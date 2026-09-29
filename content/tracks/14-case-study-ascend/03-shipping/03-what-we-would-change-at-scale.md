---
slug: what-we-would-change-at-scale
title: "What we would change at scale: a design review of Ascend"
description: A candid design review of this codebase at 10k and 100k daily users, covering multi-replica rate limiting, the real AI cost model, table growth and retention, observability and SLOs, server-verified submissions, content hot-reload, what the review's fixes closed, and a ranked list of what is still open.
minutes: 40
difficulty: expert
tags: [case-study, design-review, scalability, cost-modelling, observability, slo, rate-limiting, data-retention]
---
Every system has a scale at which its current design stops being the right one. The senior skill is not to build for that scale on day one; it is to know where the limits are, in what order they will be hit, and what the first move is when each one arrives, so that growth is a sequence of planned changes rather than a sequence of incidents.

This lesson is the design review of the codebase you have been reading. It assumes two futures, 10,000 and 100,000 daily active users (DAU), and asks what breaks, what costs too much, and what is merely unobservable. Every number is derived from the code or the deployment config, with the assumptions stated, so you can redo the arithmetic with your own.

## Where the system stands

| Property | Today | Source |
|---|---|---|
| App servers | 1 replica, stateless except a loose per-IP request bucket kept in memory on purpose | `.railway/railway.ts`, `middleware/rate_limit.rs` |
| Database | One Postgres, 50 GB volume, 20-connection pool per replica | `railway.ts`, `state.rs` |
| Hot reads (curriculum, lessons, problems) | From memory, never touch Postgres | `content/` loader, ETags |
| AI | `claude-opus-5-5`; per user per UTC day, 150 requests, 120,000 output tokens and 2,000,000 billed input tokens (a default; cache writes count 1.25x, reads at the model's price, 0.05x here), each call's worst case held before it runs; 20 model calls per minute per session | `railway.ts`, `config.rs`, `ai/budget.rs` |
| Code execution | In the browser for feedback; graded again on the server in WebAssembly, whose verdict is the one stored | ADRs 0003 and 0005 |
| Observability | JSON logs with request IDs, one line per request; volume alerts | `telemetry.rs`, `railway.ts` |
| Deploys | Push to `main`, build on Railway once CI passes, readiness-gated | `railway.ts` |

The architecture document's own scaling note is right about the shape: "Postgres is the bottleneck long before the app servers; the hot read paths (curriculum, lessons, problems) never touch it." The curriculum is served from memory with ETags, so 100x more readers is mostly a bandwidth problem. The interesting pressure points are elsewhere: the AI bill, the write-heavy tables, grading CPU, and the fact that nobody can currently see any of it.

## Rate limiting with more than one replica

### Before: every bucket in process memory

The first review found the limiter in `governor`, in process memory, with four buckets: 30 requests per minute per IP for login and registration, 10 password attempts per minute per account, 20 model calls per minute per session, and 1,200 requests per minute per IP for everything else. Right for one replica: no network hop, no dependency. Add a second and each replica keeps its own buckets, so the effective limit is N times the configured one, and depends on which replica a request lands on. An attacker guessing one learner's password at 10 per minute per replica gets 30 per minute against three.

The review proposed Redis, a Lua script per check, and degrading to local shares (limit ÷ N) when Redis is down, because failing closed would turn a cache outage into a site outage.

### After: GCRA in the database every replica already shares

What shipped in `427ed78` kept the seam and changed the store. The security-relevant buckets (sign-up and login per IP, password attempts per account or per known device, model calls and graded submissions per session) are GCRA state in Postgres: one row per key in `rate_limits(key, tat)`, created `UNLOGGED` by `m0009_shared_rate_limits`, checked and advanced by one conditional upsert in `services/rate_limit.rs`:

```sql
INSERT INTO rate_limits (key, tat) VALUES ($1, now() + make_interval(secs => $2))
ON CONFLICT (key) DO UPDATE
   SET tat = GREATEST(rate_limits.tat, now()) + make_interval(secs => $2)
 WHERE GREATEST(rate_limits.tat, now()) - now() <= make_interval(secs => $3)
RETURNING tat
```

GCRA keeps one number per key, the theoretical arrival time (TAT) of the next request at the allowed rate. A request passes while TAT − now is within the tolerance, (limit − 1) × interval, and pushes the TAT one interval on. Trace 10 password attempts a minute against one account (interval 6 s, tolerance 54 s), ten arriving at t = 0: the tenth leaves TAT at 60 s; the eleventh finds 60 − 0 > 54, gets no row back, and is told to wait 6 s; at t = 6 exactly one more passes. The pure `gcra()` function is unit-tested on that sequence, and `replicas_share_the_security_limits` builds two routers over one database and spends one allowance across both.

The store changed the failure decision. Postgres was already shared by every replica, `UNLOGGED` skips the write-ahead log (the PostgreSQL documentation calls such tables "considerably faster"; they are truncated after a crash and not replicated to standbys, which only forgets recent attempts), and the requests these buckets guard need the database anyway. So the shared limiter fails closed with a 503: refusing costs nothing a Postgres outage had not already cost. The 1,200-a-minute general bucket stays in memory per replica on purpose, since it only stops one client flooding cheap reads and a round trip per request would cost more than the approximation. An hourly sweep deletes keys whose TAT has passed, which are indistinguishable from keys never seen.

```viz
{"type": "system", "algorithm": "token-bucket", "requests": 12, "title": "What each key needs, wherever it lives", "caption": "A bucket per key with a capacity and a refill rate. GCRA is the same meter kept as one timestamp, which is what lets a single conditional upsert check and update it."}
```

The per-user AI budgets never needed to move: they live in Postgres, held under the day row's lock, correct for any number of replicas. One multi-replica prerequisite remains. The pool allows 20 connections per replica, and a default Postgres allows 100 in total ("typically 100", per the documentation), so around the fifth replica you need a pooler such as PgBouncer in transaction mode. (Migrations are done: boot takes a Postgres advisory lock, so replicas starting together queue rather than race.)

## The AI cost model

Prices for the configured model, `claude-opus-5-5`: $4 per million input tokens, $20 per million output tokens, cache writes at 1.25x input ($5), cache reads at 0.05x ($0.20). Thinking tokens bill as output.

### What the budget actually bounds

ADR 0004 says: "The worst-case daily cost is bounded by (active users) x (daily budgets): requests, billed input tokens and output tokens, each checked before a call." For most of this review's life that was true only up to an overshoot. The limits were checked before a call and the call charged after it, so with calls sequential the most output one user could generate in a day was

$$\min(150 \times M,\; 120{,}000 - 1 + M)$$

where $M$ is the call's `max_tokens`: 123,999 tokens for the coach ($M = 4{,}000$), **$2.48 per user per day**, and concurrent calls each added their own $M$. The exercise at the end computes that bound. Since `bd0dcf0` every call holds its worst case first, under the day row's lock, with `max_tokens` lowered to what is left, so the overshoot term is gone: at most 120,000 output tokens, **$2.40 per user per day**, $24,000 a day if all 10,000 DAU maxed out and $240,000 at 100,000.

Input had a longer history. When the review was first written, input was not budgeted at all, and in a chat product input is where the tokens are: a system prompt of up to roughly 10,000 tokens (persona, curriculum map, up to 24,000 characters of lesson and 12,000 of code) and up to 30 history messages (user messages up to 8,000 characters, replies up to 4,000 tokens). A long conversation can put roughly 100,000 input tokens in every request; at 150 requests, 15 million a day, uncounted.

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

For a free product that is the whole problem in one table (the general method is in [Capacity planning and cost](/learn/system-design/senior-design-skills/capacity-planning-and-cost)). Notice what changed shape: with the history cached, output is now two thirds of the bill. The levers, in the order a cost review would take them (free wins before quality trade-offs):

1. **Budget in money, not tokens.** Pricing every token class per call from a table keyed by model, and capping each user at, say, a dollar a day (above the typical day, far below the worst), would survive a change of model or price. The data is there: since `m0006`, `ai_usage` stores cache reads and writes beside input and output.
2. **Tune effort and `max_tokens` per product.** Output dominates now, and thinking bills as output. A coach turn at lower effort is cheaper, and most answers need far less than 4,000 tokens.
3. **Keep the history cached when context changes.** The context block sits before the history, so when the progress line changes the whole history is written again at 1.25x; sending changed context as a message after the history keeps the cached prefix intact.
4. **Route by stakes, measured.** The config once had an `AI_FAST_MODEL` (`claude-haiku-4-5`, $1 and $5 per million) that no code used; commit `7154e9f` deleted it rather than keep a setting that did nothing. Routing is still a lever for short factual questions and titles, with two caveats cost reviews miss: caches are per model, so routing splits cache reuse, and the minimum cacheable prefix differs (512 tokens on Opus 5 and 5.5, 4,096 on Haiku 4.5).
5. **A global spend breaker.** Sum today's priced usage across all users; above a threshold, flip AI features into the existing `AiDisabled` path and page someone. A provider-side spend limit stays the last line, knowing it fails everyone at once.

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

The retention design:

- **Decide what each row is for.** A submission serves "solved" status (one row per target), the editor (the latest) and history (a few weeks). Keep the best and latest per target, prune the rest after 30 days, and skip a run whose code hash matches the previous one.
- **Partition by time.** Monthly partitions on `submissions` and `messages` make retention a `DROP` of an old partition: instant, no dead tuples, no vacuum debt, little WAL. A `DELETE` of millions of rows does the opposite of all four ([Partitioning and sharding](/learn/databases/storage-and-scale/partitioning-and-sharding)).
- **Finish the transcript fix.** The SQL append removed the lost update; entries as rows would remove the churn.
- **Treat conversations as personal data.** Self-service deletion exists (`DELETE /api/auth/me`); a retention period for untouched conversations and an export do not.

## Observability, metrics and SLOs

Today's telemetry is one structured log line per request with a request ID, plus warnings from the AI path. That answers "what happened to this request" if you already know which one. It cannot answer "is the coach slower than yesterday", "what is our cache hit rate", "how many replies were lost in the last deploy", or "are we within budget this month".

The plan, in order:

1. **Traces.** The `TraceLayer` already opens a span per request. Export spans with OpenTelemetry (`tracing-opentelemetry`), with child spans for database calls, grading runs and the Anthropic call (model, token counts by class, `stop_reason`, time to first token), so a slow reply shows where its time went.
2. **Metrics.** Rate, errors and duration per route. For AI: tokens and priced cost per product (coach, quiz, interview) and model, cache hit ratio, time to first token, and stream outcomes (completed, client disconnected, upstream error, persistence failed). Budget rejections by reason; grading queue wait and 503s. From the browser, via a beacon: runner timeouts, Pyodide load failures, visualisation errors.
3. **SLOs with error budgets.** For example: lesson and problem API availability 99.9 percent over 30 days (an error budget of 43.2 minutes); coach time to first token under a stated p95; streamed replies persisted 99.99 percent. Alert on the burn rate of the budget, not on raw thresholds, so a brief blip does not page anyone and a slow bleed does.

See [Observability](/learn/system-design/building-blocks/observability) for the general method. The specific point for this codebase is that its cost weaknesses were invisible *because* there are no metrics. Cache tokens are now stored and logged on every coach turn, but a log line nobody aggregates cannot show a cache hit rate, and nothing counts stream outcomes at all. Metrics are how you would have found the unbudgeted cache writes without reading the code.

## Server-verified submissions: priced, then built

The first review took ADR 0003's closing line as the trigger ("Leaderboards or competitive features would need server-side verification") and priced two options. Verifying every run at 100,000 DAU with 15 runs each means 1.5 million sandboxed executions a day, about 17 per second on average and perhaps five times that at peak; at roughly one vCPU-second per run in a container sandbox, that is on the order of 90 busy vCPUs at peak. Verifying only "submit for credit" was a fifteenth of that, so the review recommended it.

ADR 0005 verifies every signed-in run instead, because the unit price changed, not the method: on the development machine a WebAssembly CPython starts in about 0.09 s with a precompiled standard library, QuickJS in about 0.02 s. Redo the arithmetic assuming 0.1 to 0.2 CPU-seconds per run (start-up plus small tests): 87 runs a second at peak needs roughly 9 to 17 busy cores, a few replicas rather than a fleet. Each replica grades at most four runs at once and answers 503 after 20 s in the queue, so capacity arrives as replicas or, as ADR 0005 plans, a grading service behind the same `Grader` interface. Retention helps here too: skipping a run whose code matches the previous one saves a grading run as well as a row. Price both options, and re-price when the technology under one of them changes.

## Content hot-reload

A lesson typo costs a deploy of about a minute, which keeps every guarantee in module 1 (validated at build time, versioned with its renderer, identical in every replica). When non-engineers edit daily, the design that keeps them: CI validates a content bundle with the same strict loader, publishes it to object storage with its fingerprint, and each replica polls for a new version and swaps an `Arc<Curriculum>` atomically (an `ArcSwap`), recomputing the content ETag with it (today `AppState::build` computes it once, at boot). The new problems are real: during a rollout two replicas may serve different content versions, so ETags flap and a lesson can change between page loads; and a bundle may need code the running binary lacks, so bundles must declare a minimum binary version. Do not build this until someone needs it.

## Known weaknesses, ranked

Most items below were found by reading the code for this track. Keep both lists: the fixed one is evidence the review was worth doing, and most of its rows are a before and after told in an earlier lesson.

| Fixed since the first review | Where | The fix |
|---|---|---|
| Budget: check and increment in two statements; input unbudgeted, then counted in the wrong column; no retry time; overshoot by calls in flight | `ai/budget.rs` | One conditional upsert; billed input, reads at the model's price (`22e4321`, `ac7532b`); `Retry-After`; holds under the row lock (`bd0dcf0`) |
| One cache breakpoint; history never cached, its window sliding every turn | `ai/coach.rs` | Stable block, context block, cached conversation; a window that moves in steps of ten |
| Limiter maps never pruned; a class behind one NAT throttled; buckets per process; an owner's password allowance spendable by anyone | `rate_limit.rs` | Hourly pruning; per-session and per-account keys; GCRA in Postgres; known devices (`427ed78`) |
| No idle sign-out; ten-character passwords with no breach check | `auth/` | `SESSION_IDLE_DAYS` (`427ed78`); 15 characters and Pwned Passwords screening (`acab135`, `0897111`) |
| Streaks from a mutable column, in UTC days; deletion cascaded into others' comments | `m0007`, `m0011` | `activity_days` in the learner's time zone (`0203d76`); `ON DELETE SET NULL` |
| Results self-reported | `crates/grader` | Graded on the server in WebAssembly (`25fd477`) |
| Transcripts: read-modify-write, replies landing after or during a grade, racing finishes, an orphaned grade stuck on a spinner | `interviews.rs` | One SQL append; status guards; `grading` before the grader runs (`c4c5de7`); "Grade again" (`7066802`) |
| Coach lock UI-only; deploys not waiting for CI | `coach.rs`, `railway.ts` | 409 during a solo interview; `checkSuites: true` |
| No drain, a 0 s drain window, then no test of either | `serve.rs`, `railway.ts` | A `TaskTracker`, 60 s window, 25 s and 30 s bounds (`8f82820`); `shutdown.rs` and a graceful stop in CI (`95b6623`) |
| Migrations raced; a rollback could not boot | `migrate.rs` | Advisory lock; booting behind the schema (`8f82820`) |
| Movable tags; stale chunks got `index.html`; upkeep by hand; smoke tests absent, then run on a debug build | `ci.yml`, `app.rs` | Pins by SHA and digest; a 404 and one reload; auto-merge after CI (`040cf0a`); smoke on the production image (`8861312`) |
| Provider error text shown; unused `AI_FAST_MODEL`; stale Python globals; SSE split on `\n` only; a slow first unknown-email login | several | Classified messages; removed; a fresh namespace; spec line endings (`527d3d1`); the dummy hash at boot |
| Generators rewrote their frames; a bad block or a prototype key could blank the page; recovery paths untested | `web/src/viz`, `api.rs` | Copies and `frames-immutable.test.ts`, an error boundary, backdating tests (`7066802`); own-key lookups (`083d69c`) |

What is still open, ranked, with the symptom each would show and how you would find it:

| Rank | Weakness | Symptom | Diagnosis | Fix |
|---|---|---|---|---|
| 1 | No global spend cap | The monthly bill arrives far above the typical-day model | Nothing aggregates priced usage across users | A spend breaker into the existing `AiDisabled` path |
| 2 | Budgets in weighted tokens, not money | A model or price change silently moves every bound | Compare `ai_usage` with the invoice | Price each token class per call from a table keyed by model |
| 3 | Railway builds its own image (`railway.ts`) | Production fails in a way CI never saw | The running image's digest matches nothing CI tested | Push CI's image and deploy that digest |
| 4 | No metrics or traces | A slower coach or a full grading queue goes unnoticed | Nothing aggregates the logs | Spans, metrics and SLOs |
| 5 | Readiness checks only the database (`routes/health.rs`) | A revoked AI key goes live with `ai: true` | Every coach call fails after a green deploy | Boot-time key probe |
| 6 | Unknown devices share one password bucket per account | An owner on a new device refused while someone guesses | 429s for one email from several addresses | Charge failures only |
| 7 | Four comparison rules round half-way values two ways | An answer passes in one runner and fails in another | Run the value through each rule | One conformance corpus |

## The plan, in order

1. **Cost safety now**, whatever the traffic: a global spend breaker, and the per-user limit moved from weighted tokens to money before a second model arrives.
2. **Before 10,000 DAU**: effort and `max_tokens` tuning per product, metrics, traces and SLOs, retention and partitioning for `submissions` and `messages`, and deploying the tested image by digest.
3. **At the second replica**: a connection pooler and canary releases (migrations are locked, and the security limits and budgets already live in Postgres); grading capacity grows with replicas.
4. **When the product changes**: server-only tests if contests arrive, a grading service when load outgrows a few cores, content hot-reload for non-engineer authors.

Notice what is *not* on the list: splitting the monolith, sharding Postgres, moving the SPA to a CDN. At 100,000 DAU the constraints are money, data growth and visibility, and each has a specific fix that does not require a rewrite.

## What to test more, at scale

- **Load-test the streaming path**: a thousand concurrent streams on one instance, measuring memory per stream, time to first token, and what the platform's proxy does to long-lived responses.
- **Chaos on persistence**: kill the database connection mid-stream and verify the reply is retried or at least counted as lost in a metric; today `finish_turn` failing is a log line.
- **Rollback compatibility**: run the *previous* release's API integration tests against the *new* schema before deploying. It is a direct, automatic check of expand/contract discipline.
- **Crash in the middle of a grade, end to end.** The integration test backdates the row and the room offers "Grade again"; killing a real process mid-grade in a browser test would check the two together.

## Interviewer follow-ups

**"What breaks first at 100 times the users?"** Model answer: sort by incorrect before slow. Most of what was incorrect across replicas is fixed (locked migrations, shared limits and budgets), so 20 connections per replica meeting `max_connections` comes first, then grading capacity. But the binding constraints at 100,000 DAU are money (about $9,200 a day of typical AI use), data growth (`submissions` alone about 110 GB a year at 10,000 DAU against a 50 GB volume) and visibility. Serving lessons stays cheap, because they come from memory. Common wrong answer: "Postgres", or "Rust will handle it", with no number attached.

**"Is the AI spend bounded?"** Model answer: per user, yes: $2.40 of output and $8.00 of billed input, $10.40 a day at worst, and since holds are taken before each call nothing in flight can overshoot it (bar an input estimate that runs low). In total, no: the per-user fuse times 100,000 users is over a million dollars a day, which is why a global breaker and a money-denominated budget come first on the plan. Common wrong answer: "the budget caps the cost", which confuses a per-user fuse with a bill.

**"Would you split this into services?"** Model answer: not for scale; none of the constraints (money, data growth, visibility) is solved by a network boundary, and each hop adds a failure mode. The one candidate is grading, already behind a `Grader` interface: it scales on CPU rather than requests, and ADR 0005 names the trigger, load beyond a few cores. Common wrong answer: "microservices scale better", answering a question the numbers do not ask.

**"How would you know the coach got slower after a deploy?"** Model answer: today you would not. The per-request log line measures the time until an SSE response opened, not time to first token or total generation. Add a span around the model call with time to first token and token counts, a stream-outcome counter, and an SLO on p95 time to first token with burn-rate alerts. Common wrong answer: "check the logs", which hold no such number.

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
- You plan retention per table from what each row is for, and implement it with partitions rather than bulk deletes.
- You define SLOs and alert on error-budget burn, and you use metrics to find the weaknesses you cannot see by reading code.
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
    Postgres implements DELETE by marking row versions dead, which vacuum must later clean and which writes WAL for every row. Dropping a partition is a metadata operation. Compression and insert speed are not the reason, and DELETE works on tables of any size, only expensively.
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
