---
lesson: convergence-and-scale
source: 36da7086bc803b6c
fit: partial
desk:
  - "The path-hunting visualisation and the round-by-round table for AS 64496, ISP1 and ISP2"
  - "The path-hunting simulation and its growth output for three to seven networks"
  - "The MRAI implementation table and the PIC failover timeline, with and without a backup"
  - "The ADD-PATH, graceful restart capability and BMP per-peer header field tables"
  - "The route flap dampening simulation and its three runs"
  - "The BMP convergence summariser and its output, the failure-mode table and the convergence toolbox"
---
## Introduction

An announcement crosses the internet in seconds: the first copy of a new route is real, so every router accepts it, passes it on, and is done. A withdrawal can take minutes. A router that loses a route still holds other paths to the prefix, heard earlier, and cannot know they are dead too. So it switches to one, tells its neighbours, and waits to be proven wrong, while traffic follows paths that lead nowhere or in circles.

And at full-table scale, about a million IPv4 prefixes, one failed upstream can mean a minute of lost traffic while a router rewrites its forwarding table prefix by prefix.

Both play out on Meridian's internet edge: Meridian is AS 64500 with gateways gw1.ams and gw2.ams, ISP1 is AS 64501, ISP2 is AS 64502, plus a transit provider, AS 64496, and a content network, AS 64511. Coming up: path hunting and the timer that paces it, failover in one write, graceful restart, how dampening backfires, where the tables run out, and how to measure it all.

## Path hunting and MRAI

A router keeps every path each neighbour sent it, but advertises only its best. When the best is withdrawn, it reruns the decision over what is left. If the origin itself withdrew, everything left is stale: routes through somebody else that ultimately ran through the origin.

Here is the smallest case that hunts. AS 64496, ISP1 and ISP2 each connect to AS 64511, which originates 192.0.2.0 slash 24, and all three peer with each other. Meridian is ISP1's customer, and before anything happens it sees a two-AS path: ISP1, then the origin.

At time zero the origin withdraws. Each network falls back to a reserve. ISP1 takes the path through AS 64496, and AS 64496 takes the path through ISP1. Now ISP1 forwards the prefix to AS 64496, which forwards it straight back: a transient loop, burning a shared link until each packet's TTL runs out. Meridian is told a three-AS path.

Nothing in BGP says "this path is dead". So what finally kills a stale path?

[pause]

The router's own AS number coming back to it. Thirty seconds later, in round two, the round-one advertisements arrive, each containing the receiver's own AS. ISP1 discards the copy from AS 64496 and moves to ISP2's longer path; AS 64496 has nothing left. Meridian is told a four-AS path. In round three, at 60 seconds, everything comes back looped or withdrawn, and Meridian finally hears the withdrawal. Paths of two, three and four ASes, for a prefix gone since time zero: 19 messages for one prefix.

Grow the mesh and, with n networks, the hunt takes n rounds and messages grow roughly with n cubed: seven networks take 211 messages and 180 seconds. And lockstep is the kind case. Labovitz and colleagues showed in 2000 that with real timing a full mesh can, in the worst case, explore factorially many paths, and measured internet withdrawals taking about three minutes on average, some up to fifteen.

The timer in that story is MRAI, the minimum route advertisement interval between two advertisements of the same prefix to the same peer. RFC 4271 suggests 30 seconds for eBGP and 5 for iBGP, with jitter. It is a rate limit with collapse: when the timer fires, the router sends its current best, so if ISP1 changes its mind three times in one interval, Meridian hears only the last.

Why not zero? In lockstep the hunt would take milliseconds. But real routers react to every message as it arrives, advertising many more transient paths, and Griffin and Premore's 2001 simulations found convergence against MRAI V-shaped: too high and it grows with the timer, too low and message counts climb and it slows again. Cisco defaults to 30 seconds for eBGP and zero for iBGP; Junos, many modern stacks and data center fabrics send immediately. In a fabric, one shared spine AS also makes stale paths fail the loop check at once.

