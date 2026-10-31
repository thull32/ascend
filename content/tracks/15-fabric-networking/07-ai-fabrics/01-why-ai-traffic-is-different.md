---
slug: why-ai-traffic-is-different
title: "Why AI traffic is different: synchronous steps, stragglers, elephants and incast"
description: A training step traced with numbers (compute, then an all-reduce on every link at once), why a synchronous collective runs at the speed of its slowest flow, why a few line-rate RDMA flows with almost no header entropy defeat ECMP, what incast does to a shallow switch buffer with and without PFC, what an idle GPU costs, and why job completion time is the metric an AI fabric is judged by.
minutes: 45
difficulty: medium
tags: [fabric-networking, ai-networking, gpu, training, all-reduce, stragglers, elephant-flows, incast, job-completion-time, rdma, roce]
problems: [top-k-flows]
---
Meridian's Amsterdam fabric carries web requests, database queries and backups. Its servers hold thousands of connections each, most a few kilobytes long, starting and stopping independently. Hashed over four spines, they balance by the law of large numbers; a dropped packet is resent by TCP while millions of other flows carry on. Average utilisation and loss rate tell you how that fabric is doing.

The 1,024-GPU training cluster in San Jose breaks every one of those assumptions. Its traffic is a few enormous flows per network card, all starting at the same instant, all needing to finish before any GPU can continue. One slow link stalls 1,024 GPUs; one hash collision halves the speed of the whole job; one queue overflow lasting 60 microseconds forces retransmissions that every GPU waits for. The dashboard can read 19% utilisation and zero drops while the machine learning team calls the network their bottleneck, and both are telling the truth.

## The San Jose cluster in one paragraph

Meridian's `sjc` AI cluster has 128 servers (`srv001.sjc` to `srv128.sjc`), each with eight H100-class GPUs (graphics processing units, here matrix-multiplication engines) joined inside the server by NVLink, NVIDIA's GPU-to-GPU interconnect, at about 900 GB/s per GPU counting both directions ([scale-up: NVLink and NVSwitch](/learn/fabric-networking/ai-fabrics/scale-up-nvlink-and-nvswitch)). Between servers, every GPU has its own 400 Gb/s network interface card (NIC, ConnectX-7 class) speaking RoCEv2: RDMA over Converged Ethernet, a way for one NIC to write directly into another machine's memory without either operating system touching the data, carried in UDP packets ([RDMA from zero](/learn/fabric-networking/ai-fabrics/rdma-from-zero)). They form a **back-end** fabric for GPU-to-GPU traffic only, separate from the front-end (logins, scheduler, internet) and storage networks. It is a leaf-spine Clos ([Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine)) that is **rail-optimised**: the first GPU of every server (GPU0, as CUDA numbers them from zero) plugs into rail 1's leaves, the second into rail 2's, and so on. Every GPU0 sits on `rail1-leaf1.sjc` (servers 1 to 64) or `rail1-leaf2.sjc` (65 to 128), and the two halves meet through `ai-spine1.sjc` to `ai-spine8.sjc` ([AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies)). Eight GPUs times 400 Gb/s is 3.2 Tb/s of network per server, against the two 25 or 100 Gb/s ports of a typical front-end server.

## A training step: compute, then communicate

Training a neural network repeats one loop, the **step**, often hundreds of thousands of times:

1. **Forward pass.** The GPU feeds a batch of training examples (for a language model, sequences of tokens) through the model and measures how wrong its predictions are, the loss.
2. **Backward pass.** It computes a **gradient** for every parameter: how much, and in which direction, nudging that parameter would reduce the loss. A billion parameters give a billion gradients.
3. **Communicate.** Every GPU combines its gradients with every other GPU's.
4. **Optimiser step.** Each GPU applies the combined gradients to its parameters, and the next step begins.

The communicate stage exists because of **data parallelism**: each of the job's GPUs holds a full copy of the model and processes a different slice of each batch, so 1,024 GPUs get through 1,024 times the data per step. The copies must stay identical, so after every backward pass each GPU replaces its gradients with the average over all of them. That operation is an **all-reduce**: every participant contributes a buffer and ends up with the element-wise sum. It is one of the **collectives**, fixed exchange patterns that every GPU in a group must take part in, implemented by NVIDIA's NCCL library (the NVIDIA Collective Communications Library, "nickel"). Data parallelism is only one way to split a model; tensor, pipeline and expert parallelism send different traffic at different moments ([parallelism: TP, PP and DP](/learn/fabric-networking/ai-fabrics/parallelism-tp-pp-dp)).

### The step, with numbers

Take eight GPUs: GPU0 of `srv001` to `srv008`, all on `rail1-leaf1.sjc`, training a 1-billion-parameter model.

