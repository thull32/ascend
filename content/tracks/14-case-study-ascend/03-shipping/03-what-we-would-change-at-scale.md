---
slug: what-we-would-change-at-scale
title: "What we would change at scale: a design review of Ascend"
description: A candid design review of this codebase at 10k and 100k daily users, covering multi-replica rate limiting, the real AI cost model, table growth and retention, observability and SLOs, server-verified submissions, content hot-reload, what the review's fixes closed, and a ranked list of what is still open.
minutes: 45
difficulty: expert
tags: [case-study, design-review, scalability, cost-modelling, observability, slo, rate-limiting, data-retention]
---
Every system has a scale at which its current design stops being the right one. The senior skill is not to build for that scale on day one; it is to know where the limits are, in what order they will be hit, and what the first move is when each one arrives, so that growth is a sequence of planned changes rather than a sequence of incidents.

This lesson is the design review of the codebase you have been reading. It assumes two futures, 10,000 and 100,000 daily active users (DAU), and asks what breaks, what costs too much, and what is merely unobservable. Every number is derived from the code or the deployment config, with the assumptions stated, so you can redo the arithmetic with your own.

## Where the system stands

| Property | Today | Source |
|---|---|---|
| App servers | 1 replica, stateless except the rate limiter | `.railway/railway.ts`, `middleware/rate_limit.rs` |
| Database | One Postgres, 50 GB volume, 20-connection pool per replica | `railway.ts`, `state.rs` |
| Hot reads (curriculum, lessons, problems) | From memory, never touch Postgres | `content/` loader, ETags |
| AI | `claude-opus-5-5`; per user per UTC day, 150 requests, 120,000 output tokens and 2,000,000 billed input tokens (a default; cache writes count 1.25x, reads 0.1x); 20 model calls per minute per session | `railway.ts`, `config.rs`, `ai/budget.rs` |
| Code execution | In the learner's browser, results self-reported | ADR 0003 |
| Observability | JSON logs with request IDs, one line per request; volume alerts | `telemetry.rs`, `railway.ts` |
| Deploys | Push to `main`, build on Railway once CI passes, readiness-gated | `railway.ts` |

The architecture document's own scaling note is right about the shape: "Postgres is the bottleneck long before the app servers; the hot read paths (curriculum, lessons, problems) never touch it." The curriculum is served from memory with ETags, so 100x more readers is mostly a bandwidth problem. The interesting pressure points are elsewhere: the per-process limiter, the AI bill, the write-heavy tables, and the fact that nobody can currently see any of it.

## Rate limiting with more than one replica

The limiter is `governor`, in process memory, with four buckets: 30 requests per minute per IP for login and registration, 10 password attempts per minute per account, 20 model calls per minute per session, and 1,200 requests per minute per IP for everything else. That is the right choice for one replica: no network hop, no dependency, nanoseconds per check.

Add a second replica and it becomes wrong in two ways. Each replica keeps its own buckets, so the effective limit is N times the configured one, and uneven load balancing makes the real limit depend on which replica a request lands on. An attacker guessing one learner's password at 10 per minute per replica gets 30 per minute against three, because the per-account bucket is per process too.

```viz
{"type": "system", "algorithm": "token-bucket", "requests": 12, "title": "What each key needs, wherever it lives", "caption": "A bucket per key with a capacity and a refill rate. Moving it to Redis changes where the counter lives, not the algorithm."}
```

The move is the one the code already anticipates ("the `Limiters` type is the seam"): keep the middleware and the key function, and back the buckets with Redis. A single Lua script per check (read the bucket, refill by elapsed time, take a token, write it back with an expiry) keeps the operation atomic and costs one in-region round trip, well under a millisecond. Expiry on every key replaces the hourly pruning the in-process version needs.

The design decision that matters is **what happens when Redis is down**. Failing closed turns a cache outage into a full outage. Failing fully open removes abuse protection exactly when something is already wrong. The usual senior answer is to degrade: fall back to the in-process limiter with each replica enforcing its share (limit ÷ N), log loudly, and alert. Note what does *not* need to move: the per-user AI budgets already live in Postgres and are shared by every replica, and since the check-then-act race became one conditional upsert, they are correct regardless of replica count.

