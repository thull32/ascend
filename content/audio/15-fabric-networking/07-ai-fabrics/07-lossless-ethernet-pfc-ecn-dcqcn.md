---
lesson: lossless-ethernet-pfc-ecn-dcqcn
source: 52217e93566b43d5
fit: partial
desk:
  - "The pfc-pause visualisation: XOFF at 100 kilobytes, the headroom catching the bytes in flight, XON, nothing dropped"
  - "The ecn-dcqcn visualisation: marks, CNPs, two rate halvings and fast recovery on the rate chart"
  - "The go-back-N loss trace with its PSNs and the goodput numbers"
  - "The RoCE packet's QoS fields table and Meridian's DSCP map"
  - "The PFC frame field by field and the PFC timeline table"
  - "The headroom calculator in Python and its table of cable lengths"
  - "The ECN codepoints table and the threshold ladder"
  - "The CNP field table and the DCQCN trace table"
  - "The DCQCN simulation in Python, with the parameters to try"
  - "The PFC, ECN and alternatives comparison table and the healthy counter dump"
---
## Introduction

Ethernet drops packets when a queue overflows, and TCP copes: it notices, slows down and resends. RoCE version 2, the RDMA transport between Meridian's 1,024 San Jose GPUs, copes badly. One lost packet makes the sender resend everything after it, and a lost last packet can stall a queue pair for a second, nearly three training steps. So AI back ends run part of Ethernet lossless: the switch must never drop that traffic, even under incast.

Two mechanisms do it together. PFC, priority flow control, is the emergency brake: a filling switch tells its upstream neighbour to stop sending one class of traffic, for microseconds, on one link. ECN, explicit congestion notification, with DCQCN, the congestion control RoCE cards run, is the throttle: the switch marks packets instead of dropping them, the receiver reports the marks, and the sender slows before the brake is needed.

Coming up: why one drop costs so much, the fields that put a packet in the lossless class, the pause and its headroom, the marking thresholds, and one congestion event traced to full recovery. All on rail1-leaf1, a rail leaf of the San Jose back end.

## Why one drop is expensive

A reliable connected queue pair, the kind NCCL uses, delivers in order, in the card. Every packet carries a 24-bit packet sequence number, the PSN, and the receiver accepts only the next one it expects.

Trace one loss. srv1 writes one megabyte to srv3: 256 packets, PSNs 7000 to 7255. In a round trip of about 5 microseconds at 400 gigabits, about 60 packets are in flight. The leaf drops 7100. srv3 receives 7101, sends one NAK, a negative acknowledgement saying "expected 7100", and discards 7101 onwards, though intact: there is no reorder buffer. When the NAK lands, srv1 has sent up to about 7160, so it rewinds and resends all of them. One drop cost about 61 packets, 250 kilobytes, plus a round trip. TCP with selective acknowledgements would resend one.

With 60 packets wasted per loss, goodput is 94 percent at one loss in 1,000 and 62 percent at one in 100, where selective repeat would hold 99.

The tail loss is worse. Drop the last packet and nothing exposes the gap, so no NAK comes. srv1 waits out its ack timeout, which with NCCL's defaults is 1.1 to 4.3 seconds. If a step moves 100,000 messages, an assumption, then at one loss in 100,000 two steps in three wait a second or more, against a step of about 370 milliseconds.

Why not selective repeat? A card holds thousands of queue pairs; a reorder buffer for each costs memory, and go-back-N needs one counter. Newer cards and Ultra Ethernet add selective retransmission, but most RoCE fabrics today still assume no drops. The signals are on the hosts: out-of-sequence counts on receivers, sequence errors and ack timeouts on senders.

## Marking the packet

The switch protects only traffic it recognises. A traffic class is its internal label for treatment, a priority is the same number as PFC sees it, and a queue is one of a port's eight. On Meridian all three are 3, by choice, not by law.

The card marks each packet and the switch trusts the marking. There are two: PCP, 3 bits in a VLAN tag, and DSCP, the top 6 bits of the IP header's second byte. Meridian's back end is routed over untagged links, so it trusts DSCP, which travels end to end.

