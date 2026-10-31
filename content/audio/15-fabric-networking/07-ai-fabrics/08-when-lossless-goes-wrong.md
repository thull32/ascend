---
lesson: when-lossless-goes-wrong
source: c03bdf2b98ceb90e
fit: partial
desk:
  - "The pfc-deadlock visualisation: pauses spreading to srv66's innocent flow, then the micro-loop deadlock and the watchdog breaking it"
  - "The incast visualisation: six senders into one 400 gigabit port, lossy versus PFC"
  - "The PAUSE frame field by field and the congestion-spreading step table"
  - "The four deadlock conditions table and the buffer dependency cycle finder in Python, with its three snapshots"
  - "The 63-to-1 incast arithmetic table"
  - "The counters table, the illustrative SONiC watchdog and PFC counter output, and the switch-versus-NIC table"
  - "The cross-side diagnose function in Python and its four cases"
  - "The failure modes and the trade-offs table of ways to live with congestion"
---
## Introduction

A training job on Meridian's San Jose GPU cluster slows from 410 milliseconds per step to 1.9 seconds. The network dashboards show no drops, no errors, and no interface above 60 percent. Both teams are right. A lossless fabric in trouble does not lose packets. It makes them wait, and waiting is contagious.

RoCE rides a lossless class because one drop costs it a go-back-N resend. PFC, priority flow control, lets a switch tell its neighbour "stop sending priority 3" when the bytes it holds from that neighbour cross a threshold called XOFF, and "resume" below XON. ECN with DCQCN is the gentler layer: a marked packet, a CNP back from the receiving NIC, a rate cut at the sender.

The fact this lesson rests on: a PAUSE frame carries a list of priorities and eight timers, and nothing else. At 400 gigabits the longest pause is 83.9 microseconds, refreshed for as long as the switch stays above XOFF. No flow, no destination, no queue pair. PFC can say "stop priority 3 on this link" and nothing finer.

Coming up: spreading, storms, deadlock, the watchdog, incast, and the counters that tell them apart.

## Spreading, victims and storms

A switch charges lossless bytes to the ingress port they arrived on, because a pause can only go back out of that port. So when one egress port is congested, the switch pauses every port feeding it, and each paused neighbour, now holding bytes it cannot send, pauses its own neighbours. The pauses climb towards the senders: a tree rooted at the congested port. That is congestion spreading.

Picture three switches: ai-spine1 and two rail 1 leaves, all links 400 gigabits. srv1 sends to srv3 at full rate, on rail1-leaf1. srv65, on rail1-leaf2, sends to srv3 at 200 gigabits through the spine. And srv66 sends 200 gigabits along that same path to srv5, whose port is idle.

srv3's port is offered 600 gigabits and can send 400. With an illustrative XOFF of 200 kilobytes, rail1-leaf1 pauses srv1 after about 12 microseconds, then pauses the spine. That stops all priority 3 on the link, srv5's packets included. The spine has 400 gigabits arriving and none leaving, so 4 microseconds later it pauses rail1-leaf2, which 8 microseconds after that pauses srv65 and srv66. Within a few tens of microseconds srv66 is stopped, though its destination is idle. Telemetry samples every 1 to 10 seconds, so a dashboard of averages sees the aftermath, never the spread.

srv66 is the victim of head-of-line blocking: a packet that could be delivered, stuck behind one that cannot, because both share one priority 3 queue on the paused link. srv5's own queue is empty. Why not a queue per flow? Ethernet has 8 priorities, each lossless one needs headroom on every port, so AI fabrics run one, and all RoCE traffic of all jobs shares it. The signal: srv5's port shows zero drops, errors and ECN marks, but srv66's NIC receives pauses. Follow them back and they end at srv3's port with the deep queue.

Spreading ends when the incast ends. A PFC storm does not. The classic root is a NIC, which sends PFC like a switch port. If its receive path stalls, through a firmware bug or a hung PCIe transaction, it pauses the leaf without end. Microsoft's 2016 SIGCOMM paper described one such NIC stopping lossless traffic across a large part of its network.