One more multi-replica prerequisite hides in the code. The pool allows 20 connections per replica, and a default Postgres allows 100 in total, so around the fifth replica you need a pooler such as PgBouncer in transaction mode. (Migrations, the other one, are done: boot takes a Postgres advisory lock, so replicas starting together queue rather than race.)

## The AI cost model

Prices for the configured model, `claude-opus-5-5`: $4 per million input tokens, $20 per million output tokens, cache writes at 1.25x input ($5), cache reads at 0.05x ($0.20). Thinking tokens bill as output.

### What the budget actually bounds

ADR 0004 says: "The worst-case daily cost is bounded by (active users) x (daily token budget)." Read `check_and_reserve` with that sentence in mind. A call is allowed while the user is under 150 requests, under 120,000 output tokens and under 2,000,000 input tokens, and those conditions are checked *before* the call. Assuming calls are sequential, the most output one user can generate in a day is

$$\min(150 \times M,\; 120{,}000 - 1 + M)$$

where $M$ is the call's `max_tokens`. For the coach ($M = 4{,}000$) that is 123,999 tokens, or **$2.48 per user per day** on output. If every one of 10,000 DAU did it, about $24,800 a day; at 100,000 DAU, about $248,000 a day. That is the bound the ADR describes for output, and the input limit now bounds input the same way.

For most of this review's life, the output bound was not the bound on the bill. When the review was first written, input tokens were not budgeted at all, and in a chat product input is where the tokens are: a system prompt of up to roughly 10,000 tokens (persona, curriculum map, up to 24,000 characters of lesson and 12,000 of code) and up to 30 history messages (user messages up to 8,000 characters, replies up to 4,000 tokens). A long conversation can put roughly 100,000 input tokens in every request; at 150 requests, 15 million a day, uncounted.

The AI hardening commit (`1d3da0c`) then added a daily input limit and conversation caching in the same change, and the two interacted. The limit compared against `input_tokens`, the *uncached* remainder, while caching moved nearly every input token of a turn into cache reads and writes. A client that sent different editor contents with every message could make each request a near-complete cache write: 15 million tokens at $5 per million, **$75 per user per day**, checked against nothing. The fuse had moved from "not metered" to "metered in the wrong column".

Commit `22e4321` put it on the right wire. The limit now counts *billed* input, `input_tokens + cache_write_tokens * 5 / 4 + cache_read_tokens / 10`, so a billed token costs at most the plain input price ($4 per million; reads bill at 0.05x, so counting them at 0.1x errs on the safe side). The same arithmetic as for output then applies: for calls whose input bills at up to 100,000 tokens, a learner's day holds at most 2,099,999 billed input tokens, about $8.40, which with the $2.48 of output bounds the worst day at about **$10.90 per user**, roughly $109,000 a day if all 10,000 DAU maxed out and $1.09 million at 100,000. That is a bound you can reason about, and it is the one the exercise at the end computes. Two things still escape it: calls already in flight when a limit is reached (each can overshoot by its own size), and any change of model or price, because the limit is in weighted tokens rather than money.

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

1. **Budget in money, not tokens.** The billed-token limit already weights cache writes and reads correctly for one model. Pricing every token class per call from a table keyed by model, and capping each user at, say, a dollar a day (comfortably above the typical day and far below the worst), would survive a change of model or price and let the cap sit much closer to real use. The data is already there: since `m0006`, `ai_usage` stores cache reads and writes beside input and output.
2. **Tune effort and `max_tokens` per product.** Output dominates now, and thinking bills as output. A coach turn at lower effort is cheaper, and most answers need far less than 4,000 tokens.
3. **Keep the history cached when context changes.** The context block sits before the history, so when the progress line changes (the learner finishes a lesson between questions) the whole history is written again at 1.25x; sending changed context as a message after the history, rather than editing the block before it, keeps the cached prefix intact. The history window had the same problem and now moves in steps of ten messages.
4. **Route by stakes, measured.** The config once had an `AI_FAST_MODEL` (`claude-haiku-4-5`, $1 and $5 per million) that no code used; commit `7154e9f` deleted it rather than keep a setting that did nothing. Routing is still a real lever for short factual questions and conversation titles, with two caveats that cost reviews miss: caches are per model, so routing splits cache reuse, and the minimum cacheable prefix differs by model (512 tokens on Opus 5, 4,096 on Haiku 4.5), so a prompt that caches on one may not on the other.
5. **A global spend breaker.** Sum today's priced usage across all users; above a threshold, flip AI features into the existing `AiDisabled` path (the UI already explains it) and page someone. Keep a provider-side spend limit as the last line, knowing it fails everyone at once.

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

