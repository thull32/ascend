---
lesson: operating-bgp-safely
source: 0118b9fabc814a34
fit: great
desk:
  - "The maintenance-order visualisation, both runs: the IGP costed out first, and the BGP drain first"
  - "The outage timeline and the protocol dashboard during the 45 minutes"
  - "The ten-step procedure with its gates, and the drain table for each device role"
  - "The graceful shutdown simulator and its two message traces, traced by hand"
  - "The max-prefix and import filter code, its four ISP2 runs, the limits table and the filter table"
  - "The troubleshooting ladder table and the advertised-routes output from the worked case"
  - "The monitoring checks code and the maintenance plan validator"
  - "The failure-mode table and the trade-offs of each way to move traffic off a BGP router"
---
## Introduction

At two in the morning an engineer starts a planned upgrade of Meridian's border gateway in Amsterdam. The plan says: drain BGP, isolate the router from the IGP, upgrade, restore. The engineer swaps the first two steps. Every BGP session stays up, every dashboard stays green, and 45 minutes later the first report arrives, from a customer.

A router that carries traffic attracts it in two ways. The IGP, the interior gateway protocol, IS-IS on Meridian, tells every other router how to reach it. BGP tells the world which destinations sit behind it. Taking the router out of service means removing both, and the order decides the night.

Coming up: that outage, traced; the correct order and the community that makes it lossless; max-prefix limits and filters as guard rails; a ladder for "BGP is up but traffic is wrong"; and what to monitor beyond session state.

The setting. Meridian is AS 64500 and announces 203.0.113.0 slash 24, from ranges reserved for documentation. gw1.ams connects to ISP1 and carries its traffic, about 6 gigabits per second inbound at peak. gw2.ams connects to ISP2 and is the backup, carrying 1 gigabit on its own 10 gigabit circuit. Meridian's public servers sit behind leaf1.ams, in a slash 26.

gw1 announces the slash 24 from a static discard route: a hand-made route for the whole block that drops any packet no more specific route claims. Operators do this so the announcement never flaps. Packets for the servers match the more specific slash 26, a BGP route whose next hop is leaf1's loopback, and only IS-IS can resolve that loopback.

So two things draw traffic to gw1. Inbound, its announcement to ISP1, over a directly connected link that needs no IGP. Outbound, the internet routes it passes inside Meridian with its own loopback as next hop. The rule: never leave a router in a state where it attracts traffic it cannot deliver. Withdraw the attraction, BGP, first. Prove nothing arrives. Then remove the means of delivery, the IGP. Restore in reverse.

## The wrong order, traced

Back to two in the morning. The engineer shuts gw1's IS-IS adjacencies to both spines. Within a tenth of a second gw1 loses every IS-IS route. The next hop of the slash 26 is unresolvable, so the slash 26 leaves the forwarding table, and a packet from the internet for a Meridian server now matches only the slash 24, the discard route. Dropped.

About a second later the spines' updated link-state packets reach every router, and gw1's loopback disappears from everyone's map. Every iBGP route pointing at it becomes unusable. gw2 re-runs best path, finds its own ISP2 routes now win, and advertises them. Outbound recovers through gw2 after seconds to tens of seconds of loss.

Before I go on: does inbound heal too?

[pause]

It does not, because nothing about the inbound attraction depends on IS-IS. The eBGP session runs over a direct link, so it stays Established. The slash 24 comes from a static route, so it stays announced. And ISP1 still prefers it, a customer route at local preference 200 against 100 through its peer. At 6 gigabits per second for 45 minutes, about 2 terabytes of inbound traffic, nearly all of Meridian's internet load, goes into the discard route.

Meanwhile the dashboard shows the session Established, one prefix advertised, and normal inbound on the circuit. The only device signal is the discard counter climbing at line rate. The only end-to-end signal is a probe from outside through ISP1. Each protocol did what it was designed to do; the combination black-holed the traffic.

