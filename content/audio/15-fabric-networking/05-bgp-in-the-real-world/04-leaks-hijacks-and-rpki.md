---
lesson: leaks-hijacks-and-rpki
source: 02d4eff80a4303df
fit: great
desk:
  - "The route-hijack visualisation: a slash 25 taking half of Meridian's traffic, then RPKI origin validation marking it Invalid"
  - "The hijack simulation and its three-column output, with AS 64497 traced by hand"
  - "The tables of hijack kinds, RFC 7908 leak types and the YouTube timeline"
  - "The RPSL objects and the generated IRR filter"
  - "The RPKI chain diagram, the ROA field table and the RTR prefix PDU, byte by byte"
  - "The route origin validation code and its ten routes, and the ASPA verifier and its six paths"
  - "The max-prefix table, the trade-offs table across six defences, and the failure-modes table"
  - "The outside-in prefix monitor and its four alerts"
---
## Introduction

A BGP update is a claim: send traffic for this prefix to me, through this chain of networks. Nothing in the message proves it. If it wins the receiver's comparison, it is installed and passed on, and within minutes it is everywhere. When the claim is false, traffic follows it just as faithfully.

A claim goes wrong in two ways. A hijack is a network announcing address space it does not hold. A route leak is a network passing on real routes it should have kept to itself. The setting is Meridian's internet edge: Meridian is AS 64500, announcing 203.0.113.0 slash 24 through ISP1, AS 64501, and ISP2, AS 64502, which both buy transit from AS 64496. An unrelated network, AS 64510, is about to announce part of Meridian's block.

BGP was designed in 1989 for a small internet whose operators largely knew each other, and its checks are local. So every network must answer three questions BGP cannot. Is the origin allowed to originate this prefix? Is the path real? And should this route have reached me through this neighbour at all? A hijack fails the first, a forged path the second, a leak the third. Every defence in this lesson answers one of them.

## Hijacks: more-specific wins

A prefix hijack is an announcement whose origin is not authorised for that space. An exact-prefix hijack announces the victim's own prefix with the attacker as origin; in April 2010, China Telecom re-originated about 37,000 prefixes for about 18 minutes. A sub-prefix hijack announces something longer inside the victim's block. A forged-origin hijack writes the victim's AS as origin after its own.

The sub-prefix kind reaches furthest, and here is why. Every router forwards by longest-prefix match: of all the routes containing an address, it uses the most specific. BGP's best-path algorithm, with local preference and path length, only compares routes for the same prefix. A slash 25 and a slash 24 are different routes. Both get installed, and the lookup picks the slash 25 for every address inside it.

So when AS 64510 announces 203.0.113.0 slash 25, the lower half of Meridian's block, a packet for 203.0.113.10 goes to AS 64510, which drops it, while 203.0.113.200, in the upper half, still reaches Meridian. A slash 25 path ten networks long would win just as well. The lesson's simulation shows the difference: with the same slash 24 from two origins, the internet splits by distance and four of the eight other networks stay correct. With the slash 25, every one is hijacked, Meridian's own ISPs included.

There is a floor. Most networks drop IPv4 routes longer than a slash 24 and IPv6 longer than a slash 48, to keep the global table bounded. Space announced as slash 24s can only be matched, not out-specificed.

A black-holing hijack drops what it attracts; an interception hijack forwards it on after reading it. Either way, the signal at the victim is inbound traffic dropping or slowing while every session looks normal.

## YouTube, 2008

In February 2008, Pakistan's telecom regulator ordered YouTube blocked inside the country. On Sunday the 24th, Pakistan Telecom, AS 17557, created a route for 208.65.153.0 slash 24, inside YouTube's slash 22, pointing at a null interface, so its customers' YouTube traffic would be thrown away.

At 18:47 UTC the route reached its upstream, PCCW, which did not filter this customer and passed it to the world. Within minutes most of the internet preferred the slash 24, and YouTube was unreachable for most of the world.

Before I tell you what YouTube did: with only its own announcements to work with, what could it do?

[pause]

