---
lesson: why-ai-traffic-is-different
source: ec67b1d5f0b6f49a
---
## 1

Eight data-parallel GPUs run a ring all-reduce of 2 gigabytes of gradients after 300 milliseconds of compute, each over a 400 gigabit per second link. One link renegotiates down to 200 gigabits. What happens to the step time?

A, it rises by about an eighth, since one link in eight is slower. B, it is unchanged, because the other seven links absorb the traffic. C, it rises from 370 to 440 milliseconds, for all eight GPUs. D, it rises from 370 to 440 milliseconds, but only for the GPU on that link.

[think]

The answer is C: it rises from 370 to 440 milliseconds, for all eight GPUs.

Each GPU sends seven eighths of twice the buffer, 3.5 gigabytes, and a ring advances in lockstep at the rate of its slowest link, so the all-reduce takes 140 milliseconds instead of 70. No GPU can apply the summed gradient until the collective completes, so every GPU's step grows. The other links cannot absorb the traffic, because every chunk must pass through every link in the ring.

## 2

The back-end fabric's 30-second counters show 19 percent average utilisation and no drops, yet the training team says the network limits their job. Which explanation fits?

A, every link is saturated during each all-reduce burst. B, the GPUs are idle waiting for the job scheduler. C, the counters are wrong, because RDMA bypasses the switch. D, the training team is measuring the front-end network.

[think]

The answer is A: every link is saturated during each all-reduce burst.

A data-parallel step is compute with the network silent, then every link at line rate at the same moment. A 70 millisecond burst in a 370 millisecond step averages to about 19 percent over 30 seconds, while the link was full whenever traffic needed it, and any exposed communication adds directly to step time. RDMA bypasses the hosts' kernels, not the switches, whose counters see every packet.

## 3

Why does static ECMP hashing balance RoCE version 2 training traffic so much worse than web traffic?

A, RoCE version 2 packets carry no UDP header for the hash to read. B, RoCE version 2 uses a new random source port for every packet. C, switches cannot hash on UDP fields at 400 gigabit line rate. D, a few equal flows share fixed fields and vary only by source port.

[think]

The answer is D: a few equal flows share fixed fields and vary only by source port.

Between two cards, the addresses, the protocol and the destination port, 4791, never change; the source port is chosen per queue pair, and a card has only a handful. The flows are equal-sized, start together and are reused every step, so a collision persists and the collective runs at the worst uplink's speed. RoCE does carry a UDP header, and a random port per packet would cause reordering, the opposite of what RoCE cards do by default.

## 4

Six senders each send 1 megabyte at 400 gigabits per second to one receiver, through a 400 gigabit egress port whose queue may hold 2 megabytes. In a lossy class, roughly when does the queue fill?

A, after about 8 microseconds, growing at 250 kilobytes per microsecond. B, never, as the port drains 400 gigabits of it. C, after about 7 microseconds, growing at 300 kilobytes per microsecond. D, after about 40 microseconds, growing at 50 kilobytes per microsecond.

[think]

The answer is A: after about 8 microseconds, growing at 250 kilobytes per microsecond.

2,400 gigabits arrive and 400 leave, so the queue grows at the difference, 2,000 gigabits, which is 250 kilobytes per microsecond, and 2 megabytes lasts 8 microseconds. Using one sender's rate, or the whole arrival rate without subtracting what leaves, gives the wrong growth rate. From then on most arriving packets are dropped, and the event is over in tens of microseconds, which is why minute-level counters never show it.

## 5

A 1,024-GPU job is slower since a restart, with nothing changed in code or nodes. Per-rank timing shows normal compute everywhere and longer collectives everywhere. What is the most likely network cause to check first?

A, TCP's minimum retransmission timeout on the front end. B, a thermally throttled GPU on one of the servers. C, a routing loop between two spines in the back end. D, new queue pairs hashing two flows onto one spine uplink.

[think]

The answer is D: new queue pairs hashing two flows onto one spine uplink.

Queue pair numbers, and so RoCE source ports, change when the job restarts, so the ECMP hash places the flows differently, and a new collision can slow every collective for the whole run. A throttled GPU would show longer compute on one rank, not normal compute everywhere. A routing loop would cause loss and alarms, and the front end's TCP does not carry the collectives.
