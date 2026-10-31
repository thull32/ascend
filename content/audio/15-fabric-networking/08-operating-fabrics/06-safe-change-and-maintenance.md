---
lesson: safe-change-and-maintenance
source: 22dfec64f4b13e01
fit: great
desk:
  - "The spine-drain visualisation: the 14:00 refusal, the drain, verification, reboot, check while costed out, restore and the snapshot comparison"
  - "The six-step table and the procedure state diagram"
  - "The procedure runner and its four runs: blocked, leaking circuit, unrelated optic, clean"
  - "The rollout planner and its eight waves over 72 devices"
  - "The differential model of Amsterdam and Singapore and its three verdicts"
  - "The change-aware classifier, its event log and the leftover report"
  - "The audit record, and the tables of rollback triggers, failure modes and trade-offs"
---
## Introduction

Most network outages begin with someone changing something. Google's SRE book puts roughly 70 percent of outages down to changes in a live system. Automation removes typing errors, but lets one wrong change reach every device at once. And Meridian still upgrades software, replaces optics and recables racks every week.

So the answer is not fewer changes. It is a procedure in which every step is checked by a measurement, every batch is small enough for redundancy to absorb, and the monitoring knows a change is running. A change has one property a hardware failure does not: it is planned. You know which device you will touch, what should happen to the traffic, and how to undo it.

Tonight's change upgrades the operating system on spine2 in Amsterdam, which needs a reboot, and the goal is to lose not one packet. On the way: the six-step shape, costing out and how it leaks, canary waves, rollback triggers, testing on a model, and monitoring that knows a change is running.

## The six steps

Every maintenance follows the same shape: pre-check, drain, validate, work, restore, validate. The pre-check asks whether the rest of the network can carry this device's traffic, and whether it is healthy right now; if not, you do not start. The drain moves traffic off while the device still forwards. Validate asks whether the traffic left and nothing broke. Then the work. Restore puts the device back, only after checking it while it carries nothing. And the last validate asks whether the network is back where the pre-check found it.

Two rules make it safe. Every gate is a measurement against a threshold, not a timer. "Wait five minutes" assumes the drain worked; "every port below 1 megabit per second" proves it. And every step has an undo that gets more expensive as you go. Before the work, undoing a drain is one metric change. After it, the undo is a second piece of work. That boundary is the point of no return, and a good plan names it.

## Draining spine2 tonight

Costing out a device means making every other router's routing calculation avoid it while it still forwards. On Meridian's IS-IS underlay you raise the metric on all its links to 16,777,214, the largest metric the shortest-path calculation still uses. A path through the spine costs millions instead of 20, every leaf drops it from its ECMP group, and traffic moves while the spine still forwards whatever reaches it. Make before break.

The fabric here is small: four spines, four leaves, 400 gigabit links. Spine1 and spine2 also carry the two 100 gigabit circuits to Singapore.

The story starts at 2 in the afternoon, with a refusal. With one of four spines out, each leaf's three remaining uplinks carry four thirds of today's load. Leaf3, the busiest, carries 270 gigabits per uplink, which would become 360: 90 percent. Both circuits carry 45 gigabits, so one circuit would carry 90. Meridian's ceiling is 80 percent. Do not start, and count that as a success: it is the cheapest rollback there is.

At 2 in the morning the same arithmetic gives 220 gigabits, 55 percent, and 70 percent on the circuit. All four spines are in service, 18 adjacencies up, no alarms, clean probes. The tool saves this as the pre-check snapshot, the definition of "back to normal".

Drain. Spine2 raises its five link metrics to the cost-out value and floods a new link-state packet. Every leaf reruns its calculation and spine2 leaves every ECMP group; leaf3 goes from four uplinks at 165 gigabits to three at 220. A flow that changes spine may see a few packets reordered; none needs to be lost. Validate: each port now carries 10 to 20 kilobits per second of hellos, BFD and LLDP, and nothing counts discards. Work: the spine reboots, five adjacencies drop as expected, and no traffic notices.

Then a step worth copying. The high metric was written into the saved configuration, so the spine boots still costed out and is checked while it attracts nothing: new release, five of five adjacencies, 52 routes, zero errors. A drain held only in the running configuration would vanish at the reboot. Only then are the metrics restored, and the post-check matches the snapshot: zero packets lost.

Now the night it goes wrong. The template that raises the metrics lists the four leaf ports and forgets the circuit to Singapore. What happens to Singapore-bound traffic?

[pause]

It stays. IS-IS metrics are directional: each router advertises the cost of leaving it over each link. A path to Singapore through spine2 leaves over the circuit, whose metric is still the normal 52,500. It costs 10 plus 52,500 plus 10, exactly what it costs through spine1, so every leaf keeps spine2 for Singapore. A device total says "mostly drained"; the per-port view shows 35 gigabits still on the circuit, which the reboot would cut. Drained is a per-port fact.

Two more nights. On one, an optic on spine3 starts dropping right after the drain, and the triggers fire. Whether the drain caused it does not matter: putting spine2 back restores a quarter of the capacity in seconds. On the other, spine2 fails its device check after the reboot. You do not restore its metrics, which would put a broken device into service. It stays costed out, and the rollback, booting the old image, happens while it carries nothing.

## Canaries and waves

A release for the whole fleet is a rollout, done in batches. The blast radius of a batch is what you lose if the change is bad on every device in it at once, the right assumption, because a bug is identical on every copy. The exposure is how long a bad change runs before anything notices. Big batches finish sooner and risk more.

