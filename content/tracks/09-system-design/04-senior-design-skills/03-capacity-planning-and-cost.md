---
slug: capacity-planning-and-cost
title: "Capacity planning and cost: from growth curves to machine counts to dollars per request"
description: How to turn daily users into peak requests per second, and a traffic forecast into instance counts using honest per-instance throughput, utilisation targets justified by simulated queues, and failover headroom; how to model growth and storage; how to compute cost per request and find the line item that dominates; and how to size reserved, on-demand and spot capacity, including the price of over-committing.
minutes: 35
difficulty: hard
tags: [system-design, senior-skills, capacity-planning, cost, estimation, cloud, queueing, reserved-instances]
---
Product announces a launch in a new market in eight weeks, expected to add 40% to peak traffic. Your director asks two questions: will we stay up, and what will it cost? "We autoscale" answers neither. Autoscaling reacts in minutes to load that arrives in seconds, it cannot create capacity your quotas or your database do not have, and it says nothing about the bill. The senior answer is a number of instances with headroom, the date the capacity must exist, the resource that runs out first, the line item that dominates the bill, and the cost per request before and after.

That answer is arithmetic, and this lesson is the arithmetic. [Back-of-envelope estimation](/learn/system-design/building-blocks/back-of-envelope-estimation) gave you the reference numbers; here you turn them into a plan that finance and on-call can both hold you to. Every price below is a round number of the right order of magnitude at the time of writing (2026). Real prices depend on provider, region, instance family, volume tier and commitment, so treat them as assumptions to replace, not quotes.

## The capacity model

$$\text{instances} = \frac{\text{peak demand}}{\text{per-instance throughput at SLO} \times \text{target utilisation}} \;+\; \text{failure headroom}$$

Each input has a trap:

1. **Peak demand, not average.** Launches, premieres and holidays stack on top of the daily peak.
2. **Throughput at the SLO, not maximum throughput.** The load at which p99 still meets the target, not the load at which errors start.
3. **Target utilisation** below that knee, because latency explodes approaching it (see the queueing section).
4. **Failure headroom:** enough spare to lose an instance, a zone or a region and still serve peak.

### From users to requests per second

The running example is the API behind a streaming app's home screen. It has 30 million daily active users; each opens the app about four times a day, and each session makes about 27 API calls (rows, artwork, pagination, progress). That is 30 million × 108 = 3.24 billion requests a day, or 3.24 × 10⁹ / 86,400 = 37,500 requests per second on average. Because users span time zones, traffic swings only from a trough of 25,000 to a peak of 50,000, a peak-to-average ratio of 1.33; a product used mostly in one country sees 2 to 3, because everyone's evening arrives at once. The ratio is a property of the audience, so measure it rather than borrowing it.

### Sizing the fleet: 60 instances, not 87

A load test shows one 8-vCPU instance holds p99 under 100 ms up to 1,250 rps; beyond that p99 climbs steeply. The service runs in three availability zones.

The naive plan stacks every buffer. A 70% utilisation target gives 875 rps per instance, so 50,000 / 875 = 58 instances; to survive losing a zone, the other two zones must hold all 58, so 29 per zone, 87 in total. At peak that fleet runs at 50,000 / (87 × 1,250) = 46% of its knee.

The deliberate plan asks which buffer covers which risk. Zone-loss headroom *is* a utilisation buffer, so let it do both jobs: size the fleet so that after losing a zone the survivors run at exactly the knee. That is 50,000 / 1,250 = 40 instances in two zones, 20 per zone, 60 in total. Normally, at peak, each runs at 67% of its knee; during a zone outage at peak, at 100% of it, with p99 at the edge of the SLO. Sixty instead of 87 is 31% less fleet for a risk you have priced: a zone failure *during* the daily peak runs hot but within SLO.

