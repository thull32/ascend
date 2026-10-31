---
lesson: designing-network-software
source: 054e3fa8fce29a27
fit: great
desk:
  - "The five-part skeleton table, and the diagram of every store joined into one graph"
  - "The telemetry load script and its output for Meridian and a large operator, and the table of numbers to have ready"
  - "The visualisations: telemetry going blind on leaf2.ams, sixteen probe streams finding the bad spine3 link, the intent-drift loop, and the spine2.ams upgrade drain"
  - "The blast-radius code and its four failure cases, traced by hand"
  - "The remediation guard-rail code and its four decisions"
  - "The fleet lifecycle state diagram"
  - "The tables: push-backs and the answers that hold, failure modes of the platform, and trade-offs"
  - "Exercise: validate a new site's cabling against LLDP"
---
## Introduction

"Design a platform that tells us whether the network is healthy." Most software engineers draw the same picture: collectors, a message queue, a time-series database, dashboards. It is not wrong. It is where the round starts going badly, because the network engineer on the panel asks questions it cannot answer. What happens when your collector's site loses its path to the aggregator? Which of four spines is dropping 4 percent of one leaf's traffic while every interface reports up? Is Acme down when one route reflector dies?

Three facts sit under those questions. The network you observe carries your observations, so it can blind you exactly when it breaks. Protocol up is not traffic flowing. And most outages start with a change. A design round at a network organisation is graded on those facts more than on your choice of database.

So: a five-part skeleton that puts them in every answer, the scale numbers to say out loud, then three designs worked on Meridian. A visibility platform, a config-as-code pipeline, and fleet lifecycle with remediation. Then the push-backs, and the answers that hold.

## The skeleton, and the join

Every network-software design has five parts. Inventory: what physically exists, from chassis to optics to leased circuits. Parts get replaced, so identity is a serial number plus a role, never a hostname alone. Intent: what the network should be doing. The network has no desired state of its own; only you can say what correct means. Telemetry: what it is doing now, from counters and protocol state to probe results and LLDP, where each port announces its device and port name to whatever is at the other end of the cable. Change: every write to the network. Roughly 70 percent of outages follow a change, by Google's SRE book. And failure modes: the part software engineers skip and network engineers listen for.

The idea that ties them together is the join between intended and observed. Every useful question is a comparison. Drift is intended configuration against running configuration. Miscabling is intended links against LLDP. A gray failure is an expected loss of zero against the 4 percent a probe measured. A blast radius is the intended topology with an observed failure removed. If your stores cannot be joined on the same device, interface and link identifiers, you can answer "what is red", but never "who is affected".

How the skeleton breaks: twenty minutes on the queue and the database, and you never reach change or failure modes. A workable 45-minute budget: 5 on requirements, 5 on scale, 10 on the data model, 10 on the pipeline, 10 on failure modes and push-back, and 5 to summarise and say what you would build first.

## Scale numbers to say out loud

The dominant volume is interface counters: devices times ports times counters per port, divided by the sample interval. Switches stream them over gNMI, which has two modes that matter. Sample sends a value every interval. On-change sends it only when it changes.

Meridian has about 120 devices. At 64 ports, 12 counters and a 10-second interval, that is about 9 thousand samples a second, around a gigabyte a day. A large operator with 10 thousand devices: a million samples a second, and about 54 terabytes for 13 months of raw data.

Three conclusions, and say them. Meridian fits on one machine: design so you can shard later. A large operator needs a sharded store, and downsampling after 30 days. And flows go elsewhere. One busy 400 gig port, sampled one packet in 10 thousand, gives 2,500 flow samples a second, and every distinct 5-tuple would become a new series as a metric label. Flow records belong in a columnar store.

One more number changes the design. A counter sampled every 10 to 30 seconds cannot alert faster than two or three intervals. BFD detects a failure in under a second, so the network reroutes before your telemetry samples anything.

## Design 1: a fabric visibility platform

State the requirements as four questions, for any device, link, tenant or path. Is it healthy? Is it the network? What is the blast radius? What changed? And make it an API first, because network engineers automate against it.

The data model is three stores joined by the same identifiers. A graph of devices, interfaces, links, circuits and tenants, where every edge exists twice: intended, from the source of truth, and observed, from LLDP, adjacencies and BGP sessions. Time series labelled with graph IDs. And events: pushes, maintenance, alarms. The graph is the product. Without it you can show that an interface is red, but not that it is half of Amsterdam's capacity to Singapore.

The pipeline: stateless collectors per site, a durable stream like Kafka so a slow store applies back-pressure instead of losing data, enrichment that attaches graph IDs, then the stores. Now the networking question inside it. Where do the collectors' bytes travel?

[pause]

Over the data network, because the out-of-band management network is usually 1 gig copper sized for logins. That means a congested fabric can silence its own telemetry. The lesson's scenario: a Globex batch job saturates leaf2's uplinks, and leaf2's best-effort telemetry is tail-dropped. Three missed samples raise an absence-of-data alert. Dead or congested? The out-of-band ping answers in under a millisecond, and the spines report 399 gigabits a second arriving from leaf2. The verdict is telemetry blind, not device dead. The rule: bulk data in band, heartbeats and the alert path out of band, and confirm every health signal from a second source over a different path.

Is it the network? Users experience paths. Ping is not enough, because ECMP hashes each flow's 5-tuple onto one spine, so every ping between two addresses takes one path. In the lesson's run, ping from leaf1 to leaf3 shows no loss. Sixteen probe streams, differing only in source port, spread over all four spines. The three through spine3 lose about 4 percent; the average over all sixteen is 0.7 percent. Alert on the worst path between a pair, never on the mean.

