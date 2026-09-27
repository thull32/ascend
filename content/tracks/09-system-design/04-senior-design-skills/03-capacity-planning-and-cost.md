---
slug: capacity-planning-and-cost
title: "Capacity planning and cost: from growth curves to machine counts to dollars per request"
description: How to turn a traffic forecast into instance counts using honest per-instance throughput, utilisation targets and failover headroom; how to model growth and storage; how to compute cost per request and find the line item that dominates; and how to mix reserved, on-demand and spot capacity.
minutes: 35
difficulty: hard
tags: [system-design, senior-skills, capacity-planning, cost, estimation, cloud]
---
Product announces a launch in a new market in eight weeks, expected to add 40% to peak traffic. Your director asks two questions: will we stay up, and what will it cost? "We autoscale" answers neither. Autoscaling reacts in minutes to load that arrives in seconds, it cannot create capacity your account's quotas or your database do not have, and it says nothing about the bill. The senior answer is a number of instances with headroom, the date the capacity must exist, the resource that runs out first, the line item that dominates the bill, and the cost per request before and after.

That answer is arithmetic, and this lesson is the arithmetic. [Back-of-envelope estimation](/learn/system-design/building-blocks/back-of-envelope-estimation) gave you the reference numbers; here you turn them into a plan that finance and on-call can both hold you to. Prices below are illustrative list prices of the right order of magnitude; check current price sheets before committing real money.

## The capacity model

The core formula fits on one line:

$$\text{instances} = \frac{\text{peak demand}}{\text{per-instance throughput at SLO} \times \text{target utilisation}} \;+\; \text{failure headroom}$$

Each input has a trap:

1. **Peak demand, not average.** Daily peaks for consumer products run 1.5 to 3 times the daily average, and launches, season premieres and holidays stack on top.
2. **Throughput at the SLO, not maximum throughput.** The number that matters is the load at which p99 still meets the target, not the load at which the instance starts returning errors.
3. **Target utilisation** below that knee, because latency explodes as you approach it (next section).
4. **Failure headroom:** enough spare capacity to lose an instance, an availability zone, or a region, and still serve peak.

Take a running example: the API behind a streaming app's home screen. Users span time zones, so traffic swings from a trough of 25,000 requests per second to a peak of 50,000, averaging 37,500. A load test shows one 8-vCPU instance holds p99 under 100 ms up to 1,250 rps; beyond that p99 climbs steeply. The service runs in three availability zones.

The naive plan stacks every buffer. A 70% utilisation target gives 875 rps per instance, so 50,000 / 875 = 58 instances; to survive losing a zone, the other two zones must hold all 58, so each zone gets 29, for 87 instances. At peak that fleet runs at 50,000 / (87 × 1,250) = 46% of its knee capacity.

The deliberate plan asks which buffer covers which risk. The zone-loss headroom *is* a utilisation buffer, so let it do both jobs: size the fleet so that after losing a zone the survivors run at exactly the knee. That is 50,000 / 1,250 = 40 instances in two zones, 20 per zone, 60 in total. Normally, at peak, each runs at 67% of its knee; during a zone outage at peak, 100% of it, with p99 at the edge of the SLO for the duration. Sixty instances instead of 87 is 31% less fleet for a risk you have priced explicitly: a zone failure *during* the daily peak runs hot but within SLO.

### Little's law sizes the pools

At peak each instance serves 50,000 / 60 ≈ 833 rps. With a mean latency of 40 ms, Little's law ($L = \lambda W$) says about 833 × 0.04 ≈ 33 requests are in flight per instance at any moment. That sizes thread pools and connection pools, and it catches a classic surprise: 60 instances with a database pool of 20 connections each open 1,200 connections, far beyond what a Postgres primary handles well, which is why you need a pooler (see [connection management](/learn/databases/storage-and-scale/connection-management)). Capacity plans fail at the resource nobody counted.

## Why the target is 60 to 70%, not 95%

Queueing theory explains the knee. In the simplest model of a single server with random arrivals (M/M/1), the mean time a request waits in the queue, measured in service times, is $\rho / (1 - \rho)$, where $\rho$ is utilisation:

| Utilisation | Queueing delay (× service time) |
|---|---|
| 50% | 1 |
| 70% | 2.3 |
| 80% | 4 |
| 90% | 9 |
| 95% | 19 |