Deploys are failures you schedule, so count them. A rolling deploy that replaces 10% of instances at a time holds some out of service while they drain and warm. If a zone fails mid-deploy at peak, the 40 survivors lose 4 to the deploy batch and the remaining 36 each carry 50,000 / 36 = 1,389 rps, 11% past the knee. Either deploy off-peak or add the batch size to the fleet. The same arithmetic with regions instead of zones gives the N/(N−1) headroom rule in [designing for failure](/learn/system-design/senior-design-skills/designing-for-failure).

### Little's law sizes the pools

At peak each instance serves 50,000 / 60 ≈ 833 rps. With a mean latency of 40 ms, Little's law ($L = \lambda W$, derived in [latency, bandwidth and the math](/learn/networking/networking-in-practice/latency-bandwidth-and-math)) puts about 833 × 0.04 ≈ 33 requests in flight per instance. That sizes thread and connection pools, and it catches a classic surprise: 60 instances with a database pool of 20 each open 1,200 connections, far beyond what one Postgres primary handles well, which is why you need a pooler ([connection management](/learn/databases/storage-and-scale/connection-management)). Capacity plans fail at the resource nobody counted.

## Under the hood: why latency bends before 100%

The knee in a load test is a queue forming. In the simplest model, one server with random (Poisson) arrivals and exponential service times (M/M/1), the mean wait in the queue, in units of mean service time, is $\rho/(1-\rho)$, and the response time is exponential, so its p99 is $\ln(100)/(1-\rho) \approx 4.6/(1-\rho)$ service times. A real instance has many workers, so the more useful model is M/M/c with c = 16. Formulas for M/M/c are messy, so the numbers below come from simulating a first-come-first-served queue: 400,000 requests per row, seed 7, times in units of the mean service time.

```python
import heapq, random

def simulate(rho, c, burst=0.0, period=2000.0, n=400_000, seed=7):
    """FCFS queue, c servers, Poisson arrivals, exponential service with mean 1.
    With burst > 0 the arrival rate alternates between rho*(1+burst) and
    rho*(1-burst) every `period` service times; the average stays rho."""
    rng = random.Random(seed)
    free = [0.0] * c                        # when each server is next free
    t, waits, resp = 0.0, [], []
    for _ in range(n):
        high = int(t // period) % 2 == 0
        t += rng.expovariate(rho * c * ((1 + burst) if high else (1 - burst)))
        start = max(t, heapq.heappop(free))  # earliest-free server takes the request
        s = rng.expovariate(1.0)
        heapq.heappush(free, start + s)
        waits.append(start - t)
        resp.append(start - t + s)
    resp.sort()
    return sum(waits) / n, resp[int(n * 0.99)]

for rho in (0.5, 0.7, 0.8, 0.9, 0.95):
    print(rho, simulate(rho, 1), simulate(rho, 16))
```

| Utilisation | M/M/1 mean wait (formula) | M/M/1 p99 response | M/M/16 mean wait | M/M/16 p99 response |
|---|---|---|---|---|
| 50% | 0.99 (1.00) | 9.2 | 0.001 | 4.6 |
| 70% | 2.32 (2.33) | 15.5 | 0.03 | 4.6 |
| 80% | 3.93 (4.00) | 23.0 | 0.09 | 4.7 |
| 90% | 8.88 (9.00) | 49.2 | 0.36 | 5.4 |
| 95% | 18.2 (19.0) | 99.7 | 0.93 | 8.2 |

Two lessons. With one worker, waiting doubles from 80% to 90% utilisation, which is why single-threaded hot spots (one partition, one lock, one event loop) must run cool. With sixteen workers the pool absorbs randomness and the steady-state knee moves past 90%, which is why a load test on a multi-core instance can look flat almost to saturation.

So why not plan for 90%? Because real load is not steady. Utilisation is usually reported as a one-minute average, which hides bursts. The same M/M/16 queue, with the arrival rate alternating ±25% around the average every 2,000 service times:

| Average utilisation | p99, steady arrivals | p99, ±25% bursts | Utilisation during bursts |
|---|---|---|---|
| 60% | 4.6 | 4.6 | 75% |
| 70% | 4.6 | 4.9 | 88% |
| 75% | 4.7 | 6.4 | 94% |
| 80% | 4.7 | 21.7 | 100% |

