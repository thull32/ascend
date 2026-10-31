---
lesson: incidents-and-what-they-teach
source: 0135971defb20547
fit: great
desk:
  - "The postmortem parts table: impact, trigger, latent condition, detection, mitigation, fix and blast radius"
  - "The six incident timelines, event by event, with who saw what"
  - "The purge storm, wrong-order maintenance, gray failure and PFC pause-spreading visualisations"
  - "The Facebook failure chain diagram and the table of other public outages"
  - "The patterns table across the six cases"
  - "The five detectors in Python, run on the incidents' own data, and their alert output"
  - "The table of detection approaches, what each catches and what each misses"
---
## Introduction

Most network outages share a sentence in the postmortem: monitoring was green throughout, and the first report came from a customer. Every session was up, and the service was down anyway, because the parts had been combined into something nobody measured. A platform that looks only at protocol state cannot see these incidents. One that checks end-to-end behaviour, compares state against intent and knows what changed can see them in seconds.

Six incidents. Five on Meridian, generic forms of failures operators really hit: a clock jump that purged the topology, a maintenance in the wrong order, a copied route target that leaked one tenant into another, a gray-failing optic, and a PFC storm from one NIC. The sixth is public: Facebook, October 2021.

Listen for two things. First, the trigger, the event that started it, usually innocent on its own, versus the latent condition, what was already wrong and waiting. "The engineer swapped two steps" is a trigger. "Nothing in the tooling knew the order" is the latent condition, and the one you can fix. Second, who saw it first. Usually someone outside the network team. Time to detect is the number tooling owns.

## The clock-jump purge storm

Meridian is upgrading Amsterdam's leaves one at a time, fifteen minutes apart. Three times in half an hour, tenant traffic stops across all three sites, for seconds to tens of seconds. No link and no IS-IS adjacency goes down.

A reminder. Every router keeps every router's LSP, its description of its links, and runs SPF over them. Each LSP's lifetime, 1,200 seconds by default, counts down in every copy until the originator refreshes it. A copy that reaches zero is purged: flooded empty and deleted everywhere. Any router may purge any LSP, because a dead router cannot withdraw its own.

Two latent conditions. Two weeks earlier, a change moved the switches' NTP from the out-of-band management network to a server reached through the fabric itself, reviewed as a management tidy-up. And this leaf model stored LSP expiry as an absolute wall-clock time, and booted with its clock at the first of January 2000.

Now leaf4 reboots. Its clock says 2000. The spines send it every LSP, and it stores their expiries in the year 2000. Seconds later the underlay is up, NTP answers, and the clock steps 26 years forward. One syslog line. By leaf4's reckoning every LSP it did not originate has now expired, so it purges about 69 of them. The purges flood, SPF everywhere finds almost nothing, the remote leaf loopbacks the overlay uses as next hops become unresolvable, and traffic stops in all three sites. Within seconds each originator re-issues its LSP with a higher sequence number, and the topology returns.

The root cause took until 10:40, an hour and a half after the wave was paused. The first two events looked like upgrade noise. And a purge looks identical on every router, so no router tells you who started it, unless someone thinks to decode the purge-originator TLV that names it. The blast radius was three sites because the flooding domain was: one level-2 domain of about 70 routers. Paced flooding and throttled SPF stretched each event towards Meridian's 9-second BGP hold timers; in a domain of hundreds of routers, sessions reset and tenants see minutes.

The fix: time over the out-of-band network, countdown aging, and management-plane changes reviewed as data-plane changes. The detector: a clock step larger than a minute, correlated within seconds with LSP counts collapsing on most routers. That pair names the culprit. And a staged rollout should halt itself when an outage outgrows the stage.

## Maintenance in the wrong order

Two in the morning. An engineer takes gw1, an Amsterdam border gateway, out of service. The rule is BGP first: withdraw the announcements, prove nothing arrives, then remove the IGP. But the engineer works from the spine runbook, where IS-IS really does go first, because spines run no BGP. The procedure existed only as prose.