Read one RDMA write the way the leaf does. DSCP 26 maps to priority 3, the lossless class. The two ECN bits say the sender understands ECN. Together those eight bits are the old type of service byte: 26 times 4, plus 2, makes 106, the value you set on hosts as NCCL's traffic class. The UDP source port, one per queue pair, feeds the ECMP hash; port 4791 says RoCE. The base transport header carries the opcode, the destination queue pair and the PSN. And the invariant CRC, the end-to-end check, skips exactly the fields a switch may change, time to live, DSCP and ECN among them, so marking never breaks it.

There is no universal RoCE DSCP; 26 is NVIDIA's default and 24 is common. Meridian maps 26 to lossless priority 3, 48 to strict-priority lossy priority 6 for congestion notifications, and everything else to lossy priority 0. Every packet is charged twice: to its ingress priority group, the arrival port plus priority, where PFC decides, and to its egress queue, where scheduling and ECN act.

How it breaks: a host marking 24 into a fabric that maps 26 puts RoCE in lossy queue 0, droppable, with no error anywhere. The signal: RoCE bytes counted on priority 0.

## PFC and headroom

Plain Ethernet pause stops a whole link. Priority flow control stops only chosen priorities: RoCE on 3 pauses while lossy 0 keeps flowing. The frame is 64 bytes and link-local, a bit and a pause time per priority; at 400 gigabits the longest pause is about 84 microseconds. The switch sends a long pause, called XOFF, refreshes it while needed, and sends zero, called XON, to resume.

Each ingress group has two thresholds: cross XOFF and the port is paused; fall below the lower XON and it resumes. The first visualisation tells it as a story. srv1 and srv2 both write to srv3 at 400 gigabits, over 50 metres of fibre, with a fixed XOFF of 100 kilobytes. Each sender's group grows 25 kilobytes a microsecond. At 4 microseconds both hit XOFF and are paused. Bytes in flight keep landing for 0.6 microseconds, to a peak of 115 kilobytes. At 6 microseconds they drain to the 80 kilobyte XON and resume. Every 4 microseconds it repeats: each sender averages 200 gigabits, srv3's port never idles, nothing is dropped. The pause never reaches a host capture; counters, above all pause duration, are the only evidence.

Three properties decide what goes wrong. It is per priority, not per flow: paused srv1 cannot send priority 3 to anyone, even an idle receiver. It is hop by hop: a paused switch that fills pauses its own neighbours, which is congestion spreading, the next lesson's subject. And both ends must agree; DCBX advertises the settings but makes nothing lossless.

Now headroom: buffer above XOFF for the bytes that keep arriving after the decision to pause. In words, the line rate times twice the cable delay plus the card's reaction time, plus two full-size frames. 50 metres at 400 gigabits needs 48.4 kilobytes; 100 metres, 73; two kilometres, a megabyte; Amsterdam to Singapore, 5.3 gigabytes, more than any switch has.

Three rules follow. One or two lossless priorities, never eight: each reserves headroom on every port, 7 percent of an illustrative 64 megabyte buffer for 64 ports of 100 metres, so eight would take 59. Lossless stops at the building. And the configured cable length must be right: a 200 metre run left at a 100 metre default drops under exactly the burst it was built for.

## Marking before the queue fills

PFC fires only when a buffer is nearly full, and it hits whole priorities. Better that senders slow while the queue is short. With ECN a congested switch sets the two bits to "congestion experienced" instead of dropping. A packet sent as not ECN-capable is never marked.

When to mark comes from WRED, weighted random early detection, with "mark" in place of "drop". Below Kmin, never. Between Kmin and Kmax, with a probability rising in a straight line to Pmax. Above Kmax, always. Data center switches use the instantaneous queue depth, because a microsecond burst is what matters, and many mark as a packet joins the queue, so the mark waits behind everything ahead of it. The DCQCN paper used 5 kilobytes, 200 kilobytes and 1 percent; production profiles are larger, for example Cumulus Linux's 150 kilobytes and 1.5 megabytes.

The thresholds form a ladder: Kmin lowest, then Kmax, then XOFF, then headroom, and a drop only if headroom was miscalculated. What happens if Kmin sits above the point where XOFF fires?

[pause]

PFC fires first, every time, and the fabric works by pausing, with spreading and head-of-line blocking. The rungs count different things: Kmin watches the egress queue, XOFF each ingress group feeding it, and in a many-to-one incast the queue is split across many groups, so marking should start long before any group pauses. The signal: zero ECN marks per queue during congestion means ECN is not in effect.