At 80% average the bursts reach saturation and p99 jumps more than fourfold, while the dashboard shows a healthy 80%. Garbage-collection pauses, uneven load balancing and heavy-tailed service times push the knee lower still. That is the case for 60–70% on latency-sensitive services, and for running batch fleets, where only throughput matters, at 90% without apology.

## Finding per-instance throughput honestly

The per-instance number drives every other number, so it deserves the most suspicion:

- **Use production-shaped load.** Replay real traffic or a recorded mix of endpoints, payload sizes and cache hit rates. A synthetic test against one cached endpoint overstates capacity several-fold.
- **Step the load and find the knee.** Increase in steps, hold each for minutes, and record the step where p99 breaches the SLO. That step, not the peak before errors, is the capacity.
- **Name the bottleneck.** CPU, memory, connections, a lock, a downstream dependency. The number is valid only while that bottleneck binds; if the database saturates first, more instances add nothing.
- **Re-measure every release.** Some companies measure in production by shifting extra live traffic onto one instance until its latency degrades, often called a squeeze test, and track the result per build.

## Modelling growth

Organic growth compounds. At 5% a month traffic doubles in ln 2 / ln 1.05 ≈ 14 months; at 8% a month it doubles in 9 and grows 1.08¹² ≈ 2.5× in a year. Plot the forecast, not today's number.

The launch plan: two months of 5% organic growth takes peak from 50,000 to 55,125 rps, and the launch adds 40%: 77,175 rps. With the zone-loss rule (two zones must carry peak at the knee), that is 77,175 / 1,250 = 62 instances across two zones, 31 per zone, **93 in total**, up from 60. Now the questions are concrete: can the database take 55% more connections and queries, is the account quota above 93 instances of this type in this region, and when must it all be in place?

That last question is **lead time**. On-demand capacity arrives in minutes if quota and regional supply exist; quota increases take days; commitments are planned quarterly; hardware shipped to partners, as Netflix does with its Open Connect appliances in ISP networks, has lead times of months. The planning horizon is lead time plus review interval plus margin. Known events are pre-scaled: autoscaling reacts over minutes and new instances take minutes to boot and warm caches, so an 8 p.m. premiere is scaled at 7 p.m. from a schedule, not discovered by a CPU alarm at 8:02.

## Storage grows differently

Request capacity follows traffic; storage follows its integral. Say the same product also ingests 2 billion playback events a day at 100 bytes each: 200 GB of raw data a day; replicated three times, 600 GB; with about 30% index and compaction overhead, roughly 780 GB of disk a day. That is 285 TB after a year with flat traffic, and 377 TB if ingest grows 5% a month, because each month adds more than the last.

The lever is retention. Keeping 90 days hot needs about 70 TB of fast storage; older data moves to object storage, typically an order of magnitude cheaper per GB-month, or is aggregated and the raw data deleted. Budget free space for the storage engine too: log-structured stores need room to compact, up to half the disk under some strategies, so a disk at 80% full may already be unable to compact.

## Cost per request

Unit economics make cost discussable: a service's monthly cost divided by the requests it served. The running example serves 37,500 rps × 2.59 million seconds ≈ 97 billion requests a month. Assume every request logs about 1 KB, responses average 5 KB, and services talk to caches and databases across zone boundaries:

| Line item | Assumption (order-of-magnitude price, 2026) | Monthly cost | Share |
|---|---|---|---|
| Compute | 45 instances on average (autoscaled), ~$0.40/hour on-demand | $13,140 | 11% |
| Database | Primary and two replicas at ~$2/hour, plus 6 TB of block storage | $4,980 | 4% |
| Cache | Six nodes at ~$0.50/hour | $2,190 | 2% |
| Load balancing | Fixed plus per-request charges | $2,000 | 2% |
| Internet egress | 5 KB × 97 billion = 486 TB at a few cents per GB | $24,300 | 21% |
| Cross-zone traffic | 10 KB per request crossing zones, ~$0.01/GB each direction | $19,440 | 17% |
| Log ingestion | 1 KB per request = 97 TB at tens of cents per GB | $48,600 | 42% |
| **Total** | | **$114,650** | **$1.18 per million requests** |