Real systems are worse than the model: garbage-collection pauses, bursty arrivals and uneven load balancing all add variance, which moves the knee to lower utilisation. And utilisation is usually measured as a one-minute average, which hides one-second bursts 20 to 50% higher. A latency-sensitive service planned at 90% average utilisation is a service that misses its p99 every busy minute. Batch systems, where latency does not matter, can run at 90% and should.

## Finding per-instance throughput honestly

The per-instance number drives every other number, so it deserves the most suspicion:

- **Use production-shaped load.** Replay real traffic or a recorded mix of endpoints, payload sizes and cache hit rates. A synthetic test hitting one cached endpoint overstates capacity several-fold.
- **Step the load and find the knee.** Increase in steps, hold each for minutes, and record the step where p99 breaches the SLO. That step, not the peak rps before errors, is the capacity.
- **Name the bottleneck.** CPU, memory, connections, a lock, a downstream dependency. The number is valid only while that bottleneck is the binding one; if the downstream database saturates first, adding instances adds nothing.
- **Re-measure continuously.** Every release can regress performance. Some companies measure in production by shifting extra live traffic onto one instance until its latency degrades, often called a squeeze test, and track the result per build.

## Modelling growth

Organic growth compounds. At 5% a month, traffic doubles in about 14 months; at 8% a month it doubles in about 9 and grows 2.5× in a year. Plot the forecast, not today's number.

The launch plan for the running example: two months of 5% organic growth takes peak from 50,000 to 55,125 rps, and the launch adds 40% on top: 77,175 rps. At 1,250 rps per instance with the zone-loss rule (two-thirds of the fleet must carry peak at the knee), that needs 77,175 / 833 = 93 instances, up from 60. Now the questions become concrete: can the database take 55% more connections and queries, is the account quota above 93 instances of this type in this region, and when must all of it be in place?

That last question is about **lead time**. On-demand cloud capacity arrives in minutes if the quota and the regional supply exist. Quota increases take days. Reserved commitments are planned quarterly. Hardware you ship to partners, as Netflix does with its Open Connect appliances in ISP networks, has lead times of months. Your planning horizon is the lead time plus the review interval plus a safety margin, and anything with a long lead time must be forecast further out.

Known events deserve special treatment. Autoscaling policies react over minutes, and new instances take minutes to boot and warm their caches, so a premiere at 8 p.m. is pre-scaled at 7 p.m. from a schedule, not discovered by a CPU alarm at 8:02.

## Storage grows differently

Request capacity follows traffic; storage follows the integral of traffic. A service that ingests 2 billion events a day at 100 bytes each writes 200 GB of raw data a day. Replicated three times that is 600 GB, and with index and compaction overhead around 30%, roughly 780 GB of disk a day: about 285 TB after a year, even if traffic never grows.

The lever is retention. Keeping 90 days hot needs about 70 TB of fast storage; everything older moves to object storage at a small fraction of the price per GB, or is aggregated and the raw data deleted. Also budget free space for the storage engine itself: log-structured stores need headroom to compact, up to half the disk under some compaction strategies, so a disk at 80% full can already be a disk that cannot compact.

## Cost per request

Unit economics make cost discussable: total monthly cost of a service divided by the requests it served. The running example at 37,500 rps average serves about 97 billion requests a month. With every request logged at about 1 KB, responses averaging 5 KB, and services talking to their cache and database across zone boundaries:

| Line item | Assumption | Monthly cost | Share |
|---|---|---|---|
| Compute | 45 instances on average (autoscaled), $0.40/hour, on-demand | $13,140 | 11% |
| Database | Primary and two replicas, $2.00/hour each, plus 6 TB of block storage | $4,980 | 4% |
| Cache | Six nodes at $0.50/hour | $2,190 | 2% |
| Load balancing | Fixed plus per-request charges | $2,000 | 2% |
| Internet egress | 5 KB × 97 billion = 486 TB at $0.05/GB | $24,300 | 21% |
| Cross-zone traffic | 10 KB per request crossing zones at $0.02/GB (both directions) | $19,440 | 17% |
| Log ingestion | 1 KB per request = 97 TB at $0.50/GB | $48,600 | 42% |
| **Total** | | **$114,650** | **$1.18 per million requests** |

