---
slug: building-the-ai-coach
title: "Building the AI coach: streaming, caching and budgets"
description: How Ascend streams model replies through a channel so a closed tab cannot lose a reply or skip its bill, how its prompt caching went from one breakpoint to three blocks, and why a budget check had to become one statement.
minutes: 45
difficulty: hard
tags: [case-study, llm, sse, streaming, prompt-caching, rate-limiting, cost-control]
---
The coach is the most expensive thing Ascend does. Every reply is a call to a paid API that bills per token, takes anywhere from a few seconds to a minute to finish, and is made on behalf of a user who signed up for free. The user is probably on a phone, and phones close tabs, lose signal and switch apps in the middle of a reply.

That gives three requirements that pull against each other. Text must appear as it is generated, or a 40-second reply feels broken. The reply and its token cost must be recorded even if the user leaves halfway, or closing the tab becomes a way to get free tokens and lose history. And no single user, script or bug may spend the shared budget. This lesson reads the code that meets those requirements (`crates/core/src/ai/`, `crates/api/src/routes/{coach.rs,sse.rs}`, `web/src/lib/api.ts`, `web/src/pages/Coach.tsx`), including one real bug where a React route change dropped a reply on the floor, three weaknesses a design review found and the code has since fixed, and the gaps that remain.

## A small typed client instead of an SDK

There is no official Anthropic SDK for Rust, so `crates/core/src/ai/anthropic.rs` is a 300-line client that covers exactly what the product uses: one-shot completions for JSON outputs and streamed text for chat. The whole request shape lives in one function:

```rust
// crates/core/src/ai/anthropic.rs — AnthropicClient::builder
fn builder(&self, req: &Request, stream: bool) -> AppResult<reqwest::RequestBuilder> {
    let body = Body {
        model: &req.model,
        max_tokens: req.max_tokens,
        system: std::iter::once(SystemBlock {
            kind: "text",
            text: &req.system,
            cache_control: Some(CacheControl { kind: "ephemeral" }),
        })
        .chain(req.context.as_deref().map(|text| SystemBlock { kind: "text", text, cache_control: None }))
        .collect(),
        messages: &req.messages,
        thinking: Thinking { kind: "adaptive" },
        output_config: OutputConfig {
            effort: req.effort,
            format: req.json_schema.clone().map(|schema| OutputFormat { kind: "json_schema", schema }),
        },
        cache_control: req.cache_conversation.then_some(CacheControl { kind: "ephemeral" }),
        stream,
    };
```

Five decisions are visible in those lines. The system prompt is split in two: a stable block (`req.system`) that carries a cache breakpoint, and an optional per-request context block (`req.context`) after it with none; a top-level `cache_control` switches on automatic caching of the conversation for multi-turn chats. (What that buys, and what the single-block version it replaced cost, is the subject of the caching section below.) Thinking is adaptive, so the model decides how much to reason, and `effort` is the dial: the coach uses `Medium`, the interview grader `High`. JSON-schema output is optional per request, which is how quizzes and evaluations get guaranteed-parseable JSON without a retry loop. And streaming is a boolean on the same body, so the streaming and non-streaming paths cannot drift apart. Two unit tests serialise a request and assert the block layout, because a silent change here would not break anything visibly; it would only raise the bill.

The streaming method has a contract written in its doc comment: *the returned stream always ends with exactly one `Done` or `Error` event.*

```rust
// crates/core/src/ai/anthropic.rs — AnthropicClient::stream
while let Some(item) = events.next().await {
    match item {
        Ok(ev) => match serde_json::from_str::<SseEvent>(&ev.data) {
            Ok(SseEvent::MessageStart { message }) => {
                usage.input_tokens = message.usage.input_tokens;
                usage.cache_read_input_tokens = message.usage.cache_read_input_tokens;
                usage.cache_creation_input_tokens = message.usage.cache_creation_input_tokens;
            }
            Ok(SseEvent::ContentBlockDelta { delta: Delta::Text { text } }) => yield StreamEvent::Delta(text),
            Ok(SseEvent::MessageDelta { delta, usage: u }) => {
                usage.output_tokens = u.output_tokens;
                finished = true;
                yield StreamEvent::Done { usage, stop_reason: delta.stop_reason };
                break;
            }
            // ... Error events and transport errors set `finished` and yield Error
        },
    }
}
if !finished {
    yield StreamEvent::Done { usage, stop_reason: None };
}
```

