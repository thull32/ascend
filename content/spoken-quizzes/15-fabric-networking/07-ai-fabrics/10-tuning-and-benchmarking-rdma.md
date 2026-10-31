---
lesson: tuning-and-benchmarking-rdma
source: 821438643ec7605b
---
## 1

A new server's 400 gigabit RoCE network card gives 368 gigabits per second in ib write bw with large messages, steadily, whatever queue pair count you use. PCIe shows Gen5 with sixteen lanes. What is the most likely cause?

A, the host MTU is 1,500, so RoCE negotiated a 1,024-byte MTU. B, the switch is congested and marking ECN on the test traffic. C, a single queue pair cannot process more than 368 gigabits on any card. D, the card sits on the other CPU socket from the test process.

[think]

The answer is A: the host MTU is 1,500, so RoCE negotiated a 1,024-byte MTU.

368 sits right at the 370 gigabit payload ceiling for 1,024-byte RoCE packets, the MTU the driver derives from a 1,500-byte interface. A queue pair limit would change with the queue pair count, and it does not here. A pair test at line rate builds no queue for ECN to mark, and NUMA misplacement shows mostly as latency and variance. Check the active MTU in the device info, or the MTU line in perftest's header.

## 2

nccl-tests all-reduce on 16 GPUs reports an algorithm bandwidth of 192 gigabytes per second and a bus bandwidth of 360 for a 1 gibibyte message. Why is bus bandwidth the number to compare with the hardware?

A, it is the algorithm bandwidth averaged across all message sizes in the sweep. B, it counts PCIe traffic, which the card's limit does not include. C, it excludes NVLink traffic, so only network bytes are counted. D, it scales algorithm bandwidth by two times n minus one, over n: the bytes each rank really sends.

[think]

The answer is D: it scales algorithm bandwidth by two times n minus one, over n, the bytes each rank really sends.

In ring all-reduce every rank sends that multiple of the data, 1.875 for 16 ranks, so bus bandwidth is the rate the links actually ran, and it stays comparable as the rank count changes. Despite the name, it has nothing to do with the PCIe bus. The averaged figure is the separate summary line, which mixes in latency-bound sizes. And it does not exclude NVLink: it is a per-rank rate across all of a rank's links.

## 3

ib write bw reaches 390 gigabits per second from host memory between two servers, but only 260 with the buffers in GPU 0's memory. The nvidia peermem module is loaded, and nvidia-smi's topology matrix shows PIX between GPU 0 and card 0. What should you check next?

A, the RoCE MTU, since GPU buffers need larger packets. B, the ECN thresholds on the rail leaf for the GPU traffic class. C, whether irqbalance is moving the card's completion interrupts. D, whether ACS is enabled on the PCIe switch ports.

[think]

The answer is D: whether ACS is enabled on the PCIe switch ports.

Only the GPU path changed between the two tests, and the module and topology are fine. ACS forces peer-to-peer traffic up through the CPU's root complex even when the GPU and card share a switch, a common result of BIOS or firmware updates. The MTU and the switch are the same in both tests, so they cannot explain the difference, and polled RDMA does not depend on completion interrupts for bandwidth.

## 4

ib send lat shows a typical latency of 1.9 microseconds but a 99.9th percentile of 38 microseconds on an otherwise idle pair, while bandwidth tests are at line rate. What is the most likely cause?

A, packet loss on the link triggering go-back-N retransmissions. B, PFC pause frames from the leaf delaying a fraction of the messages. C, a downgraded PCIe link adding latency to every transfer. D, interrupts or other work landing on the core that runs the polling loop.

[think]

The answer is D: interrupts or other work landing on the core that runs the polling loop.

A clean typical value with a rare, large tail on an idle pair is the host's signature: the polling thread is sometimes preempted by interrupts, other processes or a waking CPU core. A downgraded PCIe link would cap bandwidth, which is at line rate here. An idle ping-pong does not fill queues, so PFC should not fire, and loss would also show in bandwidth and in retransmission counters.

## 5

Each of 16 new servers passes a short perftest against a reference server, but nccl-tests across all 16 gives 74 percent of the expected bus bandwidth. What is the best next step?

A, repeat each server's perftest against the reference with more queue pairs. B, bisect the batch, or run an all-pairs perftest matrix per rail. C, lower the ECN marking threshold on every rail leaf at once. D, raise the NCCL channel count until bus bandwidth recovers.

[think]

The answer is B: bisect the batch, or run an all-pairs perftest matrix per rail.

A synchronous collective runs at its slowest hop, so one bad card or link that the short reference tests never stressed or crossed drags the whole result down. Bisecting with nccl-tests, or a pair matrix run long enough to load each link, finds which server or link it is. Repeating the same short tests covers the same ground again, and tuning NCCL or switch thresholds before localising changes many things at once and can hide the fault.

## 6

A RoCE path's hosts run an MTU of 9,000, but one switch port on it was left at 1,500. What do you observe?

A, all traffic is fragmented at that port and runs about 10 percent slower. B, the switch sends ICMP too-big messages and the cards lower their RoCE MTU. C, small messages work, while large writes retry until the queue pair errors. D, PFC pauses the traffic class until the hosts adjust their MTU.

[think]

The answer is C: small messages work, while large writes retry until the queue pair errors.

Small messages fit in small packets and pass, so latency tests succeed. Full-size RoCE packets are dropped at the port: they cannot be fragmented, and no ICMP feedback adjusts the RDMA MTU the way path MTU discovery does for TCP. The sender retransmits until its retry count is exhausted. PFC pauses for buffer pressure, not packet size, and never changes the MTU.
