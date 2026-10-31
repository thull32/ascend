---
lesson: infiniband-and-roce
source: 250f80e2dbb34e3c
fit: great
desk:
  - "The subnet manager sequence diagram and the ibstat output before and after"
  - "The InfiniBand packet header table, field by field"
  - "The credit flow visualisation and the credit walk table"
  - "The credit simulation code, its output and the cable length table"
  - "The RoCE version 1 and version 2 header tables, the frame builder and classifier code, and the overhead table"
  - "The GID table output"
  - "The trade-offs table and the four failure modes"
---
## Introduction

RDMA moves a GPU's gradients straight from one server's memory into another's, with the network card running the transport and no kernel in the path. That transport assumes the network almost never loses a packet, so its recovery is crude: a loss usually makes the sender resend everything from the gap onwards.

Three answers supply such a network. InfiniBand builds a new network in which a link cannot drop a packet for lack of buffer. RoCE, pronounced "rocky", puts InfiniBand's transport on Ethernet and makes the Ethernet behave. iWARP runs RDMA over TCP and accepts loss.

Meridian's San Jose training cluster, 1,024 GPUs with one 400 gigabit card each, runs RoCE version 2. "Why not InfiniBand?" is an early interview question about it, and "Ethernet is cheaper" is half an answer. The full answer knows what InfiniBand does that Ethernet does not, what RoCE had to rebuild, and which signal shows each one failing.

## The subnet manager: one program runs the fabric

InfiniBand was specified in 1999 as one stack, physical layer to transport, designed together. The standard is published, but almost every switch and adapter comes from one vendor, Mellanox, which NVIDIA bought in 2020.

In an Ethernet fabric every switch runs IS-IS or BGP and computes its own table. InfiniBand switches compute nothing. One program, the subnet manager, on a switch or a server, discovers the topology, assigns every address, computes every route and writes every switch's forwarding table.

Picture a server joining a hypothetical InfiniBand build of the San Jose cluster. The cable comes up and the port reports link up, but its logical state is Initialize, in which it may carry only management traffic. The subnet manager notices, from a switch trap or its periodic sweep. It reaches the port with directed-route packets, which list the output port to take at each hop, so they can reach a port with no address yet. It gives the port a 16-bit address, a local identifier or LID, writes a route to that LID into every switch, sets up the traffic classes, and only then moves the port to Active. Last, a process that wants to reach a peer asks the manager for a path record: destination LID, class, packet size and rate.

A switch's table is just an array indexed by destination LID, each entry an output port. No longest-prefix match, no ARP, no MAC learning. One subnet holds at most 49,151 LIDs; beyond that you need InfiniBand routers, which few deployments run. And there is no hop limit. An IP packet in a loop dies when its TTL runs out; an InfiniBand packet relies on the manager never computing a loop, with one backstop: a packet that waits too long at the head of a queue is discarded and counted.

What the manager solves: one program sees the whole fabric, so routes are balanced and deadlock-free and addresses never collide. How it breaks: with no manager, Active ports keep forwarding, but nothing new comes up and failures are not routed around. The signal is the most common InfiniBand ticket: a port physically up, logically still Initializing, with LID zero. Production fabrics run a standby manager and alert when it disappears.

## Credits: lossless by construction

An Ethernet switch whose buffer is full drops the next packet. An InfiniBand link cannot get there, because a sender may transmit only into buffer the receiver has already promised. Promises travel in small flow control packets, per virtual lane, counted in 64-byte blocks.

Both sides keep running totals. The sender counts every block it has ever sent. The receiver advertises a credit limit: everything it has received, plus its free buffer. The sender's rule is one sentence: send the next packet only if your total after sending it stays within the limit. The counters are 12 bits and wrap, so the test is done modulo 4,096, but that is the idea.

A walk. One server writes to another through a switch while a third server keeps the destination's link busy. Each packet is 65 blocks; the switch's buffer for the sender is 256 blocks, kept tiny to keep the numbers readable. Packets 1, 2 and 3 go: 195 blocks sent, 61 still promised. Packet 4 needs 65.

