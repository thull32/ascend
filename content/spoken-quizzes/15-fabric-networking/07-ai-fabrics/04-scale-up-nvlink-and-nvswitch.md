---
lesson: scale-up-nvlink-and-nvswitch
source: 6462fd50ec781929
---
## 1

An H100 GPU has 900 gigabytes a second of NVLink bandwidth and one 400 gigabit NIC. Comparing like with like, how much more bandwidth does it have to a GPU in its own server than to a GPU in another server?

A, about 18 times: 900 gigabytes against 50 gigabytes each way. B, about the same, once RDMA removes the kernel overhead. C, about 9 times: 450 gigabytes each way against 50. D, about 2.25 times, since it is 900 gigabytes against 400 gigabits.

[think]

The answer is C: about 9 times, 450 gigabytes each way against 50.

The 900 figure adds both directions; each way is 450. A 400 gigabit NIC moves 50 gigabytes a second each way, since a byte is 8 bits, and 450 over 50 is 9. Dividing 900 by 50 compares a two-way total with a one-way rate, and comparing 900 with 400 mixes bytes and bits. RDMA removes host software overhead, but it cannot raise the NIC's line rate.

## 2

NCCL's log on one server says GPU Direct RDMA is disabled for GPU 2 and HCA 2, because the distance is too great, and nvidia-smi's topology matrix shows NODE between GPU2 and NIC2. What is the most likely cause?

A, NIC2 sits in a slot outside GPU2's PCIe switch. B, NIC2's switch port has PFC disabled for the RoCE priority. C, the nvidia peermem module was never loaded on this node. D, GPU2 has lost four of its eighteen NVLink connections.

[think]

The answer is A: NIC2 sits in a slot outside GPU2's PCIe switch.

NODE means the path crosses PCIe host bridges within one CPU socket instead of staying under one switch, so NCCL refuses GPUDirect RDMA for that pair and stages through host memory. A missing peermem module would disable it on every pair on the node, and would not change the matrix. NVLink loss shows as NV14 between GPUs, and PFC is a switch setting unrelated to the host's PCIe tree.

## 3

A gradient all-reduce runs hierarchically: reduce-scatter inside each NVLink domain, all-reduce across domains over the NICs, then all-gather inside. Moving from 8 GPU domains to 72 GPU domains, with about the same number of GPUs and the same NIC per GPU, what happens to the bytes each GPU sends on the network?

A, they fall about ninefold, as each GPU only sends its one share of the domain. B, they stay the same, because every GPU still needs every gradient. C, they rise, because larger domains send larger messages to the network. D, they fall to zero, because NVLink now carries the whole all-reduce.

[think]

The answer is A: they fall about ninefold, as each GPU only sends its share.

After the reduce-scatter, each GPU holds one share of the summed gradient, the gradient divided by the domain size, and only that share crosses the network: about 2.48 gigabytes at 8 and 0.26 at 72 for a 10 gigabyte gradient. Every GPU does end with every gradient, but the all-gather inside the domain delivers most of it over NVLink. The network still carries the cross-domain step, since about 1,000 GPUs span many racks.

## 4

One server's NIC sits in a PCIe slot that trained at Gen4 by eight instead of Gen5 by sixteen. Every switch in the fabric is healthy. What happens to a 1,024 GPU data-parallel job?

A, only that server's eight GPUs slow down, and the rest continue. B, nothing changes, because 15.75 gigabytes a second exceeds what RDMA needs. C, the fabric reroutes that NIC's flows over other spines to compensate. D, every rank waits, because the ring runs at its slowest link.

[think]

The answer is D: every rank waits, because the ring runs at its slowest link.

A Gen4 by eight slot carries about 15.75 gigabytes a second, under a third of the NIC's 50, and a synchronous collective cannot finish until its slowest member does. In the lesson's model the all-reduce goes from 88.5 to 196.4 milliseconds. The fabric cannot help, because the bottleneck is inside the host before packets reach a switch, and the counter that shows it is the link status in lspci.

## 5

Which property most distinguishes a scale-up interconnect such as NVLink from a scale-out network such as RoCE version 2?

A, it uses UDP port 4791 inside a lossless traffic class. B, GPUs load and store directly into peer memory over it. C, it runs over optics, so it can reach across the data center. D, it relies on ECMP hashing to spread flows over its switches.

[think]

The answer is B: GPUs load and store directly into peer memory over it.

NVLink carries memory operations: a GPU's cores read and write another GPU's memory in one shared address space, with no NIC, queue pair or IP header. RoCE version 2 is the scale-out transport that uses UDP port 4791, needs lossless Ethernet or congestion control, and spreads flows with ECMP. NVLink is short-reach copper, not optics, which is why its domain stops at the rack.