Out-specific the hijacker. At 20:07 YouTube announced the same slash 24, which won back only the networks closer to YouTube, the split from the simulation. At 20:18 it announced two slash 25s, which won wherever they propagated, though the slash 24 floor meant some networks dropped them. At about 21:00 PCCW withdrew the bogus route. About two hours of global outage from a route meant for one country.

Three things generalise. The mistake was ordinary; the outage happened because the provider accepted anything from a customer. The victim's only immediate tool was a more-specific. And YouTube's own routers showed nothing wrong: the hijack was visible only from outside, at public route collectors, which peer with hundreds of networks and archive every update, and at looking glasses. A customer prefix filter at PCCW would have stopped it, and so would origin validation today. A max-prefix limit would not: one extra prefix trips nothing.

## Leaks, and an outage that was neither

A route leak is a route propagated beyond its intended scope. The prefix and origin may be genuine, but a network in the middle passed it on against its own policy. That policy is the valley-free rule from the previous lesson: customer routes go to everyone, peer and provider routes only to customers, and every network prefers customer routes over peer over provider, whatever the path length.

That preference makes a leak worse than it looks. If Meridian leaks a route learned from ISP2 to ISP1, ISP1 now holds it from a customer, which beats the same route from its peer ISP2, though the leaked path is one network longer. ISP1's traffic dives into Meridian and back up to ISP2: a valley. Meridian's transit links congest, and Meridian pays both providers for the privilege.

A leak needs two mistakes: the leaker's export and the receiver's import. On 24 June 2019, a small network's BGP optimiser generated more-specific routes internally. Its customer, multihomed to Verizon, leaked roughly 20,000 of them, and Verizon accepted them unfiltered. As more-specifics of Cloudflare's and Amazon's routes they won everywhere, and for about two hours much of that traffic squeezed through a small regional network. A prefix filter or a max-prefix limit on Verizon's customer session would have stopped it. The signal: your own AS between two of your providers in collector paths.

And not every BGP outage is an attack. On 4 October 2021, Facebook, Instagram and WhatsApp vanished for about six hours. A maintenance command disconnected Facebook's whole backbone. Facebook's DNS servers sit at anycast sites, and each withdraws its route when it cannot reach the data centres, right for one sick site. Every site failed at once, so Facebook's DNS disappeared from the internet, and recovery was slow because the engineers' tools depended on the network that was down. Nobody hijacked or leaked anything. The lessons are health checks whose failures are independent, out-of-band access, and reachability measured from outside.

## Registries and signed origins

The oldest defence answers the first question for customers. An Internet Routing Registry, or IRR, is a public database where networks publish what they intend to announce. A route object pairs a prefix with the AS allowed to originate it; an as-set names a network's customer cone. ISP1 expands Meridian's as-set, collects the route objects, and generates a prefix list: permit these, deny everything else.

Its weaknesses come from the data. Some registries never proved authority: in August 2022 attackers registered forged objects, and their upstream accepted a more-specific of an Amazon prefix on the strength of them. Objects go stale, and a new prefix without one is silently filtered.

RPKI, the Resource Public Key Infrastructure, answers the same question with cryptography. Each member's certificate, issued by its regional registry, lists exactly the space it holds, so it can sign statements about that space and nothing else. The statement that matters is the Route Origin Authorisation, a ROA: AS X may originate these prefixes, up to this length. Meridian's says 203.0.113.0 slash 24, maximum length 24, AS 64500.

That maximum length is where people go wrong. Meridian announces its IPv6 slash 32 plus one slash 48 per site, so its ROA lists those four prefixes at their own lengths. A maximum length of 48 on the slash 32 would authorise 65,536 slash 48s it never sends, and every length you authorise and do not announce is a more-specific an attacker can forge with your AS as origin.

Routers never touch a certificate. A validator fetches the repositories, checks every signature, and reduces what survives to validated payloads: prefix, maximum length, origin. Routers receive those over a small TCP protocol called RTR. A new ROA takes roughly ten minutes to an hour to take effect, so publish it before the announcement it authorises.

## Origin validation, and its limits

