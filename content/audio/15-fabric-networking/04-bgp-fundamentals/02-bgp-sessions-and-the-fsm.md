---
lesson: bgp-sessions-and-the-fsm
source: 46254650f45cec77
fit: partial
desk:
  - "The TCP capture of a session coming up, and the 19-byte message header"
  - "The OPEN field by field, its capability table, and the Python that builds, parses and checks it"
  - "The NOTIFICATION code table"
  - "The state diagram, the bring-up trace from leaf1.ams to rr1.ams, and the state-machine simulator"
  - "The detection-time table and the TCP backoff simulation of hold-timer survival"
  - "The causes of Active, the troubleshooting table, and the platform triage code"
  - "The BGP fabric visualisation: from port 179 to Established, then a hold-timer expiry"
---
## Introduction

Two routers are exchanging routes: a few thousand in a data center fabric, or the internet's million. Each route has to arrive exactly once and in order, and each side has to notice quickly when the other has gone, because every route from a dead neighbour points traffic into a hole.

BGP, the Border Gateway Protocol, hands reliable delivery to TCP, sends only changes, and puts a small state machine and a heartbeat on top. That design explains what you see on every session: a TCP handshake on port 179, four message types, six states, a hold timer, and a state called Active that, confusingly, means the session is not working.

The example is one session on the Meridian fabric: leaf1.ams, loopback 10.255.1.11, talking to its route reflector rr1.ams, loopback 10.255.1.101, both in AS 65000. A route reflector relays routes between leaves so they need not all peer with each other. Coming up: why TCP, the messages, the states traced, the hold timer worked, and what to do when a session will not come up.

## Why BGP rides on TCP

BGP has no discovery. IS-IS finds neighbours with hellos on every link, but BGP talks only to addresses an operator or a template wrote down. The session is one TCP connection: one side connects to the other's port 179.

What TCP buys: nothing is lost, so after the initial table BGP sends only changes, and a stable session carrying a million routes uses almost no bandwidth. BGP needs no retransmission of its own, and a slow receiver shrinks its TCP window rather than dropping routes.

It costs three things. First, the peer must be reachable before BGP starts: for iBGP between loopbacks, the underlay, IS-IS on Meridian, must already route to the reflector. BGP depends on the interior routing protocol, never the reverse. Second, head-of-line blocking: a keepalive written behind 2 megabytes of updates waits for all of them. Third, TCP's own liveness check is useless here. Linux's first TCP keepalive probe comes after 7,200 idle seconds, and acknowledgements come from the kernel, not the BGP process, so a hung BGP daemon still has its bytes acknowledged. Hence BGP's own heartbeat.

A few details decide whether the connection request even arrives. A directly connected eBGP session sends with a TTL of 1, so it fails if the peer is more than one hop away. GTSM inverts that: send with TTL 255 and accept only packets whose TTL proves they came from close by. And segments signed with TCP MD5 that fail verification are dropped by the kernel without a reply. When any of this goes wrong, BGP never sends its first message.

## The four messages

Every BGP message starts with the same 19-byte header: a marker of all ones, a length, because TCP is a stream and the receiver needs to know where each message ends, and a type. A KEEPALIVE is that header and nothing else.

The first thing each side writes after the handshake is an OPEN, a proposal: who I am, how long you may stay silent before I give up on you, and what I can do. It carries my autonomous system, which the receiver compares with the AS it was configured to expect; a mismatch, usually a template typo, is refused as Bad Peer AS. It carries the hold time: how many seconds the sender will wait without hearing from the peer. Both sides use the smaller of the two proposals, which must be 0, never time out, or at least 3. And it carries the BGP identifier, the router ID, conventionally the loopback. It must be unique within the AS: it breaks best-path ties, prevents loops in reflected routes, and decides which connection survives a collision. An iBGP OPEN carrying the receiver's own identifier is refused.

Last come capabilities, which are how BGP grew without a version 5: the session gets only what both sides announce. The one that bites is the address family, the kind of route a session carries, such as IPv4 or EVPN. A family missing on one side does not fail the session. It leaves an Established session carrying nothing in that family. Hold that thought.