The instances everyone argues about are 11% of the bill. The dominant costs are data moving: logs, egress and traffic between zones. None shows up in a load test, and all scale linearly with requests. Four changes, none touching the architecture:

- **Sample success logs at 1%** and keep every error: $48,600 becomes about $490.
- **Zone-aware routing**, so services prefer a cache and replica in their own zone, halving cross-zone bytes: $19,440 becomes $9,720.
- **Compress responses** from 5 KB to 2 KB: egress becomes $9,720.
- **Reserve the baseline fleet** (next section): compute becomes $9,210.

The total falls to about $38,300, or $0.39 per million requests: two-thirds cheaper. The sentence for a review is "the dominant cost is X, so the design should minimise X even at the expense of Y". Here X is bytes moved, not CPU. The ratio survives price changes, because it comes from bytes per request, which you control.

Know where bytes are metered, because that is where the surprises come from. Traffic between zones is typically billed on both sides of the hop, so a request and its response to a cache in another zone are metered four times: out and in, each way. NAT gateways charge per GB processed on top of their hourly price, so a service pulling container images or calling public APIs through one pays twice for the same bytes. Internet egress is tiered by monthly volume and falls further behind a CDN or private peering ([CDNs and edge](/learn/networking/application-protocols/cdns-and-edge)). Logs are billed at ingestion, again for retention and again for queries, which is why sampling at the source beats filtering in the backend ([metrics and logging platform](/learn/system-design/case-studies/metrics-and-logging-platform)).

```viz
{"type": "network", "scenario": "cdn-cache", "title": "Egress is a cost lever, not only a latency one",
 "caption": "A miss crosses the ocean to origin and is billed as origin egress; a hit is served from the edge. For byte-heavy products the CDN hit ratio is a line item on the bill: each point of hit ratio is bytes the origin never sends."}
```

## Reserved, on-demand and spot

| Pricing model | Discount on on-demand (order of magnitude) | Commitment | Flexibility | Interruption | Fits |
|---|---|---|---|---|---|
| On-demand | None: the reference price | None | Full | None | Peaks, experiments, anything under a year |
| Reserved instances | 30–60%+, deeper for 3 years and upfront payment | 1 or 3 years | Locked to family and region | None | The steady trough of a stable service |
| Savings plans / committed spend | Similar, slightly less for the most flexible kinds | $ per hour for 1 or 3 years | Follows usage across families and often regions | None | A baseline you expect to migrate between instance types |
| Spot / preemptible | 60–90% | None | Full | Reclaimed at short notice (two minutes on AWS) | Batch, encoding, CI, checkpointed training, queue workers |

### The break-even rule

A reservation with discount *d* costs (1 − d) of on-demand for every hour, used or not, so it pays off for any instance that would otherwise run more than (1 − d) of the hours. At 40% off, reserve every instance busy more than 60% of the time.

Apply it to the running example's smooth daily curve, 30 instances at the trough and 60 at the peak. Instance 40 is busy about 61% of the day, right at break-even. At ~$0.40 an hour on-demand and ~$0.24 reserved:

| Reserved instances | Monthly compute | Against all on-demand |
|---|---|---|
| 0 (all on-demand, autoscaled) | $13,140 | — |
| 30 (the trough) | $9,636 | −27% |
| 35 | $9,309 | −29% |
| 40 (break-even) | $9,210 | −30% |
| 45 | $9,278 | −29% |
| 60 (the peak) | $10,512 | −20% |

The optimum is flat: five instances either side costs about 1%. Reserving the peak looks prudent and is the worst commitment of the three named ones, because 20 reserved instances sit idle most of the day. Since the curve is flat near the optimum and the downside of over-committing is steep, round down.