It does not even need a mistake. If both of gw1's uplinks fail, the result is identical. So the discard pattern needs a seatbelt: conditional advertisement, which announces the aggregate only while a route inside it exists. Choose condition routes that vanish only when the gateway is truly cut off, such as the spines' loopbacks, not one server subnet that may come and go.

## Make before break

The correct procedure has gates between the steps, and each gate is a measurement, not a timer.

Pre-check: gw2 is up to ISP2 with a full table, and its circuit can take the load. 6 gigabits plus its own 1 is 7 of 10, 70 percent. If gw2 already carried 4, it would hit 10, and the answer is another night. Then drain BGP: tag everything gw1 sends ISP1 with the graceful shutdown community, and set local preference zero on the routes it passes inside Meridian. Gate: traffic on the ISP1 circuit falls below a stated threshold, such as 1 percent of the usual peak. Only then close the eBGP session administratively.

Now cost out the IGP. No BGP route points at gw1 any more, so not a packet moves. Do the work. Restore the IGP first, because the iBGP sessions between loopbacks need it, with the overload bit set on startup against the boot race. Then BGP, with graceful shutdown still on, so routes load while nobody prefers them. Gate on End-of-RIB, the marker that a peer's initial table is complete, from ISP1 and both reflectors, and on the forwarding table count matching the BGP table. Only then remove the community, and traffic returns without loss. Finally check that nothing was left behind.

The rule generalises, with a different meaning of drain per role. A leaf with tenants: shut its server ports so EVPN withdraws them and a partner leaf takes over. A spine that runs only IS-IS has no BGP to drain and goes straight to the overload bit.

## Graceful shutdown

The obvious drain is to withdraw the routes. It still loses traffic, because a router advertises only its best path. In steady state gw2's best path is the iBGP route from gw1, 200 beating its own 100, and a router never relays an iBGP route to another iBGP peer. So gw2 advertises nothing. The backup exists only inside gw2.

The lesson's simulator, at five seconds per hop. gw1 withdraws. At 5 seconds the reflector hears it, and at 10 it withdraws from gw2 and the leaf. Only now does gw2's ISP2 path become its best, advertised at 15 and reaching the leaf at 20. The leaf has no route for ten seconds: two hops of propagation, 5 gigabytes of outbound traffic at 4 gigabits per second. Break before make.

Graceful shutdown, RFC 8326, is the well-known community 65535 colon 0. The draining router re-advertises the same routes with it, and the receiver's policy sets local preference to zero. The route stays valid and keeps carrying traffic, but loses to any other path, so every router with an alternative switches while the old path still works. In the simulator, same messages, and the leaf is never without a route.

Three details decide whether it works. The receiver must act on it: Meridian writes both ends internally, but an ISP needs a matching policy, so test it, or fall back to the provider's own local preference community. Not prepending: ISP1 ranks customers at 200 and peers at 100, and local preference comes before AS path length, so a route prepended five times still wins. And zero, not a withdrawal, because a path at zero is a last resort: if gw2 fails mid-drain, traffic falls back to gw1 instead of vanishing.

It is not graceful restart. Graceful restart says "keep sending, I will be back". Graceful shutdown says "send elsewhere, I am going". And it breaks afterwards in two ways: removed before End-of-RIB, it pulls traffic onto a half-loaded router; never removed, it leaves a gateway idle for months.

## Fuses and filters

Some failures arrive from a neighbour, as in June 2019, when a route optimiser's more-specifics were leaked through a large transit provider worldwide. A maximum-prefix limit caps, per session and address family, how many routes you take from a neighbour. It is a fuse: past the limit the router sends a Cease notification, subcode 1, and closes the whole session. It warns first, typically at 75 to 90 percent, so the limit is raised for growth before it trips.

Some numbers. A full table from ISP2, about a million routes: limit 1.2 million, years of headroom. Meridian as ISP2's customer, one prefix: limit 10. A leaf's EVPN session, about 1,342 routes: warning only, because a trip would cut the leaf off from every tenant. There, the fuse would cost more than the fault.

