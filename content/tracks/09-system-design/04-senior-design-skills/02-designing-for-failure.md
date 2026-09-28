---
slug: designing-for-failure
title: "Designing for failure: taxonomy, blast radius, graceful degradation and multi-region"
description: Failure as a design input. A taxonomy of what breaks, availability arithmetic for serial, parallel, quorum and shared dependencies checked by simulation, an FMEA of a playback path, blast-radius techniques from bulkheads to shuffle sharding, DR tiers with RPO and RTO, active-active versus active-passive traced down to lost writes and conflicts, and a regional evacuation second by second.
minutes: 35
difficulty: hard
tags: [system-design, senior-skills, reliability, availability, fmea, disaster-recovery, multi-region, blast-radius]
---
A configuration change goes out to every region at once. It is valid YAML, it passed review, and it sets a client timeout to zero. Within ninety seconds every region is failing. The architecture had three regions, redundant instances, replicated databases and a 99.99% availability target, and none of it helped, because the failure was not a machine dying. It was a change that every copy shared. Large outages mostly look like this: a deploy, a config push, an overload or a common dependency, hitting all the redundancy at once.

Designing for failure means treating failure as an input to the design, alongside requirements and load. You enumerate how each part fails, compute what the combination delivers, decide how far each failure may spread and what users see meanwhile, and decide how you recover when a whole region is gone. [Resilience patterns](/learn/system-design/building-blocks/resilience-patterns) covered the mechanisms; this lesson is the judgement and the arithmetic that decide where they go.

## A failure taxonomy

| Class | Example | Why it is dangerous | Primary defence |
|---|---|---|---|
| Crash-stop | An instance, disk or availability zone dies | Least dangerous: clean and detectable | Redundancy and health checks |
| Omission | Dropped packets, lost messages | Looks like slowness; retries duplicate work | Timeouts, idempotent retries |
| Gray failure | A node passes health checks but is slow or fails 5% of requests | Health checks and users disagree; the load balancer keeps sending it traffic | Client-side latency and error measurement, outlier ejection |
| Overload | Traffic or retries exceed capacity | Can sustain itself after the trigger is gone | Load shedding, retry budgets, backoff |
| Correlated | Region outage; a shared DNS, auth or config service; a certificate expiring everywhere | Every copy fails together | Isolation: cells, staged rollouts, no shared critical dependencies |
| Poison input | A malformed message crashes every consumer that touches it | Replicas crash identically, one after another | Validation, dead-letter queues, quarantine |
| Change | A bad deploy, config push or manual command | The most common trigger of major incidents | Canaries, staged rollouts, fast rollback |
| Logical corruption | A bug writes wrong data | Replication copies the damage to every replica | Point-in-time backups, delayed replicas, immutable logs |

Redundancy protects only against *independent* failures. Most of the dangerous rows are correlated, and the senior habit is to ask of every redundant pair: "what do these two copies share?"

## Availability arithmetic

Let $a$ be a component's availability and $q = 1 - a$ its unavailability.

- **Serial** (every component must work): $A = \prod a_i$. Five dependencies at 99.9%: 0.999⁵ = 0.99501, so 0.499% unavailable, 3.6 hours a month instead of 43 minutes.
- **Parallel** (any one suffices): $Q = \prod q_i$. Two at 99.9%: $10^{-6}$, about 2.6 seconds a month.
- **k-of-n** (a quorum needs k up): with identical members, $Q = \sum_{j > n-k} \binom{n}{j} q^j a^{n-j}$. A 2-of-3 quorum fails when two or three members are down: $3q^2a + q^3 = 3 \times 10^{-6} \times 0.999 + 10^{-9} \approx 3.0 \times 10^{-6}$, about 7.8 seconds a month. A quorum is three times worse than a plain pair because any two of three failing is enough.
- **Redundancy behind a shared dependency**: a parallel pair (each 99.9%) in series with one 99.95% database gives $0.9995 \times (1 - 10^{-6}) \approx 99.95\%$. The pair's six nines vanish into the database's three and a half.
- **Common-cause failure**: suppose each region is 99.9% available, but a tenth of its downtime comes from a global config push that hits both regions together. Model the common cause as its own serial component: $q_c = 10^{-4}$, and each region's independent part is $q_i = 9 \times 10^{-4}$. The pair's unavailability is $q_c + q_i^2 = 10^{-4} + 8.1 \times 10^{-7} \approx 1.0 \times 10^{-4}$: 99.99%, not 99.9999%. The common-mode term is more than a hundred times the independent one, which is why removing a shared dependency is worth more than adding a copy.

