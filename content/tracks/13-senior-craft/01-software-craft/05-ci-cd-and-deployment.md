---
slug: ci-cd-and-deployment
title: "CI/CD and deployment: pipelines, environments, blue-green, canaries, rollbacks and migrations"
description: A real pipeline timed job by job with and without caches, blue-green and canary releases traced step by step with the sample-size arithmetic that sets stage lengths, a failed canary rolled back, draining and readiness on a real platform, why this app cannot roll back across a migration, expand/contract tied to the versions that are live, and an error budget that decides when to ship.
minutes: 29
difficulty: medium
tags: [ci-cd, deployment, blue-green, canary, rollback, migrations, slo, error-budget, senior-craft]
---
A team ships every two weeks. The release has a 40-item checklist, a release manager, and around 200 merged changes. When it breaks production, nobody knows which of the 200 changes did it, rolling back reverts all 200 (including three urgent fixes), and the real fix waits for the next train. After two bad releases the team decides to deploy *less* often, with a longer checklist. Each release now carries 400 changes.

The instinct is backwards. Risk per deploy grows with the size of the deploy, and diagnosis time grows with the number of suspects. Small, frequent, automated, reversible deploys are safer, and the DORA research programme's four key metrics (deployment frequency, lead time for changes, change failure rate, time to restore service) have repeatedly shown the strongest teams improving speed and stability together rather than trading one for the other. This lesson builds that machinery piece by piece: the pipeline, the environments, the deploy itself, the release strategies, the rollback, and the migrations that make rollback hard.

## The pipeline: build once, promote the artifact

A delivery pipeline turns a commit into a running, verified release:

```mermaid
flowchart LR
  C["Commit"] --> F["Fast checks: format, lint, typecheck"]
  F --> T["Unit and integration tests"]
  T --> B["Build the image once"]
  B --> E["E2E against that image"]
  E --> R["Push immutable image (digest)"]
  R --> S["Deploy to staging"]
  S --> P["Deploy the same digest to production"]
```

Four rules carry most of the value:

1. **Order by cost.** Formatting and type errors fail in seconds; nobody should wait for a browser suite to learn about a missing semicolon.
2. **Build once.** The artifact tested is the artifact deployed, identified by an immutable digest, never "the same Git SHA rebuilt for production". A rebuild can resolve a base-image tag to a different digest or pick up a different dependency and ship something nobody tested.
3. **Test the artifact, not the source.** End-to-end tests run against the built image, so packaging mistakes (a missing asset, a wrong entrypoint) fail before users see them. What each earlier stage should prove is the subject of [testing strategy](/learn/senior-craft/software-craft/testing-strategy).
4. **Keep it fast.** A pipeline people wait 45 minutes for gets bypassed. The next section shows where the minutes go in a real one.

## This app's pipeline, timed

`.github/workflows/ci.yml` runs five jobs. Measured on the push of commit `527d3d1` to `main` (run 36441384084, all caches warm; the commit changed lessons and three files under `web/src`), the run took 4 minutes 16 seconds:

| Job | Starts at | Duration | Where the time goes |
|---|---|---|---|
| problems | 0 s | 14 s | every practice problem's reference solution, then the quiz-order check |
| web | 1 s | 43 s | frozen-lockfile install 3 s, typecheck 9 s, Vitest 7 s (1,133 tests), build 11 s |
| rust | 1 s | 70 s | Postgres service container 12 s, cache restore 10 s, clippy 8 s, `cargo test` 23 s (19 s of it compiling), strict content validation 8 s |
| image (needs rust, web) | 75 s | 166 s | buildx setup 12 s, `docker build` 136 s |
| e2e (needs rust, web) | 76 s | 177 s | Postgres 14 s, SPA build 14 s, cache 18 s, debug server build 16 s, server ready 2 s, Chromium install 47 s, 24 Playwright tests 43 s |

The critical path is rust then e2e: 70 + 177 seconds plus scheduling. The tests themselves are quick: `cargo test`'s 22 API integration tests against a real Postgres 17 container finished in 1.49 s, and the 24 Playwright tests (12 tests, each on a desktop and a Pixel 7 profile) in 42.8 s, so on a warm run compilation, installs and setup cost more than testing does. The largest single step on the path, installing Chromium, is cacheable. And `needs: [rust, web]` makes e2e wait 75 seconds for jobs whose outputs it does not use; that ordering saves runner minutes on red builds at the price of wall-clock time on green ones, a trade worth making on purpose.

Caches decide the rest:

| Run | Commit and cache state | rust job | e2e debug build | image build | Total |
|---|---|---|---|---|---|
| 36441384084 | `527d3d1`, warm | 70 s | 16 s | 136 s | 4 m 16 s |
| 36301079237 | `6ab2be2`, `Cargo.lock` changed | 156 s | 34 s | 260 s | 7 m 42 s |
| 36299226124 | `8657191`, e2e and image caches empty | 60 s | 347 s | 356 s | 9 m 01 s |

A cold Rust cache turns a 16-second debug build into almost six minutes. [Containers and infrastructure as code](/learn/senior-craft/software-craft/containers-and-infrastructure-as-code) traces the image build layer by layer, including why each of these three builds hit or missed.

