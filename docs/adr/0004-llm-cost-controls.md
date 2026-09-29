# 0004. Bounded, cache-friendly LLM usage

- Status: accepted
- Date: 2026-09-26

## Context

The coach, quiz generator and interviewer call a paid LLM API on behalf of anonymous-signup users of a free
product. One abusive or looping client must not be able to exhaust the budget, and normal use should be as
cheap as possible without degrading quality.

## Decision

- Per-user, per-UTC-day request and output-token budgets in `ai_usage`, reserved before each call and
  settled with actual usage after, using single-statement upserts. (Amended: an input budget,
  `AI_DAILY_INPUT_TOKENS`, was added and counts *billed* input, with cache writes at 1.25x and cache reads
  at the model's price (0.1x on most models, 0.05x on Opus 5.5, 0.025x on Fable 5.1 and Mythos 5.1), because counting only uncached input left cache writes, the most expensive input, unbudgeted. A
  spent budget answers 429 with `Retry-After` until the next UTC midnight.)
- A per-session request-rate limit on model-calling routes on top of the daily budget. (Amended: this was
  per IP until end-to-end tests showed a whole class behind one NAT address sharing a single allowance.)
- System prompts ordered stable-first with `cache_control`, so multi-turn conversations reuse the cached
  prefix; volatile context (lesson text, editor contents, progress) goes last.
- JSON-schema constrained outputs for quizzes and evaluations, so there is no retry loop on malformed JSON.
- Streaming responses run in a spawned task that persists the reply and records usage even if the browser
  disconnects, so usage accounting cannot be skipped by closing the tab.
- AI features are optional: without an API key the product still works and the UI explains why.

## Consequences

- The worst-case daily cost is bounded by (active users) x (daily budgets): requests, billed input tokens
  and output tokens, each checked before a call.
- Budgets are configuration (`AI_DAILY_REQUESTS`, `AI_DAILY_INPUT_TOKENS`, `AI_DAILY_OUTPUT_TOKENS`),
  tunable without a deploy of code. A spent budget answers 429 with `Retry-After` until the next UTC midnight.

## Revisit when

- Daily AI spend approaches the budget ceiling multiplied by active users
  (introduce tiers or a shared global circuit breaker).
- Cache hit rates in the `ai_usage` cache columns fall (a prompt change broke
  the stable prefix).
- A second model provider is added (the budget seam stays; the client grows a
  trait).