So IS-IS on gw1 is shut, and BGP is left alone. gw1 reached the public servers through a BGP route whose next hop only IS-IS resolved, so that route is gone in a tenth of a second. But gw1 announces Meridian's slash 24 to ISP1 from a static discard route, which drops anything no more specific route claims, and which does not depend on IS-IS at all. It is now the longest match. Outbound traffic moves to gw2 in seconds. Inbound does not: gw2's announcement is prepended, so ISP1 keeps sending about 6 gigabits per second into gw1, and gw1 drops it.

For 45 minutes, roughly 2 terabytes, nothing fires. The eBGP session stays Established, and the ISP1 circuit shows normal inbound utilisation. Why normal?

[pause]

Utilisation counts arrivals, not delivery. The one device signal of the outage, the discard counter, sat behind the maintenance window's alert suppression, built to hide expected symptoms, here hiding the unexpected one. A customer reported the website unreachable.

The fix: procedures per device role in tooling that executes them, gated by measurements rather than timers, such as gateway traffic below 1 percent of its usual peak before IS-IS may be touched. Announce the aggregate only while routes inside it exist, and probe your own addresses from outside through each ISP. And invert the suppression: a drained device should carry almost nothing, so one still receiving and discarding 6 gigabits per second is critical precisely because a maintenance is open.

## The leaked tenant

Acme and Globex both use 10.1.1.0 slash 24, each in its own VRF, a separate routing table per tenant. EVPN routes carry a route distinguisher, which must be unique per device and segment, and route targets, which say which VRFs import a route. Each route target belongs to exactly one tenant.

To add Globex capacity, an engineer builds leaf5 by copying Acme's tenant block and editing it into Globex, but leaves Acme's import route target, 65000 colon 50001. The next day leaf6 is copied from leaf5, and because the route distinguisher was typed as a literal, leaf6 inherits it too. Both pushes succeed. No device rejects importing another tenant's route target, because that is how deliberate route leaking works.

Now Globex's default route has four paths, two labelled with Acme's VNI, and the label, not the importing VRF, decides where the far end routes the packet. On a platform that load-shares across all four, half of Globex's internet flows from those leaves left through Acme's NAT pool, and the replies, routed inside Acme's VRF, were dropped or delivered to the wrong machine. Acme's host routes appeared in Globex too, so a Globex host could reach Acme's database subnet. And with the duplicated route distinguisher, the reflector saw one route key from two leaves and reflected only one.

It took three days. Sessions were up, route counts grew as expected, and pings from leaf5 to its own Globex hosts passed, because local entries outrank the leaked routes. Globex opened a ticket about timeouts; a day later Acme's security team found Globex addresses in its firewall logs. Two tickets, one fault, linked only by a human.

The fix: render tenant configuration from a source of truth instead of copying devices, and before any push, reject a duplicate route distinguisher and any import route target owned by another tenant unless intent declares a leak. That check needs no traffic and catches the whole class. Add isolation probes that must fail: a Globex probe reaching Acme's database is an alert.

## Two partial failures: an optic and a NIC

The fourth case is a link that never goes down. A contaminated connector between leaf1 and spine3 lets receive power drift down week by week, from minus 1.8 to minus 5.9 dBm. FEC, forward error correction, repairs every bit error, and the vendor's warning sits at minus 8.9, so nothing alerts. In week 5 the error rate passes what FEC can repair, FEC fails abruptly, and 2 percent of frames on the link fail their checksum. ECMP keeps sending it a quarter of leaf1's flows, and Acme's 99th percentile latency goes up tenfold.

