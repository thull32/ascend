---
lesson: scale-up-nvlink-and-nvswitch
source: 9a6db6c7c882cc58
fit: partial
desk:
  - "The bandwidth ladder script and its alpha-beta table of effective bandwidth by message size"
  - "The PCIe generation table and the PCIe tree diagram of an HGX board"
  - "The NVLink generation table"
  - "The scale-up versus scale-out visualisation and its comparison table"
  - "The nvidia-smi topology matrix and the NCCL log lines, with the faults planted in them"
  - "The hierarchical all-reduce model and its table of domain sizes"
  - "The rails and PXN visualisation"
  - "The trade-offs and failure modes tables, and the topology checker with its output"
---
## Introduction

GPU0 in one of Meridian's San Jose training servers copies 1 GiB into GPU1, in the same chassis, in about 2.4 milliseconds. The same 1 GiB to GPU0 of the next server takes about 21.5 milliseconds. Nine times longer, on an idle network with every setting right. That gap is not a tuning problem: it is two interconnects built for two jobs.

Scale-up is a memory fabric that joins a few GPUs so tightly they behave almost like one large GPU. Scale-out is the NIC and the switched network that reaches every GPU in the cluster, at a fraction of the rate. Where the line falls decides which parallelism runs where, how many bytes the network carries, and why one NIC in the wrong slot slows a 1,024 GPU job.

Four ideas: the bandwidth ladder inside a server, NVLink and NVSwitch up to the 72 GPU rack, GPUDirect, and what changes for the network when the scale-up domain grows.

## The ladder, and why PCIe is not enough

Meridian's San Jose cluster has 128 servers, each with eight H100 class GPUs and one 400 gigabit NIC per GPU. First habit: read the units. Network links are quoted in gigabits a second, memory and buses in gigabytes. A 400 gigabit NIC moves 50 gigabytes a second.

Now the ladder, each way, per GPU. The GPU's own memory, HBM, about 3,350 gigabytes a second. NVLink to the other GPUs, 450. PCIe Gen5 by sixteen, 63 raw and 50 to 55 achieved. The NIC, 50. Bandwidth falls about sevenfold from HBM to NVLink, and sevenfold again to PCIe, and the NIC sits just below PCIe. Every design choice comes down to which rung a byte rides on.

Bandwidth is only half the cost. Every transfer also pays a fixed start-up time, so the faster link needs bigger messages to pay off: with the lesson's assumed start-up costs, NVLink reaches half its peak at about 450 kilobytes, the network at 150.

PCIe is how a CPU talks to its devices, and it is a tree. The CPU's root complex owns a few ports, and PCIe switches fan one upstream link out to several devices. Two devices under the same switch can exchange packets directly, without touching the CPU. Remember that: it is the path GPUDirect uses.

So why not join GPUs over PCIe? Bandwidth: 63 gigabytes is under 2 percent of HBM and a seventh of NVLink, and tensor parallelism exchanges partial results at every layer, so the GPUs would wait more than they compute. Lanes: a socket offers 80 to 128, and sixteen devices want 256. And peer-to-peer across sockets is slow or absent on many platforms.

PCIe breaks quietly. A slot trains below its capability, from a marginal riser or a dirty connector, and that GPU's network bandwidth falls. The signal is lspci showing link status below link capability.

## NVLink and NVSwitch

NVLink's defining property is memory semantics. A GPU's cores issue ordinary loads, stores and atomics to an address that lives in another GPU's memory, and NVLink carries them as small request and response packets. No NIC, no queue pair, no IP header, no operating system. A network, by contrast, has message semantics: software hands a buffer to a NIC, the NIC packetises it, and the far side learns of it through a completion.

In NVLink 4, a link is 25 gigabytes each way, and an H100 has 18 of them: 450 each way. Reliability is per link. Every flit carries a CRC, a corrupted one is replayed, and credits stop a sender before the receiver's buffer overflows. The link is lossless by construction.

One trap: the quoted 900 gigabytes a second adds both directions. Compare like with like, 450 each way against the NIC's 50. Nine times, not eighteen.