The common, milder version is the slow receiver: a healthy NIC that cannot move data into memory as fast as the wire delivers it, because it sits on the wrong PCIe switch, or PCIe trained at a lower generation or width, or its address translation cache misses. It pauses for part of every second, and the switch shows only pauses received on the port facing it. Read the duration counter, not the frame count: a port paused for 990 milliseconds of every second is a storm. And a healthy NIC rarely transmits a pause at all.

## Deadlock

Spreading needs a congested root, a storm a broken one. A deadlock needs neither. Once formed, it persists after its cause is gone, with every link healthy.

Operating systems deadlock under four conditions: mutual exclusion, hold and wait, no preemption, circular wait. A lossless fabric meets the first three by design. A buffer slot holds one packet; a packet holds buffer in one switch while waiting for buffer in the next; and lossless means nobody drops it to free the space. The fourth is a cyclic buffer dependency: a chain of "this buffer waits for that one" that returns to where it started.

In a healthy leaf-spine fabric every path goes up, then down. Uplink buffers wait only for downlink buffers, and downlinks only for servers, so no cycle can exist. It is lock ordering: take locks in a global order and circular wait is impossible.

A cycle needs a down-up turn, a valley: down to a leaf and back up to a spine. Micro-loops during convergence make them. So do detours: IS-IS takes shortest paths over whatever links survive, so a spine that loses a leaf reaches it down through another leaf and up another spine. An eBGP underlay with one AS for all spines rejects that path, so the spine drops instead, the safer failure here. And flooding: Microsoft found a switch flooding lossless packets for a dead server whose ARP entry outlived its MAC entry, and they closed a cycle.

Here is the micro-loop. The optic between ai-spine1 and rail1-leaf1 fails. The spine sees it almost at once, runs SPF first, and now reaches rail1-leaf1 by a valley: down to rail1-leaf2, up to ai-spine2. But rail1-leaf2 has not converged. It still hashes srv66's flow onto ai-spine1, which sends it straight back down. A packet starting at a TTL of 64 crosses that link about 60 more times, while srv66 keeps sending at 200 gigabits.

On a lossy fabric, the TTL ends this. What happens on a lossless one?

[pause]

Both directions fill. The leaf's buffer for bytes from the spine crosses XOFF, so it pauses the spine; the spine's buffer for bytes from the leaf does the same, and pauses the leaf. Each waits for the other. Nothing moves, and TTL falls only when a packet is forwarded.

Milliseconds later rail1-leaf2 converges. The loop is gone; the deadlock is not. The packets already in those buffers are queued for ports that stay paused, srv66 stays paused, and any other flow hashed onto ai-spine1, like srv65's flow to rail 2, joins the queue. A few milliseconds of inconsistency left a deadlock that lasts until something drops packets on purpose.

Finding cycles is a graph problem: a node per link buffer, an edge where one buffer's bytes can be forwarded into the next, and a depth-first search. The lesson's program finds a cycle only in the moment before rail1-leaf2 converges. That window is faster than any polled snapshot, so run it before changes: if this link fails, can any valley carry lossless traffic?

## The watchdog

To break a deadlock, remove one condition. Up-down routing removes circular wait. The PFC watchdog removes "no preemption": it drops packets to free buffer.

In SONiC, a lossless queue that is paused, holds packets and has sent nothing for the detection time, 200 milliseconds by default, is declared in a storm. Ordinary congestion never trips it. The default action drops: ignore pauses, discard what the queue holds and what arrives. After 200 more milliseconds without a pause, the queue is lossless again.

In the story, the watchdogs on rail1-leaf2 and ai-spine1 fire and the cycle dissolves. Receivers see sequence gaps and send NAKs; senders go back. Where a burst's tail was dropped, nothing reveals the gap, so the sender waits for its ACK timer, about 1.07 seconds with a timeout exponent of 18. Against a 410 millisecond step, that is half a step for detection and resends, more than two for a lost tail, and every GPU pays, because the step waits for the slowest transfer.

ConnectX NICs have the same guard: one that has sent pauses for seconds stops sending them, so a stalled host drops its own traffic instead of freezing the fabric. The watchdog bounds an outage to a few hundred milliseconds. Alert on every firing: frequent firing means your fabric is effectively lossy, with extra delay.

## Incast at scale

Incast is many senders to one receiver at once: gathers, parallel storage reads, mixture-of-experts exchanges with a popular expert. Ring collectives avoid it, since each GPU receives from one neighbour.