The invariant matters because everything downstream settles accounts on the terminal event. If the upstream connection simply ends (a proxy cut it, the provider restarted), the `finished` flag still produces a `Done`, so the consumer records whatever usage it saw. Notice also what is *not* forwarded: thinking deltas fall into `Delta::Other` and are dropped. While the model thinks, no bytes flow to the browser, which is why the SSE response sends a keep-alive comment every 15 seconds.

Errors are translated once, in `map_status`: a provider 429 becomes `AppError::RateLimited` with a 30-second retry hint, 529 and 503 become "overloaded, try again shortly", 401/403 become "the AI coach is temporarily unavailable" (a credentials problem is ours to fix, and the learner only needs to know the feature is down), and a 400 becomes a generic "the AI provider rejected the request". The provider's error body is logged and never forwarded, because it can echo request content.

That rule used to have a hole, and it is worth seeing where. `map_status` only runs when the HTTP status is an error, before streaming starts. Once a 200 stream was open, a provider `error` event (`overloaded_error` halfway through a reply, say) and a transport failure were turned into `StreamEvent::Error(error.message)` and `StreamEvent::Error(e.to_string())`, and `sse::respond` sent that text to the browser as it was. The same was true of non-streaming failures, which built `AiUpstream` from a reqwest error or a JSON parse error. The fix logs the provider's words and shows the learner a classified message of its own:

```rust
// crates/core/src/ai/anthropic.rs
/// What the learner sees when a reply stops part-way. Provider error text is
/// logged, never shown: it can echo request content or internal details.
fn interrupted_message(kind: &str) -> &'static str {
    match kind {
        "overloaded_error" => "The AI provider is overloaded, so the reply stopped early. Try again shortly.",
        "rate_limit_error" => "The AI provider is busy, so the reply stopped early. Try again in a moment.",
        _ => "The reply was interrupted. Try again.",
    }
}
```

and every non-streaming failure goes through `AppError::ai_upstream(public, detail)`, which logs `detail` and returns only `public`. The learner still learns what *kind* of failure it was, which is what they need to decide whether to retry. Two unit tests pin it against a real socket: a tiny local HTTP server replays a stream whose `error` event contains the word SECRET, and `provider_error_text_never_reaches_the_learner` asserts that the event the learner receives mentions "overloaded" and not SECRET; `upstream_throttling_carries_a_retry_hint` does the same for a 429. Every path that turns someone else's text into yours needs its own check, because a rule enforced in one function covers exactly that function.

**Rejected alternative:** a multi-provider LLM library or an unofficial crate. It would save 300 lines and cost control over the exact bytes sent, which is where prompt caching lives, and add a dependency whose request shape changes on its schedule, not yours. **Failure mode prevented:** a silent change in how the system prompt is serialised, which would not break anything visibly but would quietly turn every cache read into a cache write. **At 100x:** the client has no retries and no circuit breaker. A provider overload today becomes an error bubble in the chat. With real traffic you would add bounded retries with jittered backoff for 529s on the non-streaming path and a breaker that flips AI features to the existing "unavailable" state when the error rate crosses a threshold, rather than letting every user wait for a timeout.

## Streaming through a channel, not through the handler

The obvious way to stream is to return the upstream stream from the handler, mapped to SSE events, and persist the reply when the stream ends. It works in every demo. Its failure mode is in how Axum handles a disconnect: when the browser goes away, the response body is dropped, and with it every future it owns. The upstream request is cancelled mid-reply, the "persist when done" code never runs, and the tokens already generated are never recorded. Closing the tab would be a way to get free output and a conversation with a missing reply.

Ascend inverts ownership. The upstream stream is moved into a background task that owns persistence; the HTTP response is only a reader of a channel.

```rust
// crates/api/src/routes/coach.rs — send
let client = state.coach.client()?.clone();
ensure_coach_unlocked(&state, user.id).await?;
let (conv, _) = state.coach.get_conversation(user.id, id).await?;
let progress = state.progress.summary(user.id).await.ok();
let request = state.coach.prepare_turn(user.id, &conv, input, progress.as_ref()).await?;
let upstream = client.stream(&request).await?;

let (tx, rx) = sse::channel();
let coach = state.coach.clone();
// The spawned task outlives the request; `.instrument` carries the request
// span (method, path, request id) into its logs.
state.tasks.spawn(
    async move {
        futures::pin_mut!(upstream);
        let (reply, usage, error) = sse::pump(upstream, &tx).await;
        if let Some(e) = &error {
            tracing::warn!(error = %e, conversation = %conv.id, "coach stream error");
        }
        // ... one log line with every token class, then:
        if let Err(e) = coach.finish_turn(user.id, conv.id, reply, usage).await {
            tracing::error!(error = %e, "failed to persist coach reply");
        }
    }
    .instrument(tracing::Span::current()),
);
Ok(sse::respond(rx))
```

