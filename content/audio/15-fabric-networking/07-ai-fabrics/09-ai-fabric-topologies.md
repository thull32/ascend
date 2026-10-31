---
lesson: ai-fabric-topologies
source: 6698da317aeb3a5b
fit: great
desk:
  - "The four-networks table and the rdma link output from srv001"
  - "The rail-optimised visualisation and the rail versus top-of-rack table"
  - "The back-end sizing code and its output for 1,024 to 131,072 GPUs"
  - "The adaptive-routing visualisation, the spraying simulation and its output"
  - "The load-balancing methods table and the RDMA NIC, SuperNIC and DPU table"
  - "The cabling check and blast-radius code"
---
## Introduction

A 1,024-GPU training job runs in lockstep. Every step ends with a collective in which every GPU exchanges data with others, and the step finishes only when the last transfer does. So the network does not have to be fair to millions of small flows. It has to give a few thousand huge, synchronised flows their full line rate at the same instant, every few hundred milliseconds, for weeks. Any link that is shared, slower than its siblings, or briefly down sets the pace for all 1,024 GPUs.

That requirement explains four networks per server, eight NICs on eight different switches called rails, per-packet adaptive routing in place of ECMP, NICs that became computers, and one bad optic idling a whole job. The running example is Meridian's San Jose cluster: 128 servers, each with eight H100-class GPUs and one 400 gigabit RoCE NIC per GPU.

## Four networks per server

A GPU server plugs into four fabrics, because its traffic comes in four kinds with incompatible needs. The back end carries gradients and activations between GPUs: eight NICs at 400 gigabits, 3.2 terabits per second per server, running RoCE. If it fails, running jobs stop. The front end carries users, the scheduler, images, logs and NCCL's TCP bootstrap, through one DPU, as ordinary TCP over Meridian's EVPN fabric. If it fails, jobs keep computing but nobody can reach them. Storage carries training data and checkpoints. Management, out of band, is a BMC port for power, console and firmware: invisible until you need to recover something.

Four reasons keep them apart. First, the back end is lossless. RoCE recovers from a drop by resending everything after it, so the back end runs PFC pauses and DCQCN rate control, and one misbehaving TCP storage client on the same switches could trigger pauses that spread into GPU traffic. Second, bursts collide: a checkpoint of a 70-billion-parameter model with optimizer state is about a terabyte, five seconds of storage elephants at 200 gigabytes per second, landing on the uplinks the next step's gradients need. Third, failure domains: a back-end change must never cut you off from the BMCs you need for repair, so management shares nothing. Fourth, security: the back end has no route out.

How it breaks is quiet. If NCCL picks the storage NIC, or falls back to TCP sockets, the job runs at a fraction of its speed with no error. Server 1 has twelve RDMA devices and only eight belong to the job. Check the devices NCCL logs at startup, and pin it to those eight before every launch.

## Rails, and the arithmetic of scale

In an ordinary data center, a server's NICs go to the switch in its own rack. A GPU back end does something odd: NIC k of every server goes to the leaf of rail k. All 128 GPU-one NICs connect to rail 1, all GPU-two NICs to rail 2. In San Jose each rail has two leaves, one for servers 1 to 64 and one for 65 to 128.

The reason is NCCL's traffic. NCCL binds each GPU to its nearest NIC and builds its rings and trees so that GPU k on one server talks to GPU k on the others. Traffic inside a server crosses NVLink, at about 900 gigabytes per second per GPU. So nearly every byte that leaves a server travels between same-numbered GPUs, stays inside one rail, and crosses a single switch.

Size it with 128-port, 400 gigabit switches. Each leaf gives 64 ports to NICs and 64 to spines, so nothing is oversubscribed. 1,024 NICs is 128 per rail, two leaves per rail, 16 leaves, and their uplinks fill 8 spines. The spines still matter: servers 1 and 65 share a rail but not a leaf. A job on the first 64 servers keeps rail traffic one switch deep; a job across both halves cannot.