What is counted is decisive. ISP2 has a prefix list allowing only Meridian's slash 24, and a limit of 10. Meridian loses its export policy and sends ISP1's table. Count received routes, and the limit trips on the eleventh, although the prefix list would have rejected every one: Meridian loses ISP2 for a fault the filter had contained. Count accepted routes, and the session stays up with 512 rejections, a signal worth alarming on. With neither, ISP2 accepts everything and passes it on, the shape of the 2019 leak. A fixed limit also fails on growth: in August 2014 the global table passed 512 thousand routes and broke routers whose hardware held that many by default. And identical tight limits on both ISPs trip together on one event.

Filters decide which routes. Every internet session rejects private and reserved space, more-specifics of your own prefix, anything longer than a slash 24, paths whose first AS is not the peer's, private AS numbers, and a default route you did not ask for. Export filters decide whether you cause the next incident: Meridian advertises exactly its slash 24, and carrying ISP1's routes to ISP2 would make it free transit between two providers. Apply filter changes with route refresh, which asks the peer to resend, never a hard reset, which withdraws everything.

## When BGP is up and traffic is wrong

Most production BGP problems start after Established, and the playbook is a ladder, climbed in order. Scope first. Then: is the session stable; did the peer send the route; did import policy accept it; is it the best path; is it installed with a resolvable next hop; is it advertised onward; what does the world see; and does the traffic follow?

A worked case. At 14:10 an engineer edits gw1's export prefix list to add an IPv6 prefix. By 14:20 the ISP1 circuit carries almost no inbound traffic and ISP2's runs at 7 gigabits. Scope: all of Meridian, inbound only. Sessions: up for weeks. So jump to the advertised rung. gw1 advertises zero prefixes to ISP1: the edit replaced the IPv4 entry. Nothing failed; ISP1 moved to ISP2's path as designed. A monitor comparing the advertised count with intent catches it at 14:10, not at peak. And read before you clear: a reset destroys the state you are diagnosing.

So monitor beyond session state. Prefix counts per session, received, accepted and advertised, against baselines. A drop is the classic silent failure: a leaf Established with zero EVPN routes against a usual 1,342. A jump is a leak: ISP2's feed rising from a million to 1.16 million in minutes. An advertised count off by one is a policy error, because intent is exact. Next hops: unresolvable ones should be zero, and a loopback should resolve through its own host route, not a summary that keeps dead routes alive. Churn, alerted on a multiple of baseline. And one check catches the two in the morning trap directly: every announced aggregate must hold at least one route inside it. In the lesson's snapshot of that outage, only that check fired.

Because the ordering rule is mechanical, the platform should enforce it: refuse a backwards plan, and refuse a good plan when gw2 already carries 3 gigabits, since 9 of 10 is too much at 7 in the evening and fine at 2 in the morning.

## In the interview

"Why not just withdraw the routes? BGP reconverges in seconds."

[pause]

BGP advertises only best paths, so the backup exit is invisible until the primary is withdrawn. The gap is two or more propagation hops, seconds to tens of seconds for a full table, and the provider's routers path-hunt the same way. Local preference zero keeps the old path valid while the new one spreads. The common wrong answer confuses this with graceful restart, which does the opposite.

"Every session is up, and users say you are unreachable through one ISP." Scope, then the ladder from the advertised rung: what each gateway sends that ISP against intent, what public collectors see, then a probe through that ISP. Not a restart, which destroys the evidence.

## Recap

Five things to remember. Withdraw BGP before costing out the IGP, and restore in reverse, because a router must never attract traffic it cannot deliver. A withdrawal loses traffic because only best paths are advertised; graceful shutdown keeps the old path valid at local preference zero, if the receiver honours it, and comes off only after End-of-RIB. Max-prefix is a fuse with a cost: count accepted routes and warn early. When BGP is up and traffic is wrong, climb the ladder one table at a time. And monitor prefix counts, next hops, churn and aggregate coverage, and probe from outside, because every failure here kept its sessions up.

At your desk: the maintenance-order visualisation and outage timeline, the procedure tables, the simulator, the max-prefix, filter and monitoring code, the ladder, and the trade-off tables.
