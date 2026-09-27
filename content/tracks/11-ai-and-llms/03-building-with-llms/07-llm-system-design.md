---
slug: llm-system-design
title: "LLM system design: latency, cost, caching and budgets"
description: An LLM feature designed end to end using this app's AI coach as the worked example, covering prompt layout for caching, streaming over SSE, per-user budgets, schema-constrained outputs and a hints-not-solutions policy, then how a docs chatbot and a coding copilot differ.
minutes: 25
difficulty: hard
tags: [llm, system-design, prompt-caching, streaming, sse, rate-limiting, cost, ai]
---
Design an AI tutor for a free learning platform. It should know which lesson or problem the learner is on and what is in their code editor, stream its replies, keep conversation history, generate fresh quizzes, and run and grade mock interviews. The whole product runs on one shared API key, so a single enthusiastic user or a script must not be able to run up an unbounded bill. And it must teach: a tutor that pastes the answer to every exercise defeats the product.

That is this app's AI coach. This lesson designs it the way you would in an interview or a design review (requirements, numbers, architecture, deep dives, failure modes) and checks each decision against the code in `crates/core/src/ai/` and `crates/api/src/routes/`, including the places where a reviewer would push back. It ends by showing how the same reasoning changes for a documentation chatbot and a coding copilot.

## The numbers

Start with tokens, because tokens are latency and money. The coach's system prompt is assembled per turn from:

| Part | Size | Changes |
|---|---|---|
| Persona and teaching rules | ~350 tokens | On deploy |
| Curriculum map (every track and module title) | ~500 tokens | On deploy |
| Current lesson body, or problem statement plus hints | Up to ~24 KB (about 6,000 tokens) | When the learner moves |
| Editor contents | Up to 12 KB (about 3,000 tokens) | Whenever the learner types |
| Progress summary | ~50 tokens | Occasionally |

On top come up to 30 previous messages of history. A typical turn on a lesson is about 8,000 tokens of system prompt, 3,000 of history and 700 of output. Thinking tokens, when the model reasons before answering, are billed as output, so the effort setting is also a cost setting.

Price that at illustrative frontier-model rates of $5 per million input tokens and $25 per million output tokens, with cache reads at about a tenth of the input price and 5-minute cache writes at 1.25 times it:

| Turn | Input | Output | Total |
|---|---|---|---|
| No caching | 11,000 × $5/M = $0.055 | 700 × $25/M = $0.0175 | $0.073 |
| System prompt read from cache | 8,000 × $0.50/M + 3,000 × $5/M = $0.019 | $0.0175 | $0.037 |
| System prompt written to cache | 8,000 × $6.25/M + 3,000 × $5/M = $0.065 | $0.0175 | $0.083 |

At 2,000 daily coach users averaging 8 turns, that is 16,000 turns a day, somewhere between about $600 and $1,300 depending almost entirely on the cache hit rate. Caching is the largest single lever in the design, which is why the prompt layout comes first.

## The architecture

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API (axum)
  participant D as Postgres
  participant M as Model API
  B->>A: POST /api/coach/conversations/{id}/messages
  A->>A: per-IP rate limit (20 per minute)
  A->>D: check_and_reserve (daily budget), insert user message, load last 30 messages
  A->>M: POST /v1/messages (stream: true)
  A-->>B: SSE response backed by a channel
  Note over A: spawned task pumps model events into the channel
  M-->>A: message_start, content_block_delta ..., message_delta
  A-->>B: event delta ... event done
  A->>D: finish_turn: save reply and token counts, record usage
```

There is no official Rust SDK, so `crates/core/src/ai/anthropic.rs` is a small typed client over HTTP that covers exactly what the app uses: streamed text and one-shot JSON-schema responses. Three products sit on it: the coach, quiz generation and mock interviews. Every model call goes through the budget service first.

## Laying out the prompt for caching

Prompt caching is KV-cache reuse across requests. During prefill, the model computes attention keys and values for every prompt token ([Context windows and the KV cache](/learn/ai-and-llms/how-llms-work/context-windows-and-kv-cache)). If a later request starts with a byte-identical prefix, the provider can load those keys and values instead of recomputing them, which cuts both the price of those tokens and the time to first token.

```viz
{"type": "ml", "algorithm": "kv-cache", "text": "The cat sat",
 "title": "Prompt caching reuses the prefill",
 "caption": "Within one generation the cache avoids recomputing earlier tokens. Prompt caching keeps a prefix's keys and values across requests, so a byte-identical prefix is not prefilled again."}
