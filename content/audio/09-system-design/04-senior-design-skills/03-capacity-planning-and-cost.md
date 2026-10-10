---
lesson: capacity-planning-and-cost
source: b97c0f67329895fd
fit: great
desk:
  - "The queueing simulation script and its two tables"
  - "The cost-per-request table, line by line, and the plan on one page"
  - "The reservation table and the over-commitment arithmetic"
  - "Exercises: size a multi-region fleet, and plan reservations"
---
## Introduction

Product announces a launch in a new market in eight weeks, expected to add 40 percent to peak traffic. Your director asks two questions: will we stay up, and what will it cost?

"We autoscale" answers neither. Autoscaling reacts in minutes to load that arrives in seconds, it cannot create capacity your quotas or your database do not have, and it says nothing about the bill. The senior answer is a number of instances with headroom, the date the capacity must exist, the resource that runs out first, the line item that dominates the bill, and the cost per request before and after.

That answer is arithmetic. Four pieces of it: turning users into a fleet, why you plan for 60 to 70 percent and not 90, where the money actually goes, and how much capacity to commit to. Every price is a round number of the right order of magnitude, an assumption to replace, not a quote.

## Demand and the fleet

The running example is the API behind a streaming app's home screen. 30 million daily users, each opening the app about four times a day, each session making about 27 calls. That is 108 calls per user per day, 3.24 billion a day, or 37,500 requests a second on average. Because users span time zones, the peak is only 50 thousand, a peak-to-average ratio of 1.33. A product used mostly in one country sees two to three, because everyone's evening arrives at once. Measure that ratio; do not borrow it.

The capacity model in words: peak demand, divided by per-instance throughput at the SLO times your target utilisation, plus failure headroom. Each input has a trap. Plan on peak, not average. Use the throughput at which the 99th percentile still meets the target, not the load at which errors start. Stay below the knee. And keep enough spare to lose a zone.

A load test shows one instance holds the 99th percentile under 100 milliseconds up to 1,250 requests a second. The service runs in three zones and must survive losing one at peak. What is the smallest fleet?

[pause]

60. The naive plan stacks buffers: a 70 percent utilisation target, so 58 instances, then enough in two zones to hold all 58, so 87. At peak that fleet runs at 46 percent of its knee. The deliberate plan asks which buffer covers which risk. Zone headroom is a utilisation buffer, so let it do both jobs. After losing a zone, the survivors run at exactly the knee: 50 thousand divided by 1,250 is 40 instances in two zones, 20 per zone, 60 in total. Normally each runs at 67 percent of its knee; during a zone outage at peak, at 100 percent. That is 31 percent less fleet, for a risk you have priced.

Deploys are failures you schedule. If a zone fails mid-deploy at peak, with a tenth of instances out for the rolling batch, the 36 survivors run 11 percent past the knee. Deploy off-peak, or add the batch to the fleet.

Then count what nobody counted. Little's law says requests in flight equal arrival rate times time in the system: 833 requests a second per instance at 40 milliseconds is about 33 in flight. That sizes the pools, and catches a classic surprise. 60 instances with a database pool of 20 each open 1,200 connections, far beyond what one Postgres primary handles well. Capacity plans fail at the resource nobody counted.

## Why not 90 percent

The knee in a load test is a queue forming. With one worker and random arrivals, the mean wait grows as utilisation over one minus utilisation. Four service times at 80 percent, nine at 90, nineteen at 95. Waiting doubles between 80 and 90 percent. That is why single-threaded hot spots, one partition, one lock, one event loop, must run cool.

A real instance has many workers, and the lesson simulates sixteen. The pool absorbs randomness, and the steady-state knee moves past 90 percent. That is why a load test on a multi-core instance can look flat almost to saturation. So why not plan for 90?

[pause]

Because real load is not steady, and utilisation is usually a one-minute average that hides bursts. In the simulation, with arrivals swinging 25 percent above and below the average, an 80 percent average meant bursts reached 100 percent, and the 99th percentile jumped more than fourfold, from about 5 service times to about 22, while the dashboard showed a healthy 80. At a 70 percent average, bursts peaked at 88 percent and the tail barely moved. That is the case for 60 to 70 percent on latency-sensitive services, and for running batch fleets, where only throughput matters, at 90 without apology.

The per-instance number drives everything, so it deserves the most suspicion. Use production-shaped load: a synthetic test against one cached endpoint overstates capacity several-fold. Step the load and record where the tail breaches the SLO. Name the bottleneck. And re-measure every release.

## Growth, lead time and storage

Organic growth compounds. At 5 percent a month, traffic doubles in about 14 months. At 8 percent it doubles in nine, two and a half times in a year.

