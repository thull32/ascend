---
lesson: redundancy-and-failure-domains
source: eaff25af917a72a4
fit: great
desk:
  - "The pair availability code and its output, with the common-cause share from zero to 20 percent"
  - "The MLAG versus EVPN multihoming diagram and comparison table, and the EVPN multihoming visualisation"
  - "The failure-domain table and the blast-radius model code with its ranked output"
  - "The three-spine failure visualisation, the headroom code and its safe-peak table"
  - "The drain mechanism table, the illustrative route output, and the spine drain visualisation"
  - "The what-fails table, the failure modes table and the redundancy trade-offs table"
  - "Practice problem: blast radius"
---
## Introduction

Meridian's small Amsterdam fabric, four spines and four leaves, already has 16 fabric links and 32 optics. The full site has 128 optics, and the AI cluster in San Jose has thousands more. Across three sites something is broken most weeks, and every switch needs a software upgrade at least once a year. A network that needs everything working is down most of the time.

So the question is not how to stop failures. It is: when a part fails, or is taken out for work, what does it cost, and who notices? The answers are pairs, many parallel parts, small failure domains drawn on purpose, spare capacity for a loss in the busiest hour, and a way to take any device out without dropping a packet.

## Everything in pairs

Nearly every role at Meridian comes in twos: two power supplies per switch on separate A and B feeds, two route reflectors, two border gateways and two internet providers, two circuits to Singapore, and out-of-band management with in-band access as the second path. The goal is no single point of failure. Spines are the exception, in fours or more, because a spine holds no state its peers must agree on.

Now the arithmetic, and why it lies. Say one leaf is available 99.9 percent of the time, about 8.8 hours down a year. A pair is down only when both are down at once: about 30 seconds a year. That assumes they fail independently, and they rarely do. Both may share a power feed, a rack, a software release, a pipeline, and an engineer's typo.

Reliability engineering calls this the common-cause fraction: the share of each member's downtime that comes from something both share. Here is the number to remember. If one failure in twenty comes from a shared cause, the pair is down about 27 minutes a year, not 30 seconds. More than fifty times worse, almost all from the shared cause. A third member does nothing for that term; removing the shared cause does. A 2011 study of Microsoft's data center networks found redundancy only about 40 percent effective at reducing a failure's median impact.

A pair also breaks quietly. One member fails, nothing pages because the service still works, and the pair runs as one device for weeks until the other fails. The signal is redundancy state, not up or down: two of two, one of two, zero of two. One of two is an alert with an owner, even with no customer affected.

A server's pair is its bond: two links to two leaves, which must then look, to the server, like one switch. MLAG, multi-chassis link aggregation, couples the two leaves with a peer link that carries traffic and syncs MAC tables, plus a keepalive, and the pair shares one tunnel endpoint address. EVPN multihoming has no peer link. Both leaves name the same ethernet segment identifier and coordinate through BGP routes via the reflectors.

The same failure in both. Acme's web 2 server is bonded to leaf 1 and leaf 2 in Singapore, and the link to leaf 2 fails. The server's bond moves everything onto leaf 1; that part is identical. With MLAG, the spines still hash about half the server's traffic to leaf 2, which sends it across the peer link, so the peer link must be sized for that, and the failure is invisible outside the pair. With EVPN multihoming, leaf 2 withdraws a single route for the whole segment, and every remote leaf drops it as a next hop for every MAC on that segment at once. Mass withdrawal, visible fabric-wide in BGP.

MLAG's worst failure is losing peer link and keepalive together: split brain, two switches acting alone with one identity. It also needs both switches from the same vendor. EVPN multihoming has nothing to split; its price is that failover rides BGP convergence.

## Failure domains and blast radius

A failure domain is the set of components one cause takes down together. Blast radius is the impact side: how many servers, tenants or flows notice. Designing for failure means drawing the domains on purpose, so every likely cause has a small, known radius, and the two members of every pair sit in different domains.

The domains nest, from an optic, to a line card, a device, a rack or power feed, then a protocol's flooding domain, a software release, and the change pipeline. As the radius grows, the frequency shrinks. Physical faults are frequent and small; software and change faults are rare and large.

The dangerous domains are the ones nobody drew. Two carriers' circuits in one trench. A switch with both supplies on feed A. Both reflectors in one rack. One release on every spine. And management that runs over the fabric it manages.

Here is how big a flooding domain can be. An operator moved switches' time synchronisation from the out-of-band network onto the data network. One switch model stored its IS-IS entries' expiry against its system clock. After a reboot it built its topology database with the clock at its factory default. Then NTP, now reachable, stepped the clock forward by years. Every entry looked expired, and the switch flooded a purge for each. Every router in the area deleted them, loopbacks became unreachable, BGP next hops stopped resolving, and the overlay fell with the underlay until the entries were flooded again. Time needed the network, and the network needed time. And a protocol that lets any router delete everyone's state has a blast radius equal to its flooding domain.

The lesson builds a small model: each device lists what it depends on, and the code fails one cause at a time and ranks the damage, with two hidden shared fates planted. Before I tell you: which cause comes out on top?

[pause]

The spines' shared software release. A bug in it leaves no spine at all, and no hardware redundancy touches it. The fix is staging releases so only a minority of spines change at once. Second, the rack holding both reflectors: when it dies, every leaf's sessions expire after the 9-second hold time and overlay traffic between leaves stops. Graceful restart may hold routes for a window, often about two minutes, but that is a window, not a fix. And feed A takes out spine 3 alone, invisible in an inventory that says two power supplies.