Route origin validation checks each received route against those payloads. If one matches, covering the space, no longer than the maximum length, same origin, the route is Valid. If some cover it but none match, it is Invalid. If nothing covers it, it is NotFound, and NotFound is accepted, because about half the internet's routes still have no ROA.

Run the hijacks through it. The slash 25 from AS 64510 is Invalid twice over: wrong origin, and too long. Forge Meridian as origin and it is still Invalid on length. Now the exact slash 24, with the path 64510 then 64500. What does validation say?

[pause]

Valid. Origin validation checks who is named as origin, not whether the path is true. It does catch re-origination: Meridian announcing its customer's block as its own is Invalid.

What a router does with the state is policy, and one choice is a trap. Drop Invalid is the recommended policy, adopted since 2019 by many of the largest transit networks. De-prefer Invalid does almost nothing against a sub-prefix hijack: there is no other slash 25 to compare with, so the Invalid route is installed anyway. And protection is only as good as the validating networks between you and the attacker: in the simulation, with AS 64496 dropping the slash 25, ISP2 still learns it the long way round.

It also fails quietly. By default, routers discard RTR data after two hours without a refresh. If both validators die, every route becomes NotFound and is accepted: protection fails open while no route changes. So alert on validator data age, not just the process, and run two validators from different software.

## Guard rails and path checks

A max-prefix limit caps how many routes a router accepts from one neighbour. It warns near the limit and, past it, tears the session down. Meridian's customer normally sends one prefix, with a limit of 10; ISP1's full table is about a million routes, with a limit of 1.2 million. It is blunt: it catches nothing small, and a trip drops every route from that neighbour. Verizon's leak would have tripped any sane limit; YouTube's hijack none.

Origin validation leaves the path open. BGPsec answers it completely, with every router signing the path so far plus the network it sends to. It is essentially undeployed, because a path is protected only if every network on it signs, verification on a full table is expensive, and a leaked path is a real, correctly signed path.

ASPA, Autonomous System Provider Authorisation, covers leaks and the common forged-origin case with far less machinery. Each network publishes one signed list of its providers; Meridian's says ISP1 and ISP2. A receiver checks the valley-free shape: from the origin, the path may only climb from customer to provider, cross at most one peering link, then only descend. The forged slash 24 needs 64500 to 64510 to be a climb, Meridian's list does not include 64510, so ASPA marks Invalid the very route origin validation called Valid. It catches Meridian's leak at the first hop, too, because ISP2 does not list Meridian as its provider. A hop from a network that published nothing is unknown, never Invalid.

And because hijacks are invisible from inside, Meridian's platform watches its prefixes at public collectors: a new origin, a more-specific, an unexpected neighbour of AS 64500, or visibility collapsing, Facebook's signature.

## In the interview

Someone announces a more-specific of our prefix. What happens, and what do you do?

[pause]

Every network that accepts it sends that part of our space to them by longest-prefix match, within minutes, whatever the path length, and our own routers show nothing. Detect it from outside, contact the origin's upstream, and announce matching or longer prefixes if our block is bigger than a slash 24, as YouTube did. Long term, ROAs with tight maximum lengths. The common wrong answer: the shorter path wins. Path length never compares different prefixes.

The follow-up: we publish ROAs, so are we protected? Partly. Validating networks drop origin hijacks and over-long more-specifics; the rest still believe them. A forged origin on our exact prefix is Valid, leaks keep the true origin, and a new announcement without a ROA makes us Invalid ourselves.

## Recap

Five things to remember. A more-specific beats any path, because BGP only compares routes for the same prefix and the lookup takes the longest. A leak is two mistakes, an export and an import, and a leaked customer route beats a shorter peer route. IRR filters and RPKI origin validation answer who may originate; drop Invalid works where de-prefer does not, and a dead validator fails open. Max-prefix stops floods, not targeted hijacks. And ASPA and BGPsec check the path: BGPsec is effectively undeployed, ASPA is in early implementations.

At your desk: the hijack visualisation and simulation, the incident and field tables, the validation and ASPA code, the defence tables, and the prefix monitor.
