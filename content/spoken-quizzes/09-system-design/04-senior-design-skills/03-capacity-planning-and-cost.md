---
lesson: capacity-planning-and-cost
source: 8c9f8579d0b2c684
---
## 1

One instance meets the 99th percentile SLO up to 1,250 requests a second. Peak is 50,000 requests a second across three availability zones, and the service must survive losing a zone at peak. What is the smallest fleet that serves peak within the SLO after a zone loss?

A, 120 instances. B, 87 instances. C, 40 instances. D, 60 instances.

[think]

The answer is D: 60 instances.

After losing a zone, two zones must carry 50,000 requests a second, at up to 1,250 each: 40 instances, so 20 per zone, and 60 in total. 40 has no zone headroom, and 87 stacks a separate 70 percent utilisation target on top of the zone headroom.

## 2

In the single-server queueing model, what happens to the mean queueing delay when utilisation rises from 80 percent to 90 percent?

A, it rises by about 12 percent, tracking the change in load. B, it stays roughly flat until utilisation nears 100 percent. C, it roughly doubles, from 4 to 9 service times. D, it falls, because a busier server batches its work.

[think]

The answer is C: it roughly doubles, from 4 to 9 service times.

Queueing delay grows as the utilisation divided by one minus the utilisation: 4 service times at 80 percent, 9 at 90, and 19 at 95, which the simulation reproduced. It is not linear in load. A single worker has no pool to absorb randomness, so single-threaded hot spots must run far below saturation.

## 3

A 16-worker service runs at 80 percent average utilisation, and its arrival rate swings 25 percent above and below that average. In the lesson's simulation, what happened to the 99th percentile, compared with steady arrivals?

A, it rose about 25 percent, in line with the load swing. B, it stayed flat, since 16 workers absorb the bursts. C, it fell, since the quiet periods drain the queue. D, it rose over fourfold, as the bursts hit saturation.

[think]

The answer is D: it rose over fourfold, as the bursts hit saturation.

During bursts, utilisation reaches 100 percent, and the queue grows without bound for the length of the burst: the 99th percentile went from 4.7 to 21.7 service times. At a 70 percent average, the bursts peaked at 88 percent, and the 99th percentile barely moved. Quiet periods drain the queue, but cannot undo the waits already suffered.

## 4

A reservation gives a 40 percent discount. Which instances in an autoscaled fleet should you reserve?

A, only instances busy more than 60 percent of the hours. B, all instances, up to the fleet's size at the daily peak. C, none, since on-demand is cheaper with autoscaling. D, only the instances busy less than 40 percent of the hours.

[think]

The answer is A: only instances busy more than 60 percent of the hours.

A reserved instance costs 60 percent of on-demand for every hour, used or not, so it pays off only when the instance would run more than 60 percent of the time. Reserving up to the peak pays for idle capacity most of the day: in the lesson, it cost 10,512 dollars, against 9,210 at break-even.

## 5

A three-year commitment is 60 percent off, and a one-year commitment is 40 percent off. You expect to migrate the service to a new instance family after 18 months. Which plan costs least for that capacity?

A, two back-to-back one-year terms covering the move. B, one one-year term, then on-demand until the move. C, one three-year term, since its discount is deepest. D, on-demand for all eighteen months of use.

[think]

The answer is B: one one-year term, then on-demand until the move.

Commitments are paid for their whole term. Counted in months of on-demand cost, one one-year term costs 7.2, plus 6 months on-demand, 13.2 in all. The three-year term costs 14.4 whatever happens, and two one-year terms also cost 14.4, because the second runs six months past the move. On-demand throughout costs 18. The deepest discount loses because a third of it is never used.

## 6

A service's bill is dominated by log ingestion and cross-zone data transfer, rather than compute. What is the most effective first step?

A, move to larger instances, to cut per-request overhead. B, add cache nodes, to reduce the load on the database. C, sample success logs, and keep traffic within each zone. D, rewrite the hot paths of the service in a faster language.

[think]

The answer is C: sample success logs, and keep traffic within each zone.

The dominant costs scale with bytes moved, not with CPU. Sampling success logs, and routing to same-zone replicas and caches, attack the largest line items directly. Faster code and bigger instances reduce a line that was a small share of the bill.