```

The rules follow from the mechanism. The match is an exact prefix match, in render order: tools, then system, then messages. You mark the end of a cacheable prefix with a `cache_control` breakpoint (Anthropic allows up to four per request). An entry lives for about five minutes by default, refreshed on every hit, with a one-hour option at a higher write price. Prefixes below a model-dependent minimum (from a few hundred to a few thousand tokens) are silently not cached, and the response's `usage` reports `cache_read_input_tokens` and `cache_creation_input_tokens` so you can check.

The coach's `system_prompt` builder in `coach.rs` orders its parts by stability, and says so in a comment:

```rust
let mut s = String::with_capacity(16_000);
s.push_str(COACH_PERSONA);
s.push_str("\n\n# Curriculum map\n");
// ... one line per track with its module titles ...
// Volatile context goes last so the prefix above stays cacheable.
s.push_str("\n# Current context\n");
// ... lesson body or problem statement and hints, then editor contents, then progress
```

The client sends it as a single system block marked for caching, with adaptive thinking and an effort level:

```json
{
  "model": "<AI_MODEL>",
  "max_tokens": 4000,
  "system": [
    {"type": "text", "text": "You are the Ascend coach: ...\n\n# Curriculum map\n...\n\n# Current context\n...", "cache_control": {"type": "ephemeral"}}
  ],
  "messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, {"role": "user", "content": "Why does my loop never terminate?"}],
  "thinking": {"type": "adaptive"},
  "output_config": {"effort": "medium"},
  "stream": true
}
```

Now review it as a senior engineer would. Because the system prompt is one block, its only breakpoint is at the very end, after the editor contents. A cache hit therefore needs the *entire* system prompt, code included, to match one sent in the last few minutes. Two questions in a row about the same lesson with an unchanged editor hit. A learner who edits code between questions misses every time, and each miss pays the 1.25× write premium: in the table above, that learner's turns cost more than they would with caching switched off. The conversation history has no breakpoint, so it is reprocessed at full price on every turn.

The stable-first ordering makes the improvement cheap:

1. **Split the system prompt into blocks** with a breakpoint after the persona and curriculum map, and another after the lesson or problem text. The first prefix is identical for every user, the second for everyone on the same lesson, so hits happen across users as well as across turns. At under a thousand tokens, that first block is above the minimum cacheable length on some models and below it on others; if it is below, the first breakpoint silently does nothing, so check the usage counters.
2. **Move the editor snapshot out of the system prompt** and into the latest user turn, and add a breakpoint at the end of the history. The history becomes an append-only, cacheable prefix. The cost is that old code snapshots accumulate in history, so attach the snapshot only when the code changed.
3. **Log the cache counters.** The client already parses `cache_read_input_tokens` and `cache_creation_input_tokens` from the stream's first event, but only input and output tokens are persisted, so today the hit rate cannot be graphed.

## Streaming replies over Server-Sent Events

A 700-token reply generated at, say, 50–100 tokens per second takes 7–14 seconds to finish. Streaming makes the first words appear as soon as the prefill (and any thinking) is done, and time to first token is the latency users perceive. The coach uses Server-Sent Events: a long-lived HTTP response of `text/event-stream`, one-directional, which is all a chat reply needs ([Real-time transports](/learn/networking/application-protocols/real-time-transports) compares it with WebSockets).

The important design choice is who owns the reply. In `routes/coach.rs`, the handler prepares the turn, opens the upstream stream, and hands it to a spawned task; the HTTP response only reads from a channel:

```rust
let (tx, rx) = sse::channel();                 // tokio mpsc, capacity 64
let coach = state.coach.clone();
tokio::spawn(async move {
    futures::pin_mut!(upstream);
    let (reply, input_tokens, output_tokens, error) = sse::pump(upstream, &tx).await;
    if let Some(e) = &error {
        tracing::warn!(error = %e, conversation = %conv.id, "coach stream error");
    }
    if let Err(e) = coach.finish_turn(user.id, conv.id, reply, input_tokens, output_tokens).await {
        tracing::error!(error = %e, "failed to persist coach reply");
    }
});
Ok(sse::respond(rx))
```

Inside `pump`, each upstream event is appended to the full reply and forwarded with `let _ = tx.send(ev).await;`. If the browser disconnects, the receiver is dropped and `send` fails immediately; the error is deliberately ignored and the loop keeps consuming the model's stream, so `finish_turn` still saves the complete reply and records its tokens. A learner who closes the tab mid-answer finds the whole answer when they come back. The trade-off is explicit: generation continues, and is billed, after the user has left. For a tutor, keeping an answer worth a few cents is the right call; for inline autocomplete, where abandoned requests are the norm, you would cancel upstream on disconnect instead.

The details around it matter as much:

- **Events.** The browser receives `delta` events with text, then exactly one `done` (carrying input tokens, output tokens and stop reason as JSON) or `error`. The client guarantees its stream always ends with one of the two.
- **Keep-alives.** A `ping` comment every 15 seconds stops proxies and load balancers from closing an idle connection. That matters here because the client forwards only text deltas: while the model is thinking, the browser sees nothing but keep-alives.
- **Partial failure.** The user's message is saved before the model is called. If the stream fails midway, whatever text arrived is still saved; if it fails before any text, the conversation is left with two user messages in a row. The next turn passes history through `collapse_roles`, which merges consecutive same-role messages so the API's alternation rule holds.
- **Accounting gaps.** The output-token count arrives in the stream's final event, so a stream that dies midway records no output tokens for that turn, and one that ends in an error records no input tokens either. The request slot was already reserved, so the budget still counts the request.

## Budgets and rate limits

Two independent layers protect the shared key.

**Per-IP rate limiting** stops bursts and scripts. All AI routes pass through an in-memory keyed limiter (the `governor` crate, which implements GCRA and behaves like a token bucket) allowing 20 requests per minute per client IP: a burst of 20, then one more every three seconds. It lives in process memory, which is right for a single instance and resets on deploy; the code comments note it would move to Redis if the API scaled out. [Rate limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) covers the family.

```viz
{"type": "system", "algorithm": "token-bucket", "requests": 10,
 "title": "Burst capacity and refill rate",
 "caption": "Capacity sets the largest burst, refill sets the sustained rate. The coach's per-IP limiter is the same shape: 20 requests of burst, refilled at one every three seconds."}