1. **Traces.** The `TraceLayer` already opens a span per request. Export spans with OpenTelemetry (`tracing-opentelemetry`), and add child spans for database calls and for the Anthropic call, carrying the model, token counts by class, `stop_reason` and time to first token as attributes. A slow coach reply then shows whether the time went to Postgres, to the provider's queue, or to thinking.
2. **Metrics.** Rate, errors and duration per route. For AI: tokens and priced cost per product (coach, quiz, interview) and model, cache hit ratio, time to first token, and stream outcomes (completed, client disconnected, upstream error, persistence failed). Budget rejections by reason. From the browser, via a small beacon: runner timeouts, Pyodide load failures, visualisation errors.
3. **SLOs with error budgets.** For example: lesson and problem API availability 99.9 percent over 30 days (an error budget of 43.2 minutes); coach time to first token under a stated p95; streamed replies persisted 99.99 percent. Alert on the burn rate of the budget, not on raw thresholds, so a brief blip does not page anyone and a slow bleed does.

See [Observability](/learn/system-design/building-blocks/observability) for the general method. The specific point for this codebase is that its cost weaknesses were invisible *because* there are no metrics. Cache tokens are now stored and logged on every coach turn, but a log line nobody aggregates cannot show a cache hit rate, and nothing counts stream outcomes at all. Metrics are how you would have found the unbudgeted cache writes without reading the code.

## Server-verified submissions, if competition arrives

ADR 0003's closing line is the trigger: "Leaderboards or competitive features would need server-side verification." The cost of that decision depends entirely on *what* gets verified. At 100,000 DAU with 15 runs each, verifying every run means 1.5 million sandboxed executions a day, about 17 per second on average and perhaps five times that at peak. At roughly one vCPU-second per run before sandbox start-up overhead, that is on the order of 90 busy vCPUs at peak, plus queueing, per-language images and a sandbox (gVisor or Firecracker) to keep patched.

Verifying only submissions that confer status (one "submit for credit" per solved problem, say 100,000 a day) is about 1.2 per second on average and a handful of vCPUs at peak. Same security work, a fifteenth of the compute. Browser runs stay for feedback; the credited path keeps its hidden tests on the server. Price both options before anyone says "move execution to the server".

## Content hot-reload

A lesson typo costs a deploy of about a minute, which keeps every guarantee in module 1 (validated at build time, versioned with its renderer, identical in every replica) and is fine while authors are engineers. When non-engineers edit daily, the design that keeps the guarantees: CI validates a content bundle with the same strict loader, publishes it to object storage with its fingerprint, and each replica polls for a new version and swaps an `Arc<Curriculum>` atomically (an `ArcSwap`), recomputing the content ETag with it (today `AppState::build` computes it once, at boot). The new problems are real: during a rollout two replicas may serve different content versions, so ETags flap and a lesson can change between page loads; and a bundle may need code the running binary lacks, so bundles must declare a minimum binary version. Do not build this until someone needs it.

## Known weaknesses, ranked

Every item below was found by reading the code for this track, and most of the first list has since been fixed. Keep both lists: the fixed one is evidence that the review was worth doing, and each row is a before and after told in an earlier lesson.