The early generations wired GPUs directly, and eight GPUs with four or six links each cannot all reach the other seven at full width. That is the full-mesh problem from leaf-spine design, and the answer was the same: put a switch in the middle.

On an HGX H100 board, four NVSwitch chips take each GPU's 18 links in groups of 5, 4, 4 and 5. Every pair gets 450 gigabytes a second, all eight GPUs at once, and the topology matrix shows NV18 between every pair. The fabric has a control plane, Fabric Manager, and if it is not running, CUDA fails to start with error 802 while the machine looks healthy to every network check. And it has no IP, no routing protocol and no ECMP, so failures surface as GPU errors and NVLink counters, not an interface that monitoring polls.

How it breaks: a degrading link shows rising replay counters, NVLink's version of CRC errors, and a dead one raises XID 74. A whole switch chip failing costs every GPU the 4 or 5 links that went into it, about a quarter of its bandwidth, and NV18 drops to NV14.

## The NVL72 rack, and the line between fabrics

GB200 NVL72 takes the switch out of the server and makes the rack the scale-up domain. 72 GPUs in 18 compute trays, and 18 NVLink switch chips in 9 switch trays. Every GPU has 18 links, one to each switch chip, and reaches any of the other 71 at 900 gigabytes each way.

The design follows from reach. At 200 gigabits per lane, passive copper works for a metre or two, so everything is packed into one rack and joined by roughly 5,000 copper cables, with no optics. The price is density, on the order of 120 kilowatts a rack, which forces liquid cooling.

What 72 changes. Tensor parallelism and expert parallelism can span 72 GPUs instead of 8, and the expert all-to-all stays on NVLink. The failure domain grows: a failed switch tray removes 2 of every GPU's 18 links, and a failed GPU leaves 71. And the scale-out network does not go away. Each GPU still has its own NIC, because training spans tens of thousands of GPUs and NVLink stops at the rack.

So here is the line. A scale-up domain is the set of GPUs where one can load from and store to another's memory at close to local bandwidth: 8 on HGX, 72 on NVL72. The scale-out network is the NICs, switches and RDMA transport that connect those domains, at a ninth of the per-GPU bandwidth or less. Scale-up belongs to the server team and fails as XID errors; scale-out belongs to the network team and fails as link downs, CRC errors and pause frames. A training step crosses both and runs as slow as the slower one.

## GPUDirect: one message traced

GPUDirect moves data to and from GPU memory without staging it in CPU memory. Peer-to-peer lets one GPU read or write another's memory directly, over NVLink when present, otherwise through a shared PCIe switch. The usual reason it silently fails on PCIe is ACS, a switch feature that forces peer traffic up to the root complex for inspection. On bare-metal GPU servers NCCL's documentation recommends disabling it, because redirected traffic crawls or hangs.

GPUDirect RDMA lets a third device, the NIC, read and write GPU memory directly. Follow one 1 megabyte message from GPU0 on server one to GPU0 on server two.

NCCL's proxy thread on the CPU posts an RDMA write with immediate data to NIC0, pointing at a registered GPU buffer. Only a descriptor of a few dozen bytes touches the CPU. NIC0 issues PCIe reads to GPU0's memory window, and those reads turn around at the shared PCIe switch. They never reach the CPU. The NIC cuts the data into 256 RoCE packets of 4 kilobytes and sends them to the rail leaf. On server two, the NIC checks sequence numbers and the memory key, and writes the payload down through its own PCIe switch into GPU0's memory. Then it acknowledges. The sender's NIC posts a send completion, and because the write carried immediate data, the receiver's NIC posts a receive completion too. That is how NCCL on the far side learns the data has arrived. A plain RDMA write is silent at the receiver.

Now take GPUDirect away. The GPU first copies into a host buffer, up through the switch into DRAM, and the NIC reads it back down through the same switch. Every byte crosses the switch's upstream link twice and DRAM twice per side, and a shared upstream link becomes the bottleneck. And nothing fails. NCCL just stages through host memory.