### The price of over-committing

Commitments are priced for the whole term, so the risk is using them for less. Take 40 instances on a 3-year term at 60% off (~$0.16/hour) against renewing 1-year terms at 40% off (~$0.24/hour). The 3-year term costs $168,192 over its life whatever happens. If the service migrates to a new instance family after 12 months, you paid the equivalent of $0.48 an hour for what you used, more than on-demand, and $112,128 of commitment is stranded. The break-even against 1-year terms is 36 × 0.16 / 0.24 = 24 months of use. The rule: commit for three years only to capacity you are confident will exist in the same shape for more than two, and prefer flexible commitments for anything on a migration roadmap.

The idle reserved capacity in the trough is free compute. Netflix has written about running encoding work on its own idle reserved instances during the daily trough, spot pricing without the reclamation risk. Spot belongs where interruption is cheap, and checkpointing is what makes it cheap. Assume, as an order of magnitude that varies by instance type and region, that 5% of spot instances are reclaimed in any hour. An encoding job that checkpoints every 10 minutes loses about 5 minutes per reclaim, so 0.05 × 5/60 ≈ 0.4% of its compute is wasted, against a discount of 60–90%. A 12-hour job with no checkpoints is interrupted with probability 1 − 0.95¹² ≈ 46% and restarts from zero. Spot does not belong under a latency SLO unless the fleet can lose a slice of instances with two minutes' notice and not notice.

## Serverless versus instances

The same arithmetic settles "function or service?". At list prices of the order of $0.20 per million invocations plus about $0.0000167 per GB-second, a 100 ms request at 512 MB costs about $1.03 per million. The running example's instances serve about 3 million requests per instance-hour at ~$0.40, about $0.13 per million, eight times cheaper at sustained load. The break-even is around 110 requests per second per instance you would otherwise run: a service averaging 20 rps with occasional bursts is cheaper as functions, because instances would idle; one at 37,500 rps is far cheaper on instances. Add cold starts on the latency path and connection limits to databases, and the answer is usually functions for spiky glue and instances for steady hot paths.

## The plan on one page

Put the pieces together and the launch plan fits one table, each row recomputable from the rows above it:

| Quantity | Today | Launch day | Derivation |
|---|---|---|---|
| Daily active users | 30 million | 46 million | × 1.05² organic × 1.4 launch = × 1.54 |
| Average / peak rps | 37,500 / 50,000 | 57,900 / 77,175 | Users × 108 calls ÷ 86,400; peak = 1.33 × average |
| Fleet (zone-loss rule) | 60 | 93 | Peak ÷ 1,250 across two zones, × 3/2 |
| Database connections (pool of 20) | 1,200 | 1,860 | Fleet × pool: breaks first |
| Disk written per day | 780 GB | 1.2 TB | Events × bytes × 3 replicas × 1.3 |
| Internet egress per month | 486 TB | 750 TB | Requests × 5 KB |
| Monthly cost, as designed | $114,650 | about $173,000 | Byte-driven lines scale with traffic; database and cache held flat |
| Monthly cost, after the four fixes | $38,300 | about $55,000 | $0.39 → $0.37 per million as fixed costs spread |

Cost per request stays nearly flat because almost every line scales with requests. Only the database and cache are held fixed, and the connection row says the database will not stay fixed for long. Track cost per request next to latency and error rate on the service's dashboard ([observability](/learn/system-design/building-blocks/observability)), so a regression in either shows the week it ships.

## Presenting capacity in an interview

Three sentences, in order: the demand, the fleet, the dominant cost. "Peak is 50,000 rps from 30 million daily users, one instance holds 1,250 at our p99, and we keep a zone's worth of headroom, so 60 instances, 93 after the launch. The database connection count breaks first, so we add a pooler. The biggest cost is not compute but log ingestion and cross-zone traffic, so I would sample logs and route within zones." Thirty seconds, and every number can be challenged and defended.

