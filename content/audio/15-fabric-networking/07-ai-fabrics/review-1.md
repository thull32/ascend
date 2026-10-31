---
review: ai-fabrics
source: b0ecd11fdd06c995
---
## Introduction

Twelve questions from the AI fabrics module. Answer out loud before the answer comes.

This first set covers the module's first four lessons, in order: why AI traffic is different, the three kinds of parallelism, collectives and NCCL, and scale-up with NVLink and NVSwitch. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Eight data-parallel GPUs run a ring all-reduce of 2 gigabytes of gradients after 300 milliseconds of compute, each over a 400 gigabit per second link. One link renegotiates down to 200 gigabits. What happens to the step time?

A, it rises by about an eighth, since one link in eight is slower. B, it is unchanged, because the other seven links absorb the traffic. C, it rises from 370 to 440 milliseconds, for all eight GPUs. D, it rises from 370 to 440 milliseconds, but only for the GPU on that link.

[think]

The answer is C: it rises from 370 to 440 milliseconds, for all eight GPUs.

A ring advances in lockstep at the rate of its slowest link, so the all-reduce takes 140 milliseconds instead of 70. No GPU can apply the summed gradient until the collective completes, so every GPU's step grows. The other links cannot absorb the traffic, because every chunk must pass through every link in the ring.

## Question 2

The back-end fabric's 30-second counters show 19 percent average utilisation and no drops, yet the training team says the network limits their job. Which explanation fits?

A, every link is saturated during each all-reduce burst. B, the GPUs are idle waiting for the job scheduler. C, the counters are wrong, because RDMA bypasses the switch. D, the training team is measuring the front-end network.

[think]

The answer is A: every link is saturated during each all-reduce burst.

A data-parallel step is compute with the network silent, then every link at line rate at the same moment. A 70 millisecond burst in a 370 millisecond step averages to about 19 percent over 30 seconds, while the link was full whenever traffic needed it. RDMA bypasses the hosts' kernels, not the switches, whose counters see every packet.

## Question 3

Why does static ECMP hashing balance RoCE version 2 training traffic so much worse than web traffic?

A, RoCE version 2 packets carry no UDP header for the hash to read. B, RoCE version 2 uses a new random source port for every packet. C, switches cannot hash on UDP fields at 400 gigabit line rate. D, a few equal flows share fixed fields and vary only by source port.

[think]

The answer is D: a few equal flows share fixed fields and vary only by source port.

Between two cards, the addresses, the protocol and the destination port, 4791, never change; the source port is chosen per queue pair, and a card has only a handful. The flows are equal-sized, start together and are reused every step, so a collision persists and the collective runs at the worst uplink's speed. RoCE does carry a UDP header, and a random port per packet would cause reordering, the opposite of what RoCE cards do by default.

## Question 4

A 13-billion-parameter model is trained with tensor parallelism of 4 inside each server. Why is moving the tensor-parallel group across two servers so much worse than moving the data-parallel all-reduce across servers?

A, tensor-parallel all-reduces use a different protocol that RoCE NICs cannot accelerate in hardware. B, NCCL compresses data-parallel traffic before sending, but cannot compress tensor-parallel traffic. C, tensor-parallel traffic is sent as many tiny packets that the fabric's switches must reassemble. D, tensor-parallel traffic blocks every layer, while the data-parallel all-reduce mostly overlaps the backward pass.

[think]

The answer is D: tensor-parallel traffic blocks every layer, while the data-parallel all-reduce mostly overlaps the backward pass.

Tensor parallelism sends more bytes and, above all, sits on the critical path: the next layer cannot start until its sums arrive, 80 times per microbatch here, so the NIC's ninth of NVLink bandwidth adds directly to compute time. Data-parallel gradients are reduced bucket by bucket during the backward pass, so much of that time hides. Both run as NCCL collectives over the same RDMA transport, and neither is compressed by default.

## Question 5

A mixture-of-experts job with expert parallelism of 64 across 8 servers shows per-layer all-to-all times with a long tail, and two NICs receive about three times the bytes of the others. What is the most likely cause?

A, hot experts receiving far more tokens than average, an incast. B, a pipeline bubble that grows because there are too few microbatches. C, ECMP hashing placing the all-to-all flows on too few spines. D, gradient buckets that are too small for the data-parallel all-reduce.

[think]

The answer is A: hot experts receiving far more tokens than average, an incast.

All-to-all volume depends on the data: the router sends each token to its top few experts, and the GPUs of popular experts receive more. Uneven receive bytes per NIC within one job point at routing skew. ECMP collisions would slow particular uplinks, not concentrate received bytes on particular NICs, and bubbles and buckets belong to pipeline and data parallelism.

## Question 6

The same job, tensor parallelism 8, pipeline 2 and data parallelism 64, runs on all 128 servers, once with the servers in leaf order and once in shuffled order. What changes?

A, the bytes each GPU sends per step, which rise with the number of switches crossed. B, the tensor-parallel traffic, which moves from NVLink onto the rails in the shuffled order. C, how many data-parallel ring hops cross the spines, and so ECMP collisions and step-time variance. D, nothing on the network, because NCCL rebuilds its rings to match any server order.

[think]

The answer is C: how many data-parallel ring hops cross the spines, and so ECMP collisions and step-time variance.

The layout fixes the bytes; placement decides which links carry them. In leaf order each data-parallel ring sits on one leaf per rail, so it never touches a spine. Shuffled, about half of each ring's hops cross spines, where elephant flows hash onto uplinks and can collide.

## Question 7

