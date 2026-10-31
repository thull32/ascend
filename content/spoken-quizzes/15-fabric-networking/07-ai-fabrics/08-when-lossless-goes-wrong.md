---
lesson: when-lossless-goes-wrong
source: 4e5d37e51c646d6b
---
## 1

rail1-leaf1 pauses ai-spine1 on priority 3 because srv3's port is congested. Why does srv66's flow to srv5, an idle server whose traffic arrives over that same link, stop as well?

A, the PAUSE carries srv3's address, and srv66 shares its subnet. B, srv5's egress queue fills with srv3's packets and blocks srv5. C, ai-spine1 reroutes srv66's flow through the congested srv3 port. D, the PAUSE names a priority on the link, so every flow in it stops.

[think]

The answer is D: the PAUSE names a priority on the link, so every flow in it stops.

A PFC frame has a vector of priorities and eight timers and nothing else: no flow, no destination. ai-spine1 must stop sending all priority 3 traffic on that link, so srv66's packets wait behind srv3's. Inside rail1-leaf1 the egress queues are separate per port, so srv5's queue is empty; the blocking happens one hop earlier, on the paused link. No rerouting happens, and the frame carries no address.

## 2

After a link failure, IS-IS on a spine converges onto a path that goes down through a leaf and back up through another spine. Why does that matter on a lossless fabric, when it would be harmless on a lossy one?

A, valley paths cannot use ECN, so DCQCN stops working on them. B, valley paths add hops, and the extra TTL decrements expire packets. C, the down-up turn makes a cyclic buffer dependency possible under PFC. D, the second spine rejects packets it did not expect from a leaf.

[think]

The answer is C: the down-up turn makes a cyclic buffer dependency possible under PFC.

In up-down routing every buffer waits only for buffers in a higher tier, so no cycle can form. A down-up turn adds dependencies that can close a cycle, and with PFC a full cycle never drains: a deadlock. On a lossy fabric full buffers drop instead, so the same path is only slower. Two extra hops will not exhaust a TTL of 64, and ECN marking works on any path.

## 3

A switch port shows PFC pauses transmitted and received at the same high rate on priority 3, the link has no errors, and the watchdog fires 200 milliseconds later. What is the most likely cause?

A, a deadlock from a cyclic dependency through that link. B, ordinary incast at the server ports behind that switch. C, ECN thresholds set too low on that switch's queues. D, a dirty optic corrupting pause frames on that link.

[think]

The answer is A: a deadlock from a cyclic dependency through that link.

In a pause tree a link is paused in one direction, from the congested side towards the senders. Pauses flowing both ways at once mean each end is waiting for the other, a cycle, and a queue frozen for 200 milliseconds is what the watchdog detects. Ordinary incast pauses and resumes often and does not trip the watchdog. A dirty optic shows CRC errors, and low ECN thresholds reduce pausing.

## 4

63 servers each send one megabyte at 400 gigabits per second to one server on the same leaf. Why can't DCQCN prevent the queue from overflowing at the start of the burst?

A, DCQCN works only for flows crossing a spine, not within a leaf. B, ECN marks are applied only after PFC has already paused the senders. C, the queue grows 3.1 megabytes per microsecond, faster than a mark and CNP round trip. D, DCQCN reacts only to drops, and a lossless queue never drops.

[think]

The answer is C: the queue grows 3.1 megabytes per microsecond, faster than a mark and CNP round trip.

62 excess senders at 50 kilobytes per microsecond each fill a 2 megabyte queue in about 0.65 microseconds, while the first mark must reach the receiver and its CNP come back before any sender slows, and each cut is at most half the rate. DCQCN converges over hundreds of microseconds, so PFC must carry the start. DCQCN works within one leaf, reacts to ECN marks rather than drops, and marking happens below XOFF.

## 5

A training job slows down. Switch counters show no drops and no errors. The leaf port facing one server shows many pauses received, and that server's NIC shows its priority 3 pause-transmit counter rising. What does this point to?

A, a congested spine pausing the leaf from above. B, a deadlock between the leaf and that server's NIC. C, misconfigured ECN marking on the leaf's egress port. D, a host that cannot drain its NIC, which pauses the fabric.

[think]

The answer is D: a host that cannot drain its NIC, which pauses the fabric.

A NIC that transmits pauses is a receiver whose buffer is filling because the host cannot take data at line rate, through PCIe placement, memory or receive queues: a slow receiver, and the root of a pause tree. A congested spine would show pauses transmitted by the spine and a deep queue there. A deadlock needs a cycle between buffers that forward to each other, and a server does not forward. Misconfigured ECN shows as marks without CNPs, or constant pausing at switch queues, not as pauses sent by a NIC.