| Fixed since the first review | Where | The fix |
|---|---|---|
| Transcript appends were read-modify-write | `services/interviews.rs` | One `UPDATE` with `transcript \|\| $2` and the cap in the same statement |
| Budget check and increment were separate statements | `ai/budget.rs` | One conditional upsert with `RETURNING`, and a concurrent test |
| Input tokens unbudgeted; cache tokens discarded | `ai/budget.rs`, `m0006` | A daily input limit; cache reads and writes stored |
| One cache breakpoint; history never cached | `ai/anthropic.rs`, `ai/coach.rs` | Stable block, context block, cached conversation |
| Deploys did not wait for CI, so CI-only checks (API tests, the viz content scan) did not gate them | `railway.ts` | `checkSuites: true` |
| Background stream tasks were not drained on shutdown, and Railway's drain window was 0 s, so no drain ran at all | `main.rs`, `railway.ts` | A `TaskTracker`; a 60 s window; 25 s for connections, then 30 s for tasks (`8f82820`) |
| Replicas booting together raced on migrations, and a rollback after a migrating release could not boot | `migrate.rs` | An advisory lock, and a plan that boots a build behind the schema without migrating (`8f82820`) |
| Actions and base images on movable tags; a tab on the old build got `index.html` for a missing chunk | `ci.yml`, `Dockerfile`, `app.rs` | Pins by SHA and digest with Dependabot; a 404 for missing assets and one reload (`8f82820`) |
| `AI_FAST_MODEL` configured but unused | `config.rs` | Removed |
| Limiter maps never pruned; per-IP keys throttled learners behind one NAT | `middleware/rate_limit.rs` | Hourly pruning; per-session AI and per-account password buckets |
| Playwright not in CI | `ci.yml` | An `e2e` job running the smoke suite |
| Python globals persisted between runs | `runner/py.worker.ts` | A fresh namespace per run |
| Coach lock was UI-only | `routes/coach.rs` | 409 while a solo interview is active |
| Streaks from a mutable column; account deletion would cascade into other people's comments | `m0007` | `activity_days`; `ON DELETE SET NULL` |
| Provider error bodies reached the browser, first from failed requests, then from inside streams | `map_status`, `ai/anthropic.rs`, `AppError::ai_upstream` | Generic or classified messages; details logged |
| The input limit counted only uncached tokens, so cache writes were unbudgeted | `ai/budget.rs` | The limit counts billed input: writes at 1.25x, reads at 0.1x |
| The budget's 429 said nothing about when to retry | `ai/budget.rs`, `error.rs` | `RateLimited` carries `retry_after_secs`; `Retry-After` until the next UTC midnight |
| The coach's history window slid every turn, rewriting the cache | `ai/coach.rs` | The window moves in steps of ten messages |
| A reply could land in a transcript after it was graded; racing finishes both wrote | `services/interviews.rs` | Appends and `finish` are conditional on status; one finish wins |
| A reply could still land during the seconds of grading | `services/interviews.rs`, `routes/interviews.rs` | `begin_grading` sets `grading` with the final code before the grader runs; a failed grade reopens (`c4c5de7`) |
| The SSE parser split lines on `\n` only, so a CR in a reply showed a stray `data:` | `web/src/lib/sse.ts` | CRLF, LF and lone CR are line ends, a trailing CR waits for the next chunk; tested with axum's own bytes (`527d3d1`) |
| The first unknown-email login after boot was slower | `auth/password.rs`, `main.rs` | The dummy hash is computed at boot, inside the semaphore |
| An orphaned `grading` row left the room on a spinner forever | `InterviewRoom.tsx` | After five minutes the page offers "Grade again" (`7066802`) |
| Two generators changed their frames after recording them; a malformed viz block could blank the page | `families/array.tsx`, `families/graph.tsx`, `VizBlock.tsx` | Copies per frame and `frames-immutable.test.ts`; the normaliser inside the `try`, an error boundary per player (`7066802`) |
| The solo-lock expiry and the five-minute regrade had no test | `crates/api/tests/api.rs` | A test that backdates the rows (`7066802`) |

What is still open, ranked, with the symptom each would show and how you would find it:

| Rank | Weakness | Symptom | Diagnosis | Fix |
|---|---|---|---|---|
| 1 | Limits are checked before a call, not reserved (`ai/budget.rs`) | A learner's day ends above the output cap | `ai_usage.output_tokens` over the limit by up to one `max_tokens` per call in flight | Reserve `max_tokens`, refund on settle |
| 2 | No global spend cap | The monthly bill arrives far above the typical-day model | Nothing aggregates priced usage across users | A spend breaker into the existing `AiDisabled` path |
| 3 | Smoke tests run against a debug build, and Railway builds its own image (`ci.yml`) | Production fails in a way CI never saw | The running image's digest matches nothing CI tested | Smoke the built image, push it, deploy that digest |
| 4 | The shutdown drain has no test (the solo-lock expiry and the regrade got theirs in `7066802`) | A regression ships green | Ask which test would fail; none does | A test that sends SIGTERM mid-stream and checks the reply was persisted |
| 5 | Per-account password limits charge successes (`middleware/rate_limit.rs`) | A learner is refused their own correct password for up to a minute, repeatedly | Many 422s for one email from several addresses | Charge failures only; trust known devices |
| 6 | In-process limiter | Limits multiply with replicas | 429 rate per client falls as replicas are added | Redis with key expiry, degrading to local shares |
| 7 | Readiness checks only the database (`routes/health.rs`) | A revoked AI key goes live with `ai: true` | Every coach call fails after a green deploy | Boot-time key probe |
| 8 | Streaks count UTC days (`services/activity.rs`) | Evening learners west of UTC lose streaks | Activity rows dated a day after the learner's local date | A stored time zone per learner |
| 9 | Results self-reported | Acceptable for practice | By design, ADR 0003 | Server-side checks if results gain value |

