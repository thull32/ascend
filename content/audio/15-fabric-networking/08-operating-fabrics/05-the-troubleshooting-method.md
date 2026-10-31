---
lesson: the-troubleshooting-method
source: 19a269391b1e3e2e
fit: great
desk:
  - "The probe-localisation visualisation: sixteen streams over four spines, three lossy ones through spine3, the second leaf pair and the cost-out"
  - "The silent-drop program over 48 probe streams, with its per-spine table, the wire counters and the conservation check"
  - "The two telemetry-blind visualisations, alive but congested and dead, and the four-verdict table"
  - "The training-step visualisation and the pause-root program that follows pauses to server 37"
  - "The illustrative outputs: the EVPN route, the ss line, the packet capture of the Nagle stall, and the NIC and PCIe counters"
  - "The scope questions, physics, failure modes and diagnostic strategies tables, and the counter arithmetic under the hood"
---
## Introduction

"The network is slow." One Meridian site has 16 leaves, 4 spines and 64 links between them, and every one has dozens of counters. Reading them all is not a method, and neither is starting with the device that misbehaved last time. The network is also blamed first by default, so whoever answers must find the fault or show, with evidence, that it is somewhere else.

Experienced network engineers ask in the same order every time. Scope first: one user or many, one site or several. Then reachability, then capacity, then the host.

So: the steps and why the order matters, then four cases told start to finish. Latency up from 10 to 50 milliseconds across EVPN. A device dropping packets without counting them. Telemetry gone quiet. And a RoCE training job slowing down.

## Scope first

Before any command, ask: is it only you, or your peers too? One user points at something local. Everyone points at something shared. That answer cuts the search more than any command can.

Four questions make it precise. Who: one host, one tenant, every tenant. Where: one leaf, one site, several. What: one port, large packets only, which means the MTU, RoCE only, which means the lossless class, or all traffic. And when: since when, and what changed. Intermittent with retries succeeding often means some ECMP paths are bad.

When matters most, because most outages follow a change, and the change log is the cheapest evidence there is. Read both sides' logs. "We upgraded nothing" is often wrong. Scope also sets urgency: one host is a ticket, every tenant in a site is an incident.

Then turn the complaint into a measurement. Ten milliseconds of query time in the customer's monitoring is not 10 milliseconds of network round trip, which inside one site is tens of microseconds. Get one failing flow as a 5-tuple with a timestamp, because in an ECMP fabric the 5-tuple decides which spine it crossed. And find a working flow to compare against. The difference is often the answer.

## Reachability, capacity, the host

Reachability in an EVPN fabric is three checks. The underlay, VTEP to VTEP: if that fails, IS-IS or a link is broken. The overlay, tenant address to tenant address inside the VRF: if only this fails, suspect EVPN state, a stale route or wrong route targets. And the MTU, with full-size don't-fragment pings. VXLAN adds 50 bytes, so a link that is not jumbo-sized drops full-size tenant frames: small pings work and big transfers hang. And a working ping proves one path. With four spines, three are untested.

Capacity is checked along the flow's path, not across the fabric. Utilisation in both directions, and balance between siblings: one uplink at 95 percent while three sit at 40 means colliding large flows. Discards, ECN marks, and on RoCE, pause frames. Frame check errors, because a corrupting link looks to TCP like a congested one. And flow sampling, to name the top talker.

Averages hide bursts. Two 400 gigabit senders converging on one port for one millisecond make 50 megabytes of excess, comparable to everything a shallow-buffer switch chip holds. A 30-second average at 20 percent never shows it. Discard counters keep those drops, so read them.

The host. The kernel measures each TCP connection's round trip. If it says 80 microseconds and the application says 50 milliseconds, those 50 are not on the network. And one connection moves at most its window per round trip. At 10 gigabits per second from Amsterdam to Singapore, about 105 milliseconds round trip, that is about 131 megabytes in flight. Linux's default maximum buffers, a few mebibytes, hold one connection to a few hundred megabits per second there, however fast the circuit. The fix is a kernel setting on the servers; no network change helps.

Why this order? Each step is a precondition for reading the next: utilisation means nothing until you know the flow's path, and host tuning means nothing while the path drops 4 percent. And each step costs more than the one before.

## Ten to fifty milliseconds

Since about 9:40, Acme's queries from its web server behind leaf1 to its database behind leaf3 have gone from 10 milliseconds to 50.

Scope: only that pair; everything else on those leaves is unchanged. Meridian's change log is empty that morning. Acme's shows a database driver upgrade on the web server at 9:38. A strong lead, but you still check the network quickly, because change logs can be wrong.

Reachability: no loss, full-size pings pass, and the database's EVPN route has not moved in 41 days. Capacity: no link above 30 percent, no discards. Sixteen probe streams across all four spines show about 60 microseconds on every one, as last week.

Now the physics. Before I tell you: where could 40 extra milliseconds come from?

[pause]

Distance would need 4,000 kilometres of extra fibre. Queueing would need 2 gigabytes buffered at 400 gigabits per second, and these switch chips hold tens of megabytes. A retransmission timeout costs at least 200 milliseconds, so one query in five would have to lose a packet, and nothing is lost. But Linux's minimum delayed-acknowledgement timeout is 40 milliseconds. That matches exactly.

The host confirms it: the kernel measures 84 microseconds to the peer. A capture shows the story. The new driver writes each query in two pieces, a 5-byte header, then the body. Nagle's algorithm makes the client hold the body until the header is acknowledged. The database delays that acknowledgement, hoping to send it with a reply, but it cannot reply without the body. Each side waits until the 40-millisecond timer fires, on every query. The fix is on the client: set the no-delay option, as the old driver did, or send each query in one write. Back to 10 milliseconds.