On day one every tool looks from the wrong place. One ping is one five-tuple on one uplink, healthy three times in four. Leaf1's counters are perfect, because a sender never learns the receiver dropped its frames. And the average lies: 0.5 percent loss across the group, against 2 percent for the unlucky quarter, which ran several times to an order of magnitude slower. On day two a probe sweep over 64 source ports shows loss only through spine3, and the link is costed out and cleaned. The alert that should have fired was against the link's own baseline: in week 2, power 2.8 decibels down and the pre-FEC error rate 300 times higher. Three weeks of warning.

The fifth case is San Jose's AI cluster. RoCE recovers from loss badly, so it rides a lossless class: PFC lets a receiver pause one priority on its neighbour when a buffer fills. Pauses climb towards the senders and stop innocent flows on the way. A PFC storm is that tree with a root that never drains.

srv40's rail-1 NIC hits a PCIe error and can no longer write into memory. It pauses its leaf for 999 milliseconds of every second. Within milliseconds the pauses spread through the spines, and nearly all lossless traffic on rail 1 stops, with zero drops and zero errors. All 1,024 GPUs wait. The PFC watchdog should have dropped that queue after 200 milliseconds and freed every other flow, but it was left in alert mode from bring-up, logging to a low-priority stream. After 10 minutes the collective timeout killed the job, the scheduler restarted it on the same nodes, srv40 included, and it stalled again. 38 minutes to find the port by hand; about 850 GPU-hours lost to one NIC.

Lossless fabrics fail by stopping, which loss counters cannot see. Watch pause duration per port and per NIC, walk the pause tree to its root automatically, and check the watchdog mode against intent.

## Facebook, October 2021

On 4 October 2021, Facebook, Instagram and WhatsApp were unreachable for about six hours. A maintenance command meant to assess backbone capacity took down every backbone connection. An audit tool existed to stop exactly such commands; a bug let this one through.

The second latent condition is the lesson. Facebook's DNS servers sit at edge sites reached by anycast, many sites announcing the same prefixes, and each site withdraws its announcement when it cannot reach the data centers. Right when one site is sick. With the backbone gone, every site failed the check at once, and every site withdrew. Cloudflare's resolvers saw about 30 times their usual query volume as clients retried. Remote access and diagnosis tools depended on the network that was down, so engineers went to the data centers in person.

The lessons. A health check that withdraws a route is a distributed kill switch: safe for independent failures, but a shared cause fires every copy together, so guard the last instance. The tools you recover with must not depend on what failed. Measure your own prefixes from outside. And an audit tool that gates dangerous commands is production software that needs tests.

## Patterns, and the interview

Across the six: protocol state is not service health, since sessions stayed up in five. The latent condition is usually an earlier change, two weeks earlier in the purge storm, so correlation must search weeks back. The blast radius exceeded the unit of change in every case that had one. Averages hide partial failures. And the management plane must survive the data plane.

"Tell me about an incident that changed how you think about the network" is a common question. Answer in about 90 seconds: impact, mechanism, why detection was slow, the fix, and what you would build. The last part matters most for a software engineer. If you did not handle it yourself, say so first.

A follow-up: one leaf rebooted, and the whole site went down. Where do you look?

[pause]

Scope first. One device, site-wide impact, so look for something with a wide domain: the IGP's flooding domain, with purges, overload bits or a bad LSP; shared services such as time, DNS or the route reflectors; or a control-plane storm. Then that device's logs, its clock in particular. The wrong answer is debugging the rebooted leaf's own interfaces, which explains nothing about the other 69 routers.

## Recap

Four things to remember. Separate the trigger from the latent condition, and spend your words on the latent condition and the detection gap. Every session being up starts an investigation: measure delivery end to end, and never trust an average across an ECMP group. The best detectors join two signals: a clock step with an LSP collapse, a maintenance with traffic still arriving, a NIC with its pause duration. And compare blast radius with the unit of change, and keep the management plane independent of the data plane it watches.

At your desk: the postmortem parts table, the six timelines, the four visualisations, the Facebook chain and the other public outages, the patterns table, the five detectors with their output, and the table of detection approaches.