Before I tell you: is packet 4 dropped, sent, or held?

[pause]

Held. Only 61 blocks remain, so the sender waits and nothing is lost. The switch forwards packet 1, and its next flow control packet raises the limit to 321. Packet 4 goes.

Why running totals and not "you have 65 more"? Because the scheme heals itself. A lost flow control packet is replaced by the next one carrying the same absolute limit, and credit never leaks. In the lesson's simulation, a receiver draining at half rate made the sender wait 16 ticks and dropped nothing; without credits, 8 packets of 20 were dropped.

The price: credit returns only after a round trip, so a receiver needs a round trip of buffer per lane. At 400 gigabits, 16 kilobytes is plenty for a 30 metre cable, caps a 100 metre link at about 131 gigabits, and a 2 kilometre link at about 7. RoCE's PFC, the Ethernet pause frame for one traffic class on one link, works the other way: send until the receiver's queue crosses a threshold, then pause, with headroom for bytes in flight. Credits are proactive; pause is reactive.

But lossless is not congestion-free. While the destination's port is busy, the sender has no credit for anything on that lane through that switch port, including packets for other servers. The stall backs up hop by hop, the same congestion spreading PFC causes on Ethernet. So InfiniBand adds virtual lanes, so storage keeps its credit while training traffic stalls; end-to-end congestion control, where a congested switch marks packets, the receiver echoes the mark back and the source slows; and adaptive routing per packet.

The signal is PortXmitWait, time spent with data ready and no credit. A quiet port with zero errors says nothing about congestion; a port that spent half its time waiting is the bottleneck. And one feature still sells InfiniBand: SHARP, in which NVIDIA's switches do the reduction of an all-reduce in the network, roughly halving the ring algorithm's traffic.

## RoCE: the same transport on Ethernet

By 2010 data centers ran Ethernet, and a second network for RDMA was a hard sell. So InfiniBand's transport was kept, its 12-byte base transport header and everything the card does with it, so RDMA applications run unchanged, and the layers beneath were replaced.

RoCE version 1, in 2010, put the InfiniBand headers straight into an Ethernet frame with its own EtherType. No IP header means no router can forward it: it works inside one VLAN, which in a routed leaf-spine fabric is often one rack, and ECMP has nothing to hash.

RoCE version 2, in 2014, inserts real IP and UDP headers, and each fixes something. IP makes it routable across rails and spines. UDP adds no reliability, which stays in the transport's sequence numbers and acknowledgements, but the card picks a source port per queue pair, so ECMP spreads different queue pairs over different paths. Destination port 4791 tells the receiver "this is RDMA". DSCP, set to 26 at Meridian and mapped to lossless priority 3, picks the queue, and the ECN bits let a congested switch mark instead of drop; the receiver then sends a congestion notification packet and the sender slows. The end-to-end checksum masks the fields routers change, so a TTL decrement or an ECN mark does not break it.

Header overhead does not decide anything: at a 4,096-byte RDMA packet, every option carries data at 97 to 99 percent of the link.

One detail bites in practice. A RoCE card has a GID table pairing each address with a RoCE version, typically four entries for one IPv4 address, and the application picks one by index. Here is the failure. A two-server test passes in one VLAN; the same job across leaves hangs with retry-exceeded errors. A capture shows the version 1 EtherType: the job script pins an old index. Use the version 2 index or let NCCL choose, and collect every GID's version as inventory.

## What RoCE left behind, and iWARP

RoCE dropped InfiniBand's link layer, credits included, and Ethernet drops when a queue overflows. With go-back-N recovery, the receiver answers the first packet after a gap with a negative acknowledgement, and the sender resends everything after the missing packet: at 400 gigabits, a round trip and a burst of duplicates. If the lost packet was a message's last, nothing triggers that, and the sender waits for its timer, commonly tens of milliseconds or more. So RoCE fabrics rebuild losslessness from PFC, ECN and DCQCN, the card's rate control, which the next lesson traces.