Some traffic is not rail-aligned. In an all-to-all, the collective behind mixture-of-experts layers, GPU 7 on server 1 sends to GPU 8 on server 2. From GPU 7's own NIC, that is three switches and an ECMP choice where it can collide. NCCL's PXN copies the data over NVLink to GPU 8 first, and GPU 8's NIC sends it on rail 8: one switch again. The detour is cheap, about 450 gigabytes per second of NVLink against 50 for the NIC.

Against top-of-rack, rails keep up to 64 servers one switch apart, and a leaf failure costs every server in the group one NIC of eight rather than a few servers everything. The price is long optical runs that are harder to cable correctly. That is how rails break: NIC 3 cabled into a rail 4 leaf links up and routes, and its traffic crosses the spines. The signal is LLDP neighbours compared with the cabling plan.

At larger scale, one number sets the fabric's size: the switch radix, its port count. Two tiers of identical non-blocking switches give radix squared over two GPUs, because a spine needs a port for every leaf; three tiers give radix cubed over four. At 128 ports that is 8,192 GPUs in two tiers and over half a million in three. Optics grow fastest: 32,768 GPUs need about 200,000 transceivers, and one fails every day or two.

## Beyond ECMP: adaptive routing

Traffic that crosses the spines is still hashed. ECMP pins each flow to one uplink by hashing its 5-tuple, and an RDMA queue pair is one fixed 5-tuple. A ring collective gives each NIC a handful of such flows, each at line rate: the worst case for hashing. More queue pairs improve the odds, but the hash still knows nothing about load. Flowlet switching needs gaps that a line-rate RDMA write never leaves.

Here is the story on rail 1. Its two leaves are joined by four spines, one 400 gigabit uplink each. Servers 1 to 4 each send to a partner on servers 65 to 68 at full rate: 1,600 gigabits offered to exactly 1,600 of uplinks. The hash puts flows A and C on spine 2, and spine 1 gets nothing. A and C get 200 gigabits each, and since a collective waits for its slowest transfer, communication runs at half speed. All four flows land on different spines only about 9 percent of the time.

Now turn on adaptive routing. For each packet, the leaf picks whichever uplink has the least data queued at that instant. Flow A's next four packets, sequence numbers 1001 to 1004, leave on four different spines, and every flow gets its full rate. But the queues differ by a few tenths of a microsecond, so the packets arrive as 1001, 1003, 1002, 1004.

Before I go on: the receiving NIC expected 1002 and got 1003. What does an ordinary RoCE NIC do?

[pause]

It treats it as loss. It discards 1003, sends a NAK, and the sender resends everything from 1002. In the lesson's simulation, a one-megabyte write of 256 packets sprayed over four spines crosses the fabric 64 times: 16,512 packets in 128 rounds. A NIC that places each packet directly in memory needs 256 packets and one round. So adaptive routing without a reorder-tolerant receiver is worse than ECMP.

Direct placement works because an RDMA write targets a known address: packet 1003's payload belongs two packets past the message's start. The catch is that a standard RoCE write carries that address only in its first packet, so placement is a NIC feature, not a setting. The Ultra Ethernet transport, a 1.0 specification in 2025, designs for spraying from the start.

Adaptive routing cannot fix two things. It cannot route around the last link: two servers writing to one still meet on its single port, and that incast is congestion control's job. And a leaf deciding on its own queues cannot see a congested link further down the path. Watch the spread between the most and least loaded uplinks, and receiver out-of-sequence and NAK counters.

## SuperNICs and DPUs

An RDMA NIC such as ConnectX-7 already runs the reliable transport in hardware. SuperNIC is NVIDIA's name, not a standard, for a NIC slimmed to the back end's job: line-rate RDMA plus out-of-order placement and a congestion-control loop with the switch. In Spectrum-X the switch sprays and supplies congestion telemetry, and the SuperNIC reorders, places, and sets its rate from it.

A DPU is a computer on a card: 16 Arm cores on BlueField-3 and a full Linux the host cannot touch. It looks like an ordinary NIC to the host while running the virtual switch and security policy on its own cores, so a tenant with root on the host cannot change network policy. Meridian puts one on each server's front end.

