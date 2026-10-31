---
lesson: explaining-a-network
source: f407cdcefb46f9e6
fit: great
desk:
  - "The seven-parts table, with each part's budget and the door it opens"
  - "The two-minute answer written out, and the checker that times the first draft part by part"
  - "The numbers script that rederives every figure in the answer"
  - "The whiteboard drawing of the three sites"
  - "The visualisations: two hops and four paths inside a site, the square and its circuit cut, the overlay packet walk, and the BGP black hole"
  - "The tables: which failure fits which role, every sentence as a door, the depth ladder, and what you may defer"
---
## Introduction

"Tell us about the network you run." One answer tests three things at once. Do you hold the whole picture, or a list of parts? Can you go one level deeper on any sentence you say? And do you know where your knowledge ends?

A weak answer is a product tour: "we run EVPN VXLAN on 400 gig with some SONiC". A strong answer fits in two minutes, has seven parts in a fixed order, uses numbers, and ends with what you personally built.

Three things, then. The seven parts, built on Meridian, the track's reference network. The one story, which ties the fabric, the protocols, a packet walk and a failure together. And the move that keeps you credible deeper down: "I don't know that detail", then what you would build or measure.

## Who is listening

A networking panel usually has two or three people, and they listen for different things in the same two minutes. The principal network engineer listens for mechanism and for slips. "Spines only forward" is fine. "BGP runs at every hop" is a red flag they will come back to in a minute. The manager listens for scope and ownership: how big the network is, what you did, and whether you can explain it to people who are not network engineers. The software engineer listens for the system: where the source of truth lives, how configuration reaches devices, what is measured.

The next twenty minutes are spent on the claims they noted, so the answer sets the agenda. Mention route reflectors and you will be asked what happens when both fail. Say only what you can defend one level down.

## The seven parts

How big, how one site is built, how sites connect, what makes every device reachable, what carries tenants, where the network meets others, and what you did. Each part depends on the one before: "my part" means nothing until they know what it is part of. The budgets add up to two minutes, as a ratio rather than a stopwatch: about ten seconds for scale and for the underlay, fifteen for the edges, twenty for the rest, and twenty-five for the overlay, because it holds the most mechanism.

First, scale. It calibrates everything after it. "We push a change to every device" means a simple loop at 100 devices, and batches, canaries and a rollback plan at 5,000. Give one rounded number per noun. For Meridian: three sites, about a hundred switches and routers, two tenants, and a 1,024 GPU cluster.

Second, the fabric inside one site. Most bytes in a data center move between servers, so each site is a leaf-spine Clos: servers on leaves, every leaf linked once to every spine, nothing else linked. The sentence that proves you understand it: any leaf to any leaf in two hops, one equal-cost path per spine, and losing one of four spines costs a quarter of the capacity, not connectivity. If you quote the 3 to 1 oversubscription, be ready to say what it means: when all 48 servers on a leaf send off the leaf, each gets a third of its port.

Third, between sites, and why the backbone looks different from the fabric. Inside a site, links are cheap cables, so you build every path. Between sites, they are leased long-haul circuits, each a separate contract, route and failure point, so you build as few as failure tolerance allows. Meridian joins each pair of sites with a square: two spine-to-spine circuits, where a full mesh of spines would need four. Singapore is the hub.

Two numbers make it credible. Latency is distance: about 5 microseconds per kilometre of fibre, so Amsterdam to Singapore, 10,500 kilometres, is at least 105 milliseconds round trip. And capacity on failure is half. 80 gigabits per second over two 100 gigabit circuits is 40 percent each, and 80 percent on the survivor after a cut. That is why each circuit is kept under half full.

Fourth, the underlay, in one sentence that names its job: IS-IS, one level-2 domain, making every device's loopback reachable from everywhere. The loopback is a router's own stable address, tied to no port, and it doubles as the tunnel endpoint.

Fifth, the overlay, in three ideas. What it carries: BGP EVPN is the directory of which tenant address lives behind which leaf. The underlay is the road map; the overlay is the address book. How it scales: every leaf peers with its site's two route reflectors, 111 sessions instead of a full mesh of 1,128. And why the spines need none of it: tenant traffic is wrapped in VXLAN, addressed from one leaf's loopback to another's, so the spines only route the outer header. Separate routing tables, VRFs, are why Acme and Globex can both use 10.1.1.0 slash 24.

Sixth, the edges. Two border gateways in Amsterdam run eBGP to two ISPs and announce Meridian's slash 24. And the San Jose GPU cluster has its own rail-optimised RoCE back end, separate from the front end and storage. Each edge invites a question, so name only the edges whose question you can answer.

Seventh, your part, the one candidates most often get wrong. It needs the first person, a concrete artefact and a boundary. Not "we built a lot of automation", but "I own the pipeline that renders every device's configuration from the source of truth and diffs it against what is running; tenant service configuration is another team's tool." That sets the next hour, and shows you know where your system stops.

## Hearing the first draft fail

Here is a realistic first draft. "So we have a pretty big network." Then vendors, 400 gig optics, EVPN, route reflectors, route targets, anycast gateways, "and we use BGP at every hop so the spines know where everything is". Then "we built a lot of automation around it".

Before I tell you: what is wrong with it?

[pause]

Not its length. It runs under a minute, with about twenty product and protocol names and not one mechanism. The scale part has no number. The inter-site design, the underlay and the edges are missing. "Your part" never says I. And its worst line, BGP at every hop, is the opposite of the design, because the spines carry no tenant routes. No word counter catches that. Only saying it aloud to someone who interrupts does.

