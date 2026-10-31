---
review: ai-fabrics
source: b0ecd11fdd06c995
---
## Introduction

Twelve questions from the AI fabrics module. Answer out loud before the answer comes.

This last set covers the module's final three lessons, in order: when lossless goes wrong, AI fabric topologies, and tuning and benchmarking RDMA. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

rail1-leaf1 pauses ai-spine1 on priority 3 because srv3's port is congested. Why does srv66's flow to srv5, an idle server whose traffic arrives over that same link, stop as well?

A, the PAUSE carries srv3's address, and srv66 shares its subnet. B, srv5's egress queue fills with srv3's packets and blocks srv5. C, ai-spine1 reroutes srv66's flow through the congested srv3 port. D, the PAUSE names a priority on the link, so every flow in it stops.

[think]

The answer is D: the PAUSE names a priority on the link, so every flow in it stops.

A PFC frame has a vector of priorities and eight timers and nothing else: no flow, no destination. ai-spine1 must stop sending all priority 3 traffic on that link, so srv66's packets wait behind srv3's. Inside rail1-leaf1 the egress queues are separate per port, so srv5's queue is empty; the blocking happens one hop earlier, on the paused link.

## Question 2

After a link failure, IS-IS on a spine converges onto a path that goes down through a leaf and back up through another spine. Why does that matter on a lossless fabric, when it would be harmless on a lossy one?

A, valley paths cannot use ECN, so DCQCN stops working on them. B, valley paths add hops, and the extra TTL decrements expire packets. C, the down-up turn makes a cyclic buffer dependency possible under PFC. D, the second spine rejects packets it did not expect from a leaf.

[think]

The answer is C: the down-up turn makes a cyclic buffer dependency possible under PFC.

In up-down routing every buffer waits only for buffers in a higher tier, so no cycle can form. A down-up turn adds dependencies that can close a cycle, and with PFC a full cycle never drains: a deadlock. On a lossy fabric full buffers drop instead, so the same path is only slower. Two extra hops will not exhaust a TTL of 64, and ECN marking works on any path.

## Question 3

A switch port shows PFC pauses transmitted and received at the same high rate on priority 3, the link has no errors, and the watchdog fires 200 milliseconds later. What is the most likely cause?

A, a deadlock from a cyclic dependency through that link. B, ordinary incast at the server ports behind that switch. C, ECN thresholds set too low on that switch's queues. D, a dirty optic corrupting pause frames on that link.

[think]

The answer is A: a deadlock from a cyclic dependency through that link.

In a pause tree a link is paused in one direction, from the congested side towards the senders. Pauses flowing both ways at once mean each end is waiting for the other, a cycle, and a queue frozen for 200 milliseconds is what the watchdog detects. Ordinary incast pauses and resumes often and does not trip the watchdog; a dirty optic shows CRC errors, and low ECN thresholds reduce pausing.

## Question 4

A training job slows down. Switch counters show no drops and no errors. The leaf port facing one server shows many pauses received, and that server's NIC shows its priority 3 pause-transmit counter rising. What does this point to?

A, a congested spine pausing the leaf from above. B, a deadlock between the leaf and that server's NIC. C, misconfigured ECN marking on the leaf's egress port. D, a host that cannot drain its NIC, which pauses the fabric.

[think]

The answer is D: a host that cannot drain its NIC, which pauses the fabric.

A NIC that transmits pauses is a receiver whose buffer is filling because the host cannot take data at line rate, through PCIe placement, memory or receive queues: a slow receiver, and the root of a pause tree. A congested spine would show pauses transmitted by the spine and a deep queue there. A deadlock needs a cycle between buffers that forward to each other, and a server does not forward.

## Question 5

In Meridian's San Jose back end, why is NIC k of every server cabled to the leaf of rail k?

A, it spreads every flow over all eight leaves by per-packet hashing. B, NCCL pairs GPU k with GPU k, so most traffic crosses one switch. C, it keeps cables short, because rail leaves sit inside each rack. D, each rail is a redundant copy, so a leaf failure is hidden from jobs.

[think]

The answer is B: NCCL pairs GPU k with GPU k, so most traffic crosses one switch.

NCCL binds each GPU to its nearest NIC and builds rings and trees between same-numbered GPUs, so nearly every byte between servers stays in one rail and crosses one leaf. Rails are not redundant copies: each NIC is single-homed, so a rail leaf is shared fate for every server in its group. And rail leaves usually sit outside the rack, which makes the cabling longer, not shorter.

## Question 6

A rail leaf, rail 5's second leaf in San Jose, fails. Servers 65 to 128 are spread across three running jobs. What happens?

A, adaptive routing moves the traffic to rail 5's first leaf, and nothing stops. B, all three jobs stop, since each lost a NIC it needs for its collectives. C, only the GPU-fives of servers 65 to 128 slow down, and the jobs continue. D, only the job with the most servers on that leaf stops and restarts.

[think]

The answer is B: all three jobs stop, since each lost a NIC it needs for its collectives.

Every server on that leaf loses NIC 5, and a synchronous collective cannot finish without every rank, so each job with any server there fails and restarts from a checkpoint. Adaptive routing balances paths between leaves; it cannot replace the single link from a NIC to its leaf. Jobs do not degrade gracefully by default.

## Question 7

A RoCE back end turns on per-packet adaptive routing. Uplink load becomes perfectly even, but NCCL bandwidth falls sharply and the NICs' out-of-sequence counters climb. What is the most likely cause?