The pump forwards every event and deliberately ignores send failures:

```rust
// crates/api/src/routes/sse.rs — pump
while let Some(ev) = upstream.next().await {
    match &ev {
        StreamEvent::Delta(t) => full.push_str(t),
        StreamEvent::Done { usage: u, .. } => usage = *u,
        StreamEvent::Error(e) => error = Some(e.clone()),
    }
    // A closed receiver just means the browser went away; keep consuming
    // so the reply is still persisted and its usage still recorded.
    let _ = tx.send(ev).await;
}
(full, usage, error)
```

```mermaid
sequenceDiagram
  participant B as Browser
  participant H as send handler
  participant T as spawned task
  participant A as Anthropic
  participant DB as Postgres
  B->>H: POST /api/coach/conversations/ID/messages
  H->>DB: check solo lock, load conversation, reserve budget, insert user message
  H->>A: POST /v1/messages with stream true
  A-->>H: 200, event stream opens
  H->>T: spawn pump with upstream and tx
  H-->>B: 200 text/event-stream reading rx
  loop every text delta
    A-->>T: content_block_delta
    T-->>B: event delta via channel
  end
  A-->>T: message_delta with usage
  T-->>B: event done
  Note over B,T: if the browser left, sends fail and are ignored
  T->>DB: insert assistant message, touch conversation
  T->>DB: add every token class to ai_usage
```

Three details make this correct rather than merely plausible.

**Backpressure.** `sse::channel()` is `mpsc::channel(64)`. If the browser is connected but slow, `tx.send(...).await` waits once 64 deltas are buffered, so the task stops reading from Anthropic and TCP flow control pushes back upstream. Memory per stream is bounded. Only a *closed* receiver makes `send` return immediately, and then the task drains the rest of the reply at full speed.

**No database connection is held while streaming.** `prepare_turn` uses the pool before the call; `finish_turn` uses it after. A thousand concurrent streams need a thousand small tasks and zero extra connections from the 20-connection pool, which is why long streams do not starve the lesson API.

**Bounded lifetime.** The HTTP client is built with `timeout(AI_TIMEOUT_SECS)` (180 s by default), and a reqwest total timeout covers reading the body, so a stuck upstream ends the task with an `Error` and the invariant above still produces a terminal event.

**Tracked, not just spawned.** The first version used a bare `tokio::spawn`. That protected a reply from a closed tab but not from a deploy: on SIGTERM, Axum's graceful shutdown waits for in-flight *requests*, and a stream whose browser had already gone was no longer a request, only a task nobody was waiting for. When `main` returned, the runtime dropped it mid-reply, and the reply and its usage record were lost, the very outcome the channel design exists to prevent. Now the task is spawned on `state.tasks`, a `TaskTracker` from `tokio_util`, and after the server stops accepting connections `main` does this:

```rust
// crates/api/src/main.rs — main
state.tasks.close();
if tokio::time::timeout(Duration::from_secs(30), state.tasks.wait()).await.is_err() {
    tracing::warn!(remaining = state.tasks.len(), "background tasks still running at shutdown");
}
```

The wait is bounded because a hung upstream must not block a deploy indefinitely, and because the platform will eventually kill the process anyway. So the guarantee is now "replies that finish within 30 seconds of shutdown are persisted", and anything longer is counted in a log line rather than lost silently. A job queue with a worker that streams through a broker is what removes the bound, at the cost of a second moving part. The same change added `.instrument(tracing::Span::current())`, so the task's log lines carry the request's id even though they are written after the response has ended.

There is a cost to this design worth saying out loud. The Stop button in `useStreamingChat` aborts the `fetch`, which closes the connection, which the server treats exactly like a closed tab: it keeps generating and bills the full reply. Stop saves the learner's attention, not tokens. Distinguishing "stop" from "disconnect" needs a cancellation token the stop endpoint can trigger; the code does not have one.

```viz
{"type": "network", "scenario": "long-polling-vs-sse", "title": "Why SSE fits a one-way token stream", "caption": "Ascend uses SSE over a POST: one request, a response that keeps sending delta events, and a 15-second keep-alive comment while the model thinks."}
```

### Why not EventSource or WebSockets

`EventSource` is the browser's built-in SSE client, and it can only issue GET requests with no body and no custom headers. The coach needs to POST the message plus the learner's editor contents, and every mutating request must carry `X-Requested-With` for CSRF. So `web/src/lib/api.ts` uses `fetch` and parses the byte stream by hand:

```typescript
// web/src/lib/api.ts — streamPost
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let idx: number;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).replace(/\r$/, "");
    buffer = buffer.slice(idx + 1);
    if (line === "") dispatch();
    else if (line.startsWith(":")) continue;
    else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
}
dispatch();
```

Network reads split anywhere, including inside a UTF-8 character and inside a line, which is why the decoder runs with `stream: true` and only complete lines are processed. A delta containing a newline arrives as several `data:` lines (Axum splits it), and `dispatch` joins them back with `\n`. WebSockets were never seriously considered: the data flows one way, SSE is plain HTTP that passes through the same middleware (cookies, CSRF, request IDs, timeouts), and it needs no second protocol on the server. See [Real-time transports](/learn/networking/application-protocols/real-time-transports) for the general comparison.

## The incident: a route change that dropped the reply

The first version of the coach page had two routes, `/coach` and `/coach/:id`, both rendering `CoachPage`. A learner on a fresh `/coach` page types a question. `send` creates a conversation, then navigates to `/coach/<new id>` so the URL is shareable and survives a reload, then starts streaming.

In React Router, two sibling `<Route>` elements are two different positions in the tree. Navigating from one to the other unmounted the first `CoachPage` and mounted a new one. The stream kept running inside the closure of the *old* instance, writing deltas into state that no longer existed; the new instance started with empty turns and then hydrated from the server, which at that moment held only the user's message. The reply never appeared. Because the spawned task persisted it, a reload showed it, which is exactly the kind of bug that looks like a flaky network in manual testing.

It was caught by the live AI Playwright test, which asserts that the reply renders *before* reloading and that the URL changed:

```typescript
// web/e2e/ai.spec.ts
test("coach streams a grounded reply and keeps the conversation", async ({ page }) => {
  await register(page);
  await page.goto("/coach");
  await page.getByTestId("coach-input").fill("In one sentence: what does a hash table's load factor measure?");
  await page.keyboard.press("Enter");
  // The assistant bubble fills in as SSE deltas arrive.
  await expect(page.locator("text=/entries|slots|buckets/i").first()).toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/\/coach\/[0-9a-f-]+$/);
  await page.reload();
  await expect(page.locator("text=/load factor/i").first()).toBeVisible();
});
```

The fix has two parts. One route with an optional segment keeps the element at the same tree position, so navigation re-renders the same instance instead of remounting it:

```typescript
// web/src/App.tsx
{/* One route with an optional segment: creating a conversation navigates
    /coach -> /coach/:id without remounting the page mid-stream. */}
<Route path="/coach/:id?" element={<RequireAuth><CoachPage /></RequireAuth>} />
```

And a guard stops server hydration from overwriting a stream this instance owns:

```typescript
// web/src/pages/Coach.tsx — CoachPage
// The conversation this page instance created and is streaming into. Its
// turns live in local state; server history must not overwrite them.
const localConv = useRef<string | null>(null);
// ...
useEffect(() => {
  if (!id) {
    if (!chat.busy) chat.setTurns([]);
    return;
  }
  if (id === localConv.current) return;
  chat.setTurns(detail.data?.conversation.id === id ? ChatHistoryToTurns(detail.data.messages) : []);
}, [detail.data, id]);
```

The general lesson: component identity is part of your state model. A URL change is not "just navigation" when a long-lived operation lives in component state, and the only test that reproduces the timing is one with a real stream. No unit test of `useStreamingChat` or of the parser would have found it.

## Prompt caching: from one breakpoint to three blocks

Prompt caching is a prefix match. The provider caches the request up to a `cache_control` breakpoint; a later request whose bytes up to that point are identical reads the cached prefix instead of reprocessing it. The prompt renders in a fixed order, tools, then system, then messages, so a change anywhere invalidates everything after it. On the configured model (`claude-opus-5-5`, $4 per million input tokens), a cache write costs 1.25x the input price ($5 per million), a read costs 0.05x ($0.20 per million), and an entry lives for five minutes, refreshed by every read. Caches are shared within the API workspace, so identical prefixes are shared across learners.

### Before: a stable-first prompt with a single breakpoint

The first version assembled one system prompt, stable parts first: the persona and a curriculum map, then the lesson text (up to 24,000 characters), the learner's editor contents (up to 12,000) and a progress line. The ordering was the right instinct, but the client sent the whole prompt as *one* block with one breakpoint at its end. The cacheable unit was therefore the entire system prompt, volatile tail included, and the conversation history after it was never cached at all:

| Situation | Cache behaviour with one block |
|---|---|
| Turn 2..n of the same dock conversation within 5 minutes | System prompt hit (same lesson, same editor snapshot, same progress); history paid in full |
| Learner finishes a lesson between turns | Miss: the progress line changed, so the whole prompt was written again |
| Same lesson, different learner or different code | Miss: the persona and curriculum map, identical for everyone, were re-written |
| The conversation history | Never cached: only the system block carried a breakpoint |

The client also parsed `cache_read_input_tokens` and `cache_creation_input_tokens`, and `record` threw them away, so nobody could see the hit rate; and since the provider's `input_tokens` counts only uncached input, `ai_usage.input_tokens` under-reported what was billed.

### After: stable block, context block, cached conversation

The AI hardening commit (`1d3da0c`) split the prompt along its rates of change:

```rust
// crates/core/src/ai/coach.rs — CoachService::prepare_turn
Ok(Request {
    model: self.model.clone(),
    system: self.stable_prompt(),
    context: Some(self.context_prompt(&context, progress)),
    cache_conversation: true,
    messages: msgs,
    max_tokens: 4000,
    effort: Effort::Medium,
    json_schema: None,
})
```

`stable_prompt` is the persona and curriculum map, identical for every learner and every turn, sent with its own breakpoint. `context_prompt` is the lesson or problem, the editor contents and the progress line, sent after that breakpoint, so changing it never invalidates the stable block. `cache_conversation: true` sets the top-level `cache_control`, which places a breakpoint on the last message and moves it forward as the conversation grows, so each turn reads everything up to the previous turn and writes only what is new. The history has a cap, and how the cap moves decides whether caching survives a long conversation. `prepare_turn` used to send the last 30 messages (`MAX_HISTORY`). From the sixteenth turn, that window slid by one exchange every turn, so the first message of the history changed on every request, the cached prefix ended at the context block, and every turn wrote its whole history to the cache again at 1.25x: the longer the conversation, the more each turn cost. The window now moves in steps:

```rust
// crates/core/src/ai/coach.rs
/// Index of the first message to send, for a conversation of `total`
/// messages: 0 until the window is full, then advancing in whole steps so
/// between `MAX_HISTORY - HISTORY_STEP` and `MAX_HISTORY` messages are kept.
fn history_start(total: u64) -> u64 {
    if total <= MAX_HISTORY {
        return 0;
    }
    (total - MAX_HISTORY).div_ceil(HISTORY_STEP) * HISTORY_STEP
}
```

With `HISTORY_STEP` at 10, the start jumps ten messages at once and then stays put for five turns, so four turns in five read their whole history from cache and one in five pays for a rewrite; the model sees between 21 and 30 messages instead of exactly 30. The unit test `history_window_moves_in_steps_so_the_cached_prefix_survives` checks both the jump and the bounds for every length up to 500. Trading a little context for a stable prefix is a typical cache design move: make the thing that changes change rarely, in big steps. `m0006` added `cache_read_tokens` and `cache_write_tokens` columns, `record` stores them, and every coach turn logs all four token classes.

A worked example makes the difference concrete. Take a 10-turn dock conversation, every turn within five minutes, with a 2,000-token stable block, a 6,000-token context block, and 1,100 tokens of new history per turn (a 100-token question and a 1,000-token reply):

| Design | Input tokens and their price | Input cost |
|---|---|---|
| No caching | 130,500 tokens at $4/M | $0.52 |
| One block, one breakpoint (before) | system: 8,000 written, 72,000 read; history: 50,500 uncached | $0.26 |
| Stable, context, cached conversation (after) | 18,000 written, 112,500 read | $0.11 |

Output is the same in all three (10,000 tokens at $20 per million, $0.20), so caching the history more than halves the input bill for a conversation like this one. Two caveats keep the table honest. The context block sits *before* the history, so when it changes (the learner finishes a lesson and the progress line moves) the stable block is still read but the whole history is written again, at 1.25x. And a learner who reads for seven minutes between questions finds every entry expired except, usually, the stable block, which other learners' traffic keeps warm.

One consequence reached into the budget below. With automatic caching, almost every input token of a coach turn is billed as a cache read or a cache write, so the provider's *uncached* `input_tokens`, which `record` adds to `ai_usage.input_tokens`, stays close to zero. See [LLM system design](/learn/ai-and-llms/building-with-llms/llm-system-design) for caching strategy in general.

## Budgets: reserve before, settle after