## What the timings teach, and the gaps they expose

**Cancellation has a cost.** A `concurrency` group cancels a run when a newer commit arrives on the same branch. On 27 September, run 36298629453 was cancelled at 06:08:48, sixteen seconds after the run for `8657191` was created, with its image job two and a half minutes in. Every earlier run had failed or been cancelled before its image job finished, so nothing had ever been exported to the layer cache, and the next run built every layer from scratch: the 356-second row above. Cancelling saves runner time on stale commits; during a burst of pushes it can also stop the cache from ever warming.

**Two builds of one commit.** The image job builds the Dockerfile but does not push it (`push: false`), and Railway builds its own image from the same commit when `main` changes. That is the pattern rule 2 warns about. Frozen lockfiles and base images that resolve to the same digests (CI's build log records them) make the two builds very likely equivalent, and for a one-person project the simplicity is a fair trade; the stricter design pushes CI's image to a registry and deploys that digest.

**E2E tests a debug build.** The Playwright suite used to run only on demand (`make e2e`), so a broken browser journey could merge with every check green; the `e2e` job now runs it on every pull request and every push to `main`. It exercises a debug binary compiled from source, not the image, so rule 3 is still approximated: a packaging mistake in the Dockerfile would pass it.

**Local parity.** `make check` runs the format, lint, test and validation steps (the Makefile calls it "Everything CI runs, locally"); it leaves out the SPA build, the image, the browser suite and the quiz-order check. Closing a gap usually means naming the next one.

## Environments and configuration

The same artifact runs everywhere; only configuration and data differ.

| Environment | What runs | Data | What it catches | In this repository |
|---|---|---|---|---|
| Local | `make dev` or `make run` | a Postgres 17 container | logic errors, in seconds | yes |
| CI | debug and release builds | an empty Postgres per job | regressions, integration, browser journeys | the rust and e2e jobs |
| Preview | one deployment per pull request | seeded | what reviewers need to click | not configured |
| Staging | the production artifact | realistic volume | config, migrations on real-sized data, third-party integrations | none |
| Production | the artifact | real | everything else | Railway, one replica |

Staging earns its cost when it differs from CI in the dimension that breaks you: data volume (a migration that takes 40 ms on 10,000 rows can take minutes on 400 million, as [schema migrations at scale](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) measures) or real integrations. A staging environment with CI's data and production's name adds a queue, not safety.

Configuration must be data read from the environment and **validated at boot**. `crates/core/src/config.rs` loads every setting once and refuses to start on a bad value (a non-Postgres `DATABASE_URL`, or production without secure cookies), so a bad variable fails the new deployment's health check while the previous version keeps serving, instead of failing the first request that touches it.

Configuration can also be a release switch. With no `ANTHROPIC_API_KEY`, the app logs a warning at startup, AI routes return `AiDisabled` (a 503 with code `ai_disabled`) and the UI shows a notice. That is a **feature flag**: it separates *deploying* code from *releasing* behaviour, so code can ship dark and be switched on, off, or to a percentage of users without a deploy.

## How this app deploys

`.railway/railway.ts` declares the platform resources as code, including how a new version proves it is healthy:

```typescript
// excerpt from .railway/railway.ts
const app = service("ascend", {
  // Builds the root Dockerfile. A push to main deploys once CI passes.
  source: github("thull32/ascend", { checkSuites: true }),
  replicas: { [region]: 1 },
  // Migrations run on boot before the server binds, so a passing readiness
  // probe means the schema is current and Postgres is reachable.
  healthcheck: "/api/readyz",
  healthcheckTimeout: 120,
  // env: ...
});
```

`checkSuites: true` makes Railway wait for the commit's GitHub check suites, the five jobs above, before it deploys. The line used to read `false`, so the only thing keeping a red build out of production was branch protection; the fix turned a default nobody noticed into a decision a reviewer can see.

The boot sequence in `crates/api/src/main.rs` makes the health check meaningful: load and validate config, connect to Postgres, **run pending migrations**, load the curriculum, and only then bind the port. `/api/readyz` runs `SELECT 1` and reports the database status, whether AI is configured, the content version and the build (the commit, compiled in from `RAILWAY_GIT_COMMIT_SHA`). A 200 means "config valid, schema current, database reachable, content loaded". [Build and deploy](/learn/case-study-ascend/shipping/build-and-deploy) walks the same path from the codebase's side.

```mermaid
sequenceDiagram
  participant P as Railway
  participant N as New version
  participant O as Old version
  participant DB as Postgres
  P->>N: start container
  N->>DB: run pending migrations
  loop until a 2xx or 120 s
    P->>N: GET /api/readyz
  end
  N-->>P: 200 ok
  P->>N: route new traffic
  P->>O: SIGTERM (old version retires)
  O->>O: drain in-flight requests
  O-->>P: exit
```

Railway's documentation fixes the rest of the contract. The platform polls the health path until it gets any 2xx; the default window is 300 seconds and this service sets 120; if the window passes, the deploy is marked failed, and the old deployment, which is only stopped once a new one goes live, keeps serving. Railway does **not** poll the endpoint after the deployment goes live: the check gates the rollout only, and a process that later crashes is restarted by the restart policy (by default on failure, at most 10 times), not by a health probe. If a migration fails, the process exits non-zero before binding, never turns healthy, and traffic never moves. This is neither blue-green nor a canary: one replica is replaced by its successor once the successor passes the health check, and every user moves at once.

## Draining, and the setting that decides it

Zero downtime needs the old version to finish what it started. `main.rs` listens for SIGTERM, stops accepting connections, lets in-flight requests complete, then waits up to 30 seconds for background tasks such as an AI reply still being saved for a learner who closed the tab. A request can legitimately run for minutes: the router's `TimeoutLayer` allows 240 seconds before answering 503, and a streamed AI reply may use most of that.

How long the platform waits between SIGTERM and SIGKILL decides whether any of that runs. Railway exposes it as the `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` service variable, and its documentation gives the default as **0 seconds**: SIGTERM, then SIGKILL immediately. `railway.ts` does not set it, so unless it was set in the dashboard, where the reviewed file cannot show it, the graceful shutdown code is correct and never gets time to run. A reviewer asks for the variable in the file with a value above the slowest legitimate request plus the 30-second task wait, which here is a few minutes. A separate variable, `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS`, keeps the old deployment up for a while after the new one goes live.

Readiness and liveness are different questions. `/api/healthz` answers "is the process up?" and checks nothing else; `/api/readyz` answers "should this instance get traffic?" and checks the database. An orchestrator that restarts containers on failed *liveness* must never use a check that depends on the database, or a 40-second database failover becomes every instance restarting at once.

## Blue-green, step by step

Blue-green keeps two complete environments and moves all traffic at once:

| Step | Traffic blue / green | What happens | Gate before the next step | Rollback |
|---|---|---|---|---|
| 1. Deploy green | 100 / 0 | green starts at full size from the same digest | every green instance ready | delete green |
| 2. Verify | 100 / 0 | smoke tests and synthetic transactions hit green's private address | smoke suite green | delete green |
| 3. Warm | 100 / 0 | replayed or synthetic load fills caches, JIT and connection pools | green p99 under load within target | delete green |
| 4. Switch | 0 / 100 | the router sends new requests to green; blue drains | error rate and p99 for 15–30 min against the pre-switch level | switch back, in seconds |
| 5. Retire | 0 / 100 | blue scales down or becomes the next idle colour | none | redeploy the old digest |

```viz
{"type": "system", "algorithm": "blue-green", "title": "Blue-green: verify idle, switch atomically", "caption": "The new version is tested at full size before it sees users. Rollback is a router change, not a redeploy. Both colours share the database, so the schema must suit both."}
```

The costs are double capacity during the switch and all-at-once exposure: a bug that only real traffic triggers reaches 100% of users until someone switches back. Step 4 also compares green with *blue's past*, not with a concurrent control, so a traffic spike during the watch window looks like a regression. And the "atomic" switch is atomic for new requests only: an L7 proxy routes per request, but an L4 load balancer routes per connection, so keep-alive connections, WebSockets and server-sent event streams stay on blue until they close. Blue must drain before it retires, and both colours usually share one database, so **the schema must work for both versions at once**.

## Canary, step by step

A canary sends a small share of traffic to the new version, compares it with the old version serving *at the same time*, and widens the share only while the comparison stays clean. The plan below is for a service at 1,000 requests per second with a 0.1% error rate and a 180 ms p99; "roll back above" is the error count computed in the next section.

| Stage | Canary share | Window | Canary requests | Expected errors if healthy | Roll back above | Latency gate | Decision |
|---|---|---|---|---|---|---|---|
| 1 | 1% | 10 min | 6,000 | 6 | 13 | canary p99 over 1.2 × baseline p99 | pass → 5% |
| 2 | 5% | 10 min | 30,000 | 30 | 46 | same | pass → 25% |
| 3 | 25% | 10 min | 150,000 | 150 | 186 | same | pass → 50% |
| 4 | 50% | 10 min | 300,000 | 300 | 351 | same | pass → 100% |
| 5 | 100% | 30 min bake | all traffic | | burn-rate alerts | same | done; keep the old digest |

```viz
{"type": "system", "algorithm": "canary", "title": "Canary: widen only while the comparison stays clean", "caption": "Compare the canary with the baseline over the same window, so a traffic spike that slows both does not fail the release. Every promotion repeats the same gate."}
```

Compare against the concurrent baseline, because traffic mix and load change hour to hour; the question is "is v2 worse than v1 right now, on the same traffic?" Compare error rate, latency percentiles (p99, not the mean), saturation (CPU, memory, connection pools) and at least one business metric such as sign-ups or checkouts, because some bugs return 200 with the wrong content. Netflix has described going one step further: it deploys a fresh *baseline* cluster of the old version beside the canary, the same size and at the same time, so long-running production instances (warm caches, grown heaps) do not bias the comparison. Its open-source Kayenta, built with Google for Spinnaker, compares each metric's canary and baseline samples with a Mann-Whitney U test and turns the fraction of passing metrics into a score from 0 to 100 checked against pass and marginal thresholds.

## Sample size decides the stage length

A healthy canary that sees $n$ requests at the baseline error rate $p$ expects $e = np$ errors. Error counts are close to Poisson, with standard deviation $\sqrt{e}$, so a gate that tolerates three standard deviations rolls back when errors exceed $e + 3\sqrt{\max(e, 1)}$; the floor of 1 keeps a stage that expects almost no errors from failing on the first one. Two questions set each stage: how often does a healthy canary fail (false alarm), and how often is a real regression caught (power)?

```python
import math

def poisson_at_least(k, lam):
    """P(X >= k) for X ~ Poisson(lam); fine for lam below about 700."""
    term = cdf = math.exp(-lam)
    for i in range(1, k):
        term *= lam / i
        cdf += term
    return max(0.0, 1 - cdf)

def stage(rps, pct, minutes, base_rate, bad_rate, z=3.0):
    n = rps * pct / 100 * 60 * minutes            # requests the canary sees
    e = n * base_rate                             # expected errors if healthy
    limit = e + z * math.sqrt(max(e, 1))
    k = math.floor(limit) + 1                     # smallest count that fails the gate
    return (round(n), round(e, 1), round(limit, 2),
            round(poisson_at_least(k, e), 4),         # false alarm
            round(poisson_at_least(k, n * bad_rate), 3))  # power

for pct, minutes in [(1, 1), (1, 5), (10, 1)]:
    print(pct, minutes, stage(1000, pct, minutes, 0.001, 0.005))
# 1 1 (600, 0.6, 3.6, 0.0034, 0.353)
# 1 5 (3000, 3.0, 8.2, 0.0038, 0.963)
# 10 1 (6000, 6.0, 13.35, 0.0036, 1.0)
```

For a release that raises errors fivefold, from 0.1% to 0.5%, a 1% canary evaluated after one minute catches it only 35% of the time: 600 requests expect 0.6 errors, the bug produces 3 on average, and the gate needs 4. The same canary needs about 4.4 minutes for 95% power, a 10% canary about 30 seconds. A subtler bug is harder: a regression from 0.10% to 0.18% is caught at 1% for 10 minutes only 20% of the time, at 5% for 10 minutes 85% of the time, and at 25% almost always. Each evaluation raises a false alarm about 0.2–0.6% of the time, and checking the same stage every minute and stopping at the first breach multiplies that by up to the number of looks, so fix the evaluation points in advance or widen $z$. Stage durations are arithmetic, not taste.

## A failed canary, traced

Release v2 fails requests whose `Accept-Language` it mishandles, raising the error rate from 0.10% to 0.18%. The plan is the table above; the baseline error rate stays at 0.1% throughout.

| Clock | Event | Canary requests | Canary errors | Limit | Decision |
|---|---|---|---|---|---|
| 10:00 | router weight 1% to v2 | 0 | 0 | | |
| 10:10 | stage 1 closes | 6,000 | 11 | 13.35 | pass: 11 is inside the noise around 6 |
| 10:10 | router weight 5% | | | | |
| 10:20 | stage 2 closes | 30,000 | 54 | 46.43 | **roll back** |
| 10:20 | router weight 0% for v2 | | | | new requests go to v1 within seconds |
| 10:20–10:22 | v2 instances drain and stop | | | | in-flight requests finish |
| 10:22 | release marked failed; alert carries both counts and the query | | | | |

The counts are typical, not lucky: the power arithmetic above gives this bug an 80% chance of passing stage 1 and an 85% chance of failing stage 2. Exposure was 36,000 requests, of which about 29 failed because of the bug (0.08% of 36,000). Sent to 100% at once, the same bug fails 0.8 extra requests every second, 480 for every ten minutes a signal this weak takes to notice. Rollback took seconds because it was a routing change; no redeploy, no rebuild. The second exercise below turns this gate into code.

## Under the hood: how traffic is split

Weights live in the layer-7 proxy. Envoy's `weighted_clusters`, the Kubernetes Gateway API's weighted `backendRefs` and cloud load balancers' weighted target groups all pick a destination per request, and controllers such as Argo Rollouts and Flagger step the weights and query metrics between steps. A per-request random split sends one user's consecutive requests to different versions. That breaks anything version-coupled: a page rendered by v2 whose next request lands on v1, or a single-page app whose content-hashed assets exist only in the version that built them. Hash the user or session ID into the split instead, so each user sees one version.

This app shows the asset problem without any canary. The React bundle is compiled into the binary, and pages are lazy-loaded chunks with content-hashed names. After a deploy that changed a chunk, a tab opened before it requests `/assets/Dashboard-<old hash>.js`; the new binary has no such file, and `static_handler` falls back to `index.html` as it does for any unknown path, so the import fails as HTML served where JavaScript was expected. Keeping the previous build's assets available for a while, or reloading on Vite's documented `vite:preloadError` event, closes it.

A one-replica service cannot split by instance, but it can canary by **feature flag**: hash the user ID, enable the new path for 5% of users, and compare their error rate with everyone else's.

## Rollback, roll-forward and irreversible changes

Rollback means redeploying the previous artifact. It is fast when artifacts are immutable and retained, and it is the default response to a bad release because it restores service before anyone understands the bug. Decide the trigger before deploying ("roll back if errors exceed the stage limit, or p99 exceeds 1.2 times the baseline for five minutes") and roll forward only when the fix is smaller and better understood than the rollback.

Some changes cannot be undone by redeploying code: a migration that **dropped or rewrote** data, data written in a **new format** the old version cannot read, and **external side effects** such as emails sent or payments captured.

This app adds one more, found by reading the migration library. sea-orm-migration 2.0.3, the library behind the `Migrator::up` call at boot, compares the migrations recorded in `seaql_migrations` with those compiled into the binary and returns an error when the database records one the binary does not know: "Migration file of version 'm0007_integrity' is missing, this migration has been applied but its file is missing". `main.rs` propagates it, so the previous binary exits before binding, the rollback deployment never turns healthy, and the release you were escaping keeps serving. **Rolling back across a migration is impossible by redeploying the old image**; the options are roll-forward, or releasing every migration one deploy before the code that needs it, so that the code release's predecessor already knows the migration (the migration-only release still cannot be rolled back, but it changes no behaviour, so there is nothing to escape). A second trap sits behind the first: before commit `7154e9f` the comment entity read `user_id` as a non-null `Uuid`, and `m0007` made it nullable, so even a patched old binary would fail to decode any comment whose author had deleted their account.

## Migrations when two versions are live

During a rollout, blue-green and any rollback, **old code runs against the new schema**. Renaming a column in one step breaks the old version instantly. Expand and contract spreads the change across releases, each compatible with the one before; here `users.name` becomes `display_name`:

| Release | Migration | Writes | Reads | Live together | Roll back one release? |
|---|---|---|---|---|---|
| R1 expand | add `display_name`, nullable | both columns | `name` | R0, R1 | code: yes; in this app, only if the migration shipped a release earlier |
| backfill job | none | fills `display_name` in batches | | R1 | |
| R2 | none | both | `display_name` | R1, R2 | yes: R1 reads `name`, which R2 still writes |
| R3 | none | `display_name` | `display_name` | R2, R3 | yes; two releases back to R1 is not, since `name` went stale |
| R4 contract | drop `name` | `display_name` | `display_name` | R3, R4 | to R3 only |

Writing both before reading the new column means the backfill only covers rows older than R1. The contract waits longest because it removes the last rollback target.

This repository's conventions, at the top of `migration/src/lib.rs`, are the same discipline in miniature: migrations are **append-only** (production has recorded a shipped migration as applied, so editing it only changes what fresh databases get), and every foreign key declares an `ON DELETE` policy. The comments fix is itself append-only: the original table cascaded on user deletion, which also deleted other people's replies through `parent_id`, and the correction shipped as `m0007_integrity`, not as an edit to `m0004_community`.

Migrating at boot fits one replica. Two limits to raise in review: sea-orm-migration 2.0.3 takes no lock around `up`, so replicas booting together all run the pending migration, and whichever commits second fails on the `seaql_migrations` primary key or on DDL that already ran, then exits and restarts; and a migration longer than the 120-second health window fails the deploy midway, so large-table work (an index on a big table, a backfill) belongs in a separate, online step.

## Let the error budget decide when to ship

A service level objective turns "is it reliable enough?" into arithmetic. With an SLO of 99.9% successful requests over 30 days, the **error budget** is the other 0.1%: at 10 million requests a month, 10,000 may fail. The failed canary above spent 29 of them. The budget is meant to be spent on deploys, experiments and migrations; when it is gone, a written **error budget policy** freezes feature deploys and the team ships only reliability work until the window recovers. [Observability](/learn/system-design/building-blocks/observability) covers SLIs and burn-rate alerts; this exercise is the release gate.

```exercise
id: error-budget-gate
title: An error-budget release gate
prompt: |
  Implement `budget_status(slo, total, failed)` for a release gate.

  `slo` is the target success percentage (for example `99.9`), and `total`
  and `failed` are request counts for the current SLO window. Assume
  `total > 0` and `slo < 100`.

  Return an object with:
  `allowed`: failures the budget allows, `total * (100 - slo) / 100`,
  rounded to 2 decimal places.
  `remaining`: `allowed - failed`, rounded to 2 decimal places (may be negative).
  `consumed_pct`: `100 * failed / allowed`, rounded to 1 decimal place.
  `action`: from the unrounded consumed percentage, `"ship"` below 75,
  `"caution"` from 75 up to (not including) 100, `"freeze"` at 100 or more.
languages: [python, javascript]
entry: budget_status
starter:
  python: |
    def budget_status(slo, total, failed):
        # your code here
        return {"allowed": 0, "remaining": 0, "consumed_pct": 0, "action": "ship"}
  javascript: |
    function budget_status(slo, total, failed) {
      // your code here
      return { allowed: 0, remaining: 0, consumed_pct: 0, action: "ship" };
    }
tests:
  - args: [99.9, 1000000, 400]
    expected: {"allowed": 1000, "remaining": 600, "consumed_pct": 40, "action": "ship"}
  - args: [99.5, 20000, 90]
    expected: {"allowed": 100, "remaining": 10, "consumed_pct": 90, "action": "caution"}
  - args: [99.9, 50000, 80]
    expected: {"allowed": 50, "remaining": -30, "consumed_pct": 160, "action": "freeze"}
    label: budget overspent
  - args: [99.9, 3000000, 0]
    expected: {"allowed": 3000, "remaining": 3000, "consumed_pct": 0, "action": "ship"}
    label: no failures yet
  - args: [99.0, 12345, 100]
    expected: {"allowed": 123.45, "remaining": 23.45, "consumed_pct": 81, "action": "caution"}
    hidden: true
    label: fractional budget
  - args: [99.95, 2000000, 250]
    expected: {"allowed": 1000, "remaining": 750, "consumed_pct": 25, "action": "ship"}
    hidden: true
    label: three and a half nines
hints:
  - "Floating point makes 100 - 99.9 slightly less than 0.1; that is why the outputs are rounded."
  - "Decide the action from the unrounded ratio, then round the numbers you return."
```

The gate does not stop fixes. A frozen team still deploys changes that make the service more reliable, through the same pipeline, canary and rollback machinery as everything else.

## Exercise: a canary promotion gate

The canary plan and the failed trace above become a function. The tests include that trace, a stage with too little data, a latency regression, and a fleet-wide spike that hits both versions.

```exercise
id: canary-gate
title: A canary promotion gate
prompt: |
  Implement `canary_gate(stages, policy)`. `stages` lists, in order, what
  was measured while the canary held each traffic share, for example:

  {"pct": 5,
   "baseline": {"requests": 570000, "errors": 570, "p99_ms": 182},
   "canary":   {"requests": 30000, "errors": 54, "p99_ms": 185}}

  `policy` is {"min_requests": ..., "z": ..., "max_p99_ratio": ...}.
  Baseline requests are always positive and there is at least one stage.

  Evaluate the stages in order. For each stage:
  1. If the canary has fewer than `min_requests` requests, return
     {"decision": "hold", "stage": i, "reason": "insufficient_data"}.
  2. expected = canary requests * baseline errors / baseline requests;
     limit = expected + z * sqrt(max(expected, 1)).
     If canary errors > limit, return "rollback" with reason "errors".
  3. If canary p99 > baseline p99 * max_p99_ratio, return "rollback"
     with reason "latency".
  If every stage passes, return
  {"decision": "promote", "stage": <index of the last stage>, "reason": "ok"}.
languages: [python, javascript]
entry: canary_gate
starter:
  python: |
    import math

    def canary_gate(stages, policy):
        # your code here
        return None
  javascript: |
    function canary_gate(stages, policy) {
      // your code here
      return null;
    }
tests:
  - args: [[{"pct": 1, "baseline": {"requests": 594000, "errors": 594, "p99_ms": 180}, "canary": {"requests": 6000, "errors": 8, "p99_ms": 184}}, {"pct": 5, "baseline": {"requests": 570000, "errors": 570, "p99_ms": 182}, "canary": {"requests": 30000, "errors": 33, "p99_ms": 190}}, {"pct": 25, "baseline": {"requests": 450000, "errors": 450, "p99_ms": 181}, "canary": {"requests": 150000, "errors": 160, "p99_ms": 188}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "promote", "stage": 2, "reason": "ok"}
    label: a healthy release
  - args: [[{"pct": 1, "baseline": {"requests": 594000, "errors": 594, "p99_ms": 180}, "canary": {"requests": 6000, "errors": 11, "p99_ms": 183}}, {"pct": 5, "baseline": {"requests": 570000, "errors": 570, "p99_ms": 182}, "canary": {"requests": 30000, "errors": 54, "p99_ms": 185}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "rollback", "stage": 1, "reason": "errors"}
    label: the failed canary from the lesson
  - args: [[{"pct": 1, "baseline": {"requests": 59400, "errors": 59, "p99_ms": 180}, "canary": {"requests": 600, "errors": 0, "p99_ms": 181}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "hold", "stage": 0, "reason": "insufficient_data"}
    label: one minute at 1% is not enough
  - args: [[{"pct": 1, "baseline": {"requests": 594000, "errors": 594, "p99_ms": 180}, "canary": {"requests": 6000, "errors": 7, "p99_ms": 240}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "rollback", "stage": 0, "reason": "latency"}
    label: latency regression
  - args: [[{"pct": 1, "baseline": {"requests": 594000, "errors": 0, "p99_ms": 180}, "canary": {"requests": 6000, "errors": 2, "p99_ms": 181}}, {"pct": 5, "baseline": {"requests": 570000, "errors": 0, "p99_ms": 180}, "canary": {"requests": 30000, "errors": 4, "p99_ms": 183}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "rollback", "stage": 1, "reason": "errors"}
    hidden: true
    label: a baseline with no errors
  - args: [[{"pct": 1, "baseline": {"requests": 594000, "errors": 594, "p99_ms": 180}, "canary": {"requests": 6000, "errors": 40, "p99_ms": 400}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "rollback", "stage": 0, "reason": "errors"}
    hidden: true
    label: errors are checked before latency
  - args: [[{"pct": 1, "baseline": {"requests": 594000, "errors": 5940, "p99_ms": 900}, "canary": {"requests": 6000, "errors": 70, "p99_ms": 950}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "promote", "stage": 0, "reason": "ok"}
    hidden: true
    label: a spike that hits both versions
  - args: [[{"pct": 1, "baseline": {"requests": 594000, "errors": 594, "p99_ms": 180}, "canary": {"requests": 6000, "errors": 5, "p99_ms": 182}}, {"pct": 5, "baseline": {"requests": 57000, "errors": 57, "p99_ms": 180}, "canary": {"requests": 900, "errors": 1, "p99_ms": 185}}], {"min_requests": 1000, "z": 3, "max_p99_ratio": 1.2}]
    expected: {"decision": "hold", "stage": 1, "reason": "insufficient_data"}
    hidden: true
    label: the second stage is still filling
hints:
  - "Compute the baseline error rate from the baseline's own counts in the same stage, never from an earlier stage."
  - "The floor inside the square root means a stage expecting almost no errors still tolerates up to z of them."
```

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A burst of 502s or reset connections at every deploy | The old instance is killed with requests in flight: draining time of 0 s, or no SIGTERM handler | Handle SIGTERM and drain; set the platform's grace period above the slowest request |
| Rollback deployment never turns healthy after a release with a migration | The old binary's migrator finds an applied migration it does not know and exits (this app: "Migration file ... is missing") | Roll forward; ship migrations one release before the code that needs them |
| Canary passed, full rollout fails | Stages too short to detect the regression, a missing business metric, or a load-dependent bug (pool exhaustion, cache stampede) | Size stages with power arithmetic; gate on saturation and business metrics; keep a 50% stage |
| Deploy fails after two minutes; the new instance's last log line is "running migrations" | A migration outran the 120 s health window | Move long DDL and backfills to a separate online step |
| Users see a broken page after a deploy until they reload | Stale tab requests a content-hashed chunk the new build does not have | Serve previous assets for a while; reload on `vite:preloadError` |
| Pipeline time doubles for one commit | Cache miss: `Cargo.lock` changed, or the cache was never exported because the run that would have written it was cancelled | Expect it for dependency bumps; on `main`, let runs finish (`cancel-in-progress` only for pull requests) so the cache gets written |
| Works in staging, fails in production | Configuration differs and is only read on first use | Validate every setting at boot so the health check fails instead |

## Trade-offs

| Strategy | Extra capacity | Exposure if bad | Rollback time | Schema constraint | Needs |
|---|---|---|---|---|---|
| Recreate (stop old, start new) | none | 100%, plus downtime | a full redeploy | none during the gap | tolerance for downtime |
| Rolling | one surge instance | grows batch by batch | a reverse rolling update | old and new together | readiness checks |
| Health-gated replace (this app) | one instance during overlap | 100% once healthy | redeploy; not across migrations here | old and new together | a readiness endpoint that checks dependencies |
| Blue-green | 2x during the switch | 100% at once | seconds | both colours on one schema | a router and double capacity |
| Canary | small | the stage's share | seconds | old and new together | weighted routing, metrics, a gate |
| Feature flag | none | the flag's share | seconds, no deploy | the code handles both paths | a flag service and flag hygiene |

## Interviewer follow-ups

**"How long should each canary stage run?"** Model answer: long enough for the stage's request count to detect the regression you care about: expected errors at the baseline rate, a limit a few standard deviations above, then the power against the smallest regression you must catch; for a fivefold one at 1,000 rps, a 1% stage needs about 4.4 minutes and a 10% stage about 30 seconds. Common wrong answer: "five minutes per stage", regardless of traffic.

**"The release passed the canary and an hour later errors climb. Roll back or roll forward?"** Model answer: roll back if the release is reversible (no contract migration, no new data format, no external side effects) and the trigger says so; roll forward if the fix is smaller and better understood, or if a migration makes rollback impossible, as it does for this app's migrator. Common wrong answer: "always roll back", without checking what the release changed in the database.

**"Rename a column with zero downtime."** Model answer: expand, dual-write, backfill, switch reads, stop writing, contract, one release each, checking at every step which two versions can be live and that the previous release still works on the schema. Common wrong answer: one migration during a quiet hour, which breaks the version still serving the moment it runs.

**"Engineers bypass a 25-minute pipeline. What do you do?"** Model answer: measure the critical path per job and step, as above; cache dependencies and browsers, parallelise independent suites, question `needs` edges that only save compute, and move slow suites to a post-merge lane only when a gate still covers the risk. Common wrong answer: bigger runners, which rarely fix a cache miss or a serial dependency chain.

## What mid-level engineers get wrong

- **Rebuilding per environment.** Production runs an image nobody tested.
- **A 1% canary for five minutes, then 100%.** The first stage cannot see anything smaller than a gross failure, and the jump to 100% skips every stage that could.
- **Comparing the canary with yesterday.** Daily traffic patterns become false alarms or hide regressions.
- **Assuming rollback is always available.** A contract migration, a new data format or, in this app, any new migration removes it.
- **Graceful shutdown code without the platform setting.** With 0 seconds of draining the handler starts and is killed at once.
- **Readiness that only says "the process is up".** Traffic moves to an instance that cannot reach its database.
- **Flags that never die.** Each forgotten flag doubles the code paths someone must reason about.

## Senior signals

- You argue for **smaller, more frequent deploys** and explain why batch size drives both failure rate and time to diagnose.
- You read a pipeline as a **critical path** with measured steps, and you know what a cache miss and a cancelled run cost.
- You insist on **build once, promote the digest**, and on end-to-end tests against the built artifact.
- You distinguish **liveness from readiness**, and you check the platform's **drain setting** instead of trusting the shutdown handler.
- You pick **blue-green or canary** from the failure you fear, and size canary stages with **sample-size and power arithmetic**.
- You know which changes are **irreversible**, including the ones your migration tool makes irreversible, and you run schema changes as **expand and contract** because two versions always share the database for a while.

## Check yourself

```quiz
- q: >-
    A team rebuilds the Docker image from the same Git commit when promoting from staging to production. What is the risk?
  options: ["Production images must have debug symbols stripped, so a rebuild is needed anyway", "None, because one commit always builds a byte-identical image on any machine", "Only speed; rebuilding repeats work but yields the same tested artifact", "The rebuilt image can differ from the tested one, via a moved base tag or dependency"]
  answer: 3
  explanation: >-
    Builds are not reliably reproducible: base image tags move to new digests, and dependency resolution and caches change. Promoting the exact digest that passed tests is the only way to know production runs what you tested; frozen lockfiles narrow the gap but do not pin the base image.
- q: >-
    This app runs migrations before binding the port and Railway gates traffic on /api/readyz. A new release contains a migration that fails. What happens?
  options: ["The process exits non-zero, never turns ready, and the old deployment keeps serving", "The platform rolls the database back to its previous state and retries the deploy", "The new version starts anyway and serves traffic against the old, unmigrated schema", "Both versions share traffic until someone intervenes and picks which one to keep"]
  answer: 0
  explanation: >-
    Because migrations run before the listener binds, a failed migration means the process never becomes ready, so traffic never moves. Nothing rolls the database back for you; sea-orm-migration runs each Postgres migration in a transaction by default, which is why a failed one leaves no partial schema or record here.
- q: >-
    A service handles 1,000 requests per second with a 0.1% error rate. A release raises errors to 0.5%. With a 1% canary and a gate at expected errors plus three standard deviations, evaluated after one minute, how often is the regression caught?
  options: ["About half the time, because the gate compares against a coin flip", "Almost always, because a fivefold increase is far outside the noise", "About a third of the time, because 600 requests expect 0.6 errors", "Never, because a 1% canary cannot detect any error regression at all"]
  answer: 2
  explanation: >-
    The canary sees 600 requests; a healthy one expects 0.6 errors and the gate trips at 4. The broken release produces 3 on average, so it trips only about 35% of the time. A fivefold ratio sounds decisive, but with counts this small it is not; the same stage needs about 4.4 minutes for 95% power, and a 10% stage about 30 seconds.
- q: >-
    You roll this app back to the previous image after a release whose only schema change was adding a nullable column. What happens?
  options: ["The old binary refuses to boot because the database records a migration it lacks", "The old binary runs the migration's down step at boot and then serves traffic", "Railway reverts the migration before starting the old image, then routes traffic", "The old binary starts and ignores the new column, which is the point of expand"]
  answer: 0
  explanation: >-
    sea-orm-migration 2.0.3 errors when seaql_migrations records a migration the binary does not contain, and main.rs exits on that error, so the rollback never passes the health check and the newer release keeps serving. The schema itself would have been compatible; the migrator's check is what blocks it. Shipping each migration one release before the code that needs it keeps a rollback target that knows it.
- q: >-
    You need to rename a column that the current release reads and writes. Which plan keeps every deploy reversible?
  options: ["Rename the column during a maintenance window when no traffic reaches the database", "Add the new column, dual-write, backfill, switch reads, then drop the old one later", "Create a view with the new name over the table, then rename the table beneath it", "Ship a single migration that renames the column together with the matching code change"]
  answer: 1
  explanation: >-
    Expand and contract keeps the schema compatible with the two releases that can be live at every step, so overlap and a one-release rollback are safe. A one-step rename, with or without a maintenance window, breaks whichever version expects the other name the moment it runs.
- q: >-
    Railway documents a default of 0 seconds for RAILWAY_DEPLOYMENT_DRAINING_SECONDS. What does that mean for this app's graceful shutdown?
  options: ["SIGKILL follows SIGTERM at once, so draining and the 30-second task wait never get to run", "Nothing, because Railway waits for open connections to close before it stops a deployment", "Shutdown is skipped entirely, so the process exits cleanly without receiving any signal", "The old deployment keeps serving for 0 seconds, but in-flight requests are moved to the new one"]
  answer: 0
  explanation: >-
    The draining setting is the time between SIGTERM and SIGKILL. With 0 seconds, requests in flight and background AI replies are cut off even though main.rs handles SIGTERM correctly. The fix is a value in the reviewed file above the slowest legitimate request plus the task wait.
```