Once the OPENs are accepted, each side sends a KEEPALIVE. The first confirms the OPEN; after that they are the heartbeat, conventionally every third of the hold time. Any KEEPALIVE or UPDATE received restarts the hold timer, so a busy session needs no keepalives.

An UPDATE carries routes; the next lesson opens it. Two session facts matter here. The initial transfer is the whole table: about 1,300 EVPN routes from rr1.ams in milliseconds, or a full internet table in seconds to minutes, limited by the receiver's CPU. And an empty UPDATE called End-of-RIB says "that is everything". Without it, a tool cannot tell a session still loading from one that is complete and short of routes.

Finally, NOTIFICATION. BGP has no close message. A speaker ending a session sends a NOTIFICATION with an error code and subcode, closes TCP, and every route learned from that peer is withdrawn. Code 2 is an OPEN error: the ends are configured differently. Code 4 is hold timer expired. Code 6, Cease, is deliberate: an operator, a prefix limit, or BFD. The catch: if the path is already dead, the NOTIFICATION never arrives, and the peer learns only from its own hold timer.

## The state machine, traced

BGP runs one state machine per peer, with six states. Remember them by what is on the wire. Idle is not trying. Connect means a connection request is in flight to port 179. Active means no TCP connection: listening, and waiting for the ConnectRetry timer to try again. OpenSent means TCP is up and my OPEN is out. OpenConfirm means we exchanged acceptable OPENs and I am waiting for your KEEPALIVE. Established is where routes flow.

Now the story. rr1.ams reboots, and leaf1.ams brings the session back. Meridian's reflectors never initiate; they accept leaf sessions from a listen range covering the site's loopbacks, so a new leaf can join without touching them. At time zero leaf1 goes from Idle to Connect and sends its request. The reflector is still booting, nothing is listening, and a reset comes straight back. leaf1 drops to Active and waits 10 seconds, Meridian's ConnectRetry.

The timer fires, leaf1 goes back to Connect, and this time the reflector is listening. The handshake completes, leaf1 sends its OPEN proposing a hold time of 9 and moves to OpenSent. The reflector's OPEN proposes 90. Each checks the other's, sends a KEEPALIVE and moves to OpenConfirm, and the hold time becomes the minimum, 9 seconds. As each KEEPALIVE arrives, both reach Established, about 10 seconds after the start. The table flows, then End-of-RIB, then a KEEPALIVE each way every 3 seconds.

Fast forward to second 598. The reflector's last KEEPALIVE arrives, and then its BGP process hangs. Its kernel keeps acknowledging TCP, so the connection looks fine. At second 607, 9 seconds of silence later, leaf1's hold timer expires. It sends NOTIFICATION code 4, drops to Idle and withdraws the reflector's routes. And leaf1 loses nothing, because it holds the same routes from rr2.ams. That is why reflectors come in pairs.

One more twist. Both routers usually initiate, so two TCP connections can complete at once. Each side compares the BGP identifiers and keeps the connection started by the higher one, closing the other with Cease subcode 7.

## Hold timers, worked

The timer runs from the last message received, so a silent peer is noticed somewhere between the hold time minus the keepalive interval and the full hold time. 180 and 60, a common vendor default, detect in 2 to 3 minutes. 90 and 30, the standard's suggestion, in 60 to 90 seconds. 9 and 3, typical of fabrics, in 6 to 9 seconds. BFD at 300 milliseconds times three, in about 0.9 seconds.

At the edge that costs real traffic. gw1.ams proposes 180 to ISP1, ISP1 proposes 90, so the session runs at 90 and 30. ISP1's router dies, but a carrier switch sits between the ports, so gw1's interface never goes down. gw1 keeps sending into the dead router for 60 to 90 seconds, 75 on average: at 4 gigabits a second, about 37 gigabytes dropped before traffic moves to ISP2. BFD would cut that to under a second.

So why not 9 seconds everywhere? Before I tell you: if TCP retransmits a lost keepalive, how can a 5-second outage kill a 9-second session?

[pause]

