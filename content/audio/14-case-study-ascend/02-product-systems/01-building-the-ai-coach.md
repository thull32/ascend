---
lesson: building-the-ai-coach
source: cb330cee9bd83bf2
fit: great
desk:
  - "The streaming method, the pump loop and the send handler, with the sequence diagram"
  - "The prompt-caching cost table for a ten-turn conversation"
  - "The budget hold trace, step by step"
  - "Exercise: parse an SSE byte stream into events"
---
## Introduction

The coach is the most expensive thing Ascend does. Every reply is a call to a paid model API that bills per token, takes anywhere from a few seconds to a minute, and is made for a user who signed up for free. That user is probably on a phone, and phones close tabs, lose signal and switch apps halfway through a reply.

So there are three requirements that pull against each other. Text must appear as it is generated, or a 40-second reply feels broken. The reply and its cost must be recorded even if the user leaves halfway, or closing the tab buys free tokens. And no single user, script or bug may spend the shared budget.

This is the story of how the code meets them, and of what broke on the way: a streaming design that would have lost replies, a page that dropped them, a prompt cache that cached less than it seemed, and a budget that went through four versions.

## A small client with one promise

There is no official Anthropic SDK for Rust, so Ascend has its own client, about 370 lines, covering exactly what the product uses: one-shot completions that return JSON, and streamed text for chat. The rejected alternative was a multi-provider library or an unofficial crate. It would have saved a few hundred lines and cost control over the exact bytes sent, and the exact bytes are where prompt caching lives.

The whole request shape lives in one function. The system prompt is split in two: a stable block with a cache breakpoint, and a per-request context block without one. Thinking is adaptive, and an effort setting is the dial: medium for the coach, high for the interview grader. Two unit tests serialise a request and check that layout, because a silent change there would break nothing visibly. It would only raise the bill.

The streaming method makes one promise: the stream always ends with exactly one done event or one error event. Everything downstream settles accounts on that last event. If the connection to the provider just ends, because a proxy cut it or the provider restarted, a flag still produces a done event, so whatever usage was seen gets recorded.

That error path had a hole. Provider errors were translated into safe messages only when the HTTP status was an error, before streaming began. Once a successful stream was open, an error halfway through, such as the provider being overloaded, was forwarded to the learner in the provider's own words, and those words can echo request content. The fix logs the provider's text and shows the learner a classified message, like "the AI provider is overloaded, so the reply stopped early." A test replays a stream whose error contains the word SECRET and checks the learner never sees it. The lesson: a rule enforced in one function covers exactly that function.

## The stream belongs to a task, not the response

The obvious way to stream is to return the provider's stream from the handler and save the reply when it ends. It works in every demo. Then the browser goes away, Axum drops the response body and every future it owns, and the call to the provider is cancelled mid-reply. The save never runs. The tokens already generated are never recorded. Closing the tab buys free output and leaves a conversation with a missing reply.

Ascend inverts ownership. The handler moves the provider's stream into a background task that owns persistence and billing. The HTTP response is only a reader of a channel. The task forwards each event into the channel and deliberately ignores send failures, because a closed channel just means the browser left. It keeps reading, and at the end it saves the reply and settles the bill.

Four details make that correct. First, backpressure: the channel holds 64 events, so a slow phone makes the task wait, and that pushes back on the provider. Only a closed channel lets the task drain at full speed. Second, no database connection is held during a stream; the pool is used before the call and after it. A thousand concurrent streams need a thousand small tasks and none of the 15 connections each replica has. Third, the HTTP client has a total timeout of 180 seconds, so a stuck provider still ends in an error event.

The fourth detail was learned the hard way. The first version spawned a bare task. That protected a reply from a closed tab, but not from a deploy. On shutdown, Axum waits for in-flight requests, and a stream whose browser had gone was just a task nobody was waiting for. When the program exited, the reply died mid-sentence.

[pause]

Now the task is spawned on a tracker, and shutdown waits for tracked tasks for up to 30 seconds, after draining connections for up to 25. Both limits fit inside Railway's 60-second draining window. And here is the twist: until a later commit set that window, it was Railway's default of zero seconds. The kill signal followed the shutdown signal at once, so none of this careful shutdown had ever run in production. Today it is tested over real sockets, and CI sends the production container a shutdown signal and requires a clean exit within 25 seconds.

There is a cost, and the lesson says it out loud. The Stop button aborts the request, and the server cannot tell that apart from a closed tab. It keeps generating and bills the full reply. Stop saves the learner's attention, not tokens.

## The wire format, and a reply that vanished

Why not the browser's built-in EventSource? It can only send GET requests, with no body and no custom headers. The coach needs to POST the message and the learner's editor contents, with a CSRF header. So the frontend reads the stream with fetch and parses server-sent events by hand.

The first parser was right for the common case. It split lines on newline only. But the format also ends a line at a lone carriage return, and Axum's encoder emits one whenever the payload contains a carriage return. A reply ending in one reached the learner with a stray fragment of protocol text attached. Model output rarely contains a carriage return, so nobody noticed until a review against the Axum source. The fix follows the spec and is tested with the server's own bytes, split at every possible offset. When you reimplement one side of a wire format, test against bytes the other side really produces.