The instances everyone argues about are 11% of the bill. The dominant costs are data moving: logs, egress and traffic between zones. None of them shows up in a load test, and all of them scale linearly with requests. Four changes, none of which touches the architecture:

- **Sample success logs at 1%** and keep every error: $48,600 becomes about $490.
- **Zone-aware routing** so services prefer a cache and replica in their own zone, halving cross-zone bytes: $19,440 becomes $9,720.
- **Compress responses** from 5 KB to 2 KB: egress becomes $9,720.
- **Reserve the baseline fleet** (next section): compute becomes $9,210.

The total falls to about $38,300, or $0.39 per million requests: two-thirds cheaper. The sentence to say in a review is "the dominant cost is X, so the design should minimise X even at the expense of Y". Here X is bytes moved, not CPU.

```viz
{"type": "network", "scenario": "cdn-cache", "title": "Egress is a cost lever, not just a latency one",
 "caption": "A miss crosses the ocean to origin and is billed as origin egress; a hit is served from the edge. For byte-heavy products the CDN hit ratio is a line item on the bill: each point of hit ratio is bytes the origin never sends."}
```

## Reserved, on-demand and spot

Cloud capacity comes in three pricing models:

- **On-demand:** pay by the second or hour, no commitment. The reference price.
- **Reserved capacity or savings plans:** commit to one or three years of usage for a discount, commonly in the range of 30 to 60% or more depending on term and payment.
- **Spot or preemptible:** spare capacity at large discounts, often 60 to 90%, which the provider can reclaim with short notice (two minutes on AWS).

The rule for reservations is a break-even: a reservation with discount *d* pays off for any instance that would otherwise run more than (1 − d) of the hours. At a 40% discount, reserve every instance that is busy more than 60% of the time and leave the rest on-demand.

Apply it to the running example's daily curve, 30 instances at the trough and 60 at the peak. Instances 1 to 30 run all day: reserve them. Instance 60 runs only at the very top of the evening peak: on-demand. For a smooth daily curve, instance 40 is busy about 61% of the day, right at break-even. Priced at $0.40 an hour on-demand and $0.24 reserved:

| Strategy | Monthly compute | Saving |
|---|---|---|
| All on-demand, autoscaled | $13,140 | — |
| Reserve the trough (30), on-demand above | $9,636 | 27% |
| Reserve to break-even (40), on-demand above | $9,210 | 30% |
| Reserve the peak (60) | $10,512 | 20% |

Reserving the peak looks prudent and is the worst of the three commitments, because 20 reserved instances sit idle most of the day. Two more senior points: reservations lock in an instance family and region, so a planned migration to a new instance type or region makes a three-year commitment a liability; and the idle reserved capacity in the trough is free compute. Netflix has written about running encoding work on its own idle reserved instances during the daily trough, which is spot pricing without the risk of reclamation.

Spot belongs where interruption is cheap: batch jobs, encoding, CI runners, model training with checkpoints, stateless workers behind a queue. It does not belong under a latency SLO unless the fleet can lose a slice of instances with two minutes' notice and not notice.

## Serverless versus instances

The same arithmetic settles "should this be a function or a service?". At roughly $0.20 per million invocations plus about $0.0000167 per GB-second, a 100 ms request at 512 MB costs about $1.03 per million. The running example's instances serve about 3 million requests per instance-hour at $0.40, about $0.13 per million, eight times cheaper at sustained load. The break-even is around 110 requests per second per instance you would otherwise run: a service that averages 20 rps with occasional bursts is cheaper as functions, because instances would idle; a service at 37,500 rps is far cheaper on instances. Add the non-price factors (cold starts on the latency path, connection limits to databases) and the answer is usually functions for spiky glue and instances for steady hot paths.

## Presenting capacity in an interview

Three sentences, in order: the demand, the fleet, the dominant cost. "Peak is 50,000 rps, one instance holds 1,250 at our p99, and we keep a zone's worth of headroom, so 60 instances, 93 after the launch. The database connection count is the first thing that breaks, so we add a pooler. The biggest cost is not compute but log ingestion and cross-zone traffic, so I would sample logs and route within zones." That is thirty seconds, and every number in it can be challenged and defended.

