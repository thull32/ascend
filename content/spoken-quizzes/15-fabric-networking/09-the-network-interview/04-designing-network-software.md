---
lesson: designing-network-software
source: 9500c2e4b59fa301
---
## 1

Your visibility platform's collectors stream over the data network. A site's dashboards freeze at their last values, and no alert fires. What design element was missing?

A, an absence-of-data alert, with heartbeats and the alert path carried out of band. B, polling with SNMP instead of streaming with gNMI from every device. C, a larger message queue between the collectors and the time-series store. D, a faster sample interval, so that the stale values are refreshed sooner.

[think]

The answer is A: an absence-of-data alert, with heartbeats and the alert path carried out of band.

When the path that carries telemetry fails, there is no bad value to alert on, only silence. So the platform must alert on missing data, and confirm over a path that does not share the failure, such as the out-of-band network or a probe from a neighbouring site. A larger queue only helps when data reaches it. SNMP polling rides the same data network, and a faster interval changes nothing when no samples arrive.

## 2

Spine1 in Amsterdam fails. Each Amsterdam leaf still has three of its four spines, and Acme's two web servers are both reachable. How should a blast-radius computation report Acme's web tier?

A, down until the spine's replacement has passed burn-in. B, up, because spare capacity absorbed the lost spine. C, unknown, because blast radius only applies to devices. D, down, because a spine it depends on has failed.

[think]

The answer is B: up, because spare capacity absorbed the lost spine.

Blast radius stops at redundancy. The leaves are degraded at 3 of 4 paths, but the web tier still has both members up, so it is not affected. Marking everything downstream of a failed device as down produces red dashboards during routine single failures, and trains people to ignore them. The engineer's view still shows the degraded leaves.

## 3

A config-as-code pipeline renders an empty configuration for a leaf, because the source of truth returned a partial record, and pushes it in replace mode. Which guard rail stops this before it becomes an outage?

A, a per-device lock, so that only one writer changes the leaf at a time. B, a confirmed commit that rolls back if not confirmed within a timer. C, a circuit breaker that refuses pushes deleting more than a threshold. D, golden-file tests of each template against a fixed sample record.

[think]

The answer is C: a circuit breaker that refuses pushes deleting more than a threshold.

The push is structurally valid, and the tool would confirm its own commit, so only a check on the size of the deletion catches it: refuse any push that deletes more than a set share of owned lines until a person approves. A lock prevents interleaving, not bad content. A confirmed commit protects against losing reachability to the device, and golden files test the template with good data, not a partial read at run time.

## 4

Sixteen probe streams between leaf1 and leaf3 in Amsterdam show 0.7 percent average loss. Three of them, all through spine3, lose about 4 percent. What should the platform alert on?

A, nothing yet, because ping between the same two hosts shows no loss. B, the worst path, grouped by the spine each stream crossed. C, the 0.7 percent average, since it is above the fabric's loss threshold. D, the total packets lost per minute across all sixteen streams.

[think]

The answer is B: the worst path, grouped by the spine each stream crossed.

Users on the bad path see 4 percent loss and retransmissions, and the average dilutes that by the number of healthy paths. Grouping streams by the path they took localises the fault to spine3, and then, with a second leaf pair, to one link. Ping uses a single 5-tuple, and so tests a single path, which is why it showed nothing.

## 5

An auto-remediation rule wants to cost out a gray-failing link from spine3 to leaf3 in Amsterdam at two in the afternoon, when each of leaf3's four uplinks carries 270 gigabits a second on 400 gig links. What should it do?

A, drain it, since a link losing frames should always be removed. B, do nothing until the link goes operationally down on its own. C, page a person, since three links would run at 360 gigabits a second, 90 percent. D, drain it, and restore it automatically once the errors stop.

[think]

The answer is C: page a person, since three links would run at 360 gigabits a second, 90 percent.

ECMP spreads the drained link's share over the remaining three: 1,080 divided by three is 360 gigabits a second each, above an 80 percent limit. So the choice is between loss on one link and congestion on three, a judgement for a person with the numbers in front of them. Automatic restore when errors stop invites a drain-restore loop, and waiting for the link to go down leaves the gray failure eating traffic indefinitely.