The signal of a hunt: for one prefix, a run of updates with steadily longer AS paths, ending in a withdrawal.

## Failover in one write: PIC and ADD-PATH

Most outages an operator cares about are simpler: its own upstream fails, and a good alternative exists. With a million prefixes, how fast traffic moves is set by programming the FIB, the routing table in the forwarding chip, not by BGP.

Meridian gives ISP1's routes a local preference of 200 and ISP2's 100. gw1.ams uses ISP1. gw2.ams also prefers ISP1's paths, learned over iBGP from gw1.ams, so its own ISP2 paths are not best and it advertises them to nobody. Now ISP1's router dies with the circuit still lit. BFD notices at 0.9 seconds.

Without a backup, gw1.ams deletes a million paths and withdraws them. Within a few seconds gw2.ams hears, reruns best path, and ISP2 wins. Then it programs a million entries and advertises them, and at an assumed 20,000 routes a second, the last prefix forwards again after about a minute.

BGP PIC, prefix-independent convergence, changes the shape. In a hierarchical FIB a million prefixes share one entry for their next hop. PIC core handles a change in the IGP path to that next hop: rewrite the shared entry and they all move. PIC edge handles the next hop itself dying: the shared entry holds a primary and a precomputed backup, and the failure flips it in one write, bounded by detection, whatever the table size.

It needs three things. A backup in the RIB: gw2.ams must advertise its ISP2 path anyway, which is called best-external. A FIB that can hold a backup, which depends on the chip. And a fast trigger like BFD, not a hold timer of 90 to 180 seconds. One trap remains: in plain IP, redirected packets reach gw2.ams, whose own table still says "via gw1.ams", and bounce between the gateways for seconds. It works cleanly when the packet carries an MPLS label meaning "out through ISP2".

The reflectors are the other obstacle. A session normally carries one path per prefix, and a new announcement implicitly withdraws the previous one, so a reflector advertising only its best hides the alternatives. ADD-PATH puts a 4-byte path identifier in front of every prefix, so a second path is added rather than replacing the first. The sender chooses what to send: all paths, the best few, or the best plus one backup with a different next hop, which is what PIC wants. "Send all" makes memory and churn grow with the number of exits.

The signals: PIC coverage, the share of prefixes with a backup in hardware, and paths per prefix at each reflector client against what the topology should give.

## Graceful restart: not converging on purpose

When a router's BGP process restarts, for a crash or an upgrade, its forwarding chip keeps forwarding. Without help, every peer withdraws every route through it and re-learns them when it returns: two internet-wide convergence events for a router that never dropped a packet.

Take a planned upgrade of gw1.ams, with ISP1 as the helper and a 120-second restart time. At time zero the session closes without a NOTIFICATION. ISP1 marks Meridian's paths stale, keeps forwarding on them, and starts the timer. The internet sees nothing. At 45 seconds the new process sends an OPEN saying "I restarted, and my forwarding was preserved". ISP1 sends its full table and an End-of-RIB marker, an empty update meaning "that was everything", and gw1.ams defers best-path selection until it arrives, so it never computes from half a table. At 50 seconds gw1.ams advertises its routes, and ISP1 replaces its stale copies and deletes any not re-advertised.

Graceful restart is a bet that the data plane is fine. If gw1.ams had rebooted completely with the circuit lit, ISP1 would forward Meridian's inbound traffic into a dead box for the full 120 seconds. The protection is BFD running in hardware, flagged as independent of the control plane: if it fails too, the helper abandons graceful restart at once. In a fabric with redundant spines, routing around a restarting box is cheap, so many operators keep it for the edge.

Long-lived graceful restart, LLGR, is for when a stale route for hours beats none. Stale routes are tagged with a well-known community and used only if nothing else exists. The Meridian case: a bad push takes down both Amsterdam reflectors, every leaf's sessions expire after 9 seconds, and without LLGR each leaf flushes every EVPN route. Tenant traffic stops, though every tunnel and spine works. With LLGR at an hour, the leaves keep forwarding. But nothing updates them: a virtual machine that moves leaf in that hour keeps receiving traffic at its old one.

