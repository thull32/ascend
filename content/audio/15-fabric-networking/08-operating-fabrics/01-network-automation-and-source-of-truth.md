---
lesson: network-automation-and-source-of-truth
source: 34037237598548ba
fit: great
desk:
  - "The intent-drift visualisation: the night on leaf1.ams from drift to a merge push, a replace push and an empty rerun"
  - "The source-of-truth table for leaf1.ams and the data-to-rendered-config trace"
  - "The merge, replace and explicit delete table per platform, and the four ways of getting a deletion onto the device"
  - "The drift triage table"
  - "The intent loop in Python and its output"
  - "Exercise: a drift report, and the config-drift practice problem"
---
## Introduction

Acme retires its staging environment on a Tuesday. Someone deletes the staging segment, VLAN 300, carried across the fabric as VNI 10102, from the system that describes Meridian's network. That night's automation run reports success on every leaf. Three months later, VNI 10102 is handed to a different tenant, and port swp5 on leaf1 in Amsterdam, still configured for the old segment, puts an unknown server straight into the new tenant's network.

Nothing failed. The automation did exactly what it was built to do. It pushed what the intent said, and the intent said nothing about VLAN 300 any more.

This is the kind of system network organisations hire software engineers to build. Four ideas, then. Why automate at all. The intent loop, from source of truth to verified device. Merge versus replace, and why deletions are the hard part. And drift and idempotency, the two properties that make a loop safe to run every few minutes.

## Why automate

Three facts drive every network automation programme.

First, changes cause most outages, and people make the changes. Google's Site Reliability Engineering book attributes roughly 70 percent of outages to changes in a live system. Fabrics are built with redundancy to absorb a failed switch. A wrong change applies to every redundant copy at once.

Second, hands do not scale. Meridian has over a hundred devices; large operators run tens of thousands. Suppose an engineer typing by hand gets 1 change in 200 wrong, an assumption for the arithmetic. Adding a segment to all 16 Amsterdam leaves then goes wrong somewhere nearly 8 percent of the time. Across 100 devices, about 39 percent. Automation makes the error rate a property of one reviewed template, rather than of every keystroke on every device.

Third, consistency. Sixteen leaves configured by hand become sixteen slightly different leaves, and every difference is a question during an incident.

But automation is an amplifier. In Facebook's October 2021 outage, a command issued during routine maintenance disconnected every backbone link, and the audit tool meant to stop it had a bug. The tooling was the blast radius.

## The intent loop

Intent-based automation separates what the network should be from how a device is told. It is the same idea as Terraform or a Kubernetes controller: declare the desired state, compute the difference from the actual state, act on the difference, check. Six stages.

The source of truth holds the network as data: devices, interfaces, cables, addresses, tenants and their segments. Templates turn that data into one device's intended configuration. The tool reads what the device is actually running, diffs the two, applies the change as a transaction, and verifies. Then the loop runs again.

The source of truth stores facts, not device commands. Anything that follows from another value is derived in the template, never stored: the IS-IS system ID comes from the loopback, and so does the EVPN route distinguisher. Store them separately and one day they disagree. The source of truth is also where uniqueness is enforced. Two tenants on the same VNI are each valid on the device where they are typed, and invalid across the network. NetBox or YAML in Git both work; what matters is exactly one source per fact.

Templates have two rules. Rendering is pure: no device access, no clock, no randomness, so the same data always gives byte-identical output, testable with golden files. And templates describe what exists. When the staging segment is deleted from the data, its lines are simply absent. Nothing in the output says "VLAN 300 used to be here." Hold on to that. It is the root of the deletion problem.

The diff is not a text diff. Configuration is a hierarchy, some order matters and some does not, and devices add noise: timestamps, omitted defaults, hashed secrets. All of that must be normalised, or every run reports drift that is not real. So production tools diff trees of paths: set a path if the intended value is missing or different, delete it if the device has a path the intent does not.

Verify has two levels, and only the second says the network works. First, read the configuration back: the diff must now be empty. Then check operational state: BGP sessions established, IS-IS adjacencies up, LLDP neighbours matching the cabling, probes passing. Correct configuration can still black-hole traffic.

## One night on leaf1

Here is the whole loop on one switch, leaf1 in Amsterdam, with two uplinks. On a normal night, the source of truth has two segments, the render is eight lines, the device runs the same eight lines, and the diff is empty.

Yesterday there was an incident. The optic on the uplink to spine2 was throwing errors, so an engineer raised that link's IS-IS metric from 10 to 1000 by hand. leaf1 now sends everything through spine1. Metrics are one-directional, so traffic from spine2 down to leaf1 kept using the link unless someone raised the spine's end too: a second manual change, on a second device. The optic was replaced this morning. The override is now stale. Tonight's diff shows one change, and that is drift. The owner approves the revert.

Then Acme staging is retired. The source of truth drops to one segment, and the render shrinks from eight lines to six. The diff now shows one change, the metric, and two deletions: VLAN 300 and the port swp5 that carries it.

The automation pushes the six lines in merge mode. Before I tell you what happens: what is on the device afterwards?

[pause]

The metric is back to 10. The push reports success. And VLAN 300 is still mapped to VNI 10102 on swp5. leaf1 keeps advertising an EVPN type-3 route for that VNI, the route that tells other leaves to send it the segment's broadcast traffic, so every other leaf still configured with VNI 10102 keeps replicating broadcasts to it. Under merge pushes, that is all of them. When the VNI is reused, swp5 joins the new tenant's segment. That is the opening story.