Formulas assume steady state and hide how outages cluster, so check them with a simulation. The model below gives each component exponential times between failures and exponential repair times with a one-hour mean, sweeps 20,000 simulated years, and records total downtime and the number of distinct outages. Seed 7; the common cause has a 30-minute mean repair.

```python
import random
YEARS = 20_000
H = YEARS * 8760.0                                   # simulated hours

def outages(rng, avail, mttr):
    """Down intervals of one component: exponential up and down times."""
    mtbf = mttr * avail / (1 - avail)
    t, out = rng.expovariate(1 / mtbf), []
    while t < H:
        end = t + rng.expovariate(1 / mttr)
        out.append((t, min(end, H)))
        t = end + rng.expovariate(1 / mtbf)
    return out

def simulate(components, is_down):
    """Sweep every up/down transition; is_down(list of per-component down flags)."""
    events = sorted((t, i, d) for i, ivs in enumerate(components)
                    for s, e in ivs for t, d in ((s, 1), (e, -1)))
    down, prev, total, incidents, was = [0] * len(components), 0.0, 0.0, 0, False
    for t, i, d in events:
        if was:
            total += t - prev
        down[i] += d
        now = is_down(down)
        incidents += now and not was
        was, prev = now, t
    return total / H, incidents / YEARS

rng = random.Random(7)
c = lambda a, mttr=1.0: outages(rng, a, mttr)
configs = {
    "one 99.9%":               ([c(0.999)], any),
    "five in series":          ([c(0.999) for _ in range(5)], any),
    "two in parallel":         ([c(0.999) for _ in range(2)], all),
    "2-of-3 quorum":           ([c(0.999) for _ in range(3)], lambda d: sum(d) >= 2),
    "pair + shared 99.95% db": ([c(0.999), c(0.999), c(0.9995)], lambda d: d[2] or (d[0] and d[1])),
    "pair, 10% common cause":  ([c(0.9991), c(0.9991), c(0.9999, 0.5)], lambda d: d[2] or (d[0] and d[1])),
}
for name, (comps, rule) in configs.items():
    u, per_year = simulate(comps, rule)
    print(f"{name:24} unavailability {u:.2e}  downtime/30d {u*43200:8.2f} min  outages/yr {per_year:.3f}")
```

| Configuration | Formula | Simulated unavailability | Simulated downtime per 30 days | Outages per year |
|---|---|---|---|---|
| One component at 99.9% | 1.0e-3 | 1.0e-3 | 43 min | 8.8 |
| Five in series | 5.0e-3 | 5.0e-3 | 3.6 h | 43.6 |
| Two in parallel | 1.0e-6 | 0.94e-6 | 2.4 s | 0.016 |
| 2-of-3 quorum | 3.0e-6 | 3.1e-6 | 8.0 s | 0.052 |
| Parallel pair behind a shared 99.95% database | 5.0e-4 | 5.0e-4 | 21.6 min | 4.4 |
| Parallel pair with 10% common cause | 1.0e-4 | 1.0e-4 | 4.4 min | 1.8 |

Three things the table says that the formulas do not. **Serial dependencies multiply pages, not only downtime**: five dependencies mean about 44 outages a year to diagnose. **Six nines cannot be verified by observation**: the parallel pair has about one outage every 60 years, and across ten seeds of 20,000 years each, individual runs of that configuration ranged from 0.91 to 1.06 × 10⁻⁶. And **the shared-dependency rows set the real number**: every design review should find the component that plays the role of that 99.95% database.

Error budgets make targets concrete:

| Target | Downtime per 30 days | What it implies |
|---|---|---|
| 99.9% | 43 minutes | A human can be paged, diagnose and roll back, about once |
| 99.99% | 4.3 minutes | Recovery must be automatic: page, acknowledgement and decision take longer than the whole budget |
| 99.999% | 26 seconds | No incident may be noticeable; every change must be staged and self-reverting |