Follow a container on server 1 opening a connection. The DPU's embedded switch looks up the 5-tuple in its hardware flow table and misses. The miss goes to the virtual switch on the Arm cores, which applies the tenant's policy and installs an exact-match rule in hardware: permit, add the VXLAN header, count. Every later packet matches that rule at line rate.

That last step is how it breaks. If the flow table fills, or a rule cannot be offloaded, packets stay on the Arm cores and throughput falls from hundreds of gigabits to a small fraction. And if the DPU's own OS hangs, the host loses its front end while looking healthy. Monitor it as its own device: heartbeat, firmware, offload ratio, flow-table occupancy.

## When one link stalls the job

A job of 768 GPUs runs on servers 1 to 96. At three in the morning, the optic on server 37's NIC 2 dies. Within milliseconds the leaf port goes down. Every queue pair to that NIC stops getting acknowledgements; senders retransmit every few seconds, and after 7 retries, about 30 seconds in, the queue pair fails. That rank aborts. Every other rank is waiting inside the same collective, which can never finish. There is no partial result: a synchronous job is one unit. The scheduler drains server 37, and the job restarts from its last checkpoint.

With a checkpoint every 30 minutes, that is on average 15 minutes of lost work plus about 12 to detect and reload: roughly 346 GPU-hours for one optic. This is not rare: Meta's Llama 3 run on 16,384 GPUs saw 419 interruptions in 54 days, about one every three hours.

Now a sick link instead of a dead one. The NIC comes back from a flap at 200 gigabits instead of 400. Nothing fails, but every ring through it runs at its speed. Say a step is one second, with 0.3 seconds of communication, and that doubles. Nobody notices for a day. Which costs more, this or the dead optic?

[pause]

The slow link, by far. The step becomes 1.3 seconds, 23 percent of the job wasted: about 4,250 GPU-hours in a day, twelve times the dead optic, because nothing restarts and nobody is paged. A slow link nobody notices is the most expensive failure in an AI fabric.

Designs push back with dual-homed NICs, each split into two 200 gigabit ports on two leaves, so a failure halves bandwidth instead of removing it, and with frequent checkpoints and hot spares. The platform's job is to join jobs, NICs and switches: a cabling map checked against LLDP, per-job step time against its baseline so the straggler is named in minutes, per-NIC link speed and error counters, and blast radius per component. In the lesson's example, one rail leaf failing stops all 1,024 GPUs, because each of three jobs has a server on it. The engineer needs the failing port; the manager needs "1,024 GPUs idle, back in about 12 minutes". Same data, two views.

## In the interview

Expect this: an nccl-tests run across two leaves shows 30 percent less bus bandwidth than within one leaf, and it varies run to run. What is happening?

[pause]

Hash collisions on the uplinks: a few line-rate queue pairs per NIC, each pinned by ECMP, and the busiest uplink sets the pace. Check the per-uplink load spread, then try more queue pairs, placement under one leaf, or adaptive routing if the NICs place out of order. The common wrong answer is "add spines", which adds capacity the hash still cannot use evenly.

And: a job's step time rose 25 percent overnight with no errors. Scope first, this job or all. Then the straggler from per-rank communication time, then that rank's NICs: link speed, error counters, retransmits, pauses, optics. Rule out a throttling GPU too. The wrong answer is inspecting the busiest switch, when the cause is usually one slow link.

## Recap

Five things. A GPU server sits on four networks, kept apart for loss model, bursts, failure domain and security. Rails follow NCCL's GPU-k-to-GPU-k pattern, so most traffic crosses one switch, and at 128 ports two tiers top out at 8,192 GPUs. Adaptive routing fixes hash collisions only with NICs that place packets out of order. A SuperNIC makes spraying safe on the back end; a DPU isolates the front end. And price failures in GPU-hours per job: a slow link nobody notices costs more than a dead one.

At your desk: the four-networks table, the rail visualisation and comparison table, the sizing code, the adaptive-routing visualisation and simulation, the device tables, and the cabling and blast-radius code.