## Exercises

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

```exercise
id: reservation-planner
title: How many instances to reserve
prompt: |
  `hourly` lists how many instances a service needs in each hour of a
  typical day. An on-demand instance costs `on_demand_cents` per hour it
  runs; a reserved instance costs `reserved_cents` per hour for every hour
  of the day, busy or idle.

  If you reserve `R` instances, then in each hour the first `R` instances
  of demand run on reserved capacity and any demand above `R` runs
  on-demand. The monthly cost is 30 times the daily cost:
  `30 * (len(hourly) * R * reserved_cents + sum over hours of max(n - R, 0) * on_demand_cents)`.

  Try every `R` from 0 to the largest hourly count. Return
  `{"reserved": R, "monthly_cents": cost}` for the cheapest plan; if several
  `R` tie, return the smallest.
languages: [python, javascript]
entry: plan_reservations
starter:
  python: |
    def plan_reservations(hourly, on_demand_cents, reserved_cents):
        # your code here
        return {"reserved": 0, "monthly_cents": 0}
  javascript: |
    function plan_reservations(hourly, on_demand_cents, reserved_cents) {
      // your code here
      return { reserved: 0, monthly_cents: 0 };
    }
tests:
  - args: [[52, 49, 45, 41, 38, 34, 32, 31, 30, 31, 32, 34, 38, 41, 45, 49, 52, 56, 58, 59, 60, 59, 58, 56], 40, 24]
    expected: {"reserved": 41, "monthly_cents": 906480}
    label: an hourly version of the lesson's curve, where instance 41 is busy 15 of 24 hours
  - args: [[10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 40, 24]
    expected: {"reserved": 10, "monthly_cents": 172800}
    label: flat demand reserves everything
  - args: [[52, 49, 45, 41, 38, 34, 32, 31, 30, 31, 32, 34, 38, 41, 45, 49, 52, 56, 58, 59, 60, 59, 58, 56], 40, 40]
    expected: {"reserved": 0, "monthly_cents": 1296000}
    label: no discount, no reason to commit
  - args: [[10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 40, 50]
    expected: {"reserved": 0, "monthly_cents": 288000}
    label: a reservation dearer than on-demand
  - args: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 40, 24]
    expected: {"reserved": 0, "monthly_cents": 0}
    label: no demand
  - args: [[10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 100], 40, 24]
    expected: {"reserved": 10, "monthly_cents": 280800}
    hidden: true
    label: a one-hour spike stays on-demand
  - args: [[52, 49, 45, 41, 38, 34, 32, 31, 30, 31, 32, 34, 38, 41, 45, 49, 52, 56, 58, 59, 60, 59, 58, 56], 40, 8]
    expected: {"reserved": 58, "monthly_cents": 338880}
    hidden: true
    label: an 80% discount reserves almost to the peak
  - args: [[5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 40, 20]
    expected: {"reserved": 5, "monthly_cents": 144000}
    hidden: true
    label: instances busy exactly at break-even tie, so take the smaller R
hints:
  - "Write cost(R) directly from the formula and loop R from 0 to max(hourly)."
  - "Compare with strictly less than, so the first (smallest) R keeps a tie."
  - "Check your answer with the break-even rule: instance R should be busy in more than (reserved / on-demand) of the hours, and instance R + 1 should not."
```

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Planning on the average | Fleet fine all day, p99 violations every evening | p99 breaches correlate with the daily peak; fleet sized to mean rps | Plan on the forecast peak, including known events |
| Stacked or missing headroom | A fleet at 46% of its knee at peak, or an outage when one zone fails | No record of which buffer covers which failure | Write the buffer-to-failure mapping; size so survivors run at the knee |
| The uncounted resource | Instance count right, yet connections, file descriptors, subnet IP addresses or instance quota run out first | Per-instance resources never multiplied by fleet size | List every per-instance resource × planned fleet; check quotas weeks ahead |
| Optimistic per-instance numbers | Production delivers half the load-tested throughput | Test hit a warm cache and one endpoint | Production-shaped load; squeeze tests per release |
| Hidden bursts | Dashboards show 80% CPU, p99 misses SLO for seconds at a time | One-minute averages hide bursts that reach saturation | Plan against short-window peaks; keep 60–70% average on latency-sensitive services |
| Cost surprises | Log ingestion, cross-zone traffic, NAT gateways or idle reservations appear on the bill a month after launch | Cost never tracked per request or per line item | Cost per request as a per-service metric with an owner and a budget alert |