The fix is a replace push of the same six lines. The device removes what the payload does not contain, and the diff is empty. An hour later the loop reruns, finds an empty diff, and pushes nothing. That last step is idempotency.

## Merge versus replace

Every configuration interface offers two ways to apply a payload. Merge: for every setting the payload names, add it or overwrite it, and leave everything else alone. A merge can never remove anything by omission. Replace: the payload is the complete desired content of the target, the whole configuration or one subtree, and the device deletes whatever the payload does not contain.

The names differ: NETCONF merges by default, gNMI has update and replace, NVUE has patch and replace.

Why are deletions the hard part? Five reasons.

One: absence is not a statement. A missing line could mean deleted on purpose, never modelled by this tool, or a query that returned partial data. Only a diff against running turns an absence into an action, and only an ownership rule says whether it is allowed.

Two: merge is the default almost everywhere, because it never destroys what the payload did not mention. So a pipeline that renders and pushes without diffing never deletes anything.

Three: ownership. A device's configuration has many writers: the fabric automation, a security team's access lists, the device's own defaults. A whole-configuration replace deletes everyone else's work. So Meridian's tool replaces only the sections it fully models, and leaves the rest.

Four: dependency order. A port references a VLAN, the VLAN a VNI. Deletion runs the opposite way to creation: port, then VLAN, then VNI. A replace lets the device order the steps. Explicit deletes make the tool responsible.

Five: deletions change forwarding at once. Rogers traced its July 2022 nationwide outage to a staged core upgrade in which a removed routing filter let routes flood its core routers until they failed.

And leftovers are not cosmetic. A stale access list entry still permits what it permitted. A stale VNI binding is the tenant leak.

So how do you get a deletion onto the device? Merge alone never does it. Explicit deletes computed from the diff are the most reviewable, and suit shared sections. A scoped replace lets the device compute deletions inside a section the source of truth models completely. A full replace fits only a greenfield device. And one pattern helps with all of them: a tombstone. Instead of deleting the staging segment's record, mark it decommissioning, render explicit removals, and drop the record only after every leaf is clean.

## Drift and idempotency

Drift is any difference between running and intended configuration that the source of truth did not cause. A change merged an hour ago and not yet pushed is a pending change, not drift, and a tool that shows both in one colour trains people to ignore it. Real drift comes from manual changes, partial pushes, upgrades that change a default, and other tools writing the same section.

Detection is the diff, run continuously, and it is cheap: a 10,000-device fleet with 50 parallel workers at 2 seconds a device is swept in under seven minutes. Tools also re-diff a device when it reports a commit.

Detection is the easy half. Triage decides what each drift means, and a person makes the call, because the tool cannot know which side is right. A typo'd MTU is a misconfiguration: revert it. The metric after the optic was fixed is a stale override: revert, with the owner's approval. The metric while the optic is still bad is a live exception: record it in the source of truth with an owner and an expiry. A cable moved and the source of truth not updated is intent lagging reality: fix the data, not the device. And a reordered section or a printed default is noise: fix normalisation so it never appears again. That last class matters most for adoption. A report of 4,000 noisy lines is ignored, and the 3 real ones inside it with it. Age every open drift: a three-hour-old override during an incident is normal, a 90-day-old one is the next incident.

Idempotency means doing it twice has the same effect as doing it once. It matters in two places. When a push times out and you do not know whether it landed, an idempotent loop has a safe answer: re-diff and push whatever is left. And a loop that runs every few minutes is only safe if a converged device produces an empty diff and an empty push, so that every non-empty diff means something.

Declarative "set this path to this value" operations are idempotent. Imperative ones often are not. An access list entry appended without a sequence number can be added twice. Resetting a BGP session repeats its effect every run, so keep it out of the loop. And unstable renders break it quietly: a timestamp in a comment, or a set iterated in hash order, which in Python can change every run. The test: render, push, read back, render again, and assert that both the diff and the second push are empty.

## In the interview

Here is the question a principal network engineer asks. Your source of truth and the device disagree. Which one wins?

[pause]

Neither, silently. The disagreement is an event, classified as drift, pending change or noise, and a person decides whether to revert the device or update the source of truth, because an emergency override may be correct and the data may be stale. Build continuous diffs, exceptions with an owner and an expiry, and auto-revert only where the team has agreed the source of truth is always right. The common wrong answer is "the source of truth always wins", which reverts an engineer's fix in the middle of an incident.

And the follow-up: why not replace the whole configuration every time? It is simpler only if the source of truth models every line on the device. Defaults and other teams' sections get deleted, and a partial read becomes an outage: a query that times out and returns leaf1 with no segments, pushed as replace, deletes every VLAN on the leaf. So replace the subtrees you fully own, and put a circuit breaker in front of the push that refuses large deletions without a person's approval. Whether a platform's replace is disruptive is something to confirm with the network team per operating system.

## Recap

Five things to remember. Changes cause most outages, and automation turns the error rate into a property of one reviewed template, but it also amplifies a wrong one. The loop is source of truth, render, diff against running, apply, and verify twice: an empty post-push diff, then operational state. Merge is the default nearly everywhere and cannot express a deletion; use explicit deletes or a replace scoped to sections you own, with a limit on deletions per push. Drift is an event to triage, not an instruction to overwrite. And prove idempotency by running the loop twice.

At your desk: the intent-drift visualisation, the source-of-truth and render tables, the merge and replace tables, the triage table, the Python model of the loop, and the drift report exercise with the config-drift problem.
