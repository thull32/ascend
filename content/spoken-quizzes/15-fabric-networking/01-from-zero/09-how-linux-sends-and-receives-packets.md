---
lesson: how-linux-sends-and-receives-packets
source: a5bed072b2214862
---
## 1

acme-db1's NIC has 1,024 descriptors in each receive ring, and receives full-size frames at its 25 gigabit line rate, about 2 million frames a second. The CPU that drains the ring stalls for 2 milliseconds. About how many frames does the NIC drop?

A, about 4,060, every frame that arrived during the stall. B, none, because TCP flow control pauses the sender in time. C, about 1,010, the same as for a 1 millisecond stall. D, about 3,040, everything beyond the 1,024 that fit.

[think]

The answer is D: about 3,040, everything beyond the 1,024 that fit.

In 2 milliseconds about 4,064 frames arrive. The ring holds 1,024, and the NIC drops the rest, counting them only in its missed counter. TCP's window cannot help: it limits unread data at the socket, but these frames never reached TCP, and the sender learns of the loss only through missing acknowledgements. The ring absorbs the first 1,024 frames, so not every arrival is lost.

## 2

A host's single TCP stream to a peer on a 100 gigabit NIC reaches a fraction of line rate, while eight parallel streams fill the link. Per-CPU statistics show one core at 100 percent softirq time. What explains it?

A, NAPI's budget of 300 packets caps every flow's rate. B, the switch hashes the stream onto one congested uplink. C, the receive buffer is smaller than the bandwidth-delay product. D, RSS keeps each flow on one queue, and so on one CPU.

[think]

The answer is D: RSS keeps each flow on one queue, and so on one CPU.

RSS hashes the addresses and ports to choose a queue, and each queue's interrupt and softirq run on one CPU, so a single flow is limited by one core's processing. Eight flows hash to several queues and spread across cores. A window limit would show an idle CPU and an idle link, not a saturated core. The NAPI budget limits one softirq run, not a flow's rate, and an uplink collision would not depend on host CPU.

## 3

A tcpdump on the sending host shows 64,000-byte TCP segments, each marked with an incorrect checksum. What is happening?

A, the kernel is corrupting packets before they reach the NIC. B, TSO and checksum offload finish the packets in the NIC. C, GRO on the sender merged segments before transmission. D, the path MTU is 64 kilobytes, so no segmentation is needed.

[think]

The answer is B: TSO and checksum offload finish the packets in the NIC.

With TSO, TCP hands the NIC one large segment that the NIC cuts into MSS-sized packets, and with checksum offload the NIC fills in the checksums as it transmits. The capture point is above the NIC, so it sees the unfinished super-packet. GRO is a receive-side merge. The wire still carries 1,500-byte packets on a 1,500-byte MTU, and nothing is corrupted.

## 4

Replication from Amsterdam to Singapore, with a 105 millisecond round trip, runs at about 20 megabits per second on a 10 gigabit circuit with zero packet loss. The application sets its socket receive buffer to 256 kilobytes. What limits it?

A, the NIC's receive ring is overflowing on the receiver. B, the sender's qdisc drops packets under CoDel's 5 millisecond target. C, packet loss on the long-haul circuit is forcing slow start. D, the receive window: 256 kilobytes per 105 millisecond round trip.

[think]

The answer is D: the receive window, 256 kilobytes per 105 millisecond round trip.

TCP can have at most one window of unacknowledged data per round trip, and the window is bounded by the receiver's buffer: about 262,000 bytes every 105 milliseconds is about 20 megabits per second. Setting the receive buffer by hand disables autotuning, so it never grows. There is zero loss, so neither slow start after loss nor ring or qdisc drops can explain it.

## 5

Two containers on the same host exchange bursts of traffic through the docker0 bridge and see intermittent loss. Which counter most likely shows it?

A, column 2 of the softnet stat file, the per-CPU backlog drops. B, the dropped field of the qdisc statistics on the physical eth0. C, rx missed errors on the physical NIC, the receive ring overflows. D, listen drops in nstat, read in the host namespace.

[think]

The answer is A: column 2 of the softnet stat file, the per-CPU backlog drops.

Traffic between two containers on one host goes veth, bridge, veth and never touches the physical NIC, so its receive rings and eth0's qdisc cannot record the loss. A veth has no hardware ring: each packet is queued on the sending CPU's backlog, 1,000 packets by default, and overflow is counted in column 2 of softnet stat. Listen drops read in the host namespace cannot see the containers' sockets, which live in their own namespaces.