Availability is also $\text{MTBF}/(\text{MTBF} + \text{MTTR})$, which turns a target into a trade between how often you fail and how fast you recover. At 99.99%, incidents that take 30 minutes to resolve may happen about once every seven months; incidents that resolve in 2 minutes may happen twice a month.

## Walk every box and every arrow: an FMEA

A failure mode and effects analysis (FMEA) is the tedious method that finds what redundancy misses. For each component and each arrow, ask what happens if it is **down**, **slow**, **erroring**, **returning wrong data** or **overloaded**, and record the effect, how you would detect it, the mitigation and the blast radius. Classic FMEA also scores severity, occurrence and detectability from 1 to 10 (10 = worst, including hardest to detect) and ranks by their product, the risk priority number (RPN). The scores are judgements; the ranking is the point. For the "start playback" path of a streaming service:

| Element | Failure | Effect | Detection | Mitigation | Blast radius | S×O×D |
|---|---|---|---|---|---|---|
| Edge gateway instance | Crash | Connections reset | Load-balancer health check, ~10 s | N+1 per zone; clients retry another instance | One instance's users, seconds | 3×4×2 = 24 |
| Playback → licence (DRM) | p99 rises to 2 s, health checks pass | Slow starts | Caller-side p99 per dependency | 500 ms timeout, one retry elsewhere, breaker, outlier ejection | Every start in the region | 7×5×4 = 140 |
| Licence service | Down | No stream can start | Start success-rate SLI, ~1 min | Fail over to another region's licence service | Region | 9×2×2 = 36 |
| Auth token service | Down | New logins fail | Login success rate | Tokens verified locally with signed keys; sessions ride a grace period | New logins only | 5×3×2 = 30 |
| CDN steering | Down | Client does not know which server to use | Error rate | Client falls back to a default server list in its config | Region; worse server choice | 6×3×3 = 54 |
| Metadata store | Replica seconds stale | None visible | Replication-lag metric | Accept; metadata changes rarely | None | 2×6×3 = 36 |
| Playback → recommendations | A synchronous call nobody meant to add | Playback fails when recommendations fail | Dependency graph from traces | Remove from the path; fetch asynchronously | Every start | 9×3×7 = 189 |
| Config pipeline | Bad value pushed everywhere | Every region fails at once | Canary cell error rate | Staged rollout, automatic rollback | Global unstaged; one cell staged | 10×3×5 = 150 |

Sort by RPN and the top three are the hidden dependency (189), the config push (150) and the gray failure (140). None is a machine dying. Critical paths accumulate hidden dependencies on non-critical services, and each lowers the availability of the core action to that of the least reliable thing it touches. The fix for the top row is found by reading traces, not by adding replicas.

## Blast radius

Blast radius is the fraction of users, requests or tenants a single failure affects. Techniques, in increasing scale:

**Bulkheads** give each dependency its own pool of threads or connections, so one slow dependency exhausts only its own compartment.

```viz
{"type": "system", "scenario": "bulkhead", "nodes": 3,
 "title": "Bulkheads cap what one slow dependency can take", "caption": "With a shared pool, a slow dependency holds every worker and healthy calls queue behind it. With per-dependency pools, the slow one exhausts only its own compartment."}
```

**Circuit breakers** stop callers spending time and threads on a dependency that is already failing, and give it room to recover.

```viz
{"type": "system", "scenario": "circuit-breaker", "requests": 15,
 "title": "A breaker turns slow failure into fast failure", "caption": "After consecutive failures the breaker opens and fails calls instantly, so callers can serve a fallback instead of waiting on timeouts; a half-open trial decides when to close again."}
```

**Cells** split the whole stack (services, caches, databases) into independent copies, each serving a fixed subset of users. With 20 cells, a poison request, bad deploy or corrupted cache in one cell affects 5% of users. The router that maps users to cells is the one thing all cells share, so it must be the simplest component in the system. Cloud providers have written publicly about building their own control planes this way.

**Shuffle sharding** limits what one bad tenant can do. Give each customer a random subset of k workers out of n. With n = 100 and k = 5 there are C(100, 5) = 75,287,520 subsets. For a random other customer, the chance of sharing all five workers is 1 in 75 million, of sharing two or more 1.9%, and of sharing at least one 23.0%. A customer whose requests crash workers takes down its own five; a neighbour sharing one worker retries on its other four and never notices.

