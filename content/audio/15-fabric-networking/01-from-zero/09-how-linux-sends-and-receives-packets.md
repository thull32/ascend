---
lesson: how-linux-sends-and-receives-packets
source: 0b72857111f9549f
fit: partial
desk:
  - "The receive-path visualisation: one frame from leaf3 to postgres, then the 1 millisecond stall"
  - "The ring simulation in Python and its table of ring sizes and stalls"
  - "The softnet stat output and the RSS hash table, step by step"
  - "The offload table and the qdisc table"
  - "The receive-buffer ceiling table for Amsterdam to Singapore"
  - "The container diagram and its six-step walk through veth, bridge and NAT"
  - "The drop table by stage, and the counter-delta script with its output"
  - "The trade-offs table: kernel stack, busy polling, XDP, DPDK and RDMA"
---
## Introduction

An application team says the network is dropping their packets. TCP retransmissions on acme-web1 have doubled, and its stream to acme-db1 stalls in bursts. Every switch port between them, on leaf1, both spines and leaf3, shows zero discards and zero CRC errors. The packets were lost inside acme-db1, between its network card and the database, and TCP cannot tell that loss from fabric congestion.

The host is the first and last hop of every packet walk. A received frame passes a NIC, a ring, an interrupt, a polling loop, a merge step, the IP and TCP code and a socket buffer before the application sees a byte. Each stage has a queue that can overflow, and a counter that records it.

So: the receive path, how the kernel spreads and batches that work, the stack and its socket buffers, the transmit side, containers, and every place a host drops a packet.

## Ring, interrupt, poll

acme-db1 has a 25 gigabit NIC with 8 receive queues, and runs PostgreSQL. A full-size frame from acme-web1 arrives. The NIC checks the frame check sequence and the destination MAC, then hashes the addresses and ports to pick a queue: queue 3. It writes the frame by DMA, direct memory access, meaning the device writes into RAM without the CPU, into a buffer the driver supplied earlier.

That buffer belongs to a ring: a circular array of descriptors, each a buffer address, a length and a status bit, shared by driver and NIC. The NIC fills the next buffer it owns and marks it done; the driver consumes done descriptors in order and refills them. When the NIC catches up with the driver, the ring is full. Ring 3 has 1,024 descriptors.

Here is the number to remember. At 25 gigabits per second, full-size frames arrive at about 2 million a second, one every 492 nanoseconds. A ring counts frames, not bytes, so 1,024 descriptors cover about half a millisecond. At 100 gigabits, 0.13 milliseconds.

So, before I tell you: CPU 3, which drains this ring, cannot run for 1 millisecond. What happens?

[pause]

About 2,032 frames arrive. 1,024 fit, and the NIC drops the other 1,008, because its only decision is whether a free descriptor exists. It cannot push back on the sender. Only the NIC's missed counter records it, rx missed errors on Intel, rx out of buffer on NVIDIA ConnectX, and acme-web1 sees missing segments that look exactly like fabric loss. That is the opening incident.

A ring of 4,096 absorbs a 1 millisecond stall; no size absorbs 5 milliseconds. And depth costs: each descriptor pins a 2 to 4 kilobyte buffer, so 8 queues of 8,192 are 256 megabytes, and frames in a deep ring wait longer. The ring that loses least queues the most. The better fix is to stop the CPU stalling.

Why does it stall? One interrupt per packet works at 10,000 packets a second and fails at 2 million: each costs around a microsecond, and the CPU does nothing but handlers. Mogul and Ramakrishnan called this receive livelock: throughput falls towards zero as load rises.

Linux's answer is NAPI. The first frame raises an interrupt; the handler masks that queue's interrupt and schedules a poll. The poll runs in a softirq, a deferred high-priority kernel task on the CPU that took the interrupt, taking 64 packets at a time until the run hits a budget of 300 packets or 2 milliseconds. Stopping with work left increments a counter called time squeeze. When the ring is empty, the interrupt is unmasked. A burst of thousands of frames costs one interrupt.

The catch: if softirq work keeps re-arriving, the rest moves to a per-CPU thread, ksoftirqd, which the scheduler treats like any thread. Now a CPU-hungry process on CPU 3, a backup or a garbage-collecting JVM, competes with it, and the ring overflows. The signal is time squeeze rising on specific CPUs, and ksoftirqd busy in top.

