---
lesson: redundancy-and-failure-domains
source: 98445369a114ec17
---
## 1

Meridian's two route reflectors are each available 99.9 percent of the time. A review finds they sit in the same rack, and about 5 percent of each one's downtime comes from causes that hit the whole rack. Roughly how does the pair's downtime compare with the independent estimate of about 30 seconds a year?

A, about the same, because a rack failure is rare compared with device faults. B, lower, because rack failures are repaired faster than device failures. C, about 5 percent higher, because only 5 percent of failures are shared. D, about 50 times higher, because the shared rack dominates the pair's downtime.

[think]

The answer is D: about 50 times higher, because the shared rack dominates.

A shared cause takes both reflectors down at once, so it contributes 5 percent of one member's downtime directly, about fifty times what two independent failures add. That is about 27 minutes a year instead of 30 seconds. The 5 percent is a share of each member's downtime, not a 5 percent increase in the pair's, and a rare shared cause still outweighs a coincidence of two independent ones.

## 2

A four-spine fabric runs at 70 percent uplink utilisation in the busiest hour. One spine is drained for an upgrade at that hour, and another spine fails during the window. What do the leaves' uplinks carry?

A, 140 percent, so queues overflow and drop. B, 70 percent, because ECMP rebalances the load. C, 93 percent, over target but without loss. D, 105 percent, slightly over capacity.

[think]

The answer is A: 140 percent, so queues overflow and drop.

With two of four spines gone, the remaining two carry everything: 70 percent times four, divided by two, is 140. One loss alone would give about 93. ECMP spreads the load over the survivors but cannot add capacity. To survive a drain plus a failure under an 80 percent target, the peak must stay under 40 percent, which is why drains are scheduled in quiet hours.

## 3

Acme's web 2 server is dual-homed to leaf 1 and leaf 2 in Singapore, and its link to leaf 2 fails. In an EVPN multihoming design, how do remote leaves stop sending its traffic to leaf 2?

A, leaf 2 forwards the traffic to leaf 1 over a peer link. B, they relearn each MAC by flooding until leaf 1 answers. C, they wait for the hold timer on their BGP session to leaf 2. D, leaf 2 withdraws one type-1 route for the whole segment.

[think]

The answer is D: leaf 2 withdraws one type-1 route for the whole segment.

That is mass withdrawal: every remote leaf removes leaf 2 from the next hops of every MAC on that segment at once. Forwarding over a peer link is how MLAG handles it, hidden behind a shared tunnel address. Remote leaves have no session to leaf 2, since both peer with the reflectors, and EVPN avoids relearning by flooding.

## 4

The blast-radius model ranks a bug in the spines' shared software release above any single rack or power feed failure. Which change reduces that radius?

A, moving the two route reflectors into separate racks. B, staging upgrades so few spines share a new release. C, adding a fifth spine running the same release. D, giving every spine a second, separately fed power supply.

[think]

The answer is B: staging upgrades so few spines share a new release.

The release is a failure domain shared by every spine that runs it, so hardware redundancy, more spines or more power supplies, leaves it untouched: a fifth spine crashes with the others. Staging limits how many spines can share a new release's bug at once. Separating the reflectors fixes a different shared fate, the rack.

## 5

A spine reboots after an upgrade. Its adjacencies come up in seconds, and a share of flows across the site is dropped for several seconds afterwards. What design rule was missing?

A, the spine should have come up costed out until its forwarding table was complete. B, the upgrade should have run with the spine left in service. C, BFD should have been disabled on the spine during the upgrade. D, the leaves should have used a larger ECMP group for that spine.

[think]

The answer is A: the spine should have come up costed out until its forwarding table was complete.

As soon as adjacencies form, leaves add the spine back to their ECMP groups and send it traffic, while its forwarding chip may not yet hold every route, so some flows are black-holed. Coming up with the overload bit or maximum metrics set, and restoring only after verification, prevents it. BFD and group size do not change what an unprogrammed forwarding table does, and upgrading in service is the opposite of a drain.