```

**Per-user daily budgets** cap cost. The `ai_usage` table has one row per user per UTC day with request, input-token and output-token counters. The defaults, configurable by environment variable, are 120 requests and 60,000 output tokens a day. Every model call first runs `check_and_reserve`, which reads today's row, rejects the call with a rate-limit error if either limit is reached, and otherwise counts the request; after the reply, `record` adds the actual token counts. Both writes are the same atomic upsert, which in SQL is:

```sql
INSERT INTO ai_usage (user_id, day, input_tokens, output_tokens, requests)
VALUES ($user, $today, $input, $output, $requests)
ON CONFLICT (user_id, day) DO UPDATE SET
  input_tokens  = ai_usage.input_tokens  + $input,
  output_tokens = ai_usage.output_tokens + $output,
  requests      = ai_usage.requests      + $requests;
```

The increment happens inside the database in one statement, so concurrent requests cannot lose each other's updates the way a read-modify-write in application code would, and the first request of the day creates the row. Postgres rather than Redis is a deliberate fit: the limit is per day, not per millisecond, the counts must survive restarts, and one file (`budget.rs`) owns the whole policy.

A careful reviewer would raise three points.

1. **The check and the increment are separate statements.** Several concurrent requests from a user at 119 can all pass the check before any increment lands, so the limit can overshoot by the user's concurrency (which the per-IP limiter bounds). If it had to be exact, a single conditional upsert does check and increment together: `... DO UPDATE SET requests = ai_usage.requests + 1 WHERE ai_usage.requests < $max_requests AND ai_usage.output_tokens < $max_output RETURNING requests`, where no returned row means over budget.
2. **The token check is pre-flight.** A request that starts below 60,000 output tokens can end above it by up to its `max_tokens` (4,000 for a coach turn). That is fine for a soft cost cap and worth stating.
3. **Input tokens are recorded but not limited.** The output cap bounds output spend at 60,000 × $25/M = $1.50 per user per day, but a long conversation can send tens of thousands of input tokens per request, so 120 requests can cost far more than that on input. The request cap is the real ceiling on input spend. A single budget in cost units, computed from all four usage counters, would bound both. Note too that the API's `input_tokens` counts only uncached input; cached reads are reported separately and are not stored.

Small cost controls appear elsewhere too: a mock interview that ends with fewer than two candidate turns is marked abandoned without calling the grader at all, and user messages are capped at 8,000 characters.

## Structured outputs for quizzes and grading

Quizzes and interview grades are consumed by code, so both use one-shot calls with a JSON schema in `output_config.format` ([Structured outputs and tool use](/learn/ai-and-llms/building-with-llms/structured-outputs-and-tool-use)).

- **Quiz generation** (`quiz.rs`) sends up to 30,000 characters of the lesson inside `<lesson>` tags with a system prompt demanding four options per question, exactly one correct index, at least one scenario question and explanations that address the most tempting wrong option. The requested count is clamped to 3–10. After parsing, questions whose answer index is out of range are dropped, and an empty result is an error.
- **Interview grading** (`interview.rs`) uses a schema whose `verdict` is an enum (`strong_hire`, `hire`, `lean_hire`, `lean_no_hire`, `no_hire`) with per-dimension scores and notes, strengths, improvements and next steps. It runs at high effort, because grading is judgement-heavy and the user waits for it once, at the end; the coach's chat turns run at medium effort because they are interactive. The overall score is clamped to 0–100 after parsing, since the schema cannot express a range.

The client also maps failure modes to user-facing errors: a `refusal` stop reason becomes "the model declined this request", HTTP 429 becomes a try-again-shortly rate-limit error, 529 and 503 become "the provider is overloaded", and other failures become a 502 with a short message while the provider's error body goes to the logs.

## Policy: hints, not solutions

The coach's most important behaviour is pedagogical, and it is enforced in two different ways.

**Structurally, it cannot leak what it never sees.** The content loader strips quiz answers and explanations from lesson bodies, and splits each practice problem's editorial (everything from `## Solution` on) away from its statement. The coach's context gets the public lesson body and the problem statement, never the reference solution or the answer key.

