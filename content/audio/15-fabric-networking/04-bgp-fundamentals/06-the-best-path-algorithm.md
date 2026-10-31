---
lesson: the-best-path-algorithm
source: c65ecf4d39dc5ccf
fit: great
desk:
  - "The ladder table with what sets each step and who sees it"
  - "The BGP table for 192.0.2.0 slash 24 on gw1.ams and the step-by-step walk table"
  - "The best-path visualisation: the default walk and the local preference variant"
  - "The MED arrival-order code and its six orderings"
  - "The ladder comparator and its three runs, with the change explanations"
  - "The failure-mode table and the levers table"
  - "Exercise: choose the best path and name the deciding step"
---
## Introduction

A border router often hears about the same destination from several neighbours, each announcement a different way out with its own list of networks to cross. It can install only one, and only that one is what it tells its peers. It has no latency measurements, no link loads, no view of anyone else's topology. And every router in the network must choose by the same rules.

BGP's answer is a fixed ladder of comparisons. The first one that tells two paths apart decides, and nothing below it is consulted. The order of the ladder is the policy. It is one of the most common BGP interview questions, and the strong answer explains why each rung sits where it does.

The decision runs per prefix, per router. Its winner goes into the forwarding table, unless another protocol's route beats it. It is the only path the router advertises: hear three, tell one. And it is recomputed whenever an input changes, including the cost inside your own network to a next hop. So "best" means most preferred under this router's policy and position. Not fastest, not least loaded. BGP knows neither unless an operator writes it into an attribute.

## The ladder, and three routes to one prefix

Here is the ladder, in Cisco's documented order, which Arista and FRRouting follow closely. Step 1: is the path usable. Then weight, local preference, locally originated. Then AS path length, origin, MED. Then eBGP over iBGP, and the IGP cost to the next hop. Then multipath. Then the tie-breakers: oldest path, router ID, cluster list length and peer address.

Hold the principle instead of the list: local and deliberate beats global and accidental. The first group is what you decided. The second is what the path's journey and the neighbour say. The third is your own network's geometry. The last steps exist only to guarantee exactly one answer.

Now the story. Meridian, AS 64500 to the internet, has three gateways fully meshed in iBGP: gw1.ams and gw2.ams in Amsterdam, gw1.sin in Singapore. A content network, AS 64511, originates 192.0.2.0 slash 24. All of these numbers come from ranges reserved for documentation.

gw1.ams holds three paths. Path A comes from its own eBGP session to ISP1 and crosses three networks: ISP1, a transit provider, the content network. Path B comes over iBGP from gw2.ams, which hears it from ISP2, and crosses two. Path C is the same ISP2 route from gw1.sin. All carry local preference 100 and origin IGP. B and C carry MED 0 from ISP2, A carries MED 10 from ISP1. The IS-IS cost to B's next hop is 20; to C's, across the long-haul circuit, 120.

Before I tell you: which path wins, and at which step?

[pause]

All three are usable and tie on weight, local preference and locally originated. At AS path length, A falls, three networks against two. That is the surprise: A is the only path gw1.ams learned directly, and the eBGP step that favours it is never reached. B and C tie on origin, on MED and on being iBGP. At IGP cost, 20 beats 120, and B wins. The router's own display says it in two words, best, IGP metric, naming the deciding step.

## Your own choices: weight, local preference, locally originated

Step 1 first. A path counts only if its next hop resolves through the routing table. So a loopback missing from the IGP silently disqualifies every path through that router, and the signal is a count of unresolved next hops.

Weight is a vendor extension, highest wins. It never travels in an update. Cisco invented it, Arista and FRRouting implement it, Junos has none. It sits above local preference on purpose: the "on this one box, whatever the AS says" override. That is also how it breaks. One router disagrees with the AS and no update explains why, and a weight left from an incident can steer traffic for months. In a network that does not use weight deliberately, decisions made at weight should be zero.