One non-problem is instructive. Leaf 1 and leaf 2 share a rack, but so do the servers they serve. The rule is not separate everything. It is that nothing should fail because something it does not depend on failed.

## Headroom math

When one of n spines fails, each leaf loses one nth of its uplinks. In words: utilisation afterwards is the old utilisation times n, divided by what is left. With three spines, leaf 1 sends 750 gigabits a second over 1,200 of uplink, 62.5 percent. One spine loses power, the same 750 meets 800, and utilisation is 93.8 percent. Nothing dropped, but every burst queues, and the next failure overloads it.

N is the members needed for the busiest hour within target. N plus one survives any single loss. N plus two survives two, and the usual second loss is planned: one member out for maintenance when another fails. Two N is a full duplicate, like A and B power.

Turn the rule around and the safe peak is the target times the share of members left. With Meridian's 80 percent target, two spines may run at 40 percent, so 60 percent of the fabric is insurance. Four spines, 60 percent. Sixteen, 75. That is the case for many small spines.

Maintenance is a failure you schedule. Leaf 3 at two in the afternoon runs at 67.5 percent. Drain a spine: 90. A failure during the drain: 135, and packets drop. At two in the morning: 41, then 55, then 82.5, over target but no loss. Staying under 80 through a drain plus a failure needs a 40 percent peak, which almost nobody pays for, so maintenance lives in quiet hours.

A pair is n equals two, so each of two circuits stays under 40 percent. Most failures remove less than a member, though. A failed fabric module inside a chassis spine, one of six, removes about 17 percent of its capacity with every port still up. And a gray failure, a link up but dropping a fraction of packets, keeps its full share of flows and damages every one, costing more than a dead link.

## Draining as a design input

Draining makes a device carry no traffic while it stays up: routing steers around it, and only then does work begin. A device that cannot be drained can only be maintained with an outage.

An IS-IS spine is drained by raising its link metrics to just under 16.8 million, the largest value that still leaves a link usable, or by setting the overload bit, a flag meaning do not route through me. In a BGP underlay, attach the graceful shutdown community. A leaf is drainable only if its servers are dual-homed, which is the strongest argument for dual-homing.

The lesson's drain is spine 2 in Amsterdam. At two in the afternoon the pre-check finds leaf 3 would hit 90 percent and the Singapore circuit 90 percent, so the tool refuses. At two in the morning: 55 and 70. Traffic moves off, and the ports fall to a trickle of hellos. The spine is rebooted, comes back still costed out, is checked, and only then restored.

The rules: every device drainable; headroom sized for the drain; devices come up costed out, because a spine that attracts traffic before its forwarding table is programmed black-holes flows for seconds; never two members of a pair at once; and order matters where two protocols meet. For a router with BGP customers, withdraw BGP first, then the underlay. An operator did it backwards: the underlay stopped delivering while the BGP routes were still preferred, so traffic arrived and was dropped. Monitoring stayed green all night, because every adjacency was in its planned state. Customers reported it.

## What fails, and how a fabric degrades

By frequency: optics and cables, weekly at fleet scale. Then fibre paths, then hardware. Then software, rarer but correlated. And people and changes, rarest per change, largest in impact. Meta's Llama 3 report put about 8 percent of 419 interruptions in 54 days on switches and cables. Google's SRE book puts roughly 70 percent of outages on changes.

On 4 October 2021, a command during routine maintenance to assess Facebook's backbone capacity disconnected every backbone link; an audit tool meant to block it had a bug. Facebook's DNS servers, built to withdraw their BGP routes when they lost the data centers, did exactly that, and the service vanished. Recovery took about six hours, partly because remote access ran over the same network. A safety mechanism working as designed enlarged the blast radius.

A well-built fabric loses capacity in proportion to what broke, not service. Many equal parts: one spine of n costs one nth. Local detection: a leaf sees loss of light within milliseconds and drops that next hop, often with one hardware write that repairs thousands of routes; a spine that stays up but stops forwarding needs BFD. The control plane is off the forwarding path, so losing a reflector costs no traffic. The chip keeps forwarding if the routing process crashes. Every leaf carries the same gateway address. And no layer-2 loops.

And active-active beats active-standby: a member carrying traffic every day proves every day that it works. So the platform shows redundancy as n of m, headroom after the worst single loss, and pairs that share a rack, feed or release.

## In the interview

We have two of everything. Why did we still have an outage?

[pause]

Because redundancy works only across independent failure domains, and two of everything is often one of something: a shared rack, feed, conduit, release or pipeline. A 5 percent common-cause share puts a pair of 99.9 percent devices down about 27 minutes a year instead of 30 seconds. Map each pair's dependencies, and check whether one member was down unnoticed. The wrong answer is to add a third device.

How much headroom does a four-spine fabric need? Losing one turns utilisation into four thirds of itself, so the peak must stay under 60 percent; for a failure during a drain, under 40. The wrong answer is 25 percent because you lose a quarter: the remaining three carry the whole load.

## Recap

Five things. A pair is only as good as its independence, and one of two is an alert. MLAG couples leaves through a peer link that can split-brain; EVPN multihoming fails over with one withdrawal. Physical faults are frequent and small; software and changes rare and large. Utilisation after losing k of n is the old one times n over n minus k, and a drain is one of the k. Every device must be drainable and come back costed out.

At your desk: the pair availability code, the MLAG and EVPN comparison and visualisation, the blast-radius model, the headroom table and three-spine run, the drain table and spine drain run, the failure tables, and the blast radius practice problem.
