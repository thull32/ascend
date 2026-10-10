---
lesson: ci-cd-and-deployment
source: 71fc0e36ac42707d
fit: great
desk:
  - "The pipeline timed job by job, and the cache table"
  - "The blue-green and canary step tables"
  - "The canary sample-size script and the failed-canary trace"
  - "The four migration plans and the expand-and-contract release table"
  - "Exercises: an error-budget release gate, and a canary promotion gate"
---
## Introduction

A team ships every two weeks. The release has a 40-item checklist, a release manager, and around 200 merged changes. When it breaks production, nobody knows which of the 200 did it, rolling back reverts all of them, including three urgent fixes, and the real fix waits for the next train. After two bad releases, the team decides to deploy less often, with a longer checklist. Each release now carries 400.

The instinct is backwards. Risk per deploy grows with the size of the deploy, and diagnosis time grows with the number of suspects. Small, frequent, automated, reversible deploys are safer. The DORA research programme's delivery metrics consistently show speed and stability going together rather than traded, with top performers doing well on all of them.

Five ideas. A pipeline that builds once and promotes the artifact. A deploy that drains properly. Blue-green and canary releases, and the arithmetic that sets a canary's stage length. Why rollback is not always available. And an error budget that decides when to ship.

## Build once, promote the artifact

A delivery pipeline turns a commit into a running, verified release, and four rules carry most of the value.

First, order by cost. Formatting and type errors fail in seconds; nobody should wait for a browser suite to learn about them. Second, build once. The artifact you tested is the artifact you deploy, identified by an immutable digest. Never "the same commit, rebuilt for production", because a rebuild can resolve a base image or a dependency differently and ship something nobody tested. Third, test the artifact, not the source, so packaging mistakes like a missing asset fail before users see them. And fourth, keep it fast. A pipeline people wait 45 minutes for gets bypassed.

This repository's pipeline, timed on one push with warm caches, took 4 minutes 16 seconds. The interesting part is where the time went. The tests themselves were quick: 22 integration tests in about a second and a half, 24 browser tests in 43 seconds. Compilation, installs and setup cost more than testing, and the single largest step was installing the browser, 47 seconds, which is cacheable.

And caches decide the rest. With an empty cache, a 16-second build took almost six minutes, and the whole run took 9. One cause was cancellation: a newer commit cancelled the image build before it had ever finished, so the layer cache was never written, and the next run built every layer from scratch.

## Configuration, and a deploy that drains

The same artifact runs everywhere; only configuration and data differ. Configuration should be read from the environment and validated at boot. Ascend refuses to start on a bad value, so a bad variable fails the new deployment's health check while the previous version keeps serving, instead of failing the first request that touches it.

Configuration can also be a release switch. With no AI key configured, Ascend's AI routes return a 503 and the UI shows a notice. That is a feature flag: it separates deploying code from releasing behaviour.

The deploy itself works like this. The new version starts, validates its config, connects to Postgres, runs pending migrations, loads the curriculum, and only then binds its port. The platform polls the readiness endpoint, and a 200 means config valid, schema current, database reachable, content loaded. If it never turns ready, the old deployment keeps serving. A failed migration exits before binding, so traffic never moves.

Zero downtime also needs the old version to finish what it started. On a termination signal, Ascend's server stops accepting connections, lets in-flight requests complete, then waits for background tasks, like an AI reply still being saved for a learner who closed the tab. Correct code. But how long does the platform wait between the polite signal and the kill?

[pause]

On Railway, by default, zero seconds. The kill came at once, so the correct shutdown code never got to run, and the symptom, a reply cut off mid-stream during a deploy, looked like a network blip until a review read the platform's documentation beside the code. The window is now 60 seconds, and the server bounds its own shutdown to fit: 25 seconds for open connections, then 30 for background tasks. 55, under 60. And because code that only runs during deploys breaks unnoticed, it is tested twice: over real sockets, and by requiring the CI image to stop cleanly.

One more distinction. Liveness asks "is the process up?" Readiness asks "should this instance get traffic?", and checks the database. Never restart containers on a liveness check that depends on the database, or a 40-second database failover becomes every instance restarting at once.

## Blue-green and canary

Ascend's deploy is neither blue-green nor a canary: the new replicas replace the old ones, and every user moves at once. Here are the two strategies that do better.

Blue-green keeps two complete environments. Deploy green at full size from the same digest, verify it with smoke tests on its private address, warm its caches, then switch the router so all new requests go to green while blue drains. Rollback is a router change, in seconds. The costs: double capacity during the switch, and all-at-once exposure, since a bug only real traffic triggers reaches every user. And the switch only applies to new requests. A load balancer that routes per connection leaves keep-alive connections and streams on blue until they close.

A canary sends a small share of traffic to the new version, compares it with the old version serving at the same time, and widens the share while the comparison stays clean. The lesson's plan, for a service at a thousand requests a second: 1 percent, then 5, 25, 50, each for 10 minutes, then 100 with a 30-minute bake.