**Staged rollouts** limit the blast radius of change: one cell, then one region, then the rest, with automated comparison at each stage, and configuration shipped through the same pipeline as code. The opening config push would have broken one cell.

**Regional isolation** means no synchronous cross-region calls on the request path. A region that needs another region to serve a request fails when either fails: two 99.9% regions in series are 99.8%.

## Graceful degradation

Blast radius limits *who* is affected; degradation decides *what they see*. Classify every feature as critical, degradable or optional, then design a ladder. For a streaming home page:

1. **Normal:** personalised rows computed for this profile.
2. **Personalisation slow:** the profile's last computed rows from cache, hours old. Few users notice.
3. **Cache miss and personalisation down:** popular-in-your-region rows, precomputed and static.
4. **Everything but playback impaired:** a minimal page from the client's local state, and playback still works.

Protect the core action (starting a stream, checking out, sending a message) at the expense of everything else. Load shedding follows the same priority: under overload, drop prefetches, telemetry and background refreshes before any request that starts a stream; Netflix has described prioritising requests at its edge this way. Two rules make ladders real: the fallback must be **cheaper** than the primary, or it collapses under the same load; and it must be **exercised**, through chaos experiments or forced use, because a fallback that has never run in production has a bug in it.

Retries decide whether a partial failure stays partial: three layers each making three attempts send 27 requests to a failing database for every user request. Retry at one layer, cap retries with a budget, and add jittered backoff; [timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff) measures each of these on a simulated herd.

## Disaster recovery: RPO and RTO per tier

Two numbers define recovery, set per dataset from the business cost of loss and downtime. **RPO** (recovery point objective) is how much data, measured in time, you can afford to lose. **RTO** (recovery time objective) is how long until service is back. The tiers below give orders of magnitude; what each depends on is the column to design against.

| Strategy | Running in the recovery region | RPO | RTO | What the numbers depend on | Cost over one region |
|---|---|---|---|---|---|
| Backup and restore | Nothing; backups copied there | Hours with daily snapshots; minutes with continuous log archiving | Hours to a day | Backup interval; restore throughput; how much infrastructure is code | A few per cent (storage) |
| Pilot light | Replicated data; compute off or minimal | Seconds (replication lag) | Tens of minutes | Instance boot and capacity availability; replica promotion; DNS TTL | Tens of per cent |
| Warm standby | Scaled-down full stack, data replicated | Seconds | Minutes | Scale-up time to full size; cache warm-up | Roughly half again |
| Active-active | Full capacity serving live traffic | Zero to seconds | Seconds to minutes | Detection time; traffic-steering convergence; headroom in survivors | N/(N−1) × peak capacity, plus data copies |

Restore time is arithmetic you should do aloud: 10 TB at a sustained 500 MB/s is 20,000 seconds, 5.6 hours, before log replay and cache warm-up; at 2 GB/s it is 1.4 hours. Backup-and-restore RTO is a restore-throughput problem, and it grows with the data.

Replication protects against losing a region, not against a bug that writes bad data: the corruption replicates in milliseconds. For logical corruption the RPO is "time until someone notices", and the defences are point-in-time recovery, a delayed replica applying changes an hour behind, and immutable logs you can replay. Ask in every review: "if a bug corrupted this table at 2 p.m., how do we get back to 1:59?"

## Multi-region: active-passive or active-active

Stateless compute runs anywhere. The data layer decides the design, and there are four patterns:

1. **One write region, replicas elsewhere (active-passive for writes).** Remote writes pay a cross-region round trip; failover promotes a replica and loses whatever was inside the replication lag.
2. **Home region per user.** Each user's writes go to a home region; others hold replicas. Local writes for most users, no conflicts; failover moves homes. Most large consumer products converge here.
3. **Multi-leader, active-active writes.** Every region accepts writes; conflicts resolve by last-writer-wins, merges or [CRDTs](/learn/system-design/distributed-systems/crdts-and-collaboration). Only for data where a merge is safe.
4. **Consensus across regions.** Every write commits to a cross-region majority: zero loss on region failure, tens of milliseconds or more per write.