## Spreading and batching: RSS and offloads

One core pushes on the order of one to a few million packets a second through the full stack. A 100 gigabit NIC delivers 8 million. The work must be spread across cores without reordering any flow.

RSS, receive side scaling, does it in the NIC: a keyed hash over addresses and ports indexes a table of queues. Every packet of a flow gets the same hash, so the flow stays on one queue and one CPU, never reordered. That is ECMP inside the host, with ECMP's weakness: one flow cannot use more than one queue, so one TCP stream is limited by one core.

IRQ affinity picks which CPU each queue's interrupt reaches. Keep queues on the NIC's NUMA node, because a buffer processed from the other CPU socket crosses the inter-socket link for every cache line. It breaks when every queue's interrupt lands on CPU 0, or one elephant flow saturates its core. The signal is uneven per-CPU softirq time and uneven per-queue counters.

Offloads move per-packet work into the NIC, or into a step that runs once per batch. Checksum offload: the NIC fills in checksums on send and verifies them on receive. TSO, TCP segmentation offload: TCP hands the driver one segment of up to 64 kilobytes, and the NIC cuts it into packets of 1,448 bytes of data, 45 packets for one trip through the stack.

GRO, generic receive offload, is the reverse, in software during the poll: consecutive segments of one flow become one buffer. On acme-db1, four 1,460-byte segments became one of 5,840 bytes. Its hardware predecessor, LRO, threw away header details while merging and corrupts forwarded or bridged traffic; GRO keeps enough to re-segment exactly.

Two consequences. A capture on the sender shows 64 kilobyte packets with incorrect checksums, because tcpdump sees them before the NIC finishes them; a capture on the receiver shows merged packets that never crossed the wire. Turning offloads off to "fix" those checksums multiplies stack traversals by up to 45.

## The stack and the socket

After GRO, the IP code checks the header, and netfilter runs, the packet filter behind iptables and nftables, with conntrack, the connection table that NAT and stateful firewalls rely on. Routing decides to deliver locally or forward. Reverse-path filtering drops a packet whose source would not route back out of its arrival interface, a trap for hosts with asymmetric routes.

TCP finds the socket by its addresses and ports; with none, it sends a reset. New connections wait in the accept queue, bounded by the listen backlog and somaxconn, 4,096 since Linux 5.4. An application slow to accept drops new connections, which clients see as an extra second of connect time. Connect times clustering at 1 and 3 seconds are the signal.

Socket buffers are limits on memory charged to the socket, not fixed arrays. TCP's advertised window comes from free receive space, and throughput is at most one window per round trip. Linux autotunes the receive buffer up to 6 megabytes before Linux 6.16, and 32 since. Setting the buffer by hand with the socket option switches autotuning off.

Work it on Meridian. Replication from acme-db1 in Amsterdam to Singapore crosses about 10,500 kilometres of fibre, roughly 105 milliseconds of round trip. With a 256 kilobyte buffer set by the application, the ceiling is about 20 megabits per second. The old 6 megabyte maximum gives about 480 megabits; 32 megabytes, about 2.6 gigabits. Filling 10 gigabits needs about 131 megabytes. Nothing is dropped: the window is the limit, and the fix is a setting on the hosts.

A full send buffer just blocks the writer: backpressure, not loss. UDP has no window, so a datagram arriving at a full buffer is dropped and counted. Telemetry collectors receiving sFlow or syslog lose data this way at peak.

## Sending, and the qdisc

On the way out, TCP sends the smaller of its congestion window and the peer's window, IP routes it, netfilter applies NAT, and the neighbour table supplies the next hop's MAC. Then the qdisc, the queueing discipline: the queue in front of the driver that decides order, and what to drop, when many sockets share one link.

Most systemd distributions default to fq codel: per-flow queues served round-robin, so a bulk flow cannot starve a small one, with CoDel dropping or ECN-marking once queueing delay has stayed above 5 milliseconds for 100 milliseconds. Busy TCP servers use fq, which paces each flow at its rate and pairs with BBR.

