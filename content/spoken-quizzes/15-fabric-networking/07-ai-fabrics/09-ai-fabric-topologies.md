---
lesson: ai-fabric-topologies
source: f390eec4f67a43af
---
## 1

In Meridian's San Jose back end, why is NIC k of every server cabled to the leaf of rail k?

A, it spreads every flow over all eight leaves by per-packet hashing. B, NCCL pairs GPU k with GPU k, so most traffic crosses one switch. C, it keeps cables short, because rail leaves sit inside each rack. D, each rail is a redundant copy, so a leaf failure is hidden from jobs.

[think]

The answer is B: NCCL pairs GPU k with GPU k, so most traffic crosses one switch.

NCCL binds each GPU to its nearest NIC and builds rings and trees between same-numbered GPUs, so nearly every byte between servers stays in one rail and crosses one leaf. Rails are not redundant copies: each NIC is single-homed, so a rail leaf is shared fate for every server in its group. And rail leaves usually sit outside the rack, which makes the cabling longer, not shorter.

## 2

A rail leaf, rail 5's second leaf in San Jose, fails. Servers 65 to 128 are spread across three running jobs. What happens?

A, adaptive routing moves the traffic to rail 5's first leaf, and nothing stops. B, all three jobs stop, since each lost a NIC it needs for its collectives. C, only the GPU-fives of servers 65 to 128 slow down, and the jobs continue. D, only the job with the most servers on that leaf stops and restarts.

[think]

The answer is B: all three jobs stop, since each lost a NIC it needs for its collectives.

Every server on that leaf loses NIC 5, and a synchronous collective cannot finish without every rank, so each job with any server there fails and restarts from a checkpoint. Adaptive routing balances paths between leaves; it cannot replace the single link from a NIC to its leaf. Jobs do not degrade gracefully by default.

## 3

A RoCE back end turns on per-packet adaptive routing. Uplink load becomes perfectly even, but NCCL bandwidth falls sharply and the NICs' out-of-sequence counters climb. What is the most likely cause?

A, the ECMP hash seed changed, so the flows polarise across tiers. B, the spines lack buffer for sprayed packets and drop them under load. C, the NICs need in-order packets and go back N on every reordering. D, PFC is pausing the uplinks because adaptive routing raised the load.

[think]

The answer is C: the NICs need in-order packets and go back N on every reordering.

Spraying delivers packets out of order by design. A NIC without out-of-order placement treats each early packet as loss, discards it, sends a NAK and makes the sender resend from the hole, so even load turns into retransmission. Rising out-of-sequence counters are that signature. Polarisation and a hash seed do not apply once forwarding is per packet.

## 4

With identical 128-port non-blocking switches, what is the largest rail-optimised back end that fits in two tiers?

A, 4,096 GPUs, one pod of 64 leaves. B, 8,192 GPUs, the radix squared over two. C, 16,384 GPUs, the radix squared. D, 1,024 GPUs, one leaf per rail.

[think]

The answer is B: 8,192 GPUs, the radix squared over two.

Each leaf uses 64 ports down and 64 up, and each spine has 128 ports, one per leaf, so there can be 128 leaves of 64 GPUs each, which is 8,192. The radix squared counts both halves of every leaf's ports as GPU ports. 4,096 is the size of one pod in the three-tier design, and 1,024 is Meridian's current cluster.

## 5

After a new kind of firewall rule is deployed, one tenant's front-end traffic through server 1's DPU falls from 180 gigabits per second to a few gigabits. The host's CPUs and NIC look healthy. What is the most likely cause?

A, the front-end leaves' ECMP hash now polarises the tenant's flows. B, the new rule cannot be offloaded, so packets stay on the Arm cores. C, back-end PFC pauses are spreading into the front-end ports. D, the SuperNIC reorders the tenant's packets and the host NAKs them.

[think]

The answer is B: the new rule cannot be offloaded, so packets stay on the Arm cores.

A DPU forwards a flow at line rate only after the virtual switch on its Arm cores installs a hardware rule for it. A policy the embedded switch cannot express keeps every packet on the Arm cores, a small fraction of line rate, while the host sees an ordinary, healthy NIC. PFC cannot reach the front end, which is a separate network; a hash problem would hurt some flows of every tenant, not all of one; and SuperNICs sit on the back end.

## 6

A 768-GPU job's step time rises from one second to 1.3 seconds because one NIC link renegotiated to 200 gigabits per second, and nothing alerts for a day. That link failing outright would cost about 350 GPU-hours. What does the slow link cost?

A, more, about 4,000 GPU-hours of wasted time. B, nothing, because the job still completes correctly. C, less, about 100 GPU-hours, since the job never restarted. D, about the same, roughly 350 GPU-hours.

[think]

The answer is A: more, about 4,000 GPU-hours of wasted time.

At 1.3 seconds per step, about 23 percent of every GPU-hour is spent waiting on the slow link: 768 GPUs for 24 hours at that rate is about 4,250 GPU-hours in a day. A hard failure loses the work since the last checkpoint plus the restart, a few hundred GPU-hours, and is noticed at once. Avoiding a restart does not make the slow link cheap; it makes it invisible.