Every model call goes through `BudgetService`, the only code that touches `ai_usage` (one row per user per UTC day). The ordering is deliberate. A request slot is reserved *before* the call, so a call that fails upstream still costs a slot (fail closed for abuse, and a client retrying in a loop runs out quickly). Tokens are recorded *after*, in the background task, which a disconnect cannot skip. On top sits `Bucket::Ai` in `middleware/rate_limit.rs`, 20 model calls per minute per session, for bursts; the daily budget is the cost fuse. (That limiter used to be keyed by IP and to cover every coach route, reading history included, until the live AI and smoke suites, whose browsers all share one address, showed it throttling a class behind one NAT; [Authentication and security](/learn/case-study-ascend/the-system/authentication-and-security) tells that story.)

### Before: a check and an increment

```rust
// crates/core/src/ai/budget.rs — BudgetService::check_and_reserve, before 1d3da0c
pub async fn check_and_reserve(&self, user_id: Uuid) -> AppResult<()> {
    let status = self.status(user_id).await?;
    if status.requests_used >= status.requests_limit {
        return Err(AppError::RateLimited(format!(
            "daily AI request limit reached ({} / day). Resets at midnight UTC.",
            status.requests_limit
        )));
    }
    if status.output_tokens_used >= status.output_tokens_limit {
        return Err(AppError::RateLimited("daily AI token budget reached. Resets at midnight UTC.".into()));
    }
    self.bump(user_id, 0, 0, 1).await
}
```

`bump` was an `INSERT ... ON CONFLICT (user_id, day) DO UPDATE SET requests = ai_usage.requests + $n`, so the increment itself was atomic. Read the function as an adversary, though. The check was a read, the increment a separate statement, and nothing tied them together. Two requests arriving together when the user was at 149 of 150 both read 149, both passed, both incremented: 151. The overshoot was bounded by how many requests one user could have in flight, which made it easy to miss, and it was still a broken invariant.

### After: the database decides

```rust
// crates/core/src/ai/budget.rs — BudgetService::check_and_reserve
let sql = format!(
    r#"
    INSERT INTO ai_usage (user_id, day, input_tokens, output_tokens, requests)
    VALUES ($1, $2, 0, 0, 1)
    ON CONFLICT (user_id, day) DO UPDATE
       SET requests = ai_usage.requests + 1
     WHERE ai_usage.requests < $3
       AND {BILLED_INPUT_SQL} < $4
       AND ai_usage.output_tokens < $5
    RETURNING requests
    "#
);
// ... bind the user, today and the three daily limits, then:
match self.db.query_one_raw(stmt).await? {
    Some(_) => Ok(()),
    None => Err(AppError::RateLimited {
        message: /* "daily AI budget reached ... Resets at midnight UTC." */,
        retry_after_secs: Some(seconds_until_reset()),
    }),
}
```

`ON CONFLICT DO UPDATE ... WHERE` updates only when the condition holds, and `RETURNING` produces a row only if something was inserted or updated, so no row back means "over budget" and nothing changed. The row lock taken by the conflicting update serialises concurrent reservations for the same user. The test `ai_budget_reservation_cannot_be_overshot_by_concurrency` fires 30 reservations at once against a limit of 10 and asserts that exactly 10 succeed. The same commit added a daily *input* token limit (`AI_DAILY_INPUT_TOKENS`, two million by default) beside the request and output limits, and that limit then had a gap of its own.

### Before and after: a limit on the wrong column

The input limit first compared against `ai_usage.input_tokens`, the provider's *uncached* count, and the same commit turned on conversation caching, which drives that count close to zero for coach and interview turns. The input tokens that actually cost money in those turns are cache writes, billed at 1.25x, which were recorded in `cache_write_tokens` and checked against nothing. A client that sent different editor contents with every message could make each request a near-complete cache write and never approach the limit. Two features that were each correct had combined into a fuse that no longer measured the current flowing through it.

The fix changed what the limit counts, not the limit itself. `BILLED_INPUT_SQL` is `input_tokens + cache_write_tokens * 5 / 4 + cache_read_tokens / 10`, integer arithmetic in the same `WHERE` clause, and `status()` reports the same billed figure to the learner. The test `cache_writes_count_against_the_input_budget_and_the_refusal_says_when_to_retry` records 90,000 cache-write tokens with zero uncached input and asserts that the next reservation is refused and that the learner's usage reads 112,500. The weights are deliberately simple: the configured model bills reads at 0.05x, so counting them at 0.1x errs on the safe side. And the refusal now says when to come back: `RateLimited` carries `retry_after_secs`, set to the seconds until the next UTC midnight, which the API sends as `Retry-After`.

One gap remains, and it is about what a pre-call check can know. **Token overshoot:** the conditions are checked before the call, so a user at 119,999 of 120,000 output tokens can still start a call with `max_tokens` 4,000 (the coach) or 6,000 (quiz generation), and a handful of concurrent calls multiply that. Reserving `max_tokens` up front and refunding the unused part when the call settles, the way a card authorisation hold works, closes it. Budgeting in money rather than weighted tokens would go one step further and survive a change of model or price.