| | Active-passive | Active-active |
|---|---|---|
| RTO | Minutes: detect, promote, shift traffic | Seconds to minutes: shift traffic only |
| RPO | Writes inside the lag at failure | Same for async; conflicts add silent overwrites |
| Write latency | Local in the primary region; a cross-region hop elsewhere | Local everywhere |
| Conflicts | None: one writer | Must be designed per data type |
| Idle capacity | A standby region, often untested | 1/N of total capacity held as headroom |
| Failover confidence | Low unless drilled; the passive side rots | High: every region serves traffic daily |

### What asynchronous replication loses

Lost writes on failover are rate × lag. At 20,000 writes a second with a typical lag of 200 ms, promoting a replica loses about 4,000 acknowledged writes; at a p99 lag of 1.5 s, 30,000. The dangerous case is a degrading link: if the inter-region link had been failing for 60 seconds before the primary region died, lag had grown to a minute and 1.2 million writes are gone. So monitor lag as an RPO signal, and when it passes the budget, act before the failure: route writes synchronously, or stop acknowledging writes that the RPO cannot cover.

### What active-active conflicts look like

Two devices on one profile change the subtitle language within the replication lag of each other:

| Time | Region A | Region B | After replication (last-writer-wins by timestamp) |
|---|---|---|---|
| 12:00:00.100 | Writes `subtitles = en` (ts .100) | | |
| 12:00:00.300 | | Writes `subtitles = es` (ts .300) | |
| 12:00:00.600 | Receives B's write; .300 > .100, applies it | Receives A's write; .100 < .300, discards it | Both regions hold `es`; the `en` write vanished with no error |

Converged, but one user's intent was silently dropped. For a setting that is tolerable; for a counter it is a bug: "downloads remaining" decremented in both regions loses one decrement, which is why counters use a CRDT that merges per-region counts, and money uses a home region. How often does it happen? If the other region writes the same key at a Poisson rate λ, a write conflicts when another lands within the lag L on either side, with probability $1 - e^{-2\lambda L}$. At one write a minute per key from each region and 0.5 s lag, that is 1.65%; at 2 s lag, 6.4% (a 200,000-trial simulation, seed 7, gave 1.67% and 6.35%).

```viz
{"type": "system", "scenario": "replication-multi-leader", "nodes": 3,
 "title": "Active-active writes across three regions", "caption": "Each region accepts writes locally and replicates asynchronously. Concurrent writes to the same key conflict and must be resolved deterministically; this is the price of local writes and surviving a region loss."}
```

### Evacuation needs headroom, warm state and pre-scaling

- **Headroom.** With N active regions, each carries 1/N of traffic and must absorb 1/(N−1) after losing one, so total capacity is N/(N−1) × peak: 2× with two regions, 1.5× with three, 1.33× with four. Each region runs at no more than 50%, 67% or 75% of capacity.
- **Warm state.** Survivors receive users whose data is not in their caches, turning failover into a database stampede unless caches are replicated or pre-warmed.
- **Pre-scaling.** Autoscaling takes minutes, and in a real regional event everyone else is asking the cloud for capacity too. Scale the receiving regions first, shift traffic second.

## Under the hood: a regional evacuation, minute by minute

Netflix has written publicly about running active-active across several AWS regions and evacuating a whole region's traffic to the others in minutes, as a regular exercise rather than an emergency procedure. What happens during one, with times as orders of magnitude that depend on the configuration named:

| Time | What happens | Depends on |
|---|---|---|
| 0 | The region's start-playback success rate drops | |
| 10–30 s | Probes from three or more vantage points fail several consecutive checks | Probe interval × failure threshold; one vantage point failing must not trigger it |
| 30–60 s | Automation decides to evacuate; a human in the loop adds 5–15 minutes | Whether the decision is automated, which a 99.99% budget requires |
| 1–3 min | Traffic steering changes DNS weights or withdraws anycast routes; resolvers pick up new answers after the TTL | TTL (often 60 s); resolvers and clients that cache longer |
| 1–5 min | Long-lived HTTP/2 and WebSocket connections drain as servers send GOAWAY or close; clients reconnect with jitter | Reconnect jitter; clients without it arrive as a stampede |
| 2–10 min | Receiving regions' caches fill; database load spikes on cold keys | Cross-region cache replication or pre-warming |
| Minutes | Data: home-region users re-homed; if a primary is promoted, it takes a new epoch number and storage rejects writes carrying the old one | Replication lag at failure; fencing support ([failure detection and leases](/learn/system-design/distributed-systems/failure-detection-and-leases)) |

