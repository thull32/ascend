---
lesson: what-we-would-change-at-scale
source: c2cdfcf41d9c3dfa
fit: great
desk:
  - "The where-it-stands table, and the ranked tables of what was fixed and what is open"
  - "The AI cost arithmetic: the worst-case bounds and the typical-day table"
  - "The table-growth estimates and the retention arithmetic"
  - "Exercise: compute the daily AI cost bound before budget holds"
---
## Introduction

Every system has a scale at which its current design stops being the right one. The senior skill is not to build for that scale on day one. It is to know where the limits are, in what order they will be hit, and what the first move is when each arrives, so that growth is a sequence of planned changes rather than a sequence of incidents.

This is the design review of the codebase this track has been reading. It imagines two futures, 10 thousand and 100 thousand daily active users, and asks what breaks, what costs too much, and what is merely invisible.

The architecture document already names the shape: Postgres is the bottleneck long before the app servers, and the hot reads, lessons and problems, never touch it, because they are served from memory. So a hundred times more readers is mostly a bandwidth problem. The real pressure points are the AI bill, the tables that grow with every action, and, until recently, the fact that nobody could see any of it.

## Rate limits with more than one replica

The first review found every rate-limit bucket in process memory. Right for one replica. Add a second and each keeps its own buckets, so the real limit is the configured one times the number of replicas. An attacker guessing a learner's password at 10 a minute per replica gets 30 a minute against three.

The review proposed Redis, and had to decide what happens when Redis is down. Failing closed would turn a cache outage into a site outage, so it proposed falling back to local shares.

What shipped kept the seam and changed the store. The security buckets now live in Postgres, one timestamp per key, checked and advanced by a single conditional upsert. And the store changed the failure decision. Before I give it: if that limiter cannot reach Postgres, should it refuse the request?

[pause]

Yes, it answers 503, and that costs nothing. Sign-up, login, model calls and grading all need the database anyway, so when it is down they fail regardless. Refusing early adds no outage. Decide what a limiter does when its store is down before you choose the store. The loose general bucket, 1,200 requests a minute, stays in memory per replica on purpose; it only stops one client flooding cheap reads.

## The fuse and the bill

Separate two numbers that people constantly confuse. The fuse is the per-user budget that bounds abuse. The bill is typical use times adoption.

The fuse first, and its history. The budgets were checked before a call and charged after it, so a learner one token under the limit could still start a 4,000-token reply. The most output one user could generate was about 124 thousand tokens a day, 2 dollars 48. With budget holds, taken under a lock before each call, it is exactly 120 thousand tokens, 2 dollars 40.

Input had a longer history. At first it was not budgeted at all, and in a chat product input is where the tokens are. Then a daily input limit and prompt caching shipped in the same change, and they interacted. The limit counted uncached input; caching moved almost every token into cache reads and writes. A client that sent different editor contents with every message could make each request a near-complete cache write, about 75 dollars per user per day, checked against nothing. The fuse had moved from "not metered" to "metered in the wrong column". Now it counts billed input, and the worst day per user is 10 dollars 40.

Here is the catch. That is a per-user fuse. Times 100 thousand users, it is over a million dollars a day. A per-user cap is not a cap on the bill.

Now the bill. Assume an engaged learner has 15 coach turns a day, each within five minutes of the last. With today's caching, that day costs about 46 cents, two thirds of it output. The old single-breakpoint caching would have cost about 83 cents. If 20 percent of users touch the coach on a given day, 10 thousand daily users cost about 920 dollars a day, roughly 27 thousand 600 a month. At 100 thousand, about 9,200 dollars a day. For a free product, that is the whole problem.

The levers, in the order a cost review takes them. First, budget in money, not tokens, so a change of model or price does not silently move every bound. Second, tune effort and maximum output per product, since output dominates and thinking bills as output. Third, keep the history cached when context changes. Fourth, route easy questions to a smaller model, remembering that caches are per model. And fifth, a global spend breaker: sum today's priced usage across everyone, and above a threshold, flip AI features into the existing "unavailable" state and page someone.

## Tables that grow

At 10 thousand daily users, the table that grows fastest is not the AI one. It is submissions, because every press of Run stores the code and per-test results, failures included: about 300 megabytes a day. Coach messages add about 120. Together about 440 megabytes a day, so the 50-gigabyte volume fills in roughly four months.

Interviews are a different cost: churn, not size. Every transcript append writes a new row version of the whole transcript, which becomes vacuum work.