**Rejected alternatives:** counting in process memory (lost on every deploy, and wrong the moment there is a second replica); Redis (a second stateful dependency for a single-instance app, when Postgres already has the row and the atomic upsert); relying only on a spend limit at the provider (it protects the company's card, not fairness between users, and it fails everyone at once). **Failure mode prevented:** one looping client exhausting the shared key. **At 100x:** the table stays correct across replicas because the state is already in Postgres; reserving `max_tokens` and budgeting in money are what remain, and the final module's cost lesson prices why.

## What the coach deliberately is not

The coach makes exactly one model call per user turn and has no tools. That keeps cost per turn predictable: one request slot, at most `max_tokens` output. The moment you give it tools ("look up my last submission", "search the curriculum"), each user turn becomes a loop of model calls, and each iteration re-sends the growing transcript.

```viz
{"type": "ml", "algorithm": "agent-loop", "text": "Why does my two_sum submission fail the hidden test?", "title": "What the coach would become with tools", "caption": "Every iteration re-reads the whole transcript. A per-request budget undercounts an agent; you budget per iteration and cap iterations."}
```

The persona rule "never hand over a full solution" is also worth naming for what it is: an instruction, not an enforcement mechanism. The product relies on it because the learner who extracts a solution only cheats themselves. See [Agents](/learn/ai-and-llms/building-with-llms/agents) for when that trade changes.

## Exercise

```exercise
id: parse-sse-stream
title: Parse an SSE byte stream into events
prompt: |
  Implement `parse_sse(chunks)`, the parser from `web/src/lib/api.ts`.
  `chunks` is a list of strings in the order they were read from the
  network; a chunk may end anywhere, even in the middle of a line.

  Return a list of `[event, data]` pairs, using these rules:

  - Only complete lines (ending in `\n`) are processed; strip one trailing `\r`.
  - An empty line dispatches the pending event if at least one `data:` line
    was collected. After a dispatch the event name resets to `"message"`.
  - A line starting with `:` is a comment (keep-alive) and is ignored.
  - `event:` sets the event name to the rest of the line, trimmed.
  - `data:` appends the rest of the line with at most one leading space removed.
    Several data lines are joined with `\n`.
  - When the input ends, dispatch any pending data. An unterminated final
    line (no `\n`) is dropped.
languages: [python, javascript]
entry: parse_sse
starter:
  python: |
    def parse_sse(chunks):
        events = []
        # your code here
        return events
  javascript: |
    function parse_sse(chunks) {
      const events = [];
      // your code here
      return events;
    }
tests:
  - args: [["event: delta\ndata: Hello\n\n"]]
    expected: [["delta", "Hello"]]
  - args: [["event: del", "ta\nda", "ta: Hel", "lo\n", "\n"]]
    expected: [["delta", "Hello"]]
    label: chunks split mid-line
  - args: [["event: delta\ndata: line one\ndata: line two\n\n"]]
    expected: [["delta", "line one\nline two"]]
    label: multi-line data
  - args: [[": ping\n\n", "event: done\ndata: {\"output_tokens\": 12}\n\n"]]
    expected: [["done", "{\"output_tokens\": 12}"]]
    label: keep-alive comment
  - args: [["data: hi\r\n\r\n"]]
    expected: [["message", "hi"]]
    label: CRLF and the default event name
  - args: [["event: delta\ndata: a\n\ndata: b\n\n"]]
    expected: [["delta", "a"], ["message", "b"]]
    hidden: true
    label: event name resets after dispatch
  - args: [["event: done\ndata: {}\n", "data: partial"]]
    expected: [["done", "{}"]]
    hidden: true
    label: end of stream
  - args: [["data:x\n\ndata:  y\n\n"]]
    expected: [["message", "x"], ["message", " y"]]
    hidden: true
    label: only one leading space is stripped
hints:
  - "Keep a string buffer across chunks; append each chunk, then repeatedly cut off everything up to the first newline."
  - "Keep three pieces of state between lines: the buffer, the current event name, and the list of data lines."
  - "Write dispatch as a small function that does nothing when there is no data, and call it once more after the loop."
```

## Senior signals

- You separate **who owns the work** from **who watches it**: the model stream belongs to a task that persists and bills; the HTTP response is a disposable consumer.
- You can say what Stop actually saves (attention, not tokens) and what it would take to make it save tokens.
- You read a budget check as an adversary and notice when the check and the increment are two statements; you know the conditional-upsert fix, why the row lock makes it safe, and which column the limit actually measures.
- You explain prompt caching as a **prefix match up to a breakpoint** with a TTL and a write premium, split prompts by rate of change, and check where the breakpoints are before claiming ordering helps.
- You track background work that must outlive a request, and you state the shutdown guarantee with its bound.
- You treat component identity and route structure as state, and you want an end-to-end test with a real stream before trusting streaming UI.
- You know that thinking tokens bill as output, so `effort` is a cost dial as well as a quality dial.

## Check yourself

```quiz
- q: >-
    A learner closes the tab two seconds into a 30-second coach reply. What happens on the server?
  options: ["The partial reply is discarded, but its tokens are still recorded from the message_start event", "The request is queued and replayed automatically when the learner opens the page again", "Axum drops the response body, which cancels the upstream call, so nothing is stored or billed", "The background task keeps reading, ignores the failed sends, and stores and bills the reply"]
  answer: 3
  explanation: >-
    The upstream stream is owned by a tracked background task, not by the response. When the receiver is dropped, tx.send fails and pump ignores the error, so the task drains the stream, calls finish_turn and records usage. Cancellation on drop is what happens when a handler returns the upstream stream directly, the naive design this code avoids.
- q: >-
    Before the AI hardening commit, two requests from one user arrived together when ai_usage showed 149 of 150 requests. What happened, and what prevents it now?
  options: ["Exactly one succeeded, because the increment was already atomic; nothing had to change", "The second waited for the first model call to end; a per-user mutex now serialises them", "Both failed with a serialisation error; a retry loop around the check now handles it", "Both succeeded and the count reached 151; a single conditional upsert now decides"]
  answer: 3
  explanation: >-
    Each request read 149 in status(), passed the comparison, then ran its own atomic increment. Atomic increments do not make a check-then-act sequence atomic. The fix folds the limits into ON CONFLICT DO UPDATE ... WHERE ... RETURNING, so the row lock serialises reservations and an over-budget request changes nothing.
- q: >-
    A learner asks the coach a question in the dock, completes the lesson (so the progress line changes), and asks again 30 seconds later. What does the prompt cache do on the second request?
  options: ["Reads the whole prompt from cache, because the five-minute lifetime has not expired", "Reads the context and the history, and re-writes only the stable persona block", "Misses everything, because any change anywhere in a request invalidates the entire cache", "Reads the stable block, then re-writes the context block and the history after it"]
  answer: 3
  explanation: >-
    Caching is a prefix match in render order: system blocks, then messages. The stable block is unchanged, so it is read. The context block changed, and everything after it, including the conversation history, must be written again at the write premium. A change invalidates only what follows it, not what precedes it.
- q: >-
    Why does the frontend parse SSE by hand with fetch instead of using the browser's EventSource?
  options: ["EventSource does not decode UTF-8, so multi-byte characters arrive split", "EventSource cannot POST a body or set custom headers, and the coach needs both", "fetch streams deliver tokens faster because they skip the event parser", "EventSource cannot reconnect after a network drop, which phones need"]
  answer: 1
  explanation: >-
    The message and editor contents travel in a POST body, and every mutating request must carry X-Requested-With for the CSRF middleware. EventSource can do neither. It does reconnect automatically, a feature this app gives up, but reconnecting would not make sense for a POST that creates a message anyway.
- q: >-
    The coach page used separate routes for /coach and /coach/:id. Why did replacing them with one route, /coach/:id?, fix the dropped reply?
  options: ["Optional segments match faster, so the navigation finishes before the stream begins", "It stops React Router from refetching the conversation while a stream is running", "It makes navigate() synchronous, so the new page mounts before the very first delta arrives", "The element keeps its tree position, so React re-renders instead of remounting the page"]
  answer: 3
  explanation: >-
    React preserves component state when the element type and position are unchanged. Two sibling routes are two positions, so navigating between them unmounted the page whose closure held the live stream. The localConv guard handles the second half of the bug, hydration overwriting a stream in progress.
- q: >-
    A learner presses Stop 5 seconds into a reply that would have used 3,000 output tokens. Roughly what is billed and stored?
  options: ["Nothing at all, because the provider does not bill aborted requests", "The full reply is generated, billed, stored and counted in ai_usage", "About five seconds of tokens, because Stop cancels the upstream call", "The partial text is stored, and the daily budget refunds the difference"]
  answer: 1
  explanation: >-
    Aborting the fetch closes the connection, which the server cannot tell apart from a closed tab. The background task finishes the stream by design. Saving tokens on Stop needs an explicit cancel signal that the task checks, which trades against the guarantee that disconnects never lose replies.
```