Local preference is the operator's choice of exit. Import policy sets it as a path enters your AS, iBGP carries it everywhere inside, and eBGP never carries it. The default is 100, highest wins. A common convention is customers 200, peers 150, transit 100: first where the network is paid, then where it is free, last where it pays.

Now Meridian decides ISP1 is the cheaper contract and sets local preference 200 on everything learned from it. A wins at step 3, despite its longer AS path. gw1.ams advertises it with 200, the other gateways switch too, and they withdraw their ISP2 paths, which are no longer their best. The cost: gw1.ams now holds one path. If ISP1 fails, the others must re-advertise ISP2 first, a round of updates rather than a backup in place.

It breaks quietly. A new circuit missing its policy falls back to 100 and moves egress. And local preference set on routes sent to a neighbour does nothing, because eBGP strips it.

Step 4, locally originated: a route this router injects itself beats one learned from a peer, so an originator never prefers someone else's copy of its own prefix. The trap is a static redistributed "temporarily" during an incident, which beats every learned path and is advertised to the whole AS.

## What the path says: AS path, origin, MED

AS path length counts networks, not miles. It is BGP's only distance-like measure, and a crude one: one network can span continents, and the shortest AS path can cross an ocean twice. Operators also lengthen it on purpose, by prepending their own number, so others avoid a path.

Origin is a fossil that still breaks ties: IGP beats EGP, named for BGP's long-dead predecessor, which beats incomplete, meaning redistributed.

MED is the most misunderstood step. It is how a neighbour connected to you in several places says which entry point it would rather you used. Lowest wins, and it is never passed to another network. Three rules make it a trap.

Rule one: MED is compared only between paths from the same neighbouring network, the first in the AS path. ISP1's MED ranks ISP1's routers; comparing it with ISP2's compares unrelated numbering schemes. That is why A's 10 never met B's 0.

Rule two: a missing MED counts as 0, the best value, so a neighbour that forgets it on one session beats its own careful MEDs elsewhere. Some implementations offer "missing as worst"; know which yours runs.

Rule three: implementations traditionally compare each new path against the current best, two at a time, and because MED applies only within a group, the answer depends on arrival order. Take P1 and P3 from ISP1, MEDs 100 and 20, and P2 from ISP2, MED 50, with IGP costs 10, 20 and 30. Arriving P1, P2, P3: P1 beats P2 on cost, then P3 beats P1 on MED. Best: P3. Arriving P2, P3, P1: P2 beats P3 on cost, then P1 beats P2 on cost. Best: P1. Deterministic MED picks each neighbour's best first, P3 and P2, then compares them: P2, whatever the order.

Behind route reflectors this can be an outage. A reflector relays only its own best, and when two reflectors' choices change what the other sees, there may be no stable state: persistent MED oscillation, RFC 3345. Deterministic MED alone does not stop it, because each reflector sees only some paths. The remedies are ADD-PATH, so reflectors advertise more than their best, always-compare-MED where neighbours' MEDs are comparable, and IGP costs that keep a cluster's own exits cheapest. The signal: best-path changes decided at MED, repeating for one prefix, with no session change.

## Your geometry, and the tie-breakers

Step 8, eBGP over iBGP: an external path leaves right here, an internal one first crosses your network. It sits below AS path and MED, which is why gw1.ams ignored its own ISP1 link.

Step 9 is the IGP cost to the next hop: hot-potato routing, handing traffic to the other network at the nearest exit. C fell here, and it mattered. Amsterdam to Singapore is about 10,500 kilometres of fibre, and at about 5 microseconds per kilometre, C would add about 52 milliseconds each way inside Meridian.

Hot potato ties BGP to the IGP, and here is the incident. An engineer raises the IS-IS metrics on gw2.ams's links to 1,000 to drain it. B's cost becomes 1,010. gw1.ams re-runs the decision, picks C, and Amsterdam's traffic leaves through Singapore: over 100 milliseconds more round trip, with no BGP session touched. A 2004 study of a large ISP, by Teixeira and colleagues, found routine IGP changes behind a noticeable share of its best-path changes. The fix: drain BGP before the IGP, or pin the exit with local preference for the window.