Blast radius is a graph traversal from the failed element that stops at redundancy. Fail spine1 in Amsterdam. Every leaf still has 3 of 4 spines: degraded, not down. The circuit to Singapore that ends on spine1 is down, so the interconnect runs at half capacity. Acme's web tier is up, because both web hosts are alive. Now fail spine1 in Amsterdam and spine2 in Singapore together. On per-site dashboards they look unrelated. Together they kill both circuits. That is why the graph needs the far site.

The same graph does correlation: one link failure's alarms, adjacency change and probe loss share a cause node, so they become one page instead of forty. And it serves two views: the on-call engineer wants this link and this optic's receive power; the manager wants which tenants are red, and whether to step in.

## Design 2: a config-as-code pipeline

"Design how configuration gets from intent to ten thousand devices." The requirement under the words: a wrong change must reach few devices, be visible before it lands, and be undoable.

Intent is data, changed by pull request. Rendering is a pure function, tested with golden files. Validation comes before any device sees it: policies like unique route targets, and for big changes a Batfish-style model that computes routes offline. A duplicated route target, leaking one tenant's routes into another's, is stopped here or nowhere, because every session stays Established while it happens. Then a fleet diff in review, a staged rollout, a confirmed commit that rolls itself back unless confirmed in time, a check that the post-push diff is empty, and a record that answers "what changed?".

Push semantics are where pipelines fail silently. A merge push sets what it names and never removes what it omits. Delete Acme's staging VLAN 300 from the source of truth, and a merge push leaves it on leaf1. A replace removes it.

Roll out by failure domain, not by count. On Meridian, never two spines of one site in one wave, because two of four halves the fabric, and never both reflectors or both gateways. A large operator might run a canary per role, then 1 percent, 10 percent and the rest, with a 30-minute soak and automatic checks after each.

Now a test. The source of truth returns an empty record, the template renders it faithfully, and the pipeline pushes it as a replace. What stops it?

[pause]

A circuit breaker on diff size: refuse any push that deletes more than a threshold, say 10 percent of a device's owned lines, until a person approves. A confirmed commit would not help, because the tool would confirm its own commit. Add one writer per device at a time, so a drift fix and an engineer's change cannot interleave. And keep a break-glass path: at 3 in the morning an engineer will type on a device. Make it visible as drift with its author, to adopt or revert.

## Design 3: fleet lifecycle and remediation

Every device moves through the same states: planned, provisioned, validated, in service, draining, maintenance, and finally decommissioned, each transition gated by checks software can run.

Bring-up starts with zero-touch provisioning: the new switch boots, gets an address from DHCP, and is pointed at the image and configuration for its planned role. Validation compares every planned link with LLDP from both ends and checks every optic. A cable in the wrong spine port still shows link up, so only the comparison with the plan catches it.

Upgrades are drains at scale: pre-check headroom, cost out, verify empty, work, verify, restore. The scheduler runs blast radius on every set of devices it plans to have out at once. And a leaf with single-attached servers cannot be drained without disconnecting them, so its upgrade needs the tenant's maintenance window.

Remediation is where automation gets dangerous. A gray-failing optic, link up and frame errors rising, is fixed by costing out the link and replacing the optic. Automating the first step pays, because a person takes minutes to an hour. Automating it unguarded is how a monitoring bug drains half a fabric. The guard rails: evidence that persists and is confirmed at both ends; at most two auto-drained links per site; never a leaf below two uplinks; and no link above 80 percent after the drain.

Here is the case that matters. At two in the morning, leaf3's four uplinks carry 165 gigabits a second each. Drain one, the other three carry 220, and the automation drains. At two in the afternoon they carry 270 each. Drain one, and three links run at 360, 90 percent of 400. The choice is 4 percent loss on a quarter of leaf3's incoming traffic, or congestion on three links. That is a judgement about these tenants at this hour, so the automation pages a person with the numbers, and stops. And when several links fail at once, the likeliest cause is the monitoring or a shared fault, which automation would multiply. That is what the budget is for.

Decommissioning is a deletion, the hard part of intent. Drain, remove from intent, confirm no peer still references the device, then remove it from inventory.

## Push-back, and the interview

The push-back is the interview. "Your collectors will melt my control plane": on-change for state, 10 to 30 seconds for counters, a cap per device, and device CPU tracked as the platform's own cost. "Don't let a script drain my network": read-only first, then suggested actions, then automation for one failure class, with budgets and a stop switch. The 2021 Facebook backbone outage began with a command an audit tool failed to block, and took its internal tools down with it, so run the alert path outside the fabric. "Your dashboard was green during the outage": probes decide health; protocol state explains. And past what you know, say so: "I'd defer to you on what interval that platform tolerates; I'd measure device CPU before and after each change."

A follow-up the lesson expects. LLDP and the source of truth disagree about a cable. Which wins?

[pause]

Neither, silently. The graph keeps both and opens a drift event. For a fabric link the fix is usually the cable, because the IP plan and routing assume the intended wiring. The wrong answer is "the source of truth, always", which shows a miscabled spine port as healthy.

And what would you build first? The graph, read-only, from existing sources; then path health for one important tenant; then blast radius for maintenance planning. No write access until the read side has earned trust.

## Recap

Five things to remember. Open with inventory, intent, telemetry, change and failure modes, and put the join between intended and observed at the centre. Carry bulk telemetry in band and heartbeats out of band, and alert on absence of data. Compute blast radius as a traversal that stops at redundancy, and alert on the worst path, never the average. Roll out by failure domain behind a diff-size breaker. And reads before writes: every automated write gets evidence, a budget, a headroom check and a stop switch.

At your desk: the skeleton table, the telemetry load script, the four visualisations, the blast-radius and remediation code, the lifecycle diagram, the push-back, failure-mode and trade-off tables, and the cabling validation exercise.