## Exercise

```exercise
id: instances-per-region
title: Size a multi-region fleet
prompt: |
  A service runs active-active in `regions` regions. Global peak traffic is
  `peak_rps`. One instance can serve `per_instance_rps` at its SLO, and you run
  instances at no more than `target_pct` percent of that.

  Each region must be able to carry its share of global peak even if any one
  other region fails: with `regions` greater than 1, a surviving region carries
  `peak_rps / (regions - 1)`; with a single region there is no failover and it
  carries all of `peak_rps`.

  The utilisation cap applies during the failure too, so `target_pct` of 100
  means "run at the knee while a region is down" and lower values keep extra
  margin. Return the number of instances each region needs, rounded up, and
  never fewer than 2 per region (so a single instance failure is survivable).
languages: [python, javascript]
entry: instances_per_region
starter:
  python: |
    def instances_per_region(peak_rps, per_instance_rps, target_pct, regions):
        # your code here
        return 0
  javascript: |
    function instances_per_region(peak_rps, per_instance_rps, target_pct, regions) {
      // your code here
      return 0;
    }
tests:
  - args: [60000, 1500, 60, 3]
    expected: 34
  - args: [54000, 1500, 60, 3]
    expected: 30
    label: exact division does not round up
  - args: [10000, 1000, 50, 1]
    expected: 20
    label: single region carries all of peak
  - args: [100, 1000, 70, 3]
    expected: 2
    label: floor of two per region
  - args: [90000, 1200, 75, 4]
    expected: 34
    hidden: true
  - args: [120000, 2000, 65, 2]
    expected: 93
    hidden: true
    label: two regions each carry everything
hints:
  - "Work out the load one region must carry after a failure first: peak / (regions - 1), or peak if there is one region."
  - "Usable capacity per instance is per_instance_rps * target_pct / 100. Divide, round up with ceil, then apply the minimum of 2."
```

## Failure modes

**Planning on the average.** The fleet handles the daily average and melts at 9 p.m. Detect: p99 violations that correlate with the daily peak. Mitigate: plan on the peak of the forecast, including known events.

**Stacked or missing headroom.** Either every buffer is added on top of every other (a fleet at 46% of its knee capacity at peak), or headroom for a zone or region loss was never counted. Mitigate: write down which buffer covers which failure.

**The uncounted resource.** The instance count was right, but connections, file descriptors, IP addresses in the subnet, or the account's instance quota ran out first. Mitigate: list every per-instance resource and multiply by the planned fleet.

**Optimistic per-instance numbers.** Load tested against a warm cache and one endpoint; production mix delivers half the throughput. Mitigate: production-shaped load, continuous re-measurement.

**Cost surprises.** Log ingestion, cross-zone traffic, NAT gateways, egress and idle reservations appear on the bill a month after the design review. Mitigate: cost per request as a tracked metric per service, with an owner and a budget alert.

**Autoscaling as a capacity plan.** Scaling policies take minutes; boot and warm-up take minutes more; in a regional incident everyone else is also asking for capacity. Mitigate: pre-scale for known events, keep failover headroom running rather than promised.

## Interviewer follow-ups

**Q: "Traffic doubles overnight because of a viral event. What breaks first?"**

Rarely the stateless tier, because it autoscales, if slowly. The first things to break are shared, stateful and fixed-size: database connections and CPU on the primary, cache memory and eviction rate, per-partition throughput on a hot key, and account quotas. I would shed non-critical traffic at the edge immediately, protect the core path, and scale the stateful tier, which takes longest, first.

**Q: "Your cost per request went up 30% this quarter with flat traffic. How do you find out why?"**

Break the bill down by line item and by service, per request, and compare quarter on quarter. Flat traffic with rising cost usually means bytes rather than CPU: a new field that doubled response size, a log line added to a hot path, a service moved to another zone, or a new dependency whose calls cross regions. I would make cost per request a dashboard metric per service so the next increase shows up the week it ships.

**Q: "Would you reserve capacity for a service you plan to rewrite next year?"**

Only a one-year term, only up to the trough, and only if the replacement will run on the same instance family and region or the commitment is a flexible plan that follows usage across families. A three-year reservation on something you plan to retire is a bet against your own roadmap.