**By instruction, it declines to write solutions.** The persona says: "Never hand over a full solution to an exercise or practice problem the learner is working on. Give the next hint, the invariant, or the question that unblocks them. If they explicitly say they have given up, give the approach in prose first, then code." On a problem page, the context adds the author's hints with an instruction to reveal them one at a time, only when asked, and repeats the rule at the end of the system prompt, closest to the conversation.

An instruction is a probability, not a guarantee: the model can solve most problems itself, and a persistent learner can talk it round. That is acceptable here because the only person harmed is the learner doing the talking, the opposite of a security boundary, where [LLM security](/learn/ai-and-llms/building-with-llms/llm-security) says instructions must never be the control. The same model runs under different policies elsewhere: the mock interviewer is told never to reveal the solution, while the assistant available in AI-assisted interviews is explicitly allowed to write code, because directing and checking an assistant is what that format tests. The policy is measurable, too: [Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability) sketches an eval that runs any code in a coach reply against the problem's own tests.

## Failure modes and degradation

- **No API key configured:** the coach reports itself disabled and the rest of the product works normally.
- **Budget exhausted:** a clear error that says when the limit resets (midnight UTC).
- **Provider overloaded or rate limiting:** mapped to retry-later messages. The client does not retry automatically. One jittered retry *before the first byte* would be safe and cheap; after streaming has started, a retry would duplicate text, so the turn should fail instead.
- **Slow provider:** a 10-second connect timeout and a 180-second overall request timeout, which also bounds the longest possible streamed reply.

## Generalising: a docs chatbot and a coding copilot

The same questions (what is in the context, what does a token cost, what latency does the user perceive, what caps the spend, what must never happen) give different answers for other products.

| | AI coach (this app) | Docs chatbot | Inline coding copilot |
|---|---|---|---|
| Latency that matters | First token in a few seconds | First token in a second or two | Whole suggestion in a few hundred milliseconds, or it is useless |
| Context | Lesson or problem, editor, progress, history | Retrieved chunks with citations | Code around the cursor plus ranked snippets from related files |
| Model | Large, reasoning at medium effort | Mid-size to large, plus retrieval | Small and fast, trained for fill-in-the-middle; larger model for chat |
| Caching | Stable system prefix | Stable system prompt; answer cache for frequent questions keyed on tenant and document version | Prefix reuse per file; cancel stale requests |
| Cost control | Per-user daily budget and per-IP limit | Per-tenant quotas; answer cache | Debounce keystrokes and cancel in-flight requests as the user types |
| Worst failure | Handing over solutions | A confident answer the docs do not support | A suggestion that arrives after the user has moved on |