A, the ECMP hash seed changed, so the flows polarise across tiers. B, the spines lack buffer for sprayed packets and drop them under load. C, the NICs need in-order packets and go back N on every reordering. D, PFC is pausing the uplinks because adaptive routing raised the load.

[think]

The answer is C: the NICs need in-order packets and go back N on every reordering.

Spraying delivers packets out of order by design. A NIC without out-of-order placement treats each early packet as loss, discards it, sends a NAK and makes the sender resend from the hole, so even load turns into retransmission. Rising out-of-sequence counters are that signature, and polarisation and a hash seed do not apply once forwarding is per packet.

## Question 8

A 768-GPU job's step time rises from one second to 1.3 seconds because one NIC link renegotiated to 200 gigabits per second, and nothing alerts for a day. That link failing outright would cost about 350 GPU-hours. What does the slow link cost?

A, more, about 4,000 GPU-hours of wasted time. B, nothing, because the job still completes correctly. C, less, about 100 GPU-hours, since the job never restarted. D, about the same, roughly 350 GPU-hours.

[think]

The answer is A: more, about 4,000 GPU-hours of wasted time.

At 1.3 seconds per step, nearly a quarter of every GPU-hour is spent waiting on the slow link, and 768 GPUs for a whole day at that rate comes to more than 4,000 GPU-hours. A hard failure loses the work since the last checkpoint plus the restart, a few hundred GPU-hours, and is noticed at once. Avoiding a restart does not make the slow link cheap; it makes it invisible.

## Question 9

nccl-tests all-reduce on 16 GPUs reports an algorithm bandwidth of 192 gigabytes per second and a bus bandwidth of 360 for a 1 gibibyte message. Why is bus bandwidth the number to compare with the hardware?

A, it is the algorithm bandwidth averaged across all message sizes in the sweep. B, it counts PCIe traffic, which the card's limit does not include. C, it excludes NVLink traffic, so only network bytes are counted. D, it scales algorithm bandwidth by two times n minus one, over n: the bytes each rank really sends.

[think]

The answer is D: it scales algorithm bandwidth by two times n minus one, over n, the bytes each rank really sends.

In ring all-reduce every rank sends nearly twice the data, so bus bandwidth is the rate the links actually ran, and it stays comparable as the rank count changes. Despite the name, it has nothing to do with the PCIe bus. The averaged figure is the separate summary line, which mixes in latency-bound sizes, and bus bandwidth is a per-rank rate across all of a rank's links, NVLink included.

## Question 10

ib write bw reaches 390 gigabits per second from host memory between two servers, but only 260 with the buffers in GPU 0's memory. The nvidia peermem module is loaded, and nvidia-smi's topology matrix shows PIX between GPU 0 and card 0. What should you check next?

A, the RoCE MTU, since GPU buffers need larger packets. B, the ECN thresholds on the rail leaf for the GPU traffic class. C, whether irqbalance is moving the card's completion interrupts. D, whether ACS is enabled on the PCIe switch ports.

[think]

The answer is D: whether ACS is enabled on the PCIe switch ports.

Only the GPU path changed between the two tests, and the module and topology are fine. ACS forces peer-to-peer traffic up through the CPU's root complex even when the GPU and card share a switch, a common result of BIOS or firmware updates. The MTU and the switch are the same in both tests, so they cannot explain the difference, and polled RDMA does not depend on completion interrupts for bandwidth.

## Question 11

Each of 16 new servers passes a short perftest against a reference server, but nccl-tests across all 16 gives 74 percent of the expected bus bandwidth. What is the best next step?

A, repeat each server's perftest against the reference with more queue pairs. B, bisect the batch, or run an all-pairs perftest matrix per rail. C, lower the ECN marking threshold on every rail leaf at once. D, raise the NCCL channel count until bus bandwidth recovers.

[think]

The answer is B: bisect the batch, or run an all-pairs perftest matrix per rail.

A synchronous collective runs at its slowest hop, so one bad card or link that the short reference tests never stressed or crossed drags the whole result down. Bisecting with nccl-tests, or a pair matrix run long enough to load each link, finds which server or link it is. Tuning NCCL or switch thresholds before localising changes many things at once and can hide the fault.

## Question 12

A RoCE path's hosts run an MTU of 9,000, but one switch port on it was left at 1,500. What do you observe?

A, all traffic is fragmented at that port and runs about 10 percent slower. B, the switch sends ICMP too-big messages and the cards lower their RoCE MTU. C, small messages work, while large writes retry until the queue pair errors. D, PFC pauses the traffic class until the hosts adjust their MTU.

[think]

The answer is C: small messages work, while large writes retry until the queue pair errors.

Small messages fit in small packets and pass, so latency tests succeed. Full-size RoCE packets are dropped at the port: they cannot be fragmented, and no ICMP feedback adjusts the RDMA MTU the way path MTU discovery does for TCP. The sender retransmits until its retry count is exhausted, and PFC pauses for buffer pressure, not packet size.

## Recap

Three ideas kept coming back. A pause names a priority on a link, not a flow, so congestion and slow receivers spread backwards as pause trees, and any down-up turn risks a deadlock that only a watchdog breaks. Rails concentrate traffic and fate alike: same-numbered GPUs meet on one leaf, so that leaf's failure stops every job that touches it, and spraying packets only helps if the cards accept them out of order. And a slow link is worse than a dead one, because nothing alerts: measure bus bandwidth, localise with pair tests and bisection, and check the host, from PCIe and ACS to MTU, before blaming the switches.