## Interviewer follow-ups

**"Traffic doubles overnight because of a viral event. What breaks first?"** Model answer: rarely the stateless tier, which autoscales, if slowly. First to break are shared, stateful and fixed-size things: database connections and CPU on the primary, cache memory and eviction rate, per-partition throughput on a hot key, and account quotas. Shed non-critical traffic at the edge, protect the core path, and scale the stateful tier first because it takes longest. Common wrong answer: "we autoscale", which covers the one tier least likely to fail.

**"Your cost per request rose 30% this quarter with flat traffic. How do you find out why?"** Model answer: break the bill down by line item and by service, per request, quarter on quarter. Flat traffic with rising cost usually means bytes, not CPU: a field that doubled response size, a log line on a hot path, a service moved to another zone, a dependency whose calls cross regions. Then make cost per request a dashboard metric so the next rise shows the week it ships. Common wrong answer: "profile the code for CPU hotspots", which targets a line item that is 11% of the bill.

**"Would you reserve capacity for a service you plan to rewrite next year?"** Model answer: only a 1-year term, only up to the trough, and only if the replacement runs on the same family and region or the commitment follows usage across families. A 3-year term breaks even against 1-year terms only after about 24 months of use; used for 12, it costs more than on-demand. Common wrong answer: "yes, three years, because the discount is deepest".

**"Why not run every instance at 90% to save money?"** Model answer: latency is a queueing curve. A 16-worker instance looks fine at 90% under steady load, but real load bursts: in simulation, ±25% bursts around an 80% average quadrupled p99 because the peaks hit saturation. I run batch at 90%; for latency-sensitive services the saving from 70% to 90% is about 22% of the fleet and it buys SLO misses every busy minute. Common wrong answer: "the load test was flat up to 90%", which measured steady arrivals.

**"How much headroom do you keep, and where does the number come from?"** Model answer: from the failures I design for: enough to lose one zone at peak within SLO, and in an active-active setup enough in each region to absorb a failed region's share, which with three regions means running at two-thirds. I do not stack a separate utilisation buffer on top of the failure headroom, and I say explicitly that during a failure at peak we run at the knee. Common wrong answer: "30%, as a rule of thumb", a number with no failure attached.

## What mid-level engineers get wrong

- **Sizing to the average.** A fleet sized to 37,500 rps misses its SLO every evening at 50,000.
- **Trusting a synthetic load test.** One cached endpoint overstates capacity several-fold, and every derived number inherits the error.
- **Stacking buffers.** A utilisation target plus zone headroom plus a safety margin gives 87 instances where 60 meet the same risk.
- **Treating compute as the bill.** Logs, egress and cross-zone bytes were 80% of the example; tuning CPU cannot reach them.
- **Reserving to the peak or for three years by default.** Idle reserved hours and stranded commitments cost more than on-demand.
- **Forgetting lead time.** Quotas, commitments and hardware take days to months; a plan that starts at launch week is too late.

## Senior signals

- You derive **peak rps from users and behaviour**, and plan on **peak demand and throughput at the SLO**, found with production-shaped load.
- You explain the **60–70% target with queueing**, including why a many-worker instance looks flat until bursts push it to saturation, and you run batch at 90%.
- You make buffers **cover named failures** instead of stacking them, and you can show the fleet each choice implies.
- You check **the uncounted resources**: connections, quotas, IP addresses, per-partition limits, lead times.
- You compute **cost per request by line item** and expect bytes moved to rival compute.
- You reserve **to the break-even point**, round down because the optimum is flat, and price the **risk of over-committing** before choosing a term.