The written-out answer on the page is 303 words: two minutes at 150 words a minute. Every number in it should be one you can rederive.

## The one story

The two-minute answer describes the network. The one story proves you understand it. It runs the same network as four linked parts, in under three minutes: the fabric, the two protocols and how they split the work, one packet walked across it, and one failure. Each part is the premise of the next.

The fabric: leaf-spine inside each site, spines only forward, a square of two circuits between sites.

The protocols. IS-IS runs on every device and knows one thing: how to reach every loopback. BGP EVPN runs on the leaves and route reflectors and knows which tenant address lives behind which leaf. A BGP route's next hop is a leaf's loopback, and the leaf resolves it through IS-IS. Here is the sentence to memorise: BGP says which leaf, IS-IS says how to get there.

The packet. Acme's web server, acme-web1, behind leaf1 in Amsterdam, sends to acme-web2, behind leaf2 in Singapore, in the same subnet. Leaf1 already learned acme-web2's MAC and IP from an EVPN route, so it answers the ARP itself. It looks up the MAC and finds it behind leaf2.sin's loopback. It wraps the frame in VXLAN, segment 10100, with an outer header from its own loopback to leaf2's. The spines and the long-haul circuit see only that outer header, which IS-IS knows how to route. Each hop rewrites the outer MACs and lowers the outer TTL; nothing inside changes. Leaf2 in Singapore strips the 50 bytes of outer headers and delivers the original frame. That is why the spines need no BGP: encapsulation addresses the packet to something IS-IS already knows.

The failure. Take the encapsulation away. Three routers in a row, IS-IS on all three, BGP only on the two ends. The BGP session comes up, because the loopbacks are reachable through the middle router. A tenant packet is handed to the middle router, which has no BGP and no route for it, and drops it. BGP Established, traffic black-holed. The fixes are encapsulation, VXLAN or MPLS, or BGP everywhere. And the lesson for monitoring: protocol state being up is not the service working, so the platform checks next-hop resolution and probes the data path.

Why end on a failure? Predicting how a mechanism breaks is a deeper test than describing it. It moves the conversation to signals and tooling, a software engineer's home ground. And it hands the interviewer a next question you have prepared. So choose it for the role. The black hole is the safe default. Maintenance done in the wrong order suits change tooling; a duplicated route target suits automation; one slow link stalling a training job suits AI infrastructure. The clock jump that purges every IS-IS LSP impresses only if you can go two levels deeper. And for a real incident, say your role first.

Every sentence in the story is a door. "Route reflectors" leads to "what if both fail?": one down changes nothing, but with both down, once the sessions drop, every leaf deletes its overlay routes and tenant traffic stops with the underlay healthy.

## Saying I don't know that detail

Interviewers probe until they find the edge of what you know. Guessing past it is what fails: the next question goes one level deeper, and the collapsing guess takes your earlier answers' credibility with it.

The move has three parts. Say what you do know, at the level of mechanism. Name precisely what you don't know, and who would. A precise "I don't know the default refresh interval on that vendor's software" sounds expert; a vague "I'm not sure about IS-IS" does not. Then pivot to what you would build or measure.

Follow the underlay down. Level one is your own sentence. Level two: "Why IS-IS and not eBGP?" Design reasoning, so answer it: one domain across three sites, the full map on every router, one SPF run with no path hunting; eBGP per leaf suits a single data center. Level three: "How does a router know an LSP is stale?" Mechanism: a sequence number, and a lifetime that counts down; the originator refreshes it, and a copy that reaches zero is purged, and the purge floods. Level four: "What lifetime and refresh do your boxes run?" Now the move. The standard's defaults are a 1,200 second lifetime and a refresh around 900 seconds. What yours are configured to, you would read from the source of truth rather than guess. And what you would build: an alert on the LSP count collapsing, correlated with clock steps on any device.

But deferring on a fundamental the role depends on is not honesty; it is a gap. "Make outbound traffic prefer ISP1" you answer: higher local preference on ISP1's routes. "Is a slash 16 more specific than a slash 24?" you answer: no, the slash 24 is. Platform limits and vendor commands you may defer. Avoid three anti-patterns: bluffing a number, the bare "I don't know" that leaves nothing to score, and the escape to an unrelated strength, like "but I know Kubernetes well".

If the network is your employer's, describe it safely: rounded numbers, roles rather than hostnames, no customers, incidents as mechanisms.

## In the interview

The story already answered the commonest follow-up, why the spines run no BGP. One more precise point: many fabrics do run BGP on spines as their underlay, so the exact claim is no overlay BGP on the spines.

Now a harder one. "If you could change one thing about this design, what would it be?"

[pause]

A trade-off with its cost, not a wish. Singapore is a hub, so an Amsterdam to San Jose flow pays 241 milliseconds round trip and depends on two squares. A direct square would cut both, at the price of two more long-haul circuits, the most expensive links you have. Decide with traffic and latency data per site pair. The wrong answer is "move everything to 800 gig": a purchase, not a design argument.

## Recap

Five things to remember. The answer has seven parts in order: scale, the site fabric, between sites, underlay, overlay, edges, and your part, with a number in each, in two minutes. The protocol split is one sentence: BGP says which leaf, IS-IS says how to get there, and the spines see only the outer header. The backbone is described by cost and failure: two circuits instead of four, 80 percent on the survivor, each kept under half. The one story ends on a failure chosen for the role, with the signal that shows it. And at your edge: what you know, exactly what you don't, and what you would build.

At your desk: the seven-parts table, the written answer and its checker, the numbers script, the whiteboard drawing, four visualisations, and the tables.