Two traps are specific to these designs. A **semantic answer cache**, which reuses an answer for a question that embeds close to a previous one, will eventually serve "refunds for US orders" to someone who asked about EU orders, and across tenants it leaks; key caches on the exact normalised question, tenant and document version unless you have measured the risk. And for a **copilot**, most requests are wasted by design, because the user keeps typing: cancellation and debouncing are the cost model, not an optimisation.

## Senior signals

- You start an LLM design from **token arithmetic**: what is in the context, what each turn costs, and how much the cache hit rate swings the bill.
- You lay prompts out **stable first, volatile last**, place cache breakpoints at stability boundaries, and verify hits with the usage counters rather than assuming them.
- You decide **who owns a streamed reply**: a spawned task that persists it survives disconnects at the price of paying for abandoned generations, and you can say when to make the opposite choice.
- You layer **rate limits for bursts and budgets for cost**, use atomic upserts for counters, and know where check-then-increment overshoots.
- You use **schema-constrained output** for anything code consumes and still validate the invariants the schema cannot express.
- You separate **policies enforced by construction** (the coach never sees solutions) from **policies enforced by instruction** (it declines to write them), and you only accept the latter where the harm is contained.

## Check yourself

```quiz
- q: >-
    The coach's system prompt is one block with a single cache breakpoint at its end, after the editor contents. A learner edits their code before every question. What happens to caching?
  options: ["Every turn misses and pays the cache-write premium, because the prefix up to the breakpoint changes whenever the code does", "Every turn hits the cache, because the persona comes first", "Only the history is cached", "Caching is disabled for streaming requests"]
  answer: 0
  explanation: >-
    Caching is an exact prefix match up to a breakpoint. With one breakpoint after the code, any code change changes the cached prefix, so each turn writes a new entry at 1.25 times the input price. Stable-first ordering only pays off with a breakpoint at the stable boundary.
- q: >-
    Why does the coach run the model stream in a spawned task that writes to a channel, instead of streaming directly from the request handler?
  options: ["Spawned tasks generate tokens faster", "SSE requires a separate thread", "To avoid holding a database connection", "So the reply is still consumed and saved when the browser disconnects, because the task, not the HTTP response, owns persistence"]
  answer: 3
  explanation: >-
    If the handler owned the stream, a disconnect would drop it and lose the reply. The task keeps reading after the receiver is gone and calls finish_turn. The cost is paying for generations nobody is watching.
- q: >-
    The daily budget reads today's usage, checks it against the limit, then increments the request counter with an atomic upsert. What can still happen?
  options: ["Lost updates: two increments can overwrite each other", "The counter can go negative", "Concurrent requests can all pass the check before any increment lands, overshooting the limit by the number in flight", "Nothing; atomic upserts make the whole check atomic"]
  answer: 2
  explanation: >-
    The upsert makes each increment atomic, so no update is lost, but the check is a separate read. A conditional upsert that increments only while under the limit and returns the new row closes the gap.
- q: >-
    The budget caps output tokens at 60,000 per user per day. Which cost does that cap not bound?
  options: ["Input spend, because long histories and large system prompts can send many input tokens per request; only the request cap limits it", "Output spend", "Database storage", "Rate-limiter memory"]
  answer: 0
  explanation: >-
    Input tokens are recorded but not limited. With long conversations, input can dominate the bill; a cost-unit budget over all usage counters would bound both.
- q: >-
    The coach never sees a problem's editorial solution, and its prompt also tells it not to write solutions. Why keep both mechanisms?
  options: ["They are redundant; one could be removed", "The instruction is needed for caching", "Stripping the editorial guarantees the reference solution cannot leak; the instruction discourages the model from producing its own solution, which no amount of stripping can prevent", "Stripping is only for performance"]
  answer: 2
  explanation: >-
    Construction removes what the model can leak; instruction shapes what it chooses to generate. The model can solve problems unaided, so the instruction is still needed, and it is acceptable only because a determined learner can harm only their own learning.
- q: >-
    You are designing inline code completion. Which cost control matters most?
  options: ["A per-user daily token budget alone", "Debouncing keystrokes and cancelling in-flight requests when the user keeps typing, since most requests are superseded", "A larger model at high effort", "Persisting every completion in a spawned task"]
  answer: 1
  explanation: >-
    Most completion requests are made obsolete by the next keystroke. Debouncing and cancellation remove that waste; persisting completions the user has already typed past, as the coach does with chat replies, would pay for exactly the work you want to avoid.
```