## The plan, in order

1. **Cost safety now**, whatever the traffic: reserve `max_tokens` before a call and add a global spend breaker; move the per-user limit from weighted tokens to money before a second model arrives.
2. **Before 10,000 DAU**: effort and `max_tokens` tuning per product, metrics, traces and SLOs, retention and partitioning for `submissions` and `messages`, smoke tests against the built image, and lockout-resistant password limits.
3. **At the second replica**: the Redis limiter, a connection pooler, canary releases (migrations are already locked).
4. **When the product changes**: server-verified submissions for credited results, content hot-reload for non-engineer authors.

Notice what is *not* on the list: splitting the monolith, sharding Postgres, moving the SPA to a CDN. At 100,000 DAU the constraints are money, data growth and visibility, and each has a specific fix that does not require a rewrite.

## What to test more, at scale

- **Load-test the streaming path**: a thousand concurrent streams on one instance, measuring memory per stream, time to first token, and what the platform's proxy does to long-lived responses.
- **Chaos on persistence**: kill the database connection mid-stream and verify the reply is retried or at least counted as lost in a metric; today `finish_turn` failing is a log line.
- **Rollback compatibility**: run the *previous* release's API integration tests against the *new* schema before deploying. It is a direct, automatic check of expand/contract discipline.
- **Crash in the middle of a grade, end to end.** The integration test backdates the row and the room offers "Grade again"; killing a real process mid-grade in a browser test would check the two together.

## Interviewer follow-ups

**"What breaks first at 100 times the users?"** Model answer: sort by incorrect before slow. The per-process limiter is wrong the moment a second replica exists (migrations, which used to race, are now locked), then 20 connections per replica meet `max_connections`. But the binding constraints at 100,000 DAU are money (about $9,200 a day of typical AI use), data growth (`submissions` alone about 110 GB a year at 10,000 DAU against a 50 GB volume) and visibility. Serving lessons stays cheap, because they come from memory. Common wrong answer: "Postgres", or "Rust will handle it", with no number attached.

**"Is the AI spend bounded?"** Model answer: per user, yes: about $2.48 of output and $8.40 of billed input, roughly $10.90 a day at worst, plus overshoot from calls in flight. In total, no: the per-user fuse times 100,000 users is over a million dollars a day, which is why a global breaker and a money-denominated budget come first on the plan. Common wrong answer: "the budget caps the cost", which confuses a per-user fuse with a bill.

**"Would you split this into services?"** Model answer: not for scale; none of the constraints (money, data growth, visibility) is solved by a network boundary, and each hop adds a failure mode. The one component that earns its own service is server-side execution for credited submissions, because it needs isolation (a sandbox) and scales on a different axis. Common wrong answer: "microservices scale better", answering a question the numbers do not ask.

**"How would you know the coach got slower after a deploy?"** Model answer: today you would not. The per-request log line measures the time until an SSE response opened, not time to first token or total generation. Add a span around the model call with time to first token and token counts, a stream-outcome counter, and an SLO on p95 time to first token with burn-rate alerts. Common wrong answer: "check the logs", which hold no such number.

## What mid-level engineers get wrong

- **Sizing the bill from the fuse, or the fuse from the bill.** The worst case sizes the per-user limit; typical use times adoption sizes the budget.
- **Proposing a rewrite where the constraint is money or data.** Microservices do not make tokens cheaper or tables smaller.
- **Moving the limiter to Redis without deciding what happens when Redis is down.** Failing closed is an outage; failing open is no protection.
- **Deleting old rows in bulk.** Dead tuples, vacuum debt and WAL for every row; dropping a monthly partition costs almost nothing.
- **Pricing tokens without their cache class.** Reads at 0.05x and writes at 1.25x move a conversation's cost by a factor of two either way.
- **Scaling out before you can see.** Without metrics, the second replica's effect on limits, pool and cost is a guess.