An evacuation you have never run is a hypothesis. Netflix has written publicly about its chaos tooling, from killing single instances in production to evacuating whole regions on a schedule; the principle transfers at any scale: drill the failover during business hours, with the team watching, often enough that the tooling and the headroom cannot silently rot. Measure each drill against the RTO and RPO you promised.

Automate the traffic shift, which is stateless and reversible. Be more deliberate about promoting a write primary: two primaries during a partition means divergent data, and fencing by epoch is what makes the old primary's late writes fail instead of land. [Netflix microservices and resilience](/learn/system-design/case-studies/netflix-microservices-and-resilience) covers the tooling lineage.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| The untested fallback | The degraded path throws an exception the first time it runs, during the incident | Fallback code has no production traffic in its history | Exercise fallbacks continuously: chaos experiments, forced use for a small cohort |
| Recovery depends on the failed region | Failover stalls: pipeline, secrets store, DNS control plane or runbook wiki unreachable | Every tool the failover needs, listed with where it runs | Run failover tooling outside the regions it rescues; drill with the region cut off |
| Health checks that fail together | The load balancer removes the whole fleet at once | Deep readiness checks test a shared database | Shallow liveness checks; never gate readiness on a dependency every instance shares |
| The recovery stampede | The service comes back and falls over again within a minute | Reconnects and retries arrive in the same second | Jittered reconnects, admission control, ramping traffic back |
| Split brain on data failover | Two primaries accept writes; rows diverge | Automated promotion during a partition, no fencing | Epoch-fenced promotion or consensus; a human decision for data while traffic failover stays automatic |
| RPO silently blown | After a failover, far more writes are missing than the RPO allowed | Replication lag had grown for minutes before the failure and nobody alerted | Alert on lag against the RPO; switch to synchronous writes or stop acknowledging when lag passes it |

## Interviewer follow-ups

**"Your whole region goes down. Walk me through the next ten minutes."** Model answer: probes from several vantage points fail within about 30 seconds; automation shifts traffic within a few minutes, and the other two regions absorb it because they run below two-thirds of capacity and were pre-scaled. For data, profiles homed in the failed region are re-homed; writes inside the replication lag, typically under a second, are at risk, which viewing progress tolerates because clients resend their position. I would watch database load on cold keys in the receiving regions, error rates on anything never failed over, and whether any tooling lived in the failed region. Common wrong answer: "DNS fails over automatically, so users see nothing", which ignores data loss, cold caches and capacity.

**"How do you choose RPO and RTO?"** Model answer: per dataset, from the business cost of a minute of downtime and an hour of lost writes, then price each DR tier. Payments: RPO zero, so synchronous replication or consensus and slower writes. Viewing history: seconds. Analytics: restore within a day. Common wrong answer: "zero for everything", which makes every write pay for the strictest dataset.

**"Active-active or active-passive for this service?"** Model answer: decided by the data layer. If each record has a natural home or merges safely, active-active: every region is exercised daily and failover is a traffic shift. If writes cannot merge and cannot be partitioned, active-passive with a drilled failover, lag monitored against the RPO, and the lost-write count computed (rate × lag). Common wrong answer: "active-active, because there is no idle capacity", when N regions still hold 1/N of capacity idle as headroom.

**"Would you run payments active-active across regions?"** Model answer: not with asynchronous multi-leader writes, because two regions can each accept a charge against the same balance and last-writer-wins drops one. Each account gets a home region that owns its writes, replicated synchronously to a second region or through consensus if RPO must be zero, accepting cross-region latency on the small fraction of traffic that is payments. Common wrong answer: "yes, with conflict resolution", with no answer to which of two charges wins.

**"How would you make a 99.99% target credible?"** Model answer: show that no single failure needs a human: automated detection within a minute, automated rollback, traffic failover without promotion decisions, few serial dependencies each with a fallback, and no shared dependency below four nines. Then show the budget, 4.3 minutes a month, and ask whether the product needs it, since the step from 99.9% can double the design's cost. Common wrong answer: "add more replicas", which does nothing for the common-cause term that dominates.

