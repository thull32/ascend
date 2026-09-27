# 0004. Bounded, cache-friendly LLM usage

- Status: accepted
- Date: 2026-09-26

## Context

The coach, quiz generator and interviewer call a paid LLM API on behalf of anonymous-signup users of a free
product. One abusive or looping client must not be able to exhaust the budget, and normal use should be as
cheap as possible without degrading quality.

## Decision

- Per-user, per-UTC-day request and output-token budgets in `ai_usage`, reserved before each call and
  settled with actual usage after, using single-statement upserts.
- A per-IP request-rate limit on AI routes on top of the daily budget.
- System prompts ordered stable-first with `cache_control`, so multi-turn conversations reuse the cached
  prefix; volatile context (lesson text, editor contents, progress) goes last.
- JSON-schema constrained outputs for quizzes and evaluations, so there is no retry loop on malformed JSON.
- Streaming responses run in a spawned task that persists the reply and records usage even if the browser
  disconnects, so usage accounting cannot be skipped by closing the tab.
- AI features are optional: without an API key the product still works and the UI explains why.

## Consequences

- The worst-case daily cost is bounded by (active users) x (daily token budget).
- Budgets are configuration (`AI_DAILY_REQUESTS`, `AI_DAILY_OUTPUT_TOKENS`), tunable without a deploy of code.