- **Compute.** Forward 100 ms, backward 200 ms (backward is roughly twice the arithmetic). As a check: training costs about $6N$ floating-point operations per token for $N$ parameters (the standard estimate from OpenAI's 2020 scaling-laws paper), and an H100's dense peak in bf16 (bfloat16, a 2-byte floating-point format) is about 989 TFLOPS (trillion operations per second), so 300 ms at a realistic 40% of peak is about $1.2 \times 10^{14}$ operations, roughly 20,000 tokens: five 4,096-token sequences per GPU per step.
- **Gradients.** One bf16 number (2 bytes) per parameter: 2 GB per GPU. (Many setups reduce gradients in 4-byte fp32 instead, which doubles every byte count below.)
- **All-reduce.** With NCCL's ring algorithm each GPU sends, and receives, $2(n-1)/n$ times the buffer: $2 \times 7/8 \times 2\text{ GB} = 3.5\text{ GB}$ ([collectives and NCCL](/learn/fabric-networking/ai-fabrics/collectives-and-nccl) derives the formula). At 400 Gb/s, which is 50 GB/s, that is 70 ms.

| Time (ms) | GPUs | Every rail-1 link |
|---|---|---|
| 0–100 | forward pass, 100% busy | silent |
| 100–300 | backward pass, 100% busy | silent |
| 300–370 | waiting | 400 Gb/s in both directions |
| 370 | next step begins | silent again |

The step takes 370 ms, and for 70 of them, 18.9%, every GPU is idle waiting for the network. The network sees the mirror image: silence for 300 ms, then every link at line rate at the same moment for 70 ms. It is a square wave with a 19% duty cycle, synchronised across all eight links, and ordinary monitoring gets it wrong: a switch counter read every 30 seconds averages 81 bursts and reports 19% utilisation, while the link was saturated whenever it mattered.

### Overlap, and what "exposed" means

Real frameworks do not wait for the whole backward pass. PyTorch's DistributedDataParallel (DDP) groups gradients into buckets (25 MB by default) and all-reduces each bucket as soon as it is ready, last layers first, while the GPU computes earlier layers. If 50 ms of the 70 overlaps with computation, the step drops to 320 ms. Only **exposed** communication, the part no computation hides, costs step time. Two consequences for the network:

- The traffic becomes dozens of bursts spread through the backward pass, harder to see, and the final bucket is always exposed because nothing comes after it.
- Overlap hides a slow network only while communication is shorter than the computation behind it; past that point every extra millisecond on the wire is a millisecond of step.

## Synchronous collectives: the slowest flow sets the step

An all-reduce is a barrier with arithmetic. No GPU can apply the averaged gradient until it has every other GPU's contribution, so the collective ends for everyone when the last byte arrives anywhere. The ring algorithm makes the dependence concrete: the eight GPUs form a ring, each buffer is cut into eight chunks, and in each of $2(n-1) = 14$ rounds every GPU sends one chunk to its neighbour and receives one. A round ends when its slowest transfer ends, because the next round forwards what the last one delivered. Every chunk passes through every link.

**What it solves.** Synchronous training keeps every copy of the model identical with no coordination beyond the collective, so training on 1,024 GPUs is mathematically training on one with a 1,024-times larger batch. Asynchronous schemes that let fast workers run ahead exist, but large-model training almost always pays for synchrony, because stale gradients hurt convergence.

**How it breaks.** Before step 2, `srv005`'s link flaps and comes back at 200 Gb/s: the two ends negotiated a lower speed, for example over a marginal copper cable. The link is up, so any monitor that only checks up or down is satisfied. Step 2 then runs:

| Phase | Step 1 (all 400G) | Step 2 (srv005 at 200G) |
|---|---|---|
| Forward + backward | 300 ms | 300 ms, srv005 included |
| All-reduce | 3.5 GB at 50 GB/s = 70 ms | 3.5 GB at 25 GB/s = 140 ms |
| Step | 370 ms | 440 ms (+18.9%) |
| GPU idle | 70 ms (18.9%) | 140 ms (31.8%) |
| The seven healthy links | 400 Gb/s during the all-reduce | 200 Gb/s, half idle |

One link in eight slowed all eight GPUs equally, and the seven healthy links ran at half rate, because a ring moves no faster than its narrowest segment. All eight GPUs report the same step time, so none can say which link is at fault.

**What signal shows it.** The leaf's port counters during the all-reduce: seven ports carrying 200 Gb/s at 50% of their speed, one carrying the same 200 Gb/s at 100% of a reduced speed. That port is the straggler, and a per-port "operational speed differs from intended speed" alert catches it before any job notices.

```viz
{"type": "fabric", "scenario": "training-step", "title": "One training step, then the same step with one link at half speed", "caption": "GPU0 of srv001 to srv008 on rail1-leaf1.sjc train a 1-billion-parameter model with data parallelism. Step 1: 100 ms forward, 200 ms backward, then a ring all-reduce in which each GPU sends 3.5 GB in 70 ms with every link flat out: a 370 ms step, 18.9% of it GPU idle time. Before step 2 srv005's link comes back at 200 Gb/s; compute is unchanged, but the all-reduce takes 140 ms, the step 440 ms and idle time 31.8%. The leaf's port counters single out the one port saturated at a reduced speed, and the last frame scales the waste to the 1,024-GPU job."}
```

### The tail at scale

The straggler above was a fixed fault. Most stragglers are random: a retransmission, a brief queue, a congested spine for one step. Suppose each link has a 0.1% chance of being slow in any given step. A job whose step waits for every link meets at least one slow link with probability $1 - (1 - p)^N$:

| Links the step waits for | P(step has a slow link) |
|---|---|
| 8 | 0.80% |
| 64 | 6.20% |
| 1,024 | 64.10% |
| 8,192 | 99.97% |

At 1,024 GPUs a one-in-a-thousand event happens in most steps. Jeff Dean and Luiz Barroso described the effect for web services in "The Tail at Scale" (Communications of the ACM, 2013): a request fanning out to 100 servers, each slow 1% of the time, is slow 63% of the time. A training job is the extreme fan-out, to every GPU in every step, with no option to proceed on a partial answer. That is why AI fabric engineers watch the worst link, not the per-link median.

Not every straggler is the network. A GPU throttling its clock because it runs hot, a busy host CPU or a slow data read delays one rank (one participant in the job), and the collective makes every other rank wait. Per-rank timing separates the cases: a slow GPU shows longer compute on one rank; a slow link shows normal compute everywhere and a longer collective everywhere.

## Elephant flows with little entropy

A leaf with several equal uplinks uses **ECMP** (equal-cost multipath): it picks one uplink per flow by hashing the 5-tuple (source and destination address, protocol, source and destination port), so every packet of a flow takes the same path and arrives in order. **Entropy** is the variety in those hashed fields across the traffic. [ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing) covers the mechanism and the birthday-problem arithmetic of elephants (large, long flows) colliding; here is why AI traffic is the worst case for it.

### What a RoCEv2 packet gives the hash

A RoCEv2 packet from `srv001`'s GPU0 to `srv065`'s GPU0 (the other half of rail 1, so it crosses a spine). RDMA traffic is organised in **queue pairs** (QPs): one RDMA connection's pair of send and receive queues, identified at each end by a 24-bit number. Addresses follow Meridian's illustrative back-end plan, `10.200.<rail>.<server>`; the ports and queue pair number are illustrative too.

| Field | Size | Value in this example | What reads it |
|---|---|---|---|
| Source IP | 32 bits | 10.200.1.1 (srv001 GPU0's NIC) | Routing, ECMP hash; fixed for the NIC's lifetime |
| Destination IP | 32 bits | 10.200.1.65 (srv065 GPU0's NIC) | Routing lookup, ECMP hash; fixed per peer |
| DSCP / ECN | 6 + 2 bits | 26 / ECT(0), "ECN-capable" | DSCP (a traffic-class code point) selects the switch queue; ECN (explicit congestion notification) is set to "congestion experienced" by a congested queue ([lossless Ethernet](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)) |
| IP protocol | 8 bits | 17 (UDP) | ECMP hash; the same for every RoCE packet |
| UDP source port | 16 bits | 52173 | ECMP hash; chosen by the NIC, usually from the queue pair number |
| UDP destination port | 16 bits | 4791 (RoCEv2) | ECMP hash; the same for every RoCE packet |
| BTH destination QP | 24 bits | 0x000d2a | The receiving NIC: which queue pair the packet belongs to |
| BTH packet sequence number | 24 bits | 8,214,407 | The receiving NIC: order and loss detection; switches ignore it |

The BTH is the InfiniBand Base Transport Header that RoCEv2 carries inside UDP ([InfiniBand and RoCE](/learn/fabric-networking/ai-fabrics/infiniband-and-roce)). Four of the five hashed fields are fixed for a pair of NICs; only the UDP source port varies, and only per queue pair. A web server, by contrast, sees thousands of client addresses and ephemeral ports, with a fresh 5-tuple every few milliseconds.

### Few, huge, identical and simultaneous

AI traffic is elephants in every respect that hurts a hash:

- **Few.** NCCL opens a few connections per peer (one queue pair each by default, `NCCL_IB_QPS_PER_CONNECTION=1`), and in a ring each GPU has two peers. A NIC carries a handful of flows, not thousands.
- **Huge.** Each flow runs near 400 Gb/s for the whole collective: 3.5 GB per step in the example.
- **Identical.** Every flow carries the same bytes, so one that shares an uplink takes twice as long.
- **Simultaneous.** They start together, so no other flow's quiet period averages a collision out.
- **Long-lived.** The same queue pairs serve every step, so a collision repeats until the job restarts.

Hash four such flows from `rail1-leaf1.sjc` onto four spine uplinks (a small example, one uplink per spine) and the offered load exactly equals the capacity, so any collision halves at least two flows, and the collective waits for the worst uplink. The simulation below gives:

| Flows onto uplinks | Steps with no collision | Expected flows on the worst uplink | Collective slowdown |
|---|---|---|---|
| 2 onto 2 | 49.7% | 1.50 | 1.50× |
| 4 onto 4 | 9.3% | 2.12 | 2.12× |
| 8 onto 8 | 0.2% | 2.60 | 2.60× |

Average utilisation of the uplink group looks perfect in every row, while the 4-by-4 collective runs more than twice as slow.

**Signal.** Per-member utilisation of the ECMP group during collectives: some uplinks at 100% with two flows, others idle. And run-to-run variance: queue pair numbers, and so source ports, change every time the job starts, so the same code on the same nodes is fast on Monday and 40% slower after Tuesday's restart. "Slower and nothing changed" is a hash collision until proven otherwise.

**Fixes.** Rail-optimised design keeps most traffic away from hashing: GPUs on the same rail and leaf half meet through one switch with no ECMP decision ([AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies)). Across spines, more queue pairs per connection add entropy, and adaptive routing goes further, choosing a path per packet by queue depth and letting a reorder-tolerant NIC restore the order, as InfiniBand switches and NVIDIA Spectrum-X do.

## Incast: many senders, one receiver, the same instant

**Incast** is many senders transmitting to one receiver at the same moment: every sender's link is fine, and the receiver's link gets the sum. In AI clusters it comes from **all-to-all** collectives, the pattern of expert parallelism (mixture-of-experts models send each token to the GPUs holding its chosen experts, so every GPU sends to every other at once), from gathers of many ranks' results to one, and from storage reads such as a server restoring a checkpoint from many storage servers in parallel. A ring all-reduce avoids incast by construction, since each GPU receives from one neighbour.

### The mechanism, traced

Six servers, `srv002` to `srv007`, each send 1 MB to `srv001` at the same instant through `rail1-leaf1.sjc`. All links are 400 Gb/s, which is 50 KB per microsecond. The leaf is non-blocking, so the only place traffic can pile up is the egress port towards `srv001`. Suppose that port may take 2 MB from the switch's shared buffer (illustrative; the real limit depends on the chip and its settings).

| Time | Arriving | Leaving to srv001 | Egress queue | Dropped so far |
|---|---|---|---|---|
| 0 µs | 6 × 400 = 2,400 Gb/s | 400 Gb/s | 0 | 0 |
| 4 µs | | | 1 MB, growing at 250 KB/µs | 0 |
| 8 µs | | | 2 MB: full; from now on 5 of every 6 arriving packets are dropped | 0 |
| 20 µs | senders finish | 1 MB delivered in total | 2 MB | 3 MB |
| 60 µs | | 3 MB delivered | empty | 3 MB |

Half the data is dropped within 20 microseconds. The queue fills at 2,400 − 400 = 2,000 Gb/s, 250 KB per microsecond, so a 2 MB allowance lasts 8 µs. Switch buffers are shallow by design: a 51.2 Tb/s chip with on the order of 100 MB of on-chip buffer (sizes vary by model) holds about 16 µs of its own bandwidth, shared by every port.

### Why a drop is so expensive here

For TCP, incast is a known disaster. Storage-cluster studies (Phanishayee and colleagues at FAST 2008, Vasudevan and colleagues at SIGCOMM 2009) showed throughput collapsing by an order of magnitude when synchronised reads overflowed a switch buffer. A sender that loses the tail of its burst has no later packets to trigger fast retransmit, so it waits for the retransmission timeout, 200 ms minimum on Linux. If the collective ran over TCP (NCCL can fall back to sockets), one 200 ms timeout against a 370 ms step would be a 54% longer step for all 1,024 GPUs.

RDMA's reliable transport fails differently but no better. A reliable-connected queue pair accepts packets only in order. After a sender's first loss, about 8 µs in, the receiving NIC sends one NAK (negative acknowledgement) and discards everything else from that sender until the missing packet is resent: **go-back-N**, the classic RoCE behaviour (newer NICs can retransmit selectively). Each sender had about 0.4 MB accepted in order and must resend 0.6 MB: 3.6 MB in total, more than the switch dropped, because packets that arrived after the gap are discarded too.

The industry's answer is to stop dropping. Priority flow control (PFC) lets a switch pause one traffic class on the port feeding it when that port's queued bytes cross a threshold (XOFF). With a 200 KB per-port threshold, at 4.8 µs each ingress port has 200 KB queued and the leaf sends a PAUSE frame out of all six; each sender is then paused and resumed so that it averages 400/6 = 66.7 Gb/s. The queue holds at 1.2 MB, nothing is dropped, and the 6 MB is through in 120 µs, the minimum for a 400 Gb/s port. The cost moves upstream: a paused sender cannot send in that class to anyone, and pauses can spread through the fabric ([when lossless goes wrong](/learn/fabric-networking/ai-fabrics/when-lossless-goes-wrong)). ECN marking with DCQCN exists to slow senders before the queue reaches XOFF ([lossless Ethernet: PFC, ECN and DCQCN](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)).

```viz
{"type": "fabric", "scenario": "incast", "title": "6:1 incast into one 400G port: tail drops in a lossy class, pauses in a PFC class", "caption": "srv002 to srv007 each send 1 MB to srv001 at once through rail1-leaf1.sjc. Lossy: the egress queue fills at 250 KB per microsecond, hits its 2 MB limit at 8 µs, and 3 MB of the 6 are dropped; go-back-N makes the senders resend about 3.6 MB. The same burst in a PFC class: PAUSE frames go out at 4.8 µs, the queue holds at 1.2 MB, every sender averages 66.7 Gb/s, nothing is dropped and the burst completes in 120 µs. The last frames compare the counters each side records."}
```

### Why incast is invisible to ordinary monitoring

The whole event lasted 60 to 120 microseconds. Averaged over a 30-second poll, 6 MB is 1.6 Mb/s on a 400 Gb/s port, and the drop or pause counters show a cumulative number that went up, with no hint of when. Seeing incast takes counters built for it: the port's **peak queue occupancy since last read** (a watermark, which most data center switch chips expose), PFC pause frames sent and received per priority, ECN-marked packet counts, and on the NICs, `out_of_sequence` at the receiver and `packet_seq_err` at the senders (names as in NVIDIA's mlx5 driver counters).

## The cost of an idle GPU

An H100-class GPU rented from a cloud provider cost very roughly $2 to $4 an hour in 2025, less on long contracts; owned hardware costs a comparable amount once purchase, power and space are spread over its life. At an illustrative $2.50 per GPU-hour the 1,024-GPU cluster costs $2,560 an hour, about $22.4 million a year, whether the GPUs compute or wait. An idle GPU still holds its allocation and most of the power and cooling provisioned for it (an H100 SXM is rated at up to 700 W; an 8-GPU server draws around 10 kW).

Exposed communication converts directly into money:

| Every step longer by | GPU time spent waiting per year |
|---|---|
| 1% | about $222,000 |
| 5% | about $1.07 million |
| 18.9% (the 200G straggler) | about $3.56 million |

Two design rules follow. First, network capacity is cheap insurance: the back-end fabric is a minority of the cluster's cost (the GPU servers dominate), so AI back ends are built non-blocking (1:1 oversubscription: as much capacity up from each leaf as down to its servers, in the terms of [Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine)) with a 400 Gb/s NIC per GPU, which would be absurd for a web tier. Second, the network's success is measured in the GPUs' terms: 1% of step time is worth about $222,000 a year here, and sixteen times that on a 16,000-GPU cluster.

**Model FLOPs utilisation** (MFU) is the machine learning side's version: the fraction of the GPUs' peak arithmetic the job achieves. Published large runs land well below 100%: Google reported 46.2% for PaLM (2022), and Meta reported 38 to 43% for Llama 3 on up to 16,384 H100s (2024). Exposed communication is one of the reasons, alongside memory-bound operations, pipeline bubbles and failures.

## Job completion time: the metric that matters

**Job completion time** (JCT) is the wall-clock time from launching a training job to reaching its target (a number of steps, tokens or a quality bar). It is what the fabric's customer pays for, and it captures everything:

$$\text{JCT} = N_\text{steps} \times t_\text{step} + N_\text{interruptions} \times (t_\text{lost work} + t_\text{restart})$$

Worked for a 1,024-GPU job of one million steps:

| | Healthy fabric | With the 200G straggler |
|---|---|---|
| Step time | 370 ms | 440 ms |
| Steps × step time | 102.8 hours | 122.2 hours |
| Interruptions (illustrative: about one per 45 hours) | 2 to 3 | 2 to 3 |
| Each: half a 30-minute checkpoint interval lost, plus 10 minutes to restart | about 25 minutes | about 25 minutes |
| JCT | about 104 hours | about 123 hours |

The interruption rate is scaled from Meta's Llama 3 report: 466 interruptions in 54 days on 16,384 GPUs (one every 2.8 hours), mostly hardware, network switches and cables about 8% of the unexpected ones. A sixteenth of the GPUs gives about one per 45 hours. The network feeds both terms: a degraded link lengthens every step, and a link down for longer than the framework's collective timeout (minutes, by default) hangs the job until it restarts from its last checkpoint.

Why not the metrics a network team already has?

| Metric | Who sees it | What it catches | What it misses |
|---|---|---|---|
| Average link utilisation | Network team | Long-term capacity trends | Synchronised bursts; a 19% average hides 100% at every moment that matters |
| Packet loss rate | Network team | Lossy links, overflowing queues | Lossless classes, where congestion shows as pauses, not drops |
| p99 latency of probes | Network team | Queueing on the probed paths | Probes are not collectives and rarely land inside one |
| Collective bandwidth (nccl-tests "bus bandwidth") | Both | The fabric's achievable rate for the job's pattern | Behaviour under a real job's overlap and contention ([tuning and benchmarking RDMA](/learn/fabric-networking/ai-fabrics/tuning-and-benchmarking-rdma)) |
| Step time and exposed communication per job | Machine learning team | Exactly what the network costs this job, step by step | Which link or queue caused it, unless joined to fabric data |
| Job completion time | Both, after the fact | Everything, failures included | Attribution and timeliness: it arrives when the job ends |

Track the network metrics as causes and the job metrics as effects, and build the join between them.

## Failure modes in production

**A link running below its intended speed.** *Symptom:* every job on that server slows by the same fraction, with no drops and no alarms. *Diagnosis:* the port's operational speed differs from the cabling plan. *Fix:* reseat or replace the cable or optic, and alert on speed mismatch, not only on link down ([optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer)).

**ECMP collisions between leaf halves.** *Symptom:* the same job on the same nodes runs at different speeds after each restart. *Diagnosis:* during collectives some spine uplinks carry two flows while others idle. *Fix:* placement within a leaf half, more queue pairs per connection, or adaptive routing ([AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies)).

**Incast at the last hop.** *Symptom:* mixture-of-experts jobs or checkpoint restores are slow while all-reduce-heavy jobs are fine. *Diagnosis:* high queue watermarks, and pauses sent or drops, at the egress ports towards the receivers; out-of-sequence counters on the receiving NICs. *Fix:* ECN thresholds that slow senders early, tuned DCQCN, a cap on outstanding requests per receiver in the storage client ([lossless Ethernet](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn)).

**A gray link with corruption.** *Symptom:* a few slow steps per hour in jobs on one set of servers. *Diagnosis:* a slowly rising CRC error count on one port (the frame checksum failing, so the receiver discards the frame); each corrupted packet costs one queue pair a go-back-N retransmission, which the collective turns into a slow step for everyone. *Fix:* drain and replace the optic before it fails outright ([optics, cabling and the physical layer](/learn/fabric-networking/fabric-architecture/optics-cabling-and-the-physical-layer) covers light levels and CRC errors).

**A slow GPU blamed on the network.** *Symptom:* "the all-reduce takes forever". *Diagnosis:* one rank's compute is 15% longer (a thermally throttled GPU) while transfer rates are normal; the other ranks' "slow all-reduce" is time spent waiting for it. *Fix:* the compute team's; a platform showing compute and communication per rank side by side ends the argument in minutes.

## Trade-offs: the same switches, two kinds of traffic

| | General-purpose fabric (Meridian `ams`) | AI back end (Meridian `sjc`) |
|---|---|---|
| Flows per server NIC | Thousands, short-lived | A handful of queue pairs, reused every step |
| Typical flow | Kilobytes; a few elephants carry most bytes | Gigabytes per step at line rate; nearly everything is an elephant |
| Header entropy | High: many addresses and ephemeral ports | Low: fixed addresses, port 4791, one source port per queue pair |
| Timing | Independent arrivals, smooth in aggregate | Synchronised bursts on every link at once |
| Effect of one slow link | The flows on it slow down | Every GPU in the job slows down |
| Loss tolerance | TCP recovers; the cost is local | Go-back-N or a 200 ms timeout stalls a collective |
| Transport | TCP in the kernel | RDMA in the NIC (RoCEv2 or InfiniBand) |
| Oversubscription | 3:1 or so is normal and economical | 1:1, because idle GPUs cost more than ports |
| Metric | Availability, p99 request latency | Job completion time, step time, MFU |

## Under the hood: what the framework and NCCL do during a step

In current PyTorch (2.x), DDP's hooks fire as each gradient is ready, and a full bucket launches an asynchronous NCCL all-reduce. NCCL runs on its own CUDA streams (queues of GPU work), so computation continues; before the optimiser step the compute stream waits on an event until the last all-reduce has finished. That wait is "GPU idle waiting for the network" in hardware.

NCCL splits each collective across several **channels**, each a separate ring or tree with its own connections, to use several NICs and queue pairs. Inside a server it moves data over NVLink; between servers it posts RDMA writes, and the reduction arithmetic runs in GPU kernels that occupy some of the GPU's cores, so even overlapped communication is not free. It chooses ring or tree by message size and topology ([collectives and NCCL](/learn/fabric-networking/ai-fabrics/collectives-and-nccl)). Sharded data parallelism (PyTorch's FSDP, DeepSpeed's ZeRO), where each GPU stores only a slice of the model, adds an all-gather of each layer's parameters before the layer runs (in the forward pass and again in the backward) and a reduce-scatter of its gradients afterwards: three collectives per layer instead of one burst per step.

On the wire, each transfer becomes RDMA writes on a reliable-connected queue pair, with no kernel involvement on either host, so the host-side evidence (retransmissions, NAKs, congestion notifications) lives in NIC counters, not in `netstat`, and tooling must read it there.

## What the platform should show

Tooling for an AI fabric serves the on-call engineer, who wants the failing port in one line, and the cluster owner, who wants to know which jobs lost how much, from the same data. Surface:

- **Per job, step time and exposed communication** against the job's baseline: the regression the customer feels. Everything else is attribution.
- **The job's ports**: the switch ports its NICs use and the uplinks its flows cross, so a slowdown can be joined to the fabric's state.
- **Operational versus intended speed** for every port, from the cabling plan in the source of truth.
- **Utilisation inside collectives**, not averaged over minutes: peak rates, per-ECMP-member balance and elephant top talkers per uplink.
- **Microburst counters**: queue watermarks, PFC pauses per priority, ECN marks, drops per queue, at a resolution of seconds or better ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).
- **NIC counters beside switch counters**: out-of-sequence, sequence-error NAKs, congestion notifications, pauses received; part of the evidence exists only on the host.
- **Compute versus communication per rank**, so a slow GPU is not filed as a network ticket.

The join that turns those into one line per job is small:

```python
from statistics import median


def triage(job, ports):
    """Join a job's step times to the switch ports its GPUs use, and say why it is slow."""
    p50 = median(job["step_ms"])
    lines = [f"{job['name']}: step p50 {p50:.0f} ms vs baseline {job['baseline_ms']} ms "
             f"({p50 / job['baseline_ms'] - 1:+.0%}), {len(job['ports'])} ports"]
    if p50 < 1.05 * job["baseline_ms"]:
        return lines + ["  healthy"]
    if job["comm_ms"] - job["baseline_comm_ms"] < 0.5 * (p50 - job["baseline_ms"]):
        lines.append("  communication time barely grew: look at compute (a throttled or slow GPU)")
    for name in job["ports"]:
        c = ports[name]
        if c["oper_gbps"] < c["expected_gbps"]:
            lines.append(f"  {name}: running {c['oper_gbps']}G, expected {c['expected_gbps']}G, "
                         f"{c['util_in_collective']:.0%} busy in collectives -> straggler link")
        if c["crc_per_min"] > 0:
            lines.append(f"  {name}: {c['crc_per_min']:,} CRC errors/min -> drops, go-back-N retransmits")
        if c["queue_peak_mb"] > 1.5 or c["ecn_marked_per_s"] > 1000:
            lines.append(f"  {name}: egress queue peak {c['queue_peak_mb']} MB, {c['ecn_marked_per_s']:,} ECN marks/s "
                         f"-> incast towards this server")
    return lines


healthy = {"oper_gbps": 400, "expected_gbps": 400, "util_in_collective": 0.5,
           "crc_per_min": 0, "ecn_marked_per_s": 0, "queue_peak_mb": 0.1}
ports = {f"rail1-leaf1.sjc:srv{s:03}": dict(healthy) for s in range(1, 9)}
ports["rail1-leaf1.sjc:srv005"].update(oper_gbps=200, util_in_collective=1.0)
ports["rail1-leaf1.sjc:srv007"].update(ecn_marked_per_s=18_000, queue_peak_mb=1.9)

job = {"name": "pretrain-1b", "baseline_ms": 370, "baseline_comm_ms": 70, "comm_ms": 140,
       "step_ms": [441, 439, 440, 452, 440], "ports": sorted(ports)}
print("\n".join(triage(job, ports)))
```

```text
pretrain-1b: step p50 440 ms vs baseline 370 ms (+19%), 8 ports
  rail1-leaf1.sjc:srv005: running 200G, expected 400G, 100% busy in collectives -> straggler link
  rail1-leaf1.sjc:srv007: egress queue peak 1.9 MB, 18,000 ECN marks/s -> incast towards this server
```

"Slow" is relative to the job's own baseline, since it only means something for a given model and batch. The compute check runs before any port is blamed: if communication did not grow by at least half the slowdown, the network is not the main cause. `util_in_collective` is utilisation inside the job's communication windows; a one-minute average of the same port reads about 20% and flags nothing. The `srv007` line reads the egress queue towards that server, where incast piles up and ECN marks are applied: here a checkpoint restore landing on it, a reminder that real triage often finds two things at once.

## The step model in code

The lesson's numbers come from one small model (one collective per step, no overlap unless asked, equal flows), checkable by hand.

```python
import random
from collections import Counter


def ring_allreduce_ms(grad_gb, n, link_gbps):
    """A ring all-reduce pushes 2(n-1)/n of the buffer through every GPU's
    link, and the whole ring advances at the rate of its slowest link."""
    send_gb = 2 * (n - 1) / n * grad_gb
    return send_gb / (link_gbps / 8) * 1000


def step_ms(compute_ms, grad_gb, links_gbps, overlap_ms=0):
    comm = ring_allreduce_ms(grad_gb, len(links_gbps), min(links_gbps))
    return compute_ms + max(0, comm - overlap_ms), comm


# 1. One straggler link: eight data-parallel GPUs, 1B parameters, bf16 gradients.
for label, links in [("all links 400G", [400] * 8),
                     ("one link at 200G", [400] * 4 + [200] + [400] * 3)]:
    total, comm = step_ms(300, 2.0, links)
    print(f"{label:17} step {total:4.0f} ms, all-reduce {comm:4.0f} ms, idle {comm / total:5.1%}")
total, comm = step_ms(300, 2.0, [400] * 8, overlap_ms=50)
print(f"{'50 ms overlapped':17} step {total:4.0f} ms, exposed comm {total - 300:4.0f} ms")

# 2. Tail at scale: each link independently slow in a step with probability p.
p = 0.001
print("\nP(step waits for at least one slow link), p = 0.1% per link per step")
for n in (8, 64, 1024, 8192):
    print(f"  {n:5} links: {1 - (1 - p) ** n:7.2%}")

# 3. Static ECMP: k equal elephants hashed onto k uplinks (offered load = capacity).
#    The collective ends when the most loaded uplink drains.
rng = random.Random(7)
trials = 100_000
print()
for k in (2, 4, 8):
    worst = [max(Counter(rng.randrange(k) for _ in range(k)).values()) for _ in range(trials)]
    mean = sum(worst) / trials
    print(f"{k} flows on {k} uplinks: no collision {worst.count(1) / trials:5.1%}, "
          f"worst uplink {mean:.2f} flows on average -> collective {mean:.2f}x slower")

# 4. What waiting costs: 1,024 GPUs at an illustrative $2.50 per GPU-hour.
gpus, price = 1024, 2.50
per_year = gpus * price * 24 * 365
print(f"\ncluster: ${gpus * price:,.0f} per hour, ${per_year / 1e6:.1f}M per year")
for slower in (0.01, 0.05, 0.189):
    print(f"  every step {slower:5.1%} longer: ${per_year * slower / (1 + slower):>10,.0f} a year spent waiting")
```

```text
all links 400G    step  370 ms, all-reduce   70 ms, idle 18.9%
one link at 200G  step  440 ms, all-reduce  140 ms, idle 31.8%
50 ms overlapped  step  320 ms, exposed comm   20 ms

P(step waits for at least one slow link), p = 0.1% per link per step
      8 links:   0.80%
     64 links:   6.20%
   1024 links:  64.10%
   8192 links:  99.97%

2 flows on 2 uplinks: no collision 49.7%, worst uplink 1.50 flows on average -> collective 1.50x slower
4 flows on 4 uplinks: no collision  9.3%, worst uplink 2.12 flows on average -> collective 2.12x slower
8 flows on 8 uplinks: no collision  0.2%, worst uplink 2.60 flows on average -> collective 2.60x slower

cluster: $2,560 per hour, $22.4M per year
  every step  1.0% longer: $   222,036 a year spent waiting
  every step  5.0% longer: $ 1,067,886 a year spent waiting
  every step 18.9% longer: $ 3,564,708 a year spent waiting
```

`min(links_gbps)` is the straggler argument: the ring runs at its slowest member's rate. `max(Counter(...).values())` is the collision argument: the collective is as slow as the busiest uplink. The exact no-collision probability is $k!/k^k$ (9.4% for four flows, 0.24% for eight), which the simulation reproduces. The cost line divides by `1 + slower` because a step 18.9% longer spends 18.9/118.9 = 15.9% of its time waiting.

## Interviewer follow-ups

**"Why can't the AI cluster run on the same fabric design as the web tier?"** Model answer: the traffic is the opposite shape. The web tier's many small independent flows hash evenly, tolerate oversubscription and recover loss locally. Training sends a few line-rate flows per NIC in synchronised bursts, each collective waits for its slowest flow, and one loss stalls every GPU. Hence non-blocking back ends, one NIC per GPU, RDMA in a lossless or tightly congestion-controlled class, and topologies that avoid hashing. Common wrong answer: "AI needs more bandwidth", which misses synchrony and the slowest-flow rule.

**"A 1,024-GPU job is 15% slower since yesterday. How do you tell whether it is the network?"** Model answer: scope first, this job or every job, these nodes or all. Then compute versus communication per rank: one rank's compute grew means a GPU or host; communication grew everywhere means the job's ports (a speed mismatch, CRC errors, a collision after the restart, pauses and ECN marks on one egress). Then nccl-tests on the job's nodes against the known-good bus bandwidth. An honest addition: "I'd defer to the network team on PFC and ECN threshold tuning for a particular switch, but I'd build the join from job to ports that tells them where to look." Common wrong answer: starting with the switches' interface error summary for the whole fabric.

**"Incast drops packets. Why not buy switches with deeper buffers?"** Model answer: a buffer only delays the problem: a 6:1 burst grows the queue at five times the port rate, so 10 MB more buffer buys 40 µs, and an all-to-all across hundreds of GPUs is longer than that. Deep-buffer chips use off-chip memory, which costs power and port density, and a full deep buffer adds hundreds of microseconds of queueing to every packet behind it. AI back ends use shallow, fast switches, slow senders early with ECN and DCQCN, and keep PFC as the last line against drops. Common wrong answer: "more buffer always helps", which ignores that latency, not only loss, stretches the collective.

## What mid-level engineers get wrong

- **Judging the AI fabric by average utilisation and loss rate.** Both can look perfect while step time doubles and the cluster loses millions in idle time.
- **Treating up as healthy.** A link at half its intended speed is up, passes traffic, and slows every job that touches it.
- **Polling counters every minute.** Incast lasts tens of microseconds, so without watermarks and pause counters the evidence does not exist.
- **Changing the hash seed to fix a collision.** With a handful of equal flows per uplink group any static hash collides most of the time; a new seed only moves the collision.

## Senior signals

- You describe a training step as compute, then a synchronised burst on every link, and size it: 3.5 GB per GPU on the wire, 70 ms at 400 Gb/s, 19% idle.
- You state the rule: a synchronous collective ends when its slowest transfer ends, so one degraded link slows every GPU, and at 1,024 links a one-in-a-thousand event happens in most steps.
- You explain RoCE's poor hashing from the header, and read run-to-run variance after a restart as a collision symptom.
- You treat incast as a microsecond event in a shallow buffer, explain why a drop is amplified (go-back-N, TCP's 200 ms minimum timeout), and name the counters that see it.
- You price idle time and use it to justify non-blocking, one-NIC-per-GPU designs.
- You make job completion time and step time the top-line metrics, and build the join from a job to its ports, host counters and switch counters.

## Check yourself

```quiz
- q: >-
    Eight data-parallel GPUs run a ring all-reduce of 2 GB of gradients after 300 ms of compute, each over a 400 Gb/s link. One link renegotiates to 200 Gb/s. What happens to the step time?
  options: ["It rises by about 1/8, since one link in eight is slower", "It is unchanged, because the other seven links absorb the traffic", "It rises from 370 ms to 440 ms, for all eight GPUs", "It rises from 370 ms to 440 ms, but only for the GPU on that link"]
  answer: 2
  explanation: >-
    Each GPU sends 2 × 7/8 × 2 GB = 3.5 GB, and a ring advances in lockstep at the rate of its slowest link, so the all-reduce takes 3.5 GB at 25 GB/s = 140 ms instead of 70 ms. No GPU can apply the summed gradient until the collective completes, so every GPU's step grows from 370 to 440 ms. The other links cannot absorb the traffic because every chunk must pass through every link in the ring, and the penalty is not proportional to the share of slow links.
- q: >-
    The back-end fabric's 30-second counters show 19% average utilisation and no drops, yet the training team says the network limits their job. Which explanation fits?
  options: ["Every link is saturated during each all-reduce burst", "The GPUs are idle waiting for the job scheduler", "The counters are wrong because RDMA bypasses the switch", "The training team is measuring the front-end network"]
  answer: 0
  explanation: >-
    A data-parallel step is compute with the network silent, then every link at line rate at the same moment. A 70 ms burst in a 370 ms step averages to about 19% over 30 seconds, while the link was full whenever traffic needed it, and any exposed communication adds directly to step time. RDMA bypasses the hosts' kernels, not the switches, whose counters see every packet.
- q: >-
    Why does static ECMP hashing balance RoCEv2 training traffic so much worse than web traffic?
  options: ["RoCEv2 packets carry no UDP header for the hash to read", "RoCEv2 uses a new random source port for every packet sent", "Switches cannot hash on UDP fields at 400 Gb/s line rate", "A few equal flows share fixed fields and vary only by source port"]
  answer: 3
  explanation: >-
    Between two NICs the addresses, protocol (UDP) and destination port (4791) never change; the source port is chosen per queue pair, and a NIC has only a handful. The flows are equal-sized, start together and are reused every step, so a collision persists and the collective runs at the worst uplink's speed. RoCEv2 does carry a UDP header, and a random port per packet would cause reordering, the opposite of what RoCE NICs do by default.
- q: >-
    Six senders each send 1 MB at 400 Gb/s to one receiver through a 400 Gb/s egress port whose queue may hold 2 MB. In a lossy class, roughly when does the queue fill?
  options: ["After about 8 µs, growing at 250 KB per µs", "Never, as the port drains 400 Gb/s of it", "After about 7 µs, growing at 300 KB per µs", "After about 40 µs, growing at 50 KB per µs"]
  answer: 0
  explanation: >-
    2,400 Gb/s arrives and 400 Gb/s leaves, so the queue grows at the difference, 2,000 Gb/s, which is 250 KB per microsecond; 2 MB lasts 8 microseconds. Using one sender's rate (50 KB per µs) or the whole arrival rate without subtracting what leaves gives the wrong growth rate, and the drain does not keep up because it removes only a sixth of what arrives. From then on most arriving packets are dropped, and the whole event is over in tens of microseconds, which is why minute-level counters never show it.
- q: >-
    A 1,024-GPU job is slower since a restart, with nothing changed in code or nodes. Per-rank timing shows normal compute everywhere and longer collectives everywhere. What is the most likely network cause to check first?
  options: ["TCP's minimum retransmission timeout on the front end", "A thermally throttled GPU on one of the servers", "A routing loop between two spines in the back end", "New queue pairs hashing two flows onto one spine uplink"]
  answer: 3
  explanation: >-
    Queue pair numbers, and so RoCEv2 source ports, change when the job restarts, so the ECMP hash places the flows differently and a new collision can slow every collective for the whole run. A throttled GPU would show longer compute on one rank, not normal compute everywhere. A routing loop would cause loss and alarms, and the front end's TCP does not carry the collectives.
```