The more instructive bug was in React. The coach page had two routes, one for a fresh coach page and one with a conversation id, both rendering the same page. A learner on a fresh page asks a question. The page creates a conversation, navigates to its URL so it survives a reload, and starts streaming.

Two sibling routes are two positions in the component tree. Navigating from one to the other unmounted the old page and mounted a new one. The stream kept writing into the old page's closure. The new page loaded from the server, which so far held only the question. The reply never appeared, and yet a reload showed it, because the background task had saved it. That looks exactly like a flaky network in manual testing.

The live end-to-end test caught it, because it checks the reply renders before reloading. The fix: one route with an optional id segment, so the page keeps its tree position and re-renders instead of remounting, plus a guard so server data never overwrites a stream the page owns. Component identity is part of your state model.

## Prompt caching: from one breakpoint to three blocks

Prompt caching is a prefix match. A later request whose bytes are identical up to a breakpoint reads that prefix from cache. A change anywhere invalidates everything after it. On the configured model, input costs 4 dollars per million tokens. Writing to the cache costs one and a quarter times that, reading costs a twentieth, and an entry lives five minutes, refreshed on every read.

Before: the prompt was assembled stable parts first, persona and curriculum map, then the lesson, the editor contents and a progress line. Right instinct. But it went out as one block with one breakpoint at the end. So finishing a lesson changed the progress line and rewrote the whole prompt. A different learner on the same lesson rewrote the persona that is identical for everyone. And the conversation history was never cached at all. The client even parsed the cache counters and then threw them away, so nobody could see the hit rate.

After the hardening work, the prompt is split along its rates of change: a stable block, then a context block, then the conversation, cached with a breakpoint that moves forward each turn. One more trap remained. The history was capped at the last 30 messages, and once full, that window slid by one exchange every turn. The first message changed every time, so every turn rewrote its whole history at the premium price. Longer conversations cost more per turn.

The fix makes the window move in steps of ten messages. It jumps, then stays put for five turns, so four turns in five read their history from cache. The model sees 21 to 30 messages instead of exactly 30. Make the thing that changes change rarely, in big steps.

The number to remember: for a ten-turn conversation, input cost 52 cents with no caching, 26 cents with the single breakpoint, and 11 cents with the three-block design. Output costs the same 20 cents in all three.

## Budgets: four versions

Every call goes through one budget service and a daily row per user. Production allows 150 requests and 120 thousand output tokens a day.

Version one checked usage, then incremented it in a separate statement. Read it as an adversary. Two requests arrive together at 149 of 150. Both read 149, both pass, both increment. 151. The increment being atomic does not make check-then-act atomic.

Version two let the database decide: one conditional upsert that increments only while under every limit, and returns nothing if over. The row lock serialises one user's requests. A test fires 30 reservations at a limit of 10 and checks exactly 10 succeed.

Version three found that the new input limit measured the wrong column. It counted uncached input, and the same commit turned on caching, which drives that count close to zero. The input that costs money had moved into cache writes, checked against nothing. Two correct features had combined into a fuse that no longer measured the current flowing through it. The fix counts billed input: cache writes at one and a quarter, reads at their discounted rate.

[pause]

Version four closed the last gap: overshoot. A learner at 119,999 of 120 thousand output tokens could still start a call allowed 4 thousand tokens, and a few concurrent calls multiplied that. Now each call reserves its worst case first, like a card terminal placing a hold. Under the row lock, it checks there is room, holds the tokens, and lowers the call's own maximum to what is left. Afterwards it settles the real usage and releases the hold. A reservation dropped without settling releases itself. The request slot is never refunded, so a client retrying in a loop runs out quickly. What remains open is the unit: weighted tokens, not money.

Rejected along the way: counting in memory, lost on every deploy; Redis, a second stateful dependency when Postgres already has the row; and only a spend limit at the provider, which protects the company card but not fairness.

## In the interview

A follow-up the lesson expects: why not just return the model stream from the handler?

[pause]

Because in Axum a disconnect drops the response body and every future it owns, so the provider call is cancelled, the reply is never saved and its tokens never recorded. Move the stream into a tracked task that owns persistence, and make the response a reader of a 64-slot channel. The common wrong answer is "save it in a finally block", which never runs when the future is dropped.

And: what stops one user spending the shared key? Two layers. Twenty model calls a minute per session stops bursts. The daily budget, in billed tokens, caps cost, with each call holding its worst case under a row lock before it runs. Then name the gaps: a per-user cap does not cap the total, and tokens are not money.

## Recap

Four things to remember. Separate who owns the work from who watches it: the stream belongs to a tracked task, and the response is a disposable reader. Prompt caching is a prefix match, so split the prompt by rate of change and make the moving parts move in steps. Read a budget as an adversary: check-then-increment races, check-before-call overshoots, and a limit must measure the column that costs money. And route structure is state: only a test with a real stream finds that timing.

At your desk: the streaming code and its sequence diagram, the caching cost table, the budget hold trace, and the SSE parser exercise.