Take the worst case on one leaf: 63 servers each send one megabyte at line rate to the 64th. The queue grows by 3.1 megabytes every microsecond. Here is the number to remember: a lossy 2 megabyte queue is full in about 0.65 microseconds. Under PFC, every ingress port hits XOFF in about 4 microseconds, the leaf parks 12.6 megabytes for that one port, and the burst takes at least 1.26 milliseconds to deliver.

First conclusion: ECN cannot catch the start. A mark must reach the receiver and a CNP come back, a few microseconds, while the queue fills in under one. Each DCQCN cut is at most half the rate, and with CNPs about 50 microseconds apart, six halvings to a fair share take on the order of 300 microseconds. DCQCN converges long transfers; PFC carries every short burst.

Second: PFC at this scale is expensive. 12.6 megabytes is a large slice of a shared buffer of tens to around a hundred megabytes, so other ports hit their limits sooner and the incast spreads sideways as well as upstream.

The fixes are mostly above the network: collectives without many-to-one patterns, limits on concurrent peers, staggered reads, balanced experts, and receiver-granted credit, the direction of Ultra Ethernet. In the switch: early ECN marking, enough headroom, adaptive routing.

## The counters, and two halves of the story

Group the counters by loop. Congestion control: ECN marks on the switch, marked arrivals and CNPs sent at the receiving NIC, CNPs handled at the sender. They should track each other. Marks with no CNPs: congestion control is off at the receiver. CNPs never handled: lost on the way back, or DCQCN off at the sender. Flow control: pause frames and pause duration at both ends of every link, watchdog events, queue watermarks. Loss: lossless drops, out-of-sequence arrivals, NAKs and ACK timeouts. Gaps at the receiver while the lossless queue drops nothing mean the loss is elsewhere, often RoCE mismarked into the lossy class.

Three rules. Rates, not totals. Duration over count, because one pause may last a nanosecond or 84 microseconds. Peaks over averages: sampled queue depth looks empty during a pause tree, while a watermark keeps the peak.

One pattern names a deadlock. A pause tree pauses each link one way, towards the senders. Pauses both ways on a link, or around a ring, mean a cycle: in the lesson's output, rail1-leaf2's port to the spine sent and received about 21,000 each.

The switch knows ports, queues and links, but not jobs, and not whether a mark produced a CNP or a pause hurt anyone. The NIC knows queue pairs, hence jobs, its CNPs, gaps and time paused, but not which switch acted, or why. Joining them takes three maps: queue pair to job from the host, NIC to leaf port from LLDP, and flow to path from probes with the flow's five-tuple. Pauses sent at one end should match those received at the other.

That join closed the opening ticket. Someone finally read the leaf port facing srv3: 91,000 pauses received in ten seconds, a line nobody graphed, matched by srv3's NIC transmitting pauses. Its NIC sat in a PCIe slot under the wrong CPU socket. Neither team could have found it alone.

## In the interview

A RoCE job is slow, and switch dashboards show no drops. Where do you look?

[pause]

Scope first: one job or many, one rail or all. A lossless fabric slows by pausing, so read pause durations and watermarks on the job's ports and follow pauses to the root. Then the hosts: CNPs, out-of-sequence, timeouts, any NIC sending pauses. The wrong answer is "no drops, so not the network". Defer exact chip thresholds to the network team, and say what you would build: the pause-tree view and the host-switch join.

Why not set the watchdog to 1 millisecond?

[pause]

The 63-to-1 incast legitimately lasts 1.26 milliseconds, so a 1 millisecond timer would declare storms during normal work and drop in the lossless class: an expensive lossy fabric. 100 to 200 milliseconds separates frozen from busy.

## Recap

Four things to remember. A pause names a priority on a link, never a flow, so blocking spreads to whoever shares the queue, and "no drops" is not healthy. Deadlock is the four conditions: up-down routing is lock ordering, a valley breaks it, and the cycle outlives its loop. The watchdog is preemption, paid in go-back-N. Incast outruns ECN, so PFC carries the start and the fix is in the traffic pattern. And read durations, watermarks and NIC counters at both ends of every link: in RoCE the host is part of the network.

At your desk: the two visualisations, the frame and spreading tables, both programs, the incast arithmetic, the counter tables and output, and the trade-offs.