**Q: "Why not run every instance at 90% to save money?"**

Because latency is a queueing curve: at 90% utilisation a request waits roughly nine service times in the queue on average and far more at p99, and any burst tips it into timeouts, retries and more load. I would run batch fleets at 90%. For latency-sensitive services the saving from 70% to 90% is about 22% of the fleet, and it buys a service that misses its SLO every busy minute.

**Q: "How much headroom do you keep, and where does the number come from?"**

From the failures I am designing for: enough to lose one zone at peak within SLO, and, if the service is active-active across regions, enough in each region to absorb a failed region's share, which with three regions means running at two-thirds. I avoid stacking a separate utilisation buffer on top of the failure headroom, and I say explicitly that during a failure at peak we run at the knee.

## Senior signals

- You plan on **peak demand and throughput at the SLO**, and you find the knee with production-shaped load rather than trusting a synthetic maximum.
- You explain the **60 to 70% target with queueing**, and you run batch at 90% without apology.
- You make buffers **cover named failures** instead of stacking them, and you can show the fleet size each choice implies.
- You check **the uncounted resources**: connections, quotas, IP addresses, per-partition limits, lead times.
- You compute **cost per request by line item** and expect bytes moved (logs, egress, cross-zone traffic) to rival compute.
- You reserve **to the break-even point**, not to the peak, and you treat idle reserved trough capacity as free compute.

## Check yourself

```quiz
- q: >-
    One instance meets the p99 SLO up to 1,250 rps. Peak is 50,000 rps across three availability zones, and the service must survive losing a zone at peak. What is the smallest fleet that serves peak within SLO after a zone loss?
  options: ["120 instances", "87 instances", "40 instances", "60 instances"]
  answer: 3
  explanation: >-
    After losing a zone, two zones must carry 50,000 rps at up to 1,250 rps each: 40 instances, so 20 per zone and 60 in total. 40 has no zone headroom; 87 stacks a separate 70% utilisation target on top of the zone headroom.
- q: >-
    In the simple M/M/1 model, what happens to queueing delay when utilisation rises from 80% to 90%?
  options: ["It stays roughly flat until utilisation nears 100%", "It falls, because a busier server batches more work", "It rises by about 12%, tracking the change in load", "It roughly doubles, from about 4 to 9 service times"]
  answer: 3
  explanation: >-
    Queueing delay grows as ρ/(1−ρ): 4 at 80%, 9 at 90%, 19 at 95%. That hockey stick is why latency-sensitive services target 60 to 70%. It is not linear in load, and it rises sharply well before 100%.
- q: >-
    A reservation gives a 40% discount. Which instances in an autoscaled fleet should you reserve?
  options: ["Only instances busy more than 60% of the hours", "All instances, up to the fleet's size at daily peak", "None; on-demand is always cheaper with autoscaling", "Only the instances busy less than 40% of the hours"]
  answer: 0
  explanation: >-
    A reserved instance costs 60% of on-demand whether used or not, so it pays off only when the instance would run more than 60% of the time. Reserving to the peak pays for idle capacity most of the day.
- q: >-
    A service's bill is dominated by log ingestion and cross-zone data transfer rather than compute. What is the most effective first step?
  options: ["Move to larger instances to cut per-request overhead", "Add cache nodes to reduce the load on the database", "Sample success logs and keep traffic within each zone", "Rewrite the hot paths of the service in a faster language"]
  answer: 2
  explanation: >-
    The dominant costs scale with bytes moved, not CPU. Sampling success logs and routing requests to same-zone replicas and caches attack the largest line items directly; faster code and bigger instances reduce a line that was a small share of the bill.
- q: >-
    Why is autoscaling not a sufficient plan for a premiere expected to triple traffic at 8 p.m.?
  options: ["Autoscaling only works for batch jobs, not for web traffic", "Autoscaling is too expensive at triple the normal traffic", "It lags by minutes and cannot scale quotas or the database", "Autoscaling policies cannot scale beyond two times the base"]
  answer: 2
  explanation: >-
    Scaling policies react over minutes, instances need minutes to boot and warm, and quotas or stateful tiers may not scale at all, so capacity must be in place before the spike. Known events are pre-scaled on a schedule. The other options are simply false.
```