A story. After a NIC firmware update, a job's all-reduce bus bandwidth halves, only under load. The update reset the DSCP marking, so RDMA lands in the default queue, which has no PFC. The switch shows tail drops on queue zero and no pauses on priority 3; the cards show out-of-sequence counts on receivers and sequence errors on senders climbing in step. Restore the marking, and check every card's settings against intent continuously.

iWARP took the opposite position: keep the network lossy and put RDMA on TCP, which already recovers from loss and controls congestion, with the card running TCP in hardware. It lost the AI back end on three counts. Each TCP connection is full state on the card, and a training job opens thousands of queue pairs per card. TCP's congestion control was tuned for many independent internet flows, not a few huge transfers starting at the same instant. And NVIDIA's cards and NCCL do not support it. It survives in storage such as SMB Direct.

## Why Ethernet is winning, and where Ultra Ethernet goes

Since about 2023, new hyperscale back ends have trended to Ethernet with RoCE version 2. Meta described two clusters of 24,576 GPUs in 2024, one on each fabric, and reported both ran its largest jobs without network bottlenecks once tuned. xAI's 100,000-GPU Colossus runs NVIDIA's own Spectrum-X Ethernet.

Four reasons, in the order an operator weighs them. Supply: InfiniBand effectively has one vendor; Ethernet has many. One network, one team: Meridian already runs Ethernet with IS-IS, BGP, automation and on-call engineers, and InfiniBand means a second control plane, toolset and failure catalogue. Scale: no 49,151-LID ceiling. And Ethernet copied the advantages, with adaptive per-packet routing and telemetry-driven congestion control.

The honest qualifier: InfiniBand does out of the box what RoCE must be tuned to do, and its switches are quoted at 100 to 200 nanoseconds per hop against several hundred for many large Ethernet chips. When a collective step takes milliseconds, those nanoseconds matter far less than behaviour under congestion.

The Ultra Ethernet Consortium formed in 2023 under the Linux Foundation and published its 1.0 specification in June 2025. Its premise: RoCE's problems come from a transport designed for a lossless, single-path network, and forcing Ethernet into that shape is backwards. Its transport runs over IP, normally in UDP, and assumes less. It sprays each message over every path, with the receiver accepting any order. It offers delivery modes per operation, so bulk RDMA does not pay for ordering. It retransmits selectively, so a drop costs one packet, and a congested switch can trim a packet to its header so the receiver asks for a resend within a round trip. And it builds in congestion control, with an optional receiver-granted credit mode: InfiniBand's credits, moved end to end.

Treat it as the direction, not the incumbent: the deployed base is RoCE version 2 and InfiniBand, and its risks are youth and that spraying spreads one bad link's damage over every flow.

## In the interview

Expect this: what happens to an InfiniBand fabric when the subnet manager dies?

[pause]

Forwarding continues on the switches' existing tables. Nothing new comes up, failures are not routed around, and path queries fail, so new jobs may not start. A standby takes over if one is running. Wrong answers: "the whole fabric goes down", or "nothing happens, like losing a route reflector".

And: why does RoCE version 2 put the transport inside UDP rather than straight on IP?

[pause]

IP makes it routable. UDP adds 8 bytes and no behaviour, but gives ports, which switches hash for ECMP, so the card varies the source port per queue pair while 4791 identifies RoCE. Reliability stays in the transport header. The wrong answer is "UDP is faster than TCP"; neither provides RoCE's transport.

## Recap

Five things. InfiniBand is two choices: a central subnet manager, kept alive with a standby, and credit-based links that never drop for lack of buffer but need a round trip of buffer per lane. Lossless is not congestion-free: watch time waiting for credit, not errors. RoCE version 2 keeps the transport and adds IP for routing, a UDP source port for ECMP, 4791 to identify it and ECN for congestion, but left the lossless link behind, which is why PFC, ECN and DCQCN exist. iWARP chose TCP and lost on connection state and support. Ethernet wins on supply, operations and scale, and Ultra Ethernet drops the no-loss assumption.

At your desk: the subnet manager sequence, the header tables, the credit visualisation and simulation, the frame classifier, the GID table, and the trade-offs and failure modes.