## What mid-level engineers get wrong

- **Multiplying redundancy without asking what the copies share.** The pair's 99.9999% becomes 99.99% the moment a global config service can take both down.
- **Adding synchronous dependencies to the critical path.** Each one multiplies downtime and outages; five at 99.9% mean about 44 outages a year.
- **Promising RPO zero with asynchronous replication.** Lost writes are rate × lag, and lag is largest exactly before a failure.
- **Choosing active-active without a conflict story.** Last-writer-wins silently drops concurrent writes; counters and balances need CRDTs or a home region.
- **Treating replication as a backup.** Corruption replicates in milliseconds; only point-in-time recovery or a delayed replica gets you back.
- **Designing fallbacks that never run.** An untested degraded path fails on first use, during the incident.

## Exercise: an availability calculator

```exercise
id: availability-calculator
title: Compose availability over serial, parallel and quorum dependencies
prompt: |
  A system's dependency structure is a tree. Each node is one of:

  - a number: a component's availability, between 0 and 1;
  - `{"serial": [nodes]}`: works only if every child works (an empty
    list always works);
  - `{"parallel": [nodes]}`: works if at least one child works (an empty
    list never works);
  - `{"k": k, "of": [nodes]}`: works if at least `k` of the children work.
    Children may have different availabilities; `k` may be 0 (always
    works) or larger than the number of children (never works).

  Treat all failures as independent. Return the expected downtime in
  seconds over a 30-day month (2,592,000 seconds), that is
  `(1 - availability) * 2592000`, rounded to the nearest integer
  (use `floor(x + 0.5)`).
languages: [python, javascript]
entry: downtime_seconds
starter:
  python: |
    def downtime_seconds(node):
        # your code here
        return 0
  javascript: |
    function downtime_seconds(node) {
      // your code here
      return 0;
    }
tests:
  - args: [{"serial": [0.999, 0.999, 0.999, 0.999, 0.999]}]
    expected: 12934
    label: five serial dependencies at 99.9%
  - args: [{"k": 2, "of": [0.999, 0.999, 0.999]}]
    expected: 8
    label: a 2-of-3 quorum
  - args: [{"serial": [0.9995, {"parallel": [0.999, 0.999]}]}]
    expected: 1299
    label: a redundant pair behind a shared database
  - args: [0.99]
    expected: 25920
    label: a bare component
  - args: [{"serial": []}]
    expected: 0
    label: nothing to fail
  - args: [{"k": 4, "of": [0.99, 0.99, 0.99]}]
    expected: 2592000
    hidden: true
    label: a quorum larger than its members never works
  - args: [{"k": 2, "of": [0.99, 0.95, 0.9]}]
    expected: 16589
    hidden: true
    label: members with different availabilities
  - args: [{"k": 2, "of": [{"serial": [0.9999, {"k": 2, "of": [0.99, 0.99, 0.99]}, 0.9995]}, {"serial": [0.9999, {"k": 2, "of": [0.99, 0.99, 0.99]}, 0.9995]}, {"serial": [0.9999, {"k": 2, "of": [0.99, 0.99, 0.99]}, 0.9995]}]}]
    expected: 6
    hidden: true
    label: three regions, any two of which must be up
hints:
  - "Write availability(node) recursively and convert to seconds only at the end."
  - "Serial multiplies availabilities; parallel multiplies unavailabilities (1 - a)."
  - "For k-of-n with different members, build P(exactly j up) one child at a time: new[j] = old[j] * (1 - a) + old[j - 1] * a, then sum j >= k."
```

The calculator assumes independence, which is the assumption this lesson warns against. Model a common cause by pulling it out as its own serial term, as in the arithmetic above: `{"serial": [0.9999, {"parallel": [0.9991, 0.9991]}]}` gives 261 seconds a month, where the naive pair of 99.9% regions gives 3.

## Senior signals