A second trap here: a route reflector decides from its own IGP position and hands that answer to every client, so clients exit nearest the reflector, not nearest themselves. Optimal route reflection, RFC 9107, computes from the client's position.

Step 10, multipath, changes forwarding, not the decision. If paths still tie after IGP cost and maximum paths allows it, the router installs several as an equal-cost group, but still advertises one. By default the AS paths must be identical, not just equal in length, so two ISPs stay out of one group unless you enable multipath relax. In Meridian's eBGP underlay, leaf1.ams hears leaf2.ams's loopback from both spines with the identical path; without multipath one spine would sit idle.

Then the tie-breakers. Oldest eBGP path avoids churn between equally good exits, at the price of history: reboot the router and the other path becomes older, so traffic flips providers with no configuration change. Then lowest router ID, using the originator's for a reflected path. Then shortest cluster list, then lowest peer address. Two ISPs tied down to router ID means nobody has expressed a preference.

## What "best" means in production

One more twist on the walk: gw2.ams's loopback stops resolving. gw1.ams does not move to A, its own ISP1 link. It moves to C, Singapore, because AS path length outranks both eBGP over iBGP and hot potato. "Nearest working exit" needs a local preference policy that says so.

Best is per router. gw2.ams keeps its own eBGP path, B, and gw1.sin keeps C. Three gateways, two exits, all correct. It becomes a problem only when routers between them decide independently, the subject of the BGP black hole lesson.

Best is the only path others hear about: iBGP does not relay iBGP-learned paths, so the other gateways do not know A exists. ADD-PATH and "best external" give peers a backup in advance. Best is not necessarily installed: administrative distance ranks protocols, and on Cisco eBGP is 20, IS-IS 115, iBGP 200, so a static route, or an IGP route against iBGP, takes the prefix. And best is not fastest. Networks that want performance-aware egress measure outside BGP and feed the result back as local preference.

So what should a platform show? The on-call question is "why is traffic leaving through Singapore?", the manager's "does the exit match policy?" Show the deciding step per prefix, per router: "B, decided at IGP cost, 20 against 120." Show the runner-up and the margin: a path that won by an IGP cost of 1 moves at the next maintenance, one that won on local preference does not. Record best-path changes as events with their cause, correlated with IGP and session events. Track exit share per provider against intent, and flag decisions at weight, provider choices settled by router ID, and repeating MED decisions. The feed is the BGP Monitoring Protocol; polling once a minute misses an oscillation with a ten-second period.

## In the interview

The classic opener: walk me through BGP best-path selection.

[pause]

Group, don't recite. Eligibility: the next hop must resolve. Local policy: weight on one router, then local preference, AS-wide, set on import. What the path says: shortest AS path, lowest origin, lowest MED within one neighbouring network. Your geometry: eBGP over iBGP, then lowest IGP cost, hot potato. Then multipath and the tie-breakers. Add one consequence: a router ignores its own ISP link when an iBGP path has a shorter AS path. The common wrong answer is "BGP picks the shortest or lowest-latency path."

The follow-up: outbound on ISP1, ISP2 as backup. Higher local preference on routes learned from ISP1, on import, on every gateway that peers with it; ISP2's paths take over only when ISP1's are withdrawn. Inbound can only be influenced, by prepending, communities or more-specifics. The wrong answer is MED or prepending for outbound.

## Recap

Four things to remember. The ladder's order is the policy: local and deliberate beats global and accidental, so local preference, set on import, outranks AS path length, which counts networks, not distance. MED has three traps: same neighbour only, missing counts as best, and order dependence fixed by deterministic MED. Hot potato ties BGP to the IGP, so a maintenance metric can move an exit to another continent. And best is per router and never a measure of speed: ask "decided at which step?" before "which path?"

At your desk: the ladder table, gw1.ams's BGP table and walk, the best-path visualisation and its variant, the MED arrival-order code, the comparator and its runs, the failure and levers tables, and the best-path exercise.