Here is what that looks like on a server. The topology matrix shows GPU2 with NV14 to every peer: it lost the 4 links into one NVSwitch chip. And between GPU2 and its NIC, the matrix says NODE, not PIX. After a repair, NIC2 went back into a slot off the CPU's root port instead of GPU2's switch. NCCL's log says GPU Direct RDMA disabled for GPU 2, and its channel line lacks the GDRDMA suffix a healthy server shows. Either fault makes GPU2 the slowest rank in every collective.

## When the domain grows

The network carries whatever does not fit inside the scale-up domain: tensor and expert traffic stay on NVLink, data and pipeline parallelism go on the network. A bigger domain changes the network's job in five ways.

First, fewer bytes per GPU cross the network. Run the all-reduce hierarchically: reduce-scatter inside each domain, so every GPU holds one share of the summed gradients; all-reduce each share across domains over the NICs; then all-gather inside. Each GPU's network bytes fall in proportion to the domain size.

The lesson models it with 10 gigabytes of gradients on about 1,000 GPUs. With no scale-up, every GPU puts about 20 gigabytes on the network, about 400 milliseconds. With 8 GPU HGX domains, 2.48 gigabytes per GPU, and the whole all-reduce takes 88.5 milliseconds. With NVL72, 0.26 gigabytes, about 9.6 times fewer, and the network phase is no longer the largest part.

Before I tell you: in that HGX cluster, one NIC sits in a slot that trained at Gen4 by eight. Every switch is healthy. What happens to the job?

[pause]

Every rank waits. That slot moves 15.75 gigabytes a second, under a third of the NIC's rate, and a ring advances at its slowest link. The network phase triples and the all-reduce goes from 88.5 to 196.4 milliseconds, with nothing wrong on any switch. Trust the ratios, not the absolute times.

Second, the traffic mix shifts toward gradient all-reduces and pipeline handoffs, which largely overlap with compute, so the network's demands move from latency toward sustained bandwidth. Third, NVLink joins the network path: to reach a differently numbered GPU on another server in a rail-optimised fabric, NCCL's PXN first moves the data over NVLink to the local GPU on the right rail. Fourth, the unit of placement and failure becomes the rack.

And fifth: two fabrics, one incident. A step time regression may be an NVLink replay storm, a downtrained slot, a missing peer memory module or a congested spine, and the network on-call is often paged. So the platform must see inside the server: the topology matrix against the expected one, PCIe speed per device, GPUDirect state per pair, and NVLink counters beside switch counters.

## In the interview

Here is a follow-up a principal engineer asks. Why not make the network as fast as NVLink and drop the distinction?

[pause]

450 gigabytes a second each way is 3.6 terabits: nine 400 gigabit NICs per GPU, each with optics, switch ports and power. NVLink is cheap per bit because it is short-reach copper with link-level reliability and no transport. A cluster-wide network needs optics, a routable transport and congestion control. Reach sets the boundary, and it moves outward each generation, from 8 GPUs to 72, rather than disappearing. The wrong answer is "Ethernet is older technology".

A second: one node in a 1,024 GPU job is slow. What do you check before blaming the network? Confirm with per-node nccl-tests that one server is the outlier, then work inside it: the topology matrix against the expected one, link status for every GPU and NIC, GDRDMA on each NCCL channel, NVLink counters and XIDs, then its NIC ports and optics. Defer the BIOS and ACS details to the server team; what you would build is a node-admission check that runs all of this before a node joins the pool. The wrong answer is "check the spine utilisation".

## Recap

Five things to remember. The ladder, each way, in one unit: HBM 3,350, NVLink 450, PCIe 63, the NIC 50 gigabytes a second, and the NVLink to NIC gap is nine, not eighteen. Scale-up is defined by memory semantics, loads and stores on a peer's memory, and scale-out by messages over NICs. Copper reach is why the scale-up domain stops at the rack. GPUDirect RDMA only decides where the NIC reads and writes, and when it is off, nothing fails: NCCL stages through host memory. And a bigger domain cuts per-GPU network bytes by its size, but the slowest NIC or PCIe slot still sets the step.

At your desk: the ladder script and alpha-beta table, the PCIe and NVLink tables and the PCIe tree, the scale-up versus scale-out visualisation, the topology matrix and NCCL log lines, the hierarchical all-reduce model, the rails and PXN visualisation, and the failure tables with the topology checker.