The launch plan: two months of 5 percent growth takes peak from 50 thousand to about 55 thousand, and the launch adds 40 percent, to about 77 thousand. Same zone-loss rule: 93 instances, up from 60. Now the questions are concrete. Can the database take 55 percent more connections? Is the quota above 93 instances of this type in this region? And when must it all exist? That is lead time. On-demand capacity arrives in minutes if quota exists, quota increases take days, commitments are planned quarterly, hardware takes months. Known events are pre-scaled: an 8 p.m. premiere is scaled at 7 from a schedule, not discovered by a CPU alarm at 8:02.

Storage grows differently: it follows the integral of traffic. 2 billion playback events a day at 100 bytes is 200 gigabytes; three replicas and index overhead make it about 780 gigabytes of disk a day, 285 terabytes after a year, 377 if ingest grows 5 percent a month. The lever is retention: keep 90 days hot, about 70 terabytes, and move older data to object storage, roughly ten times cheaper per byte. And leave room for compaction, up to half the disk for some log-structured stores.

## Cost per request

Unit economics make cost discussable: monthly cost divided by requests served. The example serves about 97 billion requests a month, and the bill comes to about 115 thousand dollars, 1.18 dollars per million requests.

Here is the surprise. Compute, the instances everyone argues about, is 11 percent. Log ingestion is 42 percent: a kilobyte of logs per request. Internet egress is 21 percent. Traffic between zones is 17 percent. The dominant costs are data moving, none of them shows up in a load test, and all scale linearly with requests.

Four changes, none touching the architecture. Sample success logs at 1 percent and keep every error: 48,600 dollars becomes about 490. Route within zones, halving cross-zone bytes. Compress responses from 5 kilobytes to 2. Reserve the baseline fleet. The total falls to about 38 thousand a month, 39 cents per million: two thirds cheaper. The sentence for a review is: the dominant cost is X, so the design should minimise X even at the expense of Y. Here X is bytes moved, not CPU. And know where bytes are metered: cross-zone traffic is billed on both sides of the hop, so a request and response to a cache in another zone is metered four times.

## Commitments and spot

A reservation with a discount costs its discounted price for every hour, used or not. So it pays off for any instance busy more than one minus the discount of the time. At 40 percent off, reserve every instance busy more than 60 percent of the day.

On the example's daily curve, 30 instances at the trough and 60 at the peak, the optimum is to reserve 40: compute drops from about 13 thousand a month to about 9,200, 30 percent less. Reserving the peak looks prudent and is worse, about 10,500, because 20 reserved instances sit idle most of the day. The optimum is flat, five instances either side costs about 1 percent, and over-committing is steep. So round down.

Over-committing has a price too. A three-year term at 60 percent off against renewing one-year terms at 40 percent off: if the service migrates to a new instance family after 12 months, you paid more per used hour than on-demand, and two thirds of the commitment is stranded. Three years only beats one-year terms after about 24 months of use. Commit for three years only to capacity you are confident will exist in the same shape for more than two.

Spot belongs where interruption is cheap, and checkpointing makes it cheap. If 5 percent of spot instances are reclaimed in an hour, a job that checkpoints every ten minutes wastes about 0.4 percent of its compute, against a 60 to 90 percent discount. A 12-hour job with no checkpoints is interrupted almost half the time and restarts from zero. And serverless: at list prices a function costs about eight times more per request than instances at sustained load. Functions for spiky glue, instances for steady hot paths.

## In the interview

A follow-up the lesson expects: traffic doubles overnight because of a viral event. What breaks first?

[pause]

Rarely the stateless tier, which autoscales, if slowly. First to break are shared, stateful and fixed-size things: database connections and CPU on the primary, cache memory and eviction rate, per-partition throughput on a hot key, and account quotas. Shed non-critical traffic at the edge, protect the core path, and scale the stateful tier first, because it takes longest. "We autoscale" is the wrong answer: it covers the one tier least likely to fail.

And present capacity in three sentences: the demand, the fleet, the dominant cost. Peak is 50 thousand requests a second from 30 million daily users, one instance holds 1,250 at our tail target, and we keep a zone's worth of headroom, so 60 instances, 93 after the launch. Database connections break first, so we add a pooler. The biggest cost is not compute but log ingestion and cross-zone traffic, so sample logs and route within zones. Thirty seconds, and every number can be challenged and defended.

## Recap

Five things to remember. Plan on peak demand and throughput at the SLO, measured with production-shaped load. Make each buffer cover a named failure instead of stacking them: 60 instances, not 87. Run latency-sensitive services at 60 to 70 percent, because bursts hidden in one-minute averages push 80 percent to saturation; run batch at 90. Compute cost per request by line item and expect bytes moved, logs, egress and cross-zone traffic, to dominate. And reserve to the break-even point, round down, and price the risk of over-committing before choosing a term.

At your desk: the queueing simulation, the cost and one-page plan tables, the reservation arithmetic, and the two sizing exercises.