In a 128-server job, NCCL runs a 1 megabyte all-reduce with a tree and a 2 gigabyte all-reduce with a ring. Why?

A, rings cannot split a 1 megabyte message into n chunks across 128 ranks. B, trees send fewer bytes per rank, which only matters for small messages. C, trees take about two times log base two of n steps, so they win when latency dominates. D, trees need SHARP switches, which only accept small messages.

[think]

The answer is C: trees take about two times log base two of n steps, so they win when latency dominates.

A ring takes two times n minus one, 254 steps, each with a fixed latency, which dominates a 1 megabyte message. A double binary tree takes about 14, but still sends roughly twice the vector per rank, slightly more than the ring, so the ring wins once bandwidth dominates. Rings split any size into smaller slices, and trees run on any fabric; SHARP is the separate in-network algorithm.

## Question 8

A training job on the same 64 servers runs 30 percent slower after a restart, with no hardware change. nccl-tests between pairs of servers is normal. Which explanation fits best?

A, the restart flushed the switches' MAC tables, which slows forwarding. B, new queue pairs gave new UDP source ports that collide on spine uplinks. C, bus bandwidth always drops on long-running jobs as buffers fill up. D, NCCL now chose a tree, which uses less bandwidth than a ring.

[think]

The answer is B: new queue pairs gave new UDP source ports that collide on spine uplinks.

Each restart creates new queue pairs, and RoCE version 2 cards derive the UDP source port, the only varying hash field, from them. So cross-spine flows hash afresh, and a few elephants can now share an uplink; pairwise tests do not reproduce the full job's flow set. MAC tables do not affect routed RoCE throughput like this, and the tuner's choice depends on size and topology, which did not change.

## Question 9

Why can SHARP or NVLS all-reduce use about half the network bytes per rank that a ring needs?

A, they send over NVLink instead of the network, which carries headers for free. B, they skip the all-gather and leave each rank holding only a shard of the sum. C, they compress gradients to bf16 before sending, halving every transfer. D, the switch adds the vectors, so each rank sends its vector once and gets the sum back.

[think]

The answer is D: the switch adds the vectors, so each rank sends its vector once and gets the sum back.

The ring's cost of nearly twice the vector holds only when the endpoints do all the arithmetic: a rank must receive the others' contributions, then the others' results. With reduction in the switch, each rank sends its vector once and receives the reduced vector once. The result is still a full all-reduce, not a reduce-scatter, and compression is a separate technique the collective itself does not apply.

## Question 10

NCCL's log on one server says GPU Direct RDMA is disabled for GPU 2 and HCA 2, because the distance is too great, and nvidia-smi's topology matrix shows NODE between GPU2 and NIC2. What is the most likely cause?

A, NIC2 sits in a slot outside GPU2's PCIe switch. B, NIC2's switch port has PFC disabled for the RoCE priority. C, the nvidia peermem module was never loaded on this node. D, GPU2 has lost four of its eighteen NVLink connections.

[think]

The answer is A: NIC2 sits in a slot outside GPU2's PCIe switch.

NODE means the path crosses PCIe host bridges within one CPU socket instead of staying under one switch, so NCCL refuses GPUDirect RDMA for that pair and stages through host memory. A missing peermem module would disable it on every pair on the node, and would not change the matrix. NVLink loss shows between GPUs, and PFC is a switch setting unrelated to the host's PCIe tree.

## Question 11

A gradient all-reduce runs hierarchically: reduce-scatter inside each NVLink domain, all-reduce across domains over the NICs, then all-gather inside. Moving from 8 GPU domains to 72 GPU domains, with about the same number of GPUs and the same NIC per GPU, what happens to the bytes each GPU sends on the network?

A, they fall about ninefold, as each GPU only sends its one share of the domain. B, they stay the same, because every GPU still needs every gradient. C, they rise, because larger domains send larger messages to the network. D, they fall to zero, because NVLink now carries the whole all-reduce.

[think]

The answer is A: they fall about ninefold, as each GPU only sends its share.

After the reduce-scatter, each GPU holds one share of the summed gradient, the gradient divided by the domain size, and only that share crosses the network: for a 10 gigabyte gradient, about two and a half gigabytes at 8, and about a quarter of a gigabyte at 72. Every GPU does end with every gradient, but the all-gather inside the domain delivers most of it over NVLink. The network still carries the cross-domain step, since about 1,000 GPUs span many racks.

## Question 12

Which property most distinguishes a scale-up interconnect such as NVLink from a scale-out network such as RoCE version 2?

A, it uses UDP port 4791 inside a lossless traffic class. B, GPUs load and store directly into peer memory over it. C, it runs over optics, so it can reach across the data center. D, it relies on ECMP hashing to spread flows over its switches.

[think]

The answer is B: GPUs load and store directly into peer memory over it.

NVLink carries memory operations: a GPU's cores read and write another GPU's memory in one shared address space, with no NIC, queue pair or IP header. RoCE version 2 is the scale-out transport that uses UDP port 4791, needs lossless Ethernet or congestion control, and spreads flows with ECMP. NVLink is short-reach copper, not optics, which is why its domain stops at the rack.

## Recap

Three ideas kept coming back. A synchronous collective runs at the speed of its slowest member, so one slow link, one bad slot or one hot expert slows every GPU in the job. Average counters hide AI traffic: the network is silent during compute and full during every burst, and what hurts is communication on the critical path. And ECMP has very little to hash on: a few equal, long flows that vary only by source port, so a restart or a shuffled placement can create a collision that lasts the whole run.