## Exercise

```exercise
id: daily-cost-bound
title: Compute the daily AI cost bound the budget enforces
prompt: |
  Implement `daily_cost_bound_cents(users, daily_requests, daily_input_tokens,
  daily_output_tokens, max_input_tokens, max_tokens, input_cents, output_cents)`:
  the worst-case daily spend the budget allows, in whole cents rounded up,
  if every user maxes out their budget.

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
  - "Input here is billed input, the way check_and_reserve counts it: cache writes already weighted at 1.25x and reads at 0.1x, so one input price covers them all (reads come out slightly overpriced)."
```

## Senior signals

- You separate **fuses** (per-user budgets that bound abuse) from **bills** (typical usage times adoption), compute both, and notice when the fuse is on the smaller wire, or on the wrong one.
- You price options before choosing them, as with "verify every run" against "verify credited submissions".
- You name what happens when a new dependency fails (a Redis outage) before adding it, and choose degradation over failing open or closed.
- You plan retention per table from what each row is for, and implement it with partitions rather than bulk deletes.
- You define SLOs and alert on error-budget burn, and you use metrics to find the weaknesses you cannot see by reading code.
- You rank changes: correctness and cost safety first, then visibility, then scale-out, then product-driven redesigns; you say explicitly what you would *not* change, and you keep the list of what was fixed as evidence.

## Check yourself

```quiz
- q: >-
    ADR 0004 says the worst-case daily AI cost is bounded by active users times the daily token budget. Reading the current code, what does that bound leave out?
  options: ["Cache writes, which the billed input limit leaves out of its sum altogether", "Only the cost of quiz generation, which bypasses the per-user budget entirely", "Calls already in flight when a limit is hit, each able to overshoot by its size", "Only the requests that fail upstream, which are never charged to anyone's budget"]
  answer: 2
  explanation: >-
    Every condition is checked before a call starts, so a learner one token under a limit can still start calls whose max_tokens and input carry them past it, and concurrent calls multiply that. Cache writes used to be the big gap, but the input limit now counts billed tokens, writes at 1.25x included. Quiz generation goes through the same reservation as the coach.
- q: >-
    Ascend adds a second replica with no other change. What happens to rate limiting and to the AI budgets?
  options: ["The budgets double, but the rate limits stay correct because they are per IP", "Both stay correct, because the limiters are keyed by session and by account, not IP", "Both break, because every replica ends up with its own copy of the ai_usage table", "Every limiter is per replica, so limits roughly double; budgets stay correct"]
  answer: 3
  explanation: >-
    governor keeps its buckets in process memory, whatever the key, which is why the code calls the Limiters type the seam for Redis. The ai_usage table lives in Postgres and is shared by all replicas, and its reservation is one conditional upsert, so budgets are unaffected.
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
    The rate limiter moves to Redis, and Redis becomes unavailable. What is the best default behaviour?
  options: ["Allow every request with no limits at all until Redis comes back", "Reject every request until Redis returns, so no abuse slips through", "Restart the replicas in a loop until they can reach Redis again", "Fall back to local limits, each replica taking its share of the limit, and alert"]
  answer: 3
  explanation: >-
    Failing closed turns a limiter outage into a site outage; failing fully open removes abuse protection at the worst time. Degrading to local limits of the limit divided by N keeps approximate protection and availability, and the alert makes sure someone fixes Redis.
- q: >-
    A product manager asks for a public leaderboard. At 100,000 DAU with 15 runs per user per day, why verify only credited submissions rather than every run?
  options: ["Browsers cannot send every run to the server without slowing the editor down badly", "Server-side runs are less accurate than browser runs for Python code", "Only credited submissions include the hidden tests that actually need protecting", "1.5 million sandboxed runs a day, versus a fifteenth of that for credited ones"]
  answer: 3
  explanation: >-
    Verifying every run is on the order of 90 busy vCPUs at peak; one credited submission per solve is roughly a fifteenth of that for the same security guarantee. The leaderboard only needs trustworthy results for what it counts, so browser runs stay for feedback and ADR 0003's economics survive.
```
