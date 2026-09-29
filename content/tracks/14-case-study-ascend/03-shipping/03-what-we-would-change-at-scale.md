---
slug: what-we-would-change-at-scale
title: "What we would change at scale: a design review of Ascend"
description: A candid design review of this codebase at 10k and 100k daily users, covering multi-replica rate limiting, the real AI cost model, table growth and retention, observability and SLOs, server-verified submissions and a grading service, content hot-reload, what the review's fixes closed, and a ranked list of what is still open.
minutes: 40
difficulty: expert
tags: [case-study, design-review, scalability, cost-modelling, observability, slo, rate-limiting, data-retention]
---
Every system has a scale at which its current design stops being the right one. The senior skill is not to build for that scale on day one; it is to know where the limits are, in what order they will be hit, and what the first move is when each one arrives, so that growth is a sequence of planned changes rather than a sequence of incidents.

This lesson is the design review of the codebase you have been reading. It assumes two futures, 10,000 and 100,000 daily active users (DAU), and asks what breaks, what costs too much, and what is merely unobservable. Every number is derived from the code or the deployment config, with the assumptions stated, so you can redo the arithmetic with your own.

## Where the system stands

| Property | Today | Source |
|---|---|---|
| App servers | 1 API replica, 2 once the `PHASE_2` flag moves grading to its service; stateless except a loose per-IP bucket kept in memory on purpose | `.railway/railway.ts`, `middleware/rate_limit.rs` |
| Database | One Postgres, 50 GB volume, `DATABASE_POOL_MAX` 15 per replica with a boot-time budget check; hourly retention | `railway.ts`, `state.rs`, `services/retention.rs` |
| Hot reads (curriculum, lessons, problems) | From memory, never touch Postgres | `content/` loader, ETags |
| AI | `claude-opus-5-5`; per user per UTC day, 150 requests, 120,000 output tokens and 2,000,000 billed input tokens (a default; cache writes count 1.25x, reads at the model's price, 0.05x here), each call's worst case held before it runs; 20 model calls per minute per session | `railway.ts`, `config.rs`, `ai/budget.rs` |
| Code execution | In the browser for feedback; graded again on the server in WebAssembly, whose verdict is the one stored, by a separate `grader` service (2 replicas of 2 slots) | ADRs 0003, 0005 and 0006 |
| Observability | JSON logs; metrics and 20%-sampled traces pushed over OTLP to Prometheus and Jaeger; three SLOs with burn-rate alerts; Grafana | `telemetry.rs`, `docs/SLO.md`, `ops/` |
| Deploys | Push to `main`, build on Railway once CI passes, readiness-gated | `railway.ts` |

The architecture document's own scaling note is right about the shape: "Postgres is the bottleneck long before the app servers; the hot read paths (curriculum, lessons, problems) never touch it." The curriculum is served from memory with ETags, so 100x more readers is mostly a bandwidth problem. The interesting pressure points are elsewhere: the AI bill, the write-heavy tables, grading CPU and, until the latest round of changes, the fact that nobody could see any of it.

## Rate limiting with more than one replica

### Before: every bucket in process memory

The first review found every bucket in `governor`, in process memory. Right for one replica; add a second and each keeps its own buckets, so the effective limit is N times the configured one: an attacker guessing one learner's password at 10 per minute per replica gets 30 per minute against three.

The review proposed Redis, a Lua script per check, and degrading to local shares (limit ÷ N) when Redis is down, because failing closed would turn a cache outage into a site outage.

### After: GCRA in the database every replica already shares

What shipped in `427ed78` kept the seam and changed the store. The security-relevant buckets are GCRA state in Postgres, one theoretical arrival time per key in an `UNLOGGED` `rate_limits` table, checked and advanced by one conditional upsert ([Authentication and security](/learn/case-study-ascend/the-system/authentication-and-security) traces it), and `replicas_share_the_security_limits` spends one allowance across two routers over one database.

The store changed the failure decision. Postgres was already shared, and the requests these buckets guard need it anyway, so the shared limiter fails closed with a 503: refusing costs nothing a Postgres outage had not already cost. The 1,200-a-minute general bucket stays in memory per replica on purpose, since it only stops one client flooding cheap reads.

```viz
{"type": "system", "algorithm": "token-bucket", "requests": 12, "title": "What each key needs, wherever it lives", "caption": "A bucket per key with a capacity and a refill rate. GCRA is the same meter kept as one timestamp, which is what lets a single conditional upsert check and update it."}
```

The per-user AI budgets never needed to move: they live in Postgres, under the day row's lock. Connections were the last prerequisite, and `3658224` made them explicit: `DATABASE_POOL_MAX` (default 20, 15 in production), and a boot check that warns when a replica's pool would leave under 10 of `max_connections` spare. A default Postgres allows 100 ("typically 100", per the documentation), and a rolling deploy briefly doubles the replicas, so two replicas peak at 4 × 15 = 60; past about four, PgBouncer in transaction mode is still to do.

## The AI cost model

Prices for the configured model, `claude-opus-5-5`: $4 per million input tokens, $20 per million output tokens, cache writes at 1.25x input ($5), cache reads at 0.05x ($0.20). Thinking tokens bill as output.

### What the budget actually bounds

ADR 0004 says: "The worst-case daily cost is bounded by (active users) x (daily budgets): requests, billed input tokens and output tokens, each checked before a call." For most of this review's life that was true only up to an overshoot. The limits were checked before a call and the call charged after it, so with calls sequential the most output one user could generate in a day was

$$\min(150 \times M,\; 120{,}000 - 1 + M)$$

where $M$ is the call's `max_tokens`: 123,999 tokens for the coach ($M = 4{,}000$), **$2.48 per user per day**, and concurrent calls each added their own $M$. The exercise at the end computes that bound. Since `bd0dcf0` every call holds its worst case first, under the day row's lock, with `max_tokens` lowered to what is left, so the overshoot term is gone: at most 120,000 output tokens, **$2.40 per user per day**, $24,000 a day if all 10,000 DAU maxed out and $240,000 at 100,000.

Input had a longer history. When the review was first written, input was not budgeted at all, and in a chat product input is where the tokens are: a system prompt of up to roughly 10,000 tokens and up to 30 history messages can put roughly 100,000 input tokens in every request; at 150 requests, 15 million a day, uncounted.

The AI hardening commit (`1d3da0c`) then added a daily input limit and conversation caching together, and they interacted: the limit compared against `input_tokens`, the *uncached* remainder, while caching moved nearly every input token into cache reads and writes. A client that sent different editor contents with every message could make each request a near-complete cache write: 15 million tokens at $5 per million, **$75 per user per day**, checked against nothing. The fuse had moved from "not metered" to "metered in the wrong column".

Commit `22e4321` put it on the right wire: the limit counts *billed* input, `input_tokens + cache_write_tokens * 5 / 4 + cache_read_tokens / d`, where the divisor is 20 on Opus 5.5 since `ac7532b` (a flat 10 before, which counted its 0.05x reads twice over). Every billed unit now costs exactly the $4-per-million input price, so with holds a learner's day holds at most 2,000,000 of them, $8.00, and with $2.40 of output the worst day is **$10.40 per user**: about $104,000 a day if all 10,000 DAU maxed out, $1.04 million at 100,000. Two things still escape it: the input hold is an estimate (a token per three bytes plus framing, weighted as a cache write), so a request that tokenises more densely settles above its hold; and a change of model or price moves every figure, because the limit is in weighted tokens rather than money.

### What a normal day costs

Worst cases size the fuse; typical cases size the bill. Assume an engaged AI user has 15 coach turns a day in one dock conversation, each within five minutes of the last; an 8,000-token prompt before the history (a 2,000-token stable block and a 6,000-token context block); each turn adds a 100-token question and a 1,000-token reply to the history; and 1,000 output tokens per turn including thinking. With the current caching, turn 1 writes its whole prompt, and every later turn reads everything up to the previous turn and writes only the new reply and question (15 turns is 29 messages, one inside the 30-message history window, so the window never moves in this example):

| Per day, 15 turns | Tokens | Cost |
|---|---|---|
| Cache writes (turn 1's prompt, then 1,100 new tokens per turn) | 23,500 × $5/M | $0.118 |
| Cache reads (the prefix up to the previous turn) | 213,500 × $0.20/M | $0.043 |
| Output including thinking | 15,000 × $20/M | $0.300 |
| **Total** | | **≈ $0.46** |

For comparison, with the old single-breakpoint caching the same profile would cost about $0.83 a day at today's prices, most of it the history re-sent uncached on every turn. If 20 percent of DAU use the coach on a given day:

| DAU | AI users per day | Per day | Per 30 days |
|---|---|---|---|
| 10,000 | 2,000 | ≈ $920 | ≈ $27,600 |
| 100,000 | 20,000 | ≈ $9,200 | ≈ $276,000 |

For a free product that is the whole problem in one table (the general method is in [Capacity planning and cost](/learn/system-design/senior-design-skills/capacity-planning-and-cost)). With the history cached, output is now two thirds of the bill. The levers, in the order a cost review would take them (free wins before quality trade-offs):

1. **Budget in money, not tokens.** Pricing every token class per call from a table keyed by model, and capping each user at, say, a dollar a day (above the typical day, far below the worst), would survive a change of model or price. The data is there: since `m0006`, `ai_usage` stores cache reads and writes beside input and output.
2. **Tune effort and `max_tokens` per product.** Output dominates now, and thinking bills as output. A coach turn at lower effort is cheaper, and most answers need far less than 4,000 tokens.
3. **Keep the history cached when context changes.** The context block sits before the history, so when the progress line changes the whole history is written again at 1.25x; sending changed context as a message after the history keeps the cached prefix intact.
4. **Route by stakes, measured.** Routing short factual questions and titles to a smaller model is a lever, with two caveats cost reviews miss: caches are per model, so routing splits cache reuse, and the minimum cacheable prefix differs (512 tokens on Opus 5 and 5.5, 4,096 on Haiku 4.5).
5. **A global spend breaker.** Sum today's priced usage across all users; above a threshold, flip AI features into the existing `AiDisabled` path and page someone.

```viz
{"type": "system", "algorithm": "circuit-breaker", "requests": 16, "title": "A breaker for spend as well as for errors", "caption": "The same state machine protects the bill: closed while spend is under the daily threshold, open (AI disabled, graceful message) when it is crossed, half-open the next day."}
```

## Database growth and retention

The tables that grow are the ones written per action. Estimates at 10,000 DAU, with assumptions stated:

| Table | Rows per day | Bytes per row (assumed) | Per day | Per year |
|---|---|---|---|---|
| `submissions` (every Run by a signed-in user stores the code and per-test results) | 10,000 × 15 runs = 150,000 | ~2 KB | ~300 MB | ~110 GB |
| `messages` (2 rows per coach turn) | 2,000 × 20 × 2 = 80,000 | ~1.5 KB | ~120 MB | ~44 GB |
| `interviews` (JSONB transcript, a new row version on every append) | ~500 | ~40 KB final | ~20 MB live, several times that in dead tuples | ~7 GB live |
| `ai_usage` | ~2,000 | tiny | negligible | negligible |
| `activity_days` | ~10,000 | tiny | negligible | negligible |

Multiply by ten for 100,000 DAU. Two conclusions stand out. At about 440 MB a day, the 50 GB volume fills in roughly four months at 10,000 DAU (the usage alerts in `railway.ts` will fire first, which is what they are for), and the biggest table is not the AI one: it is `submissions`, because every press of Run is stored, solutions and failed attempts alike, and most snippets are too small for Postgres to compress automatically. And the interviews table's cost is churn, not size: every append writes a new row version of the whole transcript, which becomes vacuum work.

The review's retention design was: decide what each row is for (a submission serves "solved" status, the editor's latest code and a little history), keep the best and latest per target, prune the rest, skip a run whose code hash matches the previous one, and partition `submissions` and `messages` by month so retention is a `DROP` of an old partition: instant, no dead tuples, no vacuum debt, little WAL ([Partitioning and sharding](/learn/databases/storage-and-scale/partitioning-and-sharding)).

What shipped in `531f48d` took the first half. `services/retention.rs` keeps submissions 180 days, except each learner's latest attempt and latest pass per target, coach conversations 365 days after their last message and interviews 365 days after they start, the periods the new privacy page promises. It deletes in batches of 5,000, at most 20 per kind per hourly round, inside a transaction holding an advisory lock so one replica runs it. That is the bulk `DELETE` the review warned about, made gentle; partitions remain for scale. Redo the arithmetic, because retention bounds growth without making it fit: 180 days × 300 MB is about 54 GB of submissions at 10,000 DAU, and 365 × 120 MB about 44 GB of messages, twice the 50 GB volume at steady state. The period, a hash dedupe or object storage must change before that traffic arrives. Two items stay open: transcripts as rows (the SQL append removed the lost update, not the churn) and a data export beside self-service deletion.

## Observability, metrics and SLOs

### Before: logs only

Until `3658224` the telemetry was one structured log line per request with a request ID, plus warnings from the AI path. That answers "what happened to this request" if you already know which one; it cannot answer "is the coach slower than yesterday", "what is our cache hit rate" or "are we within budget this month". The review's plan was traces with child spans for the database, grading and the model call; metrics for routes, AI tokens and cost per product, stream outcomes and grading queues, plus a browser beacon; and SLOs with burn-rate alerts, for example 99.9 percent availability over 30 days (an error budget of 43.2 minutes).

### After: pushed metrics, sampled traces, three SLOs

`3658224` and `d3e239b` shipped most of it. Every replica pushes metrics over OTLP to Prometheus, labelled with its replica id and build: `http.server.request.duration` by route template and status, grading runs, duration and queue wait, AI tokens by class, budget decisions and time to first token, rate-limit refusals, retention deletes, emails, and pool and grading-slot gauges. Traces go to Jaeger, a fifth of requests sampled at the root. `docs/SLO.md` sets 99.5 percent availability over 30 days, 95 percent of ordinary API requests under 250 ms and 95 percent of grading under 5 s, with fast (14.4×) and slow (6×) burn-rate alerts ([Build and deploy](/learn/case-study-ascend/shipping/build-and-deploy) works the numbers). Note the target it chose: 99.5 percent, 3.6 hours a month, not the review's 99.9, because the SLO document calls that "honest for one region, one Postgres primary and a small team". An unmeetable SLO trains people to ignore the page.

What is still missing is where this review's cost story lives: tokens are counted by class but not priced per product, nothing counts stream outcomes (completed, disconnected, upstream error, persistence failed), spans stop at the request with no child for the model call or the database, the browser reports nothing, and Jaeger keeps traces in memory, so a restart loses them. See [Observability](/learn/system-design/building-blocks/observability) for the general method; the point for this codebase is that its cost weaknesses were invisible *because* there were no metrics, and a token counter by class is what would have shown the unbudgeted cache writes without reading the code.

## Server-verified submissions: priced, then built

The first review took ADR 0003's closing line as the trigger ("Leaderboards or competitive features would need server-side verification") and priced two options. Verifying every run at 100,000 DAU with 15 runs each means 1.5 million sandboxed executions a day, about 17 per second on average and perhaps five times that at peak; at roughly one vCPU-second per run in a container sandbox, that is on the order of 90 busy vCPUs at peak. Verifying only "submit for credit" was a fifteenth of that, so the review recommended it.

ADR 0005 verifies every signed-in run instead, because the unit price changed, not the method: on the development machine a WebAssembly CPython starts in about 0.09 s with a precompiled standard library, QuickJS in about 0.02 s. Redo the arithmetic assuming 0.1 to 0.2 CPU-seconds per run (start-up plus small tests): 87 runs a second at peak needs roughly 9 to 17 busy cores, a few replicas rather than a fleet. ADR 0005 named the next step, a grading service behind the same interface, and `c0b3151` built it: `ascend-api --serve-grader`, no secrets, reached over the private network with a new connection per request and one retry on a busy replica. At `GRADER_SLOTS` of 2 per replica, those 9 to 17 cores are 5 to 9 grader replicas, added in `railway.ts` when `GraderSaturated` fires, without touching the API or its database connections. Skipping a run whose code matches the previous one would save a grading run as well as a row. Price both options, and re-price when the technology under one of them changes.

## Content hot-reload

A lesson typo costs a deploy of about a minute, which keeps every guarantee in module 1. When non-engineers edit daily, the design that keeps them: CI validates a content bundle with the same strict loader, publishes it to object storage with its fingerprint, and each replica polls for a new version and swaps an `Arc<Curriculum>` atomically (an `ArcSwap`), recomputing the content ETag with it (today `AppState::build` computes it once, at boot). The new problems are real: during a rollout two replicas may serve different content versions, so ETags flap and a lesson can change between page loads; and a bundle may need code the running binary lacks, so bundles must declare a minimum binary version. Build it only when someone needs it.

## Known weaknesses, ranked

Keep both lists: the fixed one is evidence the review was worth doing, and most of its rows are a before and after told in an earlier lesson.

| Fixed since the first review | Where | The fix |
|---|---|---|
| Budget: check and increment in two statements; input unbudgeted, then counted in the wrong column; no retry time; overshoot by calls in flight | `ai/budget.rs` | One conditional upsert; billed input, reads at the model's price (`22e4321`, `ac7532b`); `Retry-After`; holds under the row lock (`bd0dcf0`) |
| One cache breakpoint; history never cached, its window sliding every turn | `ai/coach.rs` | Stable block, context block, cached conversation; a window that moves in steps of ten |
| Limiter maps never pruned; a class behind one NAT throttled; buckets per process; an owner's password allowance spendable by anyone | `rate_limit.rs` | Hourly pruning; per-session and per-account keys; GCRA in Postgres; known devices (`427ed78`) |
| No idle sign-out; ten-character passwords with no breach check | `auth/` | `SESSION_IDLE_DAYS` (`427ed78`); 15 characters and Pwned Passwords screening (`acab135`, `0897111`) |
| Streaks from a mutable column, in UTC days; deletion cascaded into others' comments | `m0007`, `m0011` | `activity_days` in the learner's time zone (`0203d76`); `ON DELETE SET NULL` |
| Results self-reported; then four copies of the comparison rule, and exercises no server had graded | `crates/grader` | Graded on the server in WebAssembly (`25fd477`); one `compare.js` and 1,430 reference solutions in CI (`e47282a`, `f29c337`) |
| One replica grading in-process; no metrics, traces or SLOs; rows kept forever; no password reset | `railway.ts`, `telemetry.rs`, `retention.rs`, `auth/` | A grading service (`c0b3151`); OTLP metrics, traces, SLOs (`3658224`, `d3e239b`); retention (`531f48d`); reset links (`39052ce`) |
| Transcripts: read-modify-write, replies landing after or during a grade, racing finishes, an orphaned grade stuck on a spinner | `interviews.rs` | One SQL append; status guards; `grading` before the grader runs (`c4c5de7`); "Grade again" (`7066802`) |
| Coach lock UI-only; deploys not waiting for CI | `coach.rs`, `railway.ts` | A 409; `checkSuites: true` |
| No drain, a 0 s drain window, then no test of either | `serve.rs`, `railway.ts` | A `TaskTracker`, 60 s window, 25 s and 30 s bounds (`8f82820`); `shutdown.rs` and a graceful stop in CI (`95b6623`) |
| Migrations raced; rollbacks could not boot | `migrate.rs` | An advisory lock; booting behind the schema |
| Movable tags; upkeep by hand; smoke tests absent, then on a debug build; AI routes and the crawl untested in CI | `ci.yml`, `tests/ai.rs` | Pins by SHA and digest; auto-merge after CI (`040cf0a`); smoke on the production image (`8861312`); a stub model (`70f15c7`); a nightly crawl (`6e8d69a`) |
| Provider error text shown; stale Python globals; SSE split on `\n` only; generators rewrote their frames | several | Classified messages; a fresh namespace; spec line endings (`527d3d1`); `frames-immutable.test.ts` (`7066802`) |

What is still open, ranked, with the symptom each would show and how you would find it:

| Rank | Weakness | Symptom | Diagnosis | Fix |
|---|---|---|---|---|
| 1 | No global spend cap | The monthly bill arrives far above the typical-day model | Nothing aggregates priced usage across users | A spend breaker into the existing `AiDisabled` path |
| 2 | Budgets in weighted tokens, not money | A model or price change silently moves every bound | Compare `ai_usage` with the invoice | Price each token class per call from a table keyed by model |
| 3 | Railway builds its own image (`railway.ts`) | Production fails in a way CI never saw | The running image's digest matches nothing CI tested | Push CI's image and deploy that digest |
| 4 | Retention's bound exceeds the volume at 10,000 DAU | The volume alerts at 80 percent | Size `submissions` and `messages` against their periods | Shorter periods, dedupe, partitions or object storage |
| 5 | AI cost invisible per product; no stream outcomes; traces lost on restart | A dearer coach or lost replies go unnoticed | Tokens are counted by class only; Jaeger is in memory | Priced counters, an outcome counter, persistent traces |
| 6 | No pooler | A deploy past about four replicas exhausts connections | The boot check warns below 10 spare | PgBouncer in transaction mode |
| 7 | Readiness checks only the database (`routes/health.rs`) | A revoked AI key goes live with `ai: true` | Every coach call fails after a green deploy | Boot-time key probe |

## The plan, in order

1. **Cost safety now**, whatever the traffic: a global spend breaker, and the per-user limit moved from weighted tokens to money before a second model arrives.
2. **Before 10,000 DAU**: effort and `max_tokens` tuning per product, priced AI metrics and stream outcomes, retention periods that fit the volume (or partitions), and deploying the tested image by digest.
3. **Past a few replicas**: switch `PHASE_2` on, add grader replicas as `GraderSaturated` asks, PgBouncer past about four API replicas, and canary releases on the per-replica metrics that now exist.
4. **When the product changes**: server-only tests if contests arrive, content hot-reload for non-engineer authors.

Notice what is *not* on the list: splitting the monolith, sharding Postgres, moving the SPA to a CDN. At 100,000 DAU the constraints are money, data growth and visibility, and each has a specific fix that does not require a rewrite.

## What to test more, at scale

- **Load-test the streaming path**: a thousand concurrent streams on one instance, measuring memory per stream, time to first token, and what the platform's proxy does to long-lived responses.
- **Chaos on persistence**: kill the database connection mid-stream and verify the reply is retried or at least counted as lost in a metric; today `finish_turn` failing is a log line.
- **Rollback compatibility**: run the *previous* release's API integration tests against the *new* schema before deploying. It is a direct, automatic check of expand/contract discipline.
- **A grader replica killed mid-run.** The API retries once on a refused connection or a 503, but a connection reset mid-request is not retried, so today the learner would see an error; the test decides whether that is acceptable.

## Interviewer follow-ups

**"What breaks first at 100 times the users?"** Model answer: sort by incorrect before slow. What was incorrect across replicas is fixed (locked migrations, shared limits and budgets, a budgeted pool, a separate grader), so connections meeting `max_connections` past four replicas come first. But the binding constraints at 100,000 DAU are money (about $9,200 a day of typical AI use) and data growth (retention still leaves about 54 GB of `submissions` at 10,000 DAU against a 50 GB volume). Serving lessons stays cheap, because they come from memory. Common wrong answer: "Postgres", or "Rust will handle it", with no number attached.

**"Is the AI spend bounded?"** Model answer: per user, yes: $2.40 of output and $8.00 of billed input, $10.40 a day at worst, and since holds are taken before each call nothing in flight can overshoot it (bar an input estimate that runs low). In total, no: the per-user fuse times 100,000 users is over a million dollars a day, which is why a global breaker and a money-denominated budget come first on the plan. Common wrong answer: "the budget caps the cost", which confuses a per-user fuse with a bill.

**"Would you split this into services?"** Model answer: only where a boundary buys something, and Ascend split exactly one. Grading scales on CPU rather than requests, and it runs untrusted code, so a service with no secrets gains isolation too; ADR 0006 accepts a network hop and a retry for that. None of the other constraints (money, data growth) is solved by a network boundary. Common wrong answer: "microservices scale better", answering a question the numbers do not ask.

**"How would you know the coach got slower after a deploy?"** Model answer: `ascend_ai_first_token_seconds` is a histogram, and every replica labels its metrics with its build, so compare p95 before and after the deploy in Grafana. It is deliberately not an SLO, because most of that time is the provider's. What you still could not see is replies lost or cut short, since nothing counts stream outcomes. Common wrong answer: "check the logs", which hold no such number.

## What mid-level engineers get wrong

- **Sizing the bill from the fuse, or the fuse from the bill.** The worst case sizes the per-user limit; typical use times adoption sizes the budget.
- **Proposing a rewrite where the constraint is money or data.** Microservices do not make tokens cheaper or tables smaller.
- **Choosing a limiter's store without deciding what happens when it is down.** Failing closed on a cache is an outage and failing open is no protection; failing closed on the database the request needs anyway costs nothing.
- **Deleting old rows in bulk.** Dead tuples, vacuum debt and WAL for every row; dropping a monthly partition costs almost nothing.
- **Pricing tokens without their cache class.** Reads at 0.05x and writes at 1.25x move a conversation's cost by a factor of two either way.
- **Scaling out before you can see.** Without metrics, the second replica's effect on limits, pool and cost is a guess.

## Exercise

```exercise
id: daily-cost-bound
title: Compute the daily AI cost bound before budget holds
prompt: |
  Implement `daily_cost_bound_cents(users, daily_requests, daily_input_tokens,
  daily_output_tokens, max_input_tokens, max_tokens, input_cents, output_cents)`:
  the worst-case daily spend the budget allowed before budget holds, when
  every limit was checked before a call and charged after it, in whole cents
  rounded up, if every user maxes out their budget. (With holds the
  `- 1 + max_tokens` overshoot terms disappear.)

  - A user may start a call while they have used fewer than `daily_requests`
    requests, fewer than `daily_input_tokens` billed input tokens and fewer
    than `daily_output_tokens` output tokens. Calls are sequential. Each call
    bills up to `max_input_tokens` input tokens and writes up to `max_tokens`
    output tokens.
  - So one user's worst-case output is
    `min(daily_requests * max_tokens, daily_output_tokens - 1 + max_tokens)`,
    and their worst-case input is
    `min(daily_requests * max_input_tokens, daily_input_tokens - 1 + max_input_tokens)`.
  - Prices are in cents per million tokens (`400` is $4 per million).
  - If `users` or any of the three daily limits is 0, no call can start and
    the bound is 0.

  Return an integer. Use integer arithmetic to avoid rounding surprises.
languages: [python, javascript]
entry: daily_cost_bound_cents
starter:
  python: |
    def daily_cost_bound_cents(users, daily_requests, daily_input_tokens, daily_output_tokens, max_input_tokens, max_tokens, input_cents, output_cents):
        # your code here
        return 0
  javascript: |
    function daily_cost_bound_cents(users, daily_requests, daily_input_tokens, daily_output_tokens, max_input_tokens, max_tokens, input_cents, output_cents) {
      // your code here
      return 0;
    }
tests:
  - args: [1, 150, 2000000, 120000, 10000, 4000, 400, 2000]
    expected: 848
    label: one user, short conversations
  - args: [1, 150, 2000000, 120000, 100000, 4000, 400, 2000]
    expected: 1088
    label: long conversations hit the input limit
  - args: [1, 2, 2000000, 120000, 1000, 4000, 400, 2000]
    expected: 17
    label: the request limit binds first
  - args: [0, 150, 2000000, 120000, 10000, 4000, 400, 2000]
    expected: 0
    label: no users
  - args: [10000, 150, 2000000, 120000, 10000, 4000, 400, 2000]
    expected: 8479980
    hidden: true
  - args: [3, 100, 50000, 50000, 2000, 1500, 100, 500]
    expected: 93
    hidden: true
    label: rounds up to the next cent
  - args: [100, 150, 2000000, 0, 10000, 4000, 400, 2000]
    expected: 0
    hidden: true
    label: a zero output budget disables AI
  - args: [100, 150, 0, 120000, 10000, 4000, 400, 2000]
    expected: 0
    hidden: true
    label: a zero input budget disables AI too
hints:
  - "Compute one user's worst-case input and output tokens first, then multiply each by its price, add them, and multiply by the number of users."
  - "Keep everything in integers until the final division by 1,000,000; round up with ceiling division, for example -(-x // 1000000) in Python or Math.ceil(x / 1e6) in JavaScript."
  - "Input here is billed input, the way the budget counts it: cache writes already weighted at 1.25x and reads at the model's price, so one input price covers them all."
```

## Senior signals

- You separate **fuses** (per-user budgets that bound abuse) from **bills** (typical usage times adoption), compute both, and notice when the fuse is on the wrong wire, or trips only after the current has passed.
- You price options before choosing them, as with "verify every run" against "verify credited submissions", and re-price when the technology under one of them changes.
- You decide what a limiter does when its store is down before choosing the store, and notice when the answer changes: failing closed costs nothing when the store is the database the request needs anyway.
- You plan retention per table from what each row is for, check that the bound fits the storage, and know when batched deletes stop being enough and partitions are needed.
- You set SLOs the architecture can meet, alert on error-budget burn, and use metrics to find the weaknesses you cannot see by reading code.
- You rank changes (correctness and cost safety, then visibility, then scale-out, then product redesigns), say what you would *not* change, and keep the list of what was fixed as evidence.

## Check yourself

```quiz
- q: >-
    A learner has 1,500 output tokens left today and sends a coach turn, whose max_tokens is 4,000. What does BudgetService::reserve do?
  options: ["Holds nothing now, and charges what the call used when it ends", "Holds 1,500 tokens and lowers the call's max_tokens to 1,500", "Refuses, because the call's max_tokens is larger than what is left", "Holds 4,000 tokens, letting the day end 2,500 over its limit"]
  answer: 1
  explanation: >-
    The call may start if at least min(clamp(4,000 / 4, 256, 4,000), 4,000) = 1,000 tokens remain, and 1,500 do, so it holds the smaller of max_tokens and what is left and lowers the request's max_tokens to match: the reply cannot outspend the day. Holding the full 4,000 was the old overshoot, and charging only afterwards was the check-then-charge design holds replaced. With 900 tokens left it would refuse, rather than start a reply it would have to cut off.
- q: >-
    Ascend adds a second replica with no other change. What happens to rate limiting and to the AI budgets?
  options: ["The budgets double, because each replica reads its own copy of ai_usage", "Nothing changes at all, because every bucket already lives in Postgres", "Every limit doubles, because each replica keeps its own in-memory buckets", "Only the loose per-IP general bucket doubles; security limits and budgets hold"]
  answer: 3
  explanation: >-
    Since 427ed78 the security-relevant buckets are GCRA rows in Postgres, checked by one conditional upsert, and replicas_share_the_security_limits proves two instances share them. The 1,200-a-minute general bucket stays in governor's process memory on purpose, so it does multiply. Budgets live in ai_usage and are held under its row lock, so they are shared too. Every limit doubling was true before the shared limiter.
- q: >-
    Which table is projected to grow fastest at 10,000 DAU, and why?
  options: ["sessions, because each login adds a row that stays until it finally expires", "ai_usage, because it gains a row for every model request a learner makes", "submissions, as every Run stores its code and results, failures included", "messages, because each AI reply is long and every turn adds two rows"]
  answer: 2
  explanation: >-
    Runs are far more frequent than coach turns, and each stores code up to 64 KiB plus per-test results. ai_usage is one row per user per day, and expired sessions are swept hourly. The fix is deciding what each submission row is for and keeping only those.
- q: >-
    You need to delete submissions older than 30 days, about 4.5 million rows a month at 10,000 DAU. Why partition the table by month instead of running a nightly DELETE?
  options: ["Dropping a partition avoids the dead tuples, vacuum and WAL of a DELETE", "Postgres does not allow a DELETE on tables past a few million rows", "Partitioning makes new inserts faster, and the nightly DELETE job slows them down", "Partitioned tables compress old rows better than one large table can"]
  answer: 0
  explanation: >-
    Postgres implements DELETE by marking row versions dead, which vacuum must later clean and which writes WAL for every row. Dropping a partition is a metadata operation. Ascend's retention deletes in batches of 5,000 today, which bounds each statement but not the dead tuples. Compression and insert speed are not the reason, and DELETE works on tables of any size, only expensively.
- q: >-
    Ascend's shared limiter keeps its state in Postgres and answers 503 when Postgres is unreachable. Why is failing closed acceptable here, when it would not be for a Redis-backed limiter?
  options: ["The requests it guards need Postgres anyway, so refusing them costs no extra availability", "Postgres never becomes unreachable, since the platform restarts it within seconds", "Failing open would leak the rate_limits table, because it is an UNLOGGED table", "A 503 tells browsers to retry at once, so learners never notice the refusal"]
  answer: 0
  explanation: >-
    Sign-up, login, model calls and grading all read or write the database, so when it is down they fail regardless, and refusing them early adds no outage. A Redis limiter in front of requests that do not need Redis would turn a cache outage into a site outage, which is why the review had proposed degrading to local shares. UNLOGGED only means the table skips the write-ahead log and is emptied after a crash.
- q: >-
    The first review priced verifying every run at about 90 busy vCPUs at peak and recommended verifying only credited submissions. Why could ADR 0005 grade every signed-in run instead?
  options: ["Railway bills grading CPU separately, so it no longer counts toward capacity", "The server skips the hidden tests, which were most of the grading work", "A WebAssembly run costs about a tenth of the vCPU-second the estimate assumed", "Browsers now send only failing runs, so the server grades far fewer of them"]
  answer: 2
  explanation: >-
    The estimate assumed about one vCPU-second per run in a container sandbox; a WebAssembly instance starts in about 0.09 s for Python and 0.02 s for JavaScript, so 87 runs a second at peak needs roughly 9 to 17 cores, a few replicas. The method, pricing both options, stayed the same; the unit price changed. Hidden tests are graded like the others, and every signed-in run is sent, not only failures.
```
