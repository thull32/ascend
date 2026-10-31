---
lesson: safe-change-and-maintenance
source: 4c33d5d362d5ebcf
---
## 1

Meridian's Amsterdam fabric has four spines. Leaf3 carries 270 gigabits per second on each of its four 400 gigabit uplinks at 2 in the afternoon, and the ceiling after a drain is 80 percent. What should the pre-check for draining spine2 decide?

A, pass, because the drained spine's share spreads evenly over three spines. B, block, because a drain always needs half the uplinks to be idle. C, pass, because 270 gigabits is only 67.5 percent of a 400 gigabit uplink. D, block, because each remaining uplink would carry 360 gigabits, 90 percent.

[think]

The answer is D: block, because each remaining uplink would carry 360 gigabits, 90 percent.

With one of four spines drained, each leaf's traffic spreads over three uplinks, so each carries four thirds of its current load: 360 gigabits, 90 percent of 400 and over the ceiling. Checking today's 67.5 percent misses that the drain itself raises the load. The traffic does spread evenly, which is exactly why the survivors become too full, and no rule needs idle uplinks.

## 2

Spine2 raises the metric to the cost-out value on its four leaf-facing links, but not on its circuit to Singapore. What does the validate-drained step find?

A, Singapore-bound traffic still on spine2, because circuit paths cost the same as before. B, all leaf-to-leaf traffic still on spine2, because metrics only apply to inbound traffic. C, nothing, because the leaves already route around a spine with any high metric. D, only control traffic, because IS-IS ignores links whose metric was not changed.

[think]

The answer is A: Singapore-bound traffic still on spine2, because circuit paths cost the same as before.

IS-IS metrics are the cost of leaving a router over a link. A path from an Amsterdam leaf to Singapore through spine2 leaves the spine over the circuit, whose metric is unchanged, so it costs 10 plus 52,500 plus 10, the same as through spine1, and the leaves keep spine2 for that traffic. Leaf-to-leaf paths leave over the raised links, so that traffic does move. Checking each port finds the circuit still carrying 35 gigabits.

## 3

A rollout planner puts spine1 and spine2 in Singapore, the two spines of a two-spine site, in the same wave, because the wave is only 5 percent of the fleet. What is wrong?

A, the wave is too small to give the canary statistically useful results. B, spines must always go last, after every leaf has been upgraded. C, the wave breaks the redundancy group, so one bad release takes the whole site. D, nothing, because a small percentage keeps the blast radius small.

[think]

The answer is C: the wave breaks the redundancy group, so one bad release takes the whole site.

A bad release is the same on every device in a wave, so a wave's blast radius is every device in it failing at once. Both spines of a two-spine site failing together cuts every leaf in that site off from every other. A fleet percentage says nothing about failure domains; the rule is at most one member of each redundancy group per wave. Spines are often good early canaries, because they can be fully drained.

## 4

A Batfish-style differential check approves draining spine2 in Amsterdam: every leaf pair stays reachable, and the inter-site pairs go from two equal-cost paths to one. What does it not tell you?

A, which leaf pairs lose an equal-cost path after the drain. B, whether the remaining circuit has the capacity for all Singapore traffic. C, whether any leaf pair loses reachability after the drain. D, whether a configuration names a prefix list that does not exist.

[think]

The answer is B: whether the remaining circuit has the capacity for all Singapore traffic.

A model computes routes and paths from configurations; it knows nothing about traffic volume. It can say that all Singapore traffic will use spine1's circuit, but only live telemetry says whether 70 gigabits fits on 100. Reachability, path counts and undefined references are exactly what a model reports. That is why the pre-check combines the model's path changes with measured load.

## 5

During the spine2 change window, with spine2 drained but not yet rebooted, leaf4 loses its link to spine1. How should change-aware monitoring treat it?

A, suppress it, because it falls within the declared maintenance window. B, amplify it, because leaf4 now has two of four uplinks. C, ignore it until the change closes, then raise it as a new incident. D, log it as expected, because adjacency changes are part of a spine drain.

[think]

The answer is B: amplify it, because leaf4 now has two of four uplinks.

The change declared only spine2's own adjacencies as expected. A second loss in the same fabric while one spine is drained is the drain-plus-failure case, with leaf4 on half its uplink capacity, which is more urgent than on a normal night. Since the reboot has not started, restoring spine2's metrics is the fastest fix. Suppressing everything in the window is how real outages go unnoticed during maintenance.

## 6

Spine2 comes back from its reboot and fails the device check: two of its five adjacencies stay down. What should the procedure do?

A, reboot it again immediately, then restore the metrics if it comes up. B, restore its metrics so the three good links carry traffic again. C, close the change, because the fabric is running on three spines anyway. D, keep it costed out and roll back the work by booting the old image.

[think]

The answer is D: keep it costed out and roll back the work by booting the old image.

After the point of no return, restoring the metric would put a device that failed its check into service. Staying costed out costs nothing, because the fabric was already sized for three spines, and the rollback is a second piece of work done while it carries no traffic: boot the previous image and check again. Closing the change leaves a drained spine with no owner, a leftover that removes a quarter of the capacity for weeks.