## CNPs and DCQCN, traced

The mark travels away from the sender, so something must carry it back. TCP echoes it in its acknowledgements, but RoCE has no per-packet ack stream: acks are coalesced. So the receiving card sends a congestion notification packet, a CNP, naming the sender's queue pair. The receiver sends it, not the switch, because a switch does not know queue pairs, and an older layer 2 scheme could not cross routers. It is rate limited, one per queue pair per 50 microseconds in the paper, and rides DSCP 48 in a strict-priority, lossy queue, so it overtakes the congestion it reports. The signal: CNPs sent at receivers against CNPs handled at senders.

DCQCN has three roles: the switch marks, the receiving card sends CNPs, and the sending card sets its rate in hardware. A new queue pair starts at line rate, with no slow start. The sender keeps a current rate, a target rate, and alpha, its congestion estimate, starting at 1. On a CNP it remembers the current rate as the target and cuts by alpha over two: with alpha at 1, it halves. Recovery runs on a timer: five steps of fast recovery, each halfway back to the target, then additive increase, nudging the target up.

Now the second visualisation. Same two senders, the paper's parameters, at 400 gigabits. srv2 joins srv1 at 20 microseconds: 800 into a 400 port. The queue passes Kmax at 24, and every packet joining it is marked. But that packet waits behind 200 kilobytes and reaches srv3 at 28. CNPs go back, and at 29 microseconds both senders halve to 200 gigabits. Together that is exactly what the port drains. So why does the queue not shrink?

[pause]

Because the cut fixed the rate, not the backlog. The 450 kilobytes built during 9 microseconds of feedback delay stay, and srv3 may not send another CNP for 50 microseconds. At 79 the second cut takes both to 100 gigabits, and the queue empties at 97. Then recovery every 55 microseconds: 150, 175, 187.5, 193.75, and 196.875 at 354. The port sat half idle from 79 microseconds. Cut hard, climb slowly: DCQCN's sawtooth. And no pause was sent: ECN acted, PFC stayed in reserve.

PFC answers "is this buffer about to overflow?" for one link, now; ECN answers "is this flow too fast?" end to end. DCQCN is too slow for an incast's first microseconds, and PFC alone pauses everyone, so each needs the other.

## In the interview

The production failures follow. A new cluster runs slow with RoCE bytes on priority 0: a host image set the wrong DSCP. Pause counters climb with zero ECN marks: marking off for the class, or Kmin above XOFF. Drops on the lossless class only on the longest runs: headroom for the wrong cable. So the platform shows switch marks beside CNPs sent and handled, pause duration, buffer peaks rather than averages, the threshold ladder checked on every switch, and host transport errors on the job's timeline.

The classic question: PFC already prevents loss, so why does a RoCE fabric need ECN too?

[pause]

PFC pauses a whole priority, hop by hop. It never tells the flow causing congestion to slow down, it pauses innocent flows, and it can spread into storms or deadlock. ECN with DCQCN slows the specific queue pairs causing it, end to end, before XOFF, so PFC becomes a rare backstop. The wrong answer: "ECN is for TCP; RoCE uses PFC."

And: switches show zero drops, but a job is slow. Scope first, one job or all. Then the hosts: sequence errors and ack timeouts reveal loss switches did not count, such as traffic in the wrong class. Then pause duration and watermarks: zero drops with heavy pausing is still a slow fabric. The wrong answer: "no drops, so it's not the network."

## Recap

Five things to remember. Go-back-N makes one drop cost a window of resends, and a lost last packet a timeout of a second or more. DSCP alone puts RoCE in the lossless class, and a mismatch silently makes it lossy. PFC pauses one priority on one link, upstream, for everyone on it, and headroom for the bytes in flight caps lossless at one or two priorities in one building. ECN marks below XOFF: mark first, pause as backstop. And DCQCN's first cut fixes the rate, not the queue.

At your desk: both visualisations, the go-back-N trace, the QoS fields and DSCP map, the PFC frame and timeline, the headroom calculator, the ECN ladder, the CNP fields and DCQCN trace table, the simulation, the comparison table and the counter dump.
