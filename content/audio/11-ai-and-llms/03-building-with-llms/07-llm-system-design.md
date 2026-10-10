---
lesson: llm-system-design
source: e16f8244c657c00e
fit: great
desk:
  - "The prompt parts table and the per-turn cost table, with and without caching"
  - "The rendered coach request: two system blocks, the explicit breakpoint and automatic caching"
  - "The sliding versus stepped history window pricing table"
  - "The spawned streaming task in Rust, and the budget settle statement in SQL"
  - "The frozen-transcript states and the observability table"
  - "The comparison with a docs chatbot and an inline coding copilot"
  - "Exercise: replay a day against the AI budget"
---
## Introduction

Design an AI tutor for a free learning platform. It knows which lesson or problem the learner is on and what is in their code editor. It streams its replies, keeps conversation history, generates quizzes and grades mock interviews. The whole product runs on one shared API key, so a single enthusiastic user or a script must not be able to run up an unbounded bill. And it must teach: a tutor that pastes the answer to every exercise defeats the product.

That is this app's AI coach, and this lesson designs it the way you would in a design review, checking each decision against the code, including the places where a reviewer pushed back and what changed.

Three ideas. Start from token arithmetic, including the worst case. Lay out prompts and history so the cache actually hits. And protect the shared key with two independent layers, a rate limit and a budget that holds the worst case before every call.

## Tokens, money and the ceiling

Start with tokens, because tokens are latency and money. The coach's system prompt is assembled every turn: a persona and teaching rules of about 300 tokens, a curriculum map of about 500, the current lesson or problem of up to about 6,000, the editor contents of up to about 3,000, and a short progress summary. On top come up to 30 previous messages. A typical turn is about 8,000 tokens of system prompt, 3,000 of history and 700 of output.

At illustrative frontier-model prices, 5 dollars per million input tokens and 25 per million output, with cache reads at a tenth of the input price and cache writes at 1.25 times it, that turn costs about 7 cents with no caching. With the system prompt read from cache, under 4 cents. With it written to cache, just over 8 cents, more than no caching at all. At 2,000 daily users averaging 8 turns, 16 thousand turns a day cost somewhere between about 600 and 1,300 dollars. The cache hit rate is the largest single lever on the bill.

Then the number a reviewer asks for: the ceiling. Production caps each user at 120 thousand output tokens and 2 million billed input tokens a day. That is 13 dollars per user per day. If all 2,000 users hit the cap, the day costs 26 thousand dollars, twenty to forty times the expected bill. The budget bounds the worst case; it does not make it affordable. That is why the design also rate-limits scripts and alerts on spend.

## Caching the prompt and the history

Prompt caching is reuse of the model's attention keys and values across requests. If a request starts with a byte-identical prefix of an earlier one, the provider loads the prefill instead of recomputing it, which cuts both the price of those tokens and the time to first token. The match is an exact prefix match in render order: tools, then system, then messages. A breakpoint marks the end of a cacheable prefix. An entry lives about five minutes, refreshed on every hit. And the response reports cache-read and cache-write token counts, so you can check.

The first version got the order right and the breakpoints wrong. It sent the whole system prompt, stable parts first, as one block with one breakpoint at the end, after the editor contents. So a learner who edited code between questions missed the cache every time and paid the write premium, more than with caching off. The history had no breakpoint at all. And no cache counter was stored, so none of it showed on a graph.

The current design splits the system prompt in two. A stable block, persona and curriculum map, closed by an explicit breakpoint, shared across users as well as turns. Then a context block with the lesson, editor and progress. On top, automatic caching places a breakpoint on the newest message and moves it forward, so each turn reads all earlier turns from cache and writes only the newest exchange.

Here is the subtle part. The conversation's cached prefix includes the context block. So a learner who asks follow-ups without touching the editor pays about 1 cent of input per turn. One who edits before every question reads only the 800-token stable block and rewrites everything after it, about 6 cents. Moving the editor snapshot into the latest user message would fix that, at the cost of old snapshots piling up in history. The lesson: stable-first ordering is necessary but not sufficient. Put a breakpoint at each stability boundary, know which volatile part sits inside which cached prefix, and let the counters tell you whether it works.

Now the history. A conversation can outgrow any window, so the coach sends at most 30 past messages. The obvious implementation is "the last 30". What does that do to the cache?

[pause]

It slides by one exchange every turn, which changes the first message of the history on every request. Everything after the context block misses, every turn of a long conversation. So the coach moves the window's start in steps of 10 instead. The start stays put for five turns. Four turns in five read the whole prefix and write only the newest exchange; on the fifth, the start jumps, the window drops to 21 messages, and one turn pays the rewrite. Priced for a long conversation, the sliding window costs about 8.5 cents of input per turn and the stepped one about 2.2. A four-fold difference from choosing which messages to drop. The same rule applies to any summarisation or memory feature that edits the front of a conversation: change the prefix rarely and in large steps.

## Streaming and routing

A 700-token reply at 50 to 100 tokens a second takes 7 to 14 seconds to finish, so the coach streams over Server-Sent Events, a one-directional stream, which is all a chat reply needs. The important decision is who owns the reply. The request handler prepares the turn, opens the model's stream, and hands it to a spawned task. The HTTP response only reads from a channel.

Why? If the browser disconnects, sending to the channel fails, and the task deliberately ignores that and keeps consuming the model's stream, so the complete reply is still saved and its tokens recorded. The trade-off is explicit: generation continues, and is billed, after the user has left. For a tutor, keeping an answer worth a few cents is right. For inline autocomplete, where abandoned requests are the norm, you cancel on disconnect.