## The silent drop

A silent drop is a packet a device discards without counting it anywhere an operator looks. There are two kinds.

The first is counted, but not watched. Ping between leaf1 and leaf3 takes one spine and is clean. Sixteen probe streams that differ only in source port cover all four. The three through spine3 lose about 4 percent, only 0.7 percent averaged over all sixteen. A second leaf pair narrows it to spine3's link to leaf3, where a weak optic lane fails 3.9 percent of frames. The error counter was rising all along; nobody compared it with its baseline.

The second kind is not counted at all. After an upgrade on spine2, about one in four Acme connections to leaf4 time out, and a retry, with a new source port and so a new spine, usually works. Every session is up and every counter is clean. The software still holds the route to leaf4, but the upgrade left it unprogrammed in the switch chip, so packets that miss the lookup are dropped in the pipeline where interface counters do not see them. Hellos and BFD never use that route, so routing never removes the broken path.

Three steps find it. Probes: list the elements on every degraded path, and remove every element that also sits on a healthy one. Streams between leaf1 and leaf3 cross spine2 cleanly, which leaves only its forwarding towards leaf4. The wire: sent equals received on every link, but in five minutes spine2 sent leaf4 only 1,180 frames, while each sibling sent 6.3 billion. And conservation: every frame entering a device must leave, be counted dropped, or go to the CPU. Of 36 billion frames into spine2, 6.3 billion did none of those.

The fix: cost out spine2, capture its state first, get the table reprogrammed, then restore. Prevention: after every upgrade, compare what the software chose with what the chip holds.

## Dead or congested

Leaf2 stops streaming telemetry. Scope first: if every device went quiet, suspect the collector. One device raises the real question: dead, or congested? The telemetry session's keepalive rides the same data network and fails the same way in both cases. You need two witnesses off that path: an out-of-band heartbeat over the management network, and the neighbours, the spines' view of their links to leaf2.

A Globex batch job saturates leaf2's uplinks, and its best-effort telemetry is dropped. The out-of-band ping answers in 0.6 milliseconds; the spines report links up, IS-IS up, and 399 gigabits per second arriving. Verdict: alive, telemetry blind. When the job ends, the stream resumes with a 4-minute gap, stored as a gap, not as zeros. Now leaf2 loses power instead. The heartbeat times out while its neighbours on the management switch answer, and the spines lose signal. Verdict: dead. Page someone.

Four design rules follow. Sequence every sample, so a gap differs from an ended stream. Alert on absence of data, because silence has no bad value. Give telemetry a protected traffic class. And keep the heartbeat out of band, so the platform can say "I am blind here".

## The slow training job

Two facts make RoCE different. Training is synchronous: every GPU waits at each all-reduce for the slowest transfer. And the RoCE class is lossless: congestion shows as pauses and ECN marks, not drops.

Job A has gone from a 4.20-second step to 5.18 since a maintenance window in which several servers were serviced. Every rank reports the same step time, so scope by rail: utilisation is about 55 percent on all eight, but only rail 3 shows pauses and marks. Nothing is down, and there are no drops, which is what a lossless class looks like in trouble.

A dashboard ranking ports by pause count lights up half of rail 3. Before I tell you: is the loudest port the cause?

[pause]

Usually not. A paused port is a victim. Pauses travel upstream, away from congestion, so follow them to the node that sends pauses and receives none. Here it is not a switch: it is server 37's rail-3 NIC, pausing its leaf 41,200 times a second.

On server 37, the NIC's PCIe link came back from maintenance at half width, eight lanes instead of sixteen. The NIC can write into memory at only about 220 gigabits per second while the fabric delivers 400. Its buffer fills, it pauses the leaf, and its congestion notifications make every sender slow down to what it can absorb. Every ring through that server runs at about 220 over 400 of its speed, and the step grows from 4.20 to 5.18 seconds.

The fix: drain the server, reseat the NIC, confirm the link width, and run a bandwidth test before returning it. Prevention: a health check that refuses any server whose PCIe link is below its capability. The switch counters said "rail 3 is congested". Only the host counters said "one server cannot drain".

## In the interview

A follow-up the lesson expects: latency went from 10 to 50 milliseconds across the EVPN fabric. How do you narrow tens of thousands of links?

[pause]

Scope, and turn "10 milliseconds" into a measured metric. Check whether the destination's route moved. Run hash-spread probes between the two leaves; if the degraded ones share a spine or link, read that element's counters and compare sent with received. If they are clean, read the host. And do the physics: 40 milliseconds is 4,000 kilometres or 2 gigabytes of buffer. The wrong answer is "log into every switch and look for errors", which skips the probes that say which switch.

For the RoCE job: no drops is normal for a lossless class. It is honest to say you would defer to the network team on exact thresholds, but that you would build the view joining per-rail switch counters with per-NIC host counters, because that join finds the straggler.

## Recap

Five things to remember. Scope before any command, and the change log is the cheapest evidence. Then reachability, capacity and the host, because each step is the precondition for the next. One ping tests one path, and averages hide bursts and the one bad path. Conservation, in against out plus counted, finds drops no counter records. And on RoCE, follow pauses to the node that sends without receiving, then read the host.

At your desk: the probe and telemetry visualisations, the silent-drop and pause-root programs, the illustrative outputs, and the lesson's tables.