## Check yourself

```quiz
- q: >-
    One instance meets the p99 SLO up to 1,250 rps. Peak is 50,000 rps across three availability zones, and the service must survive losing a zone at peak. What is the smallest fleet that serves peak within SLO after a zone loss?
  options: ["120 instances", "87 instances", "40 instances", "60 instances"]
  answer: 3
  explanation: >-
    After losing a zone, two zones must carry 50,000 rps at up to 1,250 rps each: 40 instances, so 20 per zone and 60 in total. 40 has no zone headroom; 87 stacks a separate 70% utilisation target on top of the zone headroom.
- q: >-
    In the M/M/1 model, what happens to mean queueing delay when utilisation rises from 80% to 90%?
  options: ["It roughly doubles, from 4 to 9 service times", "It rises by about 12%, tracking the change in load", "It stays roughly flat until utilisation nears 100%", "It falls, because a busier server batches its work"]
  answer: 0
  explanation: >-
    Queueing delay grows as ρ/(1 − ρ): 4 at 80%, 9 at 90%, 19 at 95%, which the simulation reproduced. It is not linear in load. A single worker has no pool to absorb randomness, so single-threaded hot spots must run far below saturation.
- q: >-
    A 16-worker service runs at 80% average utilisation, and its arrival rate swings 25% above and below that average. In the lesson's simulation, what happened to p99 compared with steady arrivals?
  options: ["It rose over fourfold as bursts hit saturation", "It stayed flat, since 16 workers absorb the bursts", "It rose about 25%, in line with the load swing", "It fell, since the quiet periods drain the queue"]
  answer: 0
  explanation: >-
    During bursts utilisation reaches 100%, the queue grows without bound for the length of the burst, and p99 went from 4.7 to 21.7 service times. At a 70% average the bursts peaked at 88% and p99 barely moved. Quiet periods drain the queue but cannot undo the waits already suffered.
- q: >-
    A reservation gives a 40% discount. Which instances in an autoscaled fleet should you reserve?
  options: ["Only instances busy more than 60% of the hours", "All instances, up to the fleet's size at daily peak", "None, since on-demand is cheaper with autoscaling", "Only the instances busy less than 40% of the hours"]
  answer: 0
  explanation: >-
    A reserved instance costs 60% of on-demand for every hour, used or not, so it pays off only when the instance would run more than 60% of the time. Reserving to the peak pays for idle capacity most of the day: in the lesson it cost $10,512 against $9,210 at break-even.
- q: >-
    A 3-year commitment is 60% off; a 1-year commitment is 40% off. You expect to migrate the service to a new instance family after 18 months. Which plan costs least for that capacity?
  options: ["One 1-year term, then on-demand until the move", "One 3-year term, since its discount is deepest", "Two back-to-back 1-year terms covering the move", "On-demand for all eighteen months of use"]
  answer: 0
  explanation: >-
    Commitments are paid for their whole term. In on-demand-months, one 1-year term costs 12 × 0.6 = 7.2, plus 6 months on-demand, 13.2 in all. The 3-year term costs 36 × 0.4 = 14.4 whatever happens, and two 1-year terms cost 24 × 0.6 = 14.4, because the second runs six months past the move. On-demand throughout costs 18. The deepest discount loses because a third of it is never used.
- q: >-
    A service's bill is dominated by log ingestion and cross-zone data transfer rather than compute. What is the most effective first step?
  options: ["Move to larger instances to cut per-request overhead", "Add cache nodes to reduce the load on the database", "Sample success logs and keep traffic within each zone", "Rewrite the hot paths of the service in a faster language"]
  answer: 2
  explanation: >-
    The dominant costs scale with bytes moved, not CPU. Sampling success logs and routing to same-zone replicas and caches attack the largest line items directly; faster code and bigger instances reduce a line that was a small share of the bill.
```
