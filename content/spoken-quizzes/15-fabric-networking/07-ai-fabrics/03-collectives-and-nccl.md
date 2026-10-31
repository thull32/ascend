---
lesson: collectives-and-nccl
source: a9cdfb6b2a3b9275
---
## 1

A ring all-reduce over 8 ranks reduces a 1 gigabyte vector. How many bytes does each rank send, and in how many steps?

A, 1 gigabyte in 7 steps. B, 1.75 gigabytes in 14 steps. C, 8 gigabytes in 8 steps. D, 2 gigabytes in 3 steps.

[think]

The answer is B: 1.75 gigabytes in 14 steps.

Reduce-scatter and all-gather each take n minus one, so 7, steps of one eighth of the vector, 125 megabytes. That is 14 steps, and two times seven eighths of a gigabyte, 1.75 gigabytes per rank. 8 gigabytes is everyone sending to everyone. 1 gigabyte in 7 steps is only one phase, and even one phase moves seven eighths of a gigabyte, not a whole one. Three steps of about 2 gigabytes describes a tree's depth, not a ring.

## 2

nccl-tests reports, for a 64-rank all-reduce on 400 gigabit NICs with one GPU per server, an algorithm bandwidth of 24.6 gigabytes a second and a bus bandwidth of 48.4. How healthy is the fabric?

A, unknown until the algorithm bandwidth reaches the NIC's link rate. B, unhealthy: bus bandwidth should be 64 times the algorithm bandwidth. C, healthy: bus bandwidth is about 97 percent of the 50 gigabyte a second link. D, unhealthy: algorithm bandwidth is under half of the 50 gigabyte a second link.

[think]

The answer is C: healthy, bus bandwidth is about 97 percent of the 50 gigabyte a second link.

Bus bandwidth is the algorithm bandwidth times two times n minus one over n, the rate each link actually carried, so it is the number to compare with the NIC; 48.4 is close to line rate after header overhead. Algorithm bandwidth can never approach the link rate for an all-reduce, because each rank must move nearly twice the vector to produce one. The factor is about two, not n.

## 3

In a 128-server job, NCCL runs a 1 megabyte all-reduce with a tree and a 2 gigabyte all-reduce with a ring. Why?

A, rings cannot split a 1 megabyte message into n chunks across 128 ranks. B, trees send fewer bytes per rank, which only matters for small messages. C, trees take about two times log base two of n steps, so they win when latency dominates. D, trees need SHARP switches, which only accept small messages.

[think]

The answer is C: trees take about two times log base two of n steps, so they win when latency dominates.

A ring takes two times n minus one, 254 steps, each with a fixed latency, which dominates a 1 megabyte message. A double binary tree takes about 14 and still sends roughly twice the vector per rank, slightly more than the ring, so the ring wins once bandwidth dominates. Rings split any size into smaller slices, and trees run on any fabric; SHARP is the separate in-network algorithm.

## 4

One host's NCCL log shows its network connections as via NET IB 3, while every other host shows via NET IB 3 GDRDMA. What is the most likely effect and cause?

A, no effect, since both lines show the same InfiniBand verbs transport. B, a wrong traffic class on that host, which puts its packets in a lossy queue. C, lower bandwidth on its rings, from a GPU-to-NIC path NCCL judged too far for GPUDirect. D, RDMA disabled entirely on that host, so it falls back to TCP sockets.

[think]

The answer is C: lower bandwidth on its rings, from a GPU-to-NIC path NCCL judged too far for GPUDirect.

Without GDRDMA the NIC cannot read GPU memory directly, so NCCL copies through host memory, costing bandwidth and CPU on every ring through that host. The topology dump typically shows a path through the CPU's host bridge or across sockets, PCIe access control services, or a missing peer-memory module. A TCP fallback would show NET Socket, and the traffic class is not visible in this line.

## 5

A training job on the same 64 servers runs 30 percent slower after a restart, with no hardware change. nccl-tests between pairs of servers is normal. Which explanation fits best?

A, the restart flushed the switches' MAC tables, which slows forwarding. B, new queue pairs gave new UDP source ports that collide on spine uplinks. C, bus bandwidth always drops on long-running jobs as buffers fill up. D, NCCL now chose a tree, which uses less bandwidth than a ring.

[think]

The answer is B: new queue pairs gave new UDP source ports that collide on spine uplinks.

Each restart creates new queue pairs, and RoCEv2 NICs derive the UDP source port, the only varying hash field, from them. So cross-spine flows hash afresh, and a few elephants can now share an uplink; pairwise tests do not reproduce the full job's flow set. MAC tables do not affect routed RoCE throughput like this, and the tuner's choice depends on size and topology, which did not change.

## 6

Why can SHARP or NVLS all-reduce use about half the network bytes per rank that a ring needs?

A, they send over NVLink instead of the network, which carries headers for free. B, they skip the all-gather and leave each rank holding only a shard of the sum. C, they compress gradients to bf16 before sending, halving every transfer. D, the switch adds the vectors, so each rank sends its vector once and gets the sum back.

[think]

The answer is D: the switch adds the vectors, so each rank sends its vector once and gets the sum back.

The ring's bound of two times n minus one over n of the vector holds only when the endpoints do all the arithmetic: a rank must receive the others' contributions, then the others' results. With reduction in the switch, each rank sends its vector once and receives the reduced vector once. The result is still a full all-reduce, not a reduce-scatter, and compression is a separate technique the collective itself does not apply.