Review added two things to that task. It carries the request's tracing span, because a bare spawned task does not inherit it, and its errors were logged without a request id. And it runs on a task tracker that shutdown waits on for up to 30 seconds, because a learner who closed the tab has no open connection for shutdown to wait for.

On routing: the coach uses one model and routes by effort instead. Chat, quizzes and interview turns run at medium effort; the final interview grade runs at high, because it is judgement-heavy and the learner waits for it once. Thinking bills as output, so this is routing by cost without a second model. A cheaper second model is the next lever, and each route needs three answers. Is quality unchanged? The eval set decides. What does it save? A quiz at about 9 cents costs about 2 on a model at a fifth of the price. What does it break? Caches are per model, so switching mid-conversation makes the next turn a full cache write; route whole conversations or one-shot calls.

## Rate limits and budgets

Two independent layers protect the shared key. The first stops bursts and scripts. Only the routes that call the model pass through a GCRA limiter, which behaves like a token bucket: 20 requests per minute per session, a burst of 20, then one every three seconds. It is keyed by session, falling back to the client IP, so learners sharing one campus address do not throttle each other.

The second caps cost: one row per user per UTC day, with request, input, output, cache-read and cache-write counters. Every model call first reserves, like a card authorisation hold. In one transaction it locks the day's row, checks the request count, the billed input and the output left, then holds the call's maximum output tokens, capped at what is left, and lowers the request's own limit to match. After the reply, settling releases the hold and adds the actual counts. A refusal carries a retry-after header counting the seconds to the next UTC midnight.

Three review findings shaped that. First, the check and the increment were separate statements. Before I explain: a user at 119 of 120 requests fires several requests at once. What happens?

[pause]

They all read "under the limit" before any increment lands, and all go through. Checking and holding under the row lock makes them queue, and an integration test fires 30 reservations at a limit of 10 and asserts exactly 10 succeed. An atomic increment is not an atomic check-and-increment.

Second, the token checks were pre-flight only, so a request that started at 59 thousand output tokens could end at 63 thousand. Holding the maximum up front, and refunding the rest, made it a hard cap. Third, the input limit first counted only the API's input tokens, which is uncached input, in the same change that turned on conversation caching and moved nearly all input into cache reads and writes. The limit barely moved while spend did. It now counts billed input, with writes weighted at 1.25 and reads at the model's own multiplier.

## Policy and failure

The policy, hints not solutions, is enforced two ways. By construction: the coach cannot leak what it never sees. The content loader strips quiz answers and explanations from lessons and splits each problem's editorial from its statement, so no reference solution ever reaches the coach's context. And during a solo mock interview, coach messages are refused on the server. By instruction: the persona asks for the next hint or the unblocking question unless the learner explicitly gives up. An instruction is a probability, not a guarantee, acceptable only because the person harmed by talking the coach round is the learner doing it. At a security boundary, an instruction must never be the control.

Failures are classified, and the provider's own words are logged, never forwarded, because error bodies can echo request content. Nothing retries a turn automatically today, which leaves a ladder a reviewer would propose, in order of cost. One jittered retry before the first byte, safe because nothing has been shown; after streaming starts, a retry would duplicate text. Then a fallback model for sustained overload, which starts cold, because its cache holds nothing: an 11,000-token turn is a full write, about 7 cents of input against 1 cent for a warm follow-up. Keep the conversation on the fallback rather than bouncing back and forth. Then degrade the feature, not the product: show the problem's own hints, while lessons and practice carry on.

The same questions give different answers for other products. An inline coding copilot needs the whole suggestion in a few hundred milliseconds, cancels on disconnect, and most of its requests are wasted by design because the user keeps typing, so cancellation and debouncing are the cost model. A docs chatbot has its own trap: a semantic answer cache, reusing an answer for a question that embeds nearby, will eventually serve refunds for US orders to someone who asked about EU orders, and across tenants it leaks. Key it on the exact normalised question, the tenant and the document version.

## In the interview

Estimate the daily cost of this coach, and its worst case.

[pause]

About 11 thousand input and 700 output tokens a turn, roughly 4 to 8 cents depending on caching, so 16 thousand turns cost about 600 to 1,300 dollars a day. Every user at the cap is 13 dollars each, 26 thousand dollars for 2,000 users, which is why rate limits and spend alerts sit on top of the budget. The wrong answer is a price per million tokens with no token count per turn.

And: the provider returns overload errors for ten minutes. What does the user see, and what should happen?

[pause]

Today, a classified "overloaded, try again" message and no automatic retry. Next, one jittered retry before the first byte, then a fallback model that starts cold and stays for the conversation, then degrading to static hints, with spend visible on a dashboard. The wrong answer is "retry until it works".

## Recap

Four things to remember. Start from token arithmetic: cost per turn, how much the cache hit rate swings it, and the worst-case ceiling. Lay prompts out stable first, put a breakpoint at each stability boundary, and step history truncation so the prefix survives; a four-fold difference came from which messages were dropped. Decide who owns a streamed reply, and what happens on disconnect. And protect a shared key with a per-session rate limit for bursts and a per-user billed-token budget that holds each call's worst case under a row lock.

At your desk: the cost tables, the rendered request, the window pricing, the streaming task and the budget statement, the product comparison, and the budget replay exercise.