## Route flap dampening backfires

A prefix that flaps every few seconds costs every router on the internet an update and a decision each time. Route flap dampening, from 1998, keeps a penalty per prefix and per peer. A withdrawal commonly adds 1,000, an attribute change 500, and the penalty halves every 15 minutes. Above 2,000 the route is suppressed until it decays below 750, for at most an hour.

Now feed it the hunt. AS 64511's link goes down once. Path hunting delivers that to gw1.ams as two attribute changes and a withdrawal: about 2,000 points from one flap. Five minutes later the link flaps again, the hunt repeats, and at 300 seconds the prefix is suppressed. The origin is stable from 480 seconds, yet Meridian cannot reach it for another 31 minutes, while the penalty decays from about 3,200 to 750.

Mao, Govindan, Varghese and Katz described exactly this in 2002. RIPE's routing working group advised against dampening in 2006, then accepted it again in 2013 with a suppress threshold of at least 6,000, the value RFC 7196 recommends, which catches only chronic flappers. At 6,000 those two flaps leave the prefix usable. And never dampen inside a fabric or on iBGP, where a flap is a fault to fix.

## Where the tables run out, and how to watch

Two memories hold a full table, and they run out differently. The RIB is software memory: every path from every peer. gw1.ams holds three paths per prefix, three million paths, about 600 megabytes at an assumed 200 bytes each, and running out kills the daemon. The FIB is fixed in silicon: data center switch chips hold a hundred thousand to a few hundred thousand IPv4 routes, edge chips several million. A full FIB fails silently: BGP keeps advertising routes the hardware drops, punts to the CPU, or sends by a less specific route.

The public case is 12 August 2014, when the IPv4 table passed 512,000 routes, the default allocation on several widely deployed platforms, Cisco's Catalyst 6500 and 7600 among them. Networks lost reachability to some prefixes, and the fix needed a reboot. Meridian keeps the full table on its edge-class gateways only, and never advertises a route before the hardware holds it.

Everything in this episode is over before a poller looks: a minute of hunting is invisible to scraping every five minutes. BMP, the BGP Monitoring Protocol, streams the router's own view to a collector: every session coming up or down with both OPENs, and every update, stamped with the time the router received it. That timestamp is the basis for every convergence measurement, and a hunt appears as its sequence of AS paths. BMP's own failure is that a collector that silently stopped receiving looks exactly like a stable network, so monitor its freshness first.

The platform should show convergence per event, measured from those timestamps and from probes. "0.9 seconds for 99 percent of prefixes" is a measurement; "BFD is configured" is not.

## In the interview

Failover from ISP1 to ISP2 loses a minute of traffic. Get it under a second.

[pause]

Split detection from repair. Detection: BFD, not a hold timer. Repair: a minute means per-prefix FIB rewriting, so the backup must already be known, through best-external and ADD-PATH, and installed as a PIC backup, making failover one write. Then check the backup router does not loop the packet back. The wrong answer is "lower the MRAI": it paces advertisements to peers, not local failover.

A customer's prefix was unreachable from one large network for forty minutes after a two-minute outage. What happened?

[pause]

Dampening, amplified by path hunting. The outage arrived there as several attribute changes and withdrawals, enough to cross 2,000, and the penalty took half an hour to decay. Confirm with that network's looking glass, a public page running read-only BGP queries, or BMP showing the route present but suppressed. The wrong answer is "BGP is slow to propagate".

## Recap

Four things to remember. Bad news travels slowly because stale paths die only when a router sees its own AS come back, one MRAI round at a time, and lower MRAI is not always faster. PIC makes failover one write, but only if the backup is known, installed and not looping. Graceful restart is a bet on the data plane, so pair it with hardware BFD. And old dampening thresholds plus path hunting suppress healthy prefixes for half an hour: measure it all with BMP and probes.

At your desk: the path-hunting visualisation and simulation, the PIC timeline, the field tables, the dampening runs and the BMP summariser.