Exponential backoff. The outage runs from second 10 to 15.5, and the last keepalive heard was at 9. The one sent at 12 is lost, and TCP retries at 12.2, 12.6, 13.4 and 15.0, each wait doubling, all inside the outage. The next retry is at 18.2, and later keepalives cannot overtake it, because TCP delivers in order. That is 9.2 seconds of silence: a 9-second session dies from a 5.5-second outage, while a 90-second session survives one of 70 seconds. Short timers buy fast detection and pay in sensitivity to brief outages and a busy CPU. So fabrics run 3 and 9, internet edges rarely go below 30 and 90, and sub-second detection goes to BFD.

## When a session will not come up

Active means TCP will not complete, so the cause is below BGP. Walk it in the order the packets travel: a route to the peer; the session sourced from the loopback the peer expects; the far side configured at all; a filter, or the policer protecting the switch's CPU, dropping port 179; an MD5 key mismatch; eBGP to a loopback without multihop; or both sides passive, so nothing is on the wire.

Before any command, scope it. One session is that pair. Every session on one router is the router. A whole site is the underlay or a shared change. Then read the state, because it names the layer. Active: no TCP. Stuck in OpenSent: TCP up, no OPEN back, so the peer's process or a middlebox. OpenSent to Idle, repeating: a refused OPEN, so read the subcode and which side sent it. Established but flapping on a regular period: the hold timer. Established with zero prefixes: the routes, not the session.

Three cases on Meridian. leaf9.ams sits in Active after a hardware replacement: its re-rendered template forgot to source BGP from the loopback, its attempts come from an uplink address outside the reflector's listen range, and the reflector refuses them. One template line; diff rendered configuration against intent.

The second is a better story. gw2.ams to ISP2 flaps every three minutes, hold times 180 on both sides, gw2 sending code 4 each time, received prefixes stalling at a few hundred. The circuit is a carrier's layer-2 service carrying 1,500-byte frames, but both router ports are set to 9,216. The handshake, the OPENs and the keepalives are small, so the session comes up, and the first updates leave in small segments. Then ISP2's full table backs up, segments grow to full size, and the carrier's switch discards them without a word, because a layer-2 device sends no "too big" message. TCP keeps retransmitting, ISP2's keepalives queue behind, and 180 seconds later gw2's hold timer expires. The signature: uptime about the hold time, and a stalled prefix count. Match the MTU to the circuit.

Third, rr2.ams will not peer with rr1.ams after a rebuild: Bad BGP Identifier, because the template copied rr1's router ID. The leaves have different IDs, so their sessions came up and the fault hid.

Your tooling should surface time in state, because Active for 41 seconds after a reboot is not Active for 41 days; the last NOTIFICATION with its direction; negotiated families against intent; prefix counts plus End-of-RIB; and redundancy, yellow when one reflector is lost, red when both are.

## In the interview

A principal engineer asks: walk me through the BGP states.

[pause]

Name each by what is on the wire: Idle not trying, Connect a request in flight, Active no TCP and waiting to retry, OpenSent my OPEN out, OpenConfirm waiting for the KEEPALIVE that accepts it, Established routes flowing. Then the practice: stuck in Active is TCP, cycling from OpenSent to Idle is a refused OPEN, flapping out of Established is the hold timer. The wrong answer calls Active "actively exchanging routes".

And another: hold time 9 seconds or 180 on an internet edge? Neither alone. 180 allows up to three minutes of black-holing when a peer fails silently; 9 makes the session sensitive to CPU load during full-table churn and to short outages stretched by backoff. The usual answer is a moderate hold time plus BFD, which runs independently of the BGP process.

## Recap

Five things. BGP rides TCP on port 179 and sends only changes, but needs its own hold timer, because the kernel acknowledges even when the BGP process is dead. Hold time is the minimum of two proposals. Active means no TCP, so look below BGP. Read a NOTIFICATION's code and direction first, and remember a silent peer sends none. And Established is not healthy: check families, End-of-RIB and prefix counts.

At your desk: the OPEN field by field with its code, the NOTIFICATION codes, the bring-up trace and simulator, the hold-timer simulation, the troubleshooting tables, and the session visualisation.