Retention shipped: submissions kept 180 days, except each learner's latest attempt and latest pass per target; conversations and interviews kept a year. It deletes in batches, each committing on its own, one replica at a time. Now redo the arithmetic, because retention bounds growth without making it fit. 180 days of submissions is about 54 gigabytes. A year of messages is about 44. That is twice the volume at steady state. The period, deduplication, or object storage must change before that traffic arrives.

And at scale, why partition by month instead of deleting nightly? Because a delete marks every row version dead, which vacuum must clean and which writes log records for every row. Dropping an old partition is a metadata change. Almost free.

## Observability: built, broken, switched off

Until the scale work, telemetry was one log line per request. That answers "what happened to this request", if you already know which one. It cannot answer "is the coach slower than yesterday" or "are we within budget this month".

Then metrics, traces and three service-level objectives shipped. Notice the target chosen: 99.5 percent availability, not the review's 99.9, because the SLO document calls it honest for one region, one database and a small team. An unmeetable objective trains people to ignore the page.

Bringing it up in production found gaps no reading of code could. The alert rules evaluated, but nothing sent them anywhere. The metrics volume was never attached, because its config shape was silently ignored. An SLO is only as real as the path from the failing request to a person's phone.

And the path never reached a phone. The alert webhook was never set. Grafana's traffic was mostly bots. Idle, the stack held over a gigabyte of memory, billed every minute. So it was switched off, one apply from coming back. A pipeline that pages no one is cost without protection. The cheaper first step when traffic arrives is the webhook, not more dashboards.

## Grading every run: priced, then re-priced

The first review priced verifying every run on the server. At 100 thousand users and 15 runs each, that is 1.5 million executions a day, perhaps 87 a second at peak. At about one CPU-second per run in a container sandbox, roughly 90 busy CPUs. So it recommended verifying only submissions for credit.

Then the method stayed the same and the unit price changed. A WebAssembly Python starts in about a tenth of a second, JavaScript in about a fiftieth. Redo it at a tenth to a fifth of a CPU-second per run, and peak load needs roughly 9 to 17 cores. A few replicas, not a fleet. So every signed-in run is graded. Price your options, and re-price when the technology under one of them changes.

## Right-sizing, and what not to change

The review so far asks what breaks with more traffic. The bill asked the opposite question. Idle, the scaled deployment held about 2.7 gigabytes and cost about 27 dollars a month, five times the app alone, for an invite-only site. Switched back to one replica grading in-process, and with threads and allocator arenas sized for two cores instead of the 24 the platform reports, the process went from 470 megabytes idle to 97.

Three habits generalise. "You aren't gonna need it" applies to infrastructure: build what correctness needs before the second replica, like shared limits and locked migrations, and run capacity when a named trigger fires. Price idle as well as peak. And measure before scaling out.

So the plan, in order. Cost safety now, whatever the traffic: a global spend breaker, and budgets in money. Before 10 thousand users: effort tuning, priced AI metrics, retention that fits the volume, and deploying the tested image by digest. When traffic arrives: observability back on with the webhook set, the grading service, a connection pooler past about four replicas, canary releases. And notice what is not on the list: splitting the monolith, sharding Postgres, or a rewrite. At 100 thousand users the constraints are money, data growth and visibility, and none of them is solved by a network boundary.

## In the interview

A follow-up the lesson expects: is the AI spend bounded?

[pause]

Per user, yes: 2 dollars 40 of output and 8 dollars of billed input, 10 dollars 40 at worst, and with holds before each call nothing in flight can overshoot it. In total, no. That fuse times 100 thousand users is over a million dollars a day, which is why a global breaker and a money budget come first. The common wrong answer is "the budget caps the cost", which confuses a per-user fuse with a bill.

And: what breaks first at a hundred times the users? Sort by incorrect before slow. What was incorrect across replicas is fixed, so connections run out first past about four replicas. But the binding constraints are money, about 9,200 dollars a day of typical AI use, and data growth. The wrong answer is "Postgres" with no number attached.

## Recap

Four things to remember. Separate the fuse from the bill: the worst case sizes the per-user limit, typical use times adoption sizes the budget, and check the fuse is on the right wire. Decide what a limiter does when its store is down before you choose the store. Check that retention's bound actually fits the storage, and drop partitions rather than deleting rows. And price idle as well as peak, keep built capacity behind switches, and say what you would not change.

At your desk: the tables of what was fixed and what is open, the AI cost arithmetic, the table-growth estimates, and the daily cost-bound exercise.