Why compare against the concurrent baseline, rather than yesterday? Because traffic mix and load change hour to hour. The question is: is the new version worse than the old one right now, on the same traffic? Compare error rate, the 99th percentile latency, saturation, and at least one business metric, because some bugs return a 200 with the wrong content.

## How long should a canary stage run?

Stage lengths are arithmetic. A healthy canary that sees some number of requests at the baseline error rate expects that number times the rate in errors. Error counts are close to Poisson, so the gate tolerates the expected count plus three times its square root.

Take a release that raises errors fivefold, from 0.1 percent to 0.5. A 1 percent canary, checked after one minute. Does the gate catch it?

[pause]

Only about a third of the time. The canary sees 600 requests. A healthy one expects 0.6 errors, and the gate needs 4. The broken release produces 3 on average. A fivefold ratio sounds decisive, but with counts this small it is not. For 95 percent power, that 1 percent canary needs about four and a half minutes. A 10 percent canary needs about 30 seconds.

A subtler regression, from 0.10 to 0.18 percent, is caught at 1 percent for 10 minutes only 20 percent of the time, at 5 percent 85 percent of the time, and at 25 almost always. And fix your evaluation points in advance: checking every minute multiplies the false alarms.

The lesson traces exactly that bug. Stage one, at 1 percent: 11 errors, against a limit of about 13. Pass; 11 is inside the noise around 6. Stage two, at 5 percent: 54 errors, against a limit of about 46. Roll back. The router weight drops to zero, new requests go to the old version within seconds, and the canary drains. About 29 requests failed because of the bug. Sent to everyone at once, the same bug fails nearly one extra request a second, 480 for every ten minutes a signal this weak takes to notice.

One routing detail: split by user, not per request. A random per-request split sends one user's requests to different versions, which breaks a single-page app whose hashed assets exist only in the version that built them. And if you cannot split traffic by instance at all, you can still canary by feature flag: hash the user ID and enable the new path for 5 percent of users.

## Rollback, and the migrations that block it

Rollback means redeploying the previous artifact. It is the default response, because it restores service before anyone understands the bug. Decide the trigger before deploying, and roll forward only when the fix is smaller and better understood than the rollback.

Some changes cannot be undone by redeploying: a migration that dropped or rewrote data, data written in a format the old version cannot read, and external side effects like emails sent or payments captured.

Ascend found one more by reading its migration library. The library errors at boot when the database records a migration the binary does not know. So a rollback after any release with a migration could never turn healthy. Now Ascend plans its own migrations, four ways. Up to date: serve. Missing some: apply them, then serve. Schema ahead, with extra migrations the binary does not know: log a warning and serve without migrating. And diverged, extras and missing both: refuse to boot, because two branches were deployed against one database.

Schema ahead is safe only under a contract the code cannot check: every migration stays expand-only for at least one release. Even relaxing a constraint can break it. Making a column nullable meant an older binary would boot, then fail to decode any comment whose author had deleted their account.

That is why you run schema changes as expand and contract. During any rollout, blue-green or rollback, old code runs against the new schema, so renaming a column in one step breaks the old version instantly. To rename name to display name: first add the new column and write both. Backfill the old rows. Then switch reads. Then stop writing the old column. Only then drop it. The drop waits longest, because it removes the last rollback target.

And boot migrations had one more limit: replicas booting together would all run the same migration. Ascend now takes a database advisory lock first, so the second replica waits, then finds the schema up to date.

## Let the error budget decide

A service level objective turns "is it reliable enough?" into arithmetic. With an objective of 99.9 percent successful requests over 30 days, the error budget is the other 0.1 percent. At 10 million requests a month, 10 thousand may fail, and the failed canary spent 29.

The budget is meant to be spent, on deploys, experiments and migrations. When it is gone, a written error budget policy halts releases, other than urgent and security fixes, until the service is back within its objective. And a frozen team still ships reliability fixes through the same pipeline, canary and rollback machinery.

## In the interview

A follow-up the lesson expects: the release passed the canary, and an hour later errors climb. Roll back or roll forward?

[pause]

Roll back if the release is reversible: no contract migration, no new data format, no external side effect. Roll forward if the fix is smaller and better understood, or a migration makes rollback impossible. The wrong answer is "always roll back", without checking what the release changed in the database.

And: engineers are bypassing a 25-minute pipeline. Measure the critical path per job and step. Cache dependencies and browsers, parallelise independent suites, question dependencies between jobs that only save compute, and move slow suites after the merge only when a gate still covers the risk. Not bigger runners, which fix neither a cache miss nor a serial chain.

## Recap

Five things to remember. Smaller, more frequent deploys are safer, because batch size drives both failure rate and diagnosis time. Build once and promote the digest, tested as the built artifact. Check the platform's drain setting rather than trusting your shutdown handler, and keep liveness separate from readiness. Size canary stages with power arithmetic, against a concurrent baseline. And know which changes are irreversible, including the ones your migration tool makes so, and change schemas by expand and contract.

At your desk: the timed pipeline and cache tables, the blue-green and canary step tables, the sample-size script and the failed-canary trace, the migration plans and the release table, and the two gate exercises.