Byte queue limits keep the queue in the qdisc, where it can be scheduled, not in the transmit ring, where it cannot. Without them, 64 TSO segments in the ring are 4 megabytes, about 1.3 milliseconds of first-in first-out delay that no queue manager sees. TCP Small Queues caps what one socket may queue to about a millisecond at its rate. A full qdisc drops locally, and TCP treats that as congestion.

## Containers: namespaces, veth and bridges

A network namespace is a separate copy of the kernel's networking state: interfaces, routes, ARP table, firewall rules, conntrack, sockets and most counters. Two namespaces can both bind port 5432 on the same address, the separation Meridian's VRFs give Acme and Globex on the leaves. A container is processes in their own namespaces on a shared kernel.

It usually breaks in diagnosis: ss, nstat and iptables run on the host say nothing about a container's sockets or drops. Read them inside the namespace, with nsenter or ip netns exec.

A veth pair is two virtual Ethernet interfaces back to back, a cable between container and host. There is no hardware ring: the packet is queued on the sending CPU's backlog, 1,000 packets by default, and overflow goes to column 2 of the softnet stat file, a counter few dashboards graph. A Linux bridge is a software switch that learns MACs and floods unknown destinations; Docker's is docker0.

Follow a container on acme-web1, at 172.17.0.2, connecting to acme-db1. It sends to the bridge as its gateway; the frame crosses the veth, goes up to the host's IP layer, and a masquerade rule rewrites the source to 10.1.1.10, recorded in conntrack. The fabric sees only 10.1.1.10, so EVPN learns the host, not the container. The reply reverses it.

Two traps. A bridge subnet overlapping a range the host must reach, management or a VPN, captures that traffic by longest-prefix match. And on a busy container host the conntrack table fills: a random fraction of new connections time out at peak while existing ones are fine.

## Counting drops, and the interview

Every queue has a counter: CRC errors and ring misses at the NIC, backlog drops in softnet stat, IP discards, firewall and conntrack drops, TCP's listen and backlog drops, socket-buffer drops, and on the way out, qdisc and transmit-ring drops. Time squeeze is a warning, not a drop.

Three properties matter for tooling. The counters are cumulative since boot, so only deltas mean anything. Their names differ by driver, so a fleet needs a mapping per NIC model. And they are split by namespace and CPU, so a host-wide sum hides one hot core. When nothing explains a drop, Linux 5.17 and later record a drop reason that tools like dropwatch or pwru turn into which function dropped which packet, and why.

The lesson's script diffs two snapshots of acme-db1 ten seconds apart. Ring misses rose by 1,010; time squeeze by 95, all on CPU 3, the CPU serving queue 3. The first stage that dropped is the ring; next, look at what else runs on that core. So the platform should put host drops beside the leaf's port discards on one timeline, as rates per CPU and per queue, under one counter schema.

Now the interview. TCP retransmissions to a server, and every switch port on the path is clean. Where do you look?

[pause]

Scope first: one server or many, one direction or both. Then the receiver's counters, as deltas: ethtool for ring misses, softnet stat per CPU, nstat for socket drops, ss for the window. The common wrong answer is "it must be a switch buffer", when switch discards are counted per port and would show.

And: one stream on 100 gigabit NICs reaches a fraction of line rate, while eight fill it. RSS puts each flow on one queue and one CPU, so one stream is limited by one core; more flows, a larger MTU, BIG TCP or RFS help. It is honest to defer to the host team on tuning, while offering to show the hot core.

## Recap

Retransmissions are not proof of network loss: ring, backlog and socket drops on a host look identical to the sender.

A ring's slack is descriptors over frame rate: 1,024 at 25 gigabits is half a millisecond. A bigger ring trades drops for latency and memory; the real fix is keeping the interrupt CPUs free.

NAPI takes one interrupt and polls in batches; RSS is ECMP inside the host, so one flow gets one core. Read offloads into every capture.

Size buffers from the bandwidth-delay product, treat namespaces as separate stacks, and read every counter as a delta, per CPU.

At your desk: the receive-path visualisation, the ring simulation, the softnet and RSS tables, the offload and qdisc tables, the buffer ceilings, the container walk, the drop table with its delta script, and the trade-offs table.