- You ask **"what do these copies share?"** of every redundant pair, and you model the common cause as its own serial term.
- You compute **serial, parallel, quorum and shared-dependency availability**, know that serial dependencies multiply pages as well as downtime, and know that 99.99% means automated recovery.
- You run an **FMEA over boxes and arrows**, rank by risk, and expect the top risks to be hidden dependencies, config pushes and gray failures, not dead machines.
- You shrink **blast radius** deliberately: bulkheads, cells, shuffle sharding, staged rollouts, config treated as code.
- You set **RPO and RTO per dataset**, price DR tiers by what they depend on, and remember replication does not protect against corruption.
- You decide **active-active versus active-passive from the data layer**, compute lost writes as rate × lag, and have a conflict story for every data type you replicate multi-leader.

## Check yourself

```quiz
- q: >-
    Two regions are each 99.9% available, but a tenth of each region's downtime comes from a global config push that takes both down together. What is the pair's availability?
  options: ["About 99.8%, since the availabilities multiply", "About 99.9999%, since the regions are redundant", "About 99.9%, since one region is the limit", "About 99.99%, set by the shared cause"]
  answer: 3
  explanation: >-
    Model the config push as a serial term of 0.01% unavailability; the independent part of each region is 0.09%, and both failing independently adds only 0.00008%. The total is about 0.01%, so 99.99%. Six nines assumes independence the shared cause breaks, and multiplying availabilities is the rule for serial dependencies, not redundant ones.
- q: >-
    An active-passive database replicates asynchronously at 20,000 writes a second, normally 200 ms behind. The inter-region link degraded for 60 seconds before the primary region died. Roughly how many acknowledged writes are lost on failover?
  options: ["About 72 million", "About 1.2 million", "About 20,000", "About 4,000"]
  answer: 1
  explanation: >-
    Lost writes are rate × lag at the moment of failure, and the lag had grown to about 60 seconds: 20,000 × 60 = 1.2 million. 4,000 uses the normal 200 ms lag, which is not the lag at failure; 20,000 is one second of writes; 72 million treats the lag as an hour. Acknowledgement by an asynchronous primary does not mean the replica has the write.
- q: >-
    A quorum needs any 2 of 3 replicas, each 99.9% available and failing independently. What is its availability?
  options: ["About 99.9%", "About 99.9997%", "About 99.7%", "About 99.9999999%"]
  answer: 1
  explanation: >-
    The quorum fails when two or three replicas are down: 3q²(1 - q) + q³ ≈ 3 × 10⁻⁶ for q = 0.001, so about 99.9997%, or 8 seconds a month. It is worse than a plain redundant pair (10⁻⁶) because any two of three failing is enough. 99.7% treats the replicas as serial.
- q: >-
    A bug writes corrupted values into a table replicated synchronously to three regions. Which defence recovers the data?
  options: ["Failing over to one of the other two regions", "Point-in-time recovery or a delayed replica", "Raising the replication factor in each region", "Adding a fourth replica in a new region"]
  answer: 1
  explanation: >-
    Replication copies the corruption everywhere within milliseconds, so failover and extra replicas hold the same bad data. Only a copy from before the corruption (point-in-time recovery, a replica applying changes an hour behind, an immutable log) gets you back.
- q: >-
    An active-active service resolves conflicts by last-writer-wins. A downloads-remaining counter is decremented in two regions within the replication lag. What happens?
  options: ["One decrement is silently lost", "The later write is rejected as a conflict", "Both apply, since both were acknowledged", "The regions stay permanently divergent"]
  answer: 0
  explanation: >-
    Each region writes a new absolute value; after replication both regions keep the one with the later timestamp, so they converge on a value that reflects only one decrement. Nothing errors and nothing stays divergent. Counters need a CRDT that merges per-region counts, or a home region that owns the writes.
- q: >-
    A service targets 99.99% availability. Its incidents take about 30 minutes to resolve when a human is paged. What does the target imply?
  options: ["The target holds provided the incidents are short", "About one such incident a month fits the budget", "The target is met if the service is multi-region", "About one such incident every seven months"]
  answer: 3
  explanation: >-
    99.99% allows about 4.3 minutes a month, 52 minutes a year, so 30-minute incidents fit roughly once every seven months. Meeting the target with normal incident rates needs recovery measured in a minute or two, which means automated detection and rollback. Multi-region helps only if the failover itself is automatic and the regions share no cause.
```