The rules. A canary goes first, alone, with the longest soak, because no lab has production's chips, table sizes and traffic. Pick one cheap to lose, like a spine in the quietest site, and soak it for a day, because memory leaks, timers and peak hours need time. Never two members of one redundancy group in one wave: one spine per site, one leaf of each pair, one route reflector, one gateway. Every role gets its own canary, because a bug in the gateway's BGP code will not show on a spine, and a role's share doubles only after a clean wave containing it. And any trigger stops the rollout, not only the device.

On 72 devices over three sites, that gives eight waves. Wave one is a single spine in Singapore, soaking 24 hours. Amsterdam, the busiest site, sees its first device in wave three. The rollout takes about two and a half days, against six for one device at a time, and an hour for all 72 at once, which would run a bug on every spine of every site together.

A canary protects only against the change it ran. In the Rogers outage in Canada in July 2022, by Rogers' account to the regulator, a core upgrade went in phases and earlier phases had gone cleanly. The failing phase removed a routing filter on distribution routers, which then flooded the core routers with more routes than they could handle. Mobile, internet and emergency calling were hit for most of a day. A wave that changes something new is a new canary.

## Rollback triggers

A rollback trigger is a condition, decided before the change, that undoes it automatically or obliges the engineer to. In advance, because judgement degrades: at twenty to three in the morning with one step left, "probe loss 0.3 percent, probably noise" is tempting. Each trigger names a signal, a threshold, a duration and an action.

For spine2: any discards on a fabric port. Probe loss above 0.1 percent for two minutes, which at 10 probes a second is 1,200 probes, so one random loss is only 0.08 percent. An uplink above 80 percent. An ECMP width different from the plan, because a leaf with two paths has lost a second spine. And the clock: stop when the window's end minus the rollback's own 30 minutes arrives.

Undoing the drain takes seconds; the drained spine is the fabric's spare. A configuration rollback, from commit history or a confirmed commit that reverts itself, takes seconds and works even if the automation cannot reach the device. A software rollback boots the previous image, minutes, and is safe only while drained.

And a rollback that needs the thing the change broke will not run. That is why Meridian manages devices over a separate out-of-band network. In Facebook's October 2021 outage, by its own write-up, engineers could not reach the data centres with their normal remote tools, because those tools needed the backbone that had just gone down.

## Testing the change on a model

The cheapest outage is rejected before any device is touched. Schema validation catches errors of form against the device's YANG model. Policy checks on the source of truth catch known mistakes, like duplicate route distinguishers, but only those someone wrote a rule for. A model computes, from the configurations alone, the routes the network will converge to. And differential analysis asks the same questions before and after, and reports only what differs.

Batfish is the best-known open-source tool for this. It parses many vendors' configurations into one model, simulates BGP, OSPF, IS-IS and static routes to convergence, and answers questions like "can A reach B, and along which paths".

Three changes through a small model of Amsterdam and Singapore. Draining spine2 is allowed, at a stated cost: Amsterdam pairs drop from four equal-cost paths to three, and inter-site pairs from two to one, which sends the pre-check to the remaining circuit's headroom. Draining spine1 and spine2 together is blocked: every path to Singapore becomes a last resort. And shutting both circuits "to test capacity"?

[pause]

Blocked: sixteen leaf pairs lose reachability. That is the shape of Facebook's 2021 outage, where a command meant to assess backbone capacity disconnected every backbone link.

What a model cannot see matters as much. It knows which paths exist, not how much traffic they carry. It computes the converged state, not the transient, and it assumes devices behave as configured. A model shows the change does what the configurations say; a canary shows the devices do.

## Monitoring and the audit trail

Monitoring that does not know about a change pages for the expected, and people learn to ignore it. Or someone mutes the site, and the real outage ten minutes later pages nobody.

Change-aware monitoring reads the change record: devices, window, expected events. Every event is classified, not suppressed. Expected: annotate, no page. Suspect, meaning loss, discards or falling prefix counts during the window: page with the change attached, because the change is the likeliest cause. Amplified: a failure in the change's failure domain. Unrelated: normal alerting.

At fourteen past two, with spine2 drained, leaf4 loses its link to spine1, leaving two uplinks of four. Muting would hide it. It is amplified, and if the reboot has not started, restore spine2. Then the slow failure: the next morning, after an abandoned change, spine2 still sits at the cost-out metric, Amsterdam on three spines with no alarm. Leftovers get reported with their age.

The first question in almost every incident is "what changed?" Answering in seconds needs one searchable record of every change: who and who approved, why, the diff per device, each gate's measured value, synchronised timestamps, snapshots, outcome. The dangerous change is the one missing from the record. Command accounting through TACACS+, configuration-change notifications and drift detection catch changes made outside the tool. Changes with no matching record should number zero.

## In the interview

"Walk me through taking a spine out for an upgrade."

[pause]

Pre-check with numbers: uplinks at 165 gigabits go to 220 on three spines, 55 percent, circuits to 70, and every spine in service. Raise its IS-IS metrics so the leaves drop it while it still forwards. Validate per port. Upgrade, check it still costed out, restore, compare with the snapshot. The common wrong answer is "shut it down, ECMP handles it", which loses every packet in flight during reconvergence and never checks whether the other spines can carry the load.

And for a thousand switches: canary first with a long soak, one per role, waves that grow but never hold two members of a redundancy group. Fixed percentages are the wrong answer; they can put both spines of a small site in one wave.

## Recap

Five things. Pre-check, drain, validate, work, restore, validate, with every gate a measurement and "do not start" a success. Drained is a per-port fact, because metrics are per direction. Batch by redundancy group and role, canary first, and a wave that changes something new is a new canary. Decide triggers in advance, and never rely on an undo that needs the broken path. A model shows reachability, not load, and monitoring classifies events against the change instead of muting.

At your desk: the spine-drain visualisation, the procedure runner, the rollout planner, the differential model, the change classifier, and the tables of triggers, failures and trade-offs.
