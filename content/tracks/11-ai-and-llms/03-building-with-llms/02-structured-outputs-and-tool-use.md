---
slug: structured-outputs-and-tool-use
title: "Structured outputs and tool use: schemas, function calling and validation"
description: How grammar-constrained decoding guarantees parseable output token by token, what a two-tool parallel call looks like on the wire, how errors and retries are handled at each layer, and why your harness still validates and authorises everything the model produces.
minutes: 45
difficulty: medium
tags: [llm, structured-outputs, json-schema, tool-use, function-calling, ai]
---
Your code needs a dictionary; the model produces text. The first version of every LLM feature parses that text with `json.loads` on whatever comes back, and it works on 199 requests out of 200. At a million requests a day, the 200th is 5,000 errors a day: a Markdown fence around the JSON, a friendly sentence before it, a field called `urgent` instead of `urgency`, a missing closing brace because the output hit `max_tokens`.

Two API features close the gap between text and programs, and they solve different halves of the problem. **Structured outputs** make the model's final answer conform to a JSON schema you supply. **Tool use** (also called function calling) lets the model pause mid-task, ask your code to run a function with typed arguments, and continue with the result. Both are schema-driven, both are produced by the same token-by-token sampling loop, and neither removes the need for your code to check what comes back.

## From "please return JSON" to constrained decoding

There have been three generations of getting machine-readable output from a model.

| Approach | Guarantee | What still goes wrong |
|---|---|---|
| Ask in the prompt, parse, retry on failure | None | Preambles, fences, wrong keys, truncation; each retry adds a full round trip of latency and cost |
| JSON mode | Output is syntactically valid JSON | Any shape at all: missing fields, wrong types, extra keys |
| Schema-constrained decoding | Output validates against your schema | Wrong *values*; truncation at `max_tokens`; refusals |

The third works by changing the sampling step, not the prompt, and the mechanism explains both its guarantee and its blind spot.

## Under the hood: grammar-constrained sampling, step by step

The provider compiles your schema into a grammar, and the grammar into an automaton that tracks where in the document generation has got to. At every step, before sampling, it asks which vocabulary tokens could extend the text so far without leaving the grammar, sets the logit of every other token to negative infinity, and samples from what remains. That is the same mask-and-renormalise operation top-p sampling performs ([Generation and sampling](/learn/ai-and-llms/how-llms-work/generation-and-sampling)), with the grammar choosing the mask.

Trace it with the smallest useful schema, an object with one required property `verdict` whose value is the enum `"hire"` or `"no_hire"`, and a toy vocabulary. Real vocabularies have on the order of 100,000 tokens or more (Llama 3's has 128,256; [Tokenization](/learn/ai-and-llms/how-llms-work/tokenization)), but the steps are the same.

| Step | Text so far | Automaton state | Tokens the grammar allows | Sampled |
|---|---|---|---|---|
| 1 | (empty) | expect `{` | `{`, `{"` | `{"` |
| 2 | `{"` | inside a key; only `verdict` exists | `verdict`, `v`, `ver` | `verdict` |
| 3 | `{"verdict` | key complete; expect `"` and `:` | `"`, `":` | `":` |
| 4 | `{"verdict":` | expect a value from the enum | `"`, ` "` | ` "` |
| 5 | `{"verdict": "` | inside the string: a prefix of `hire"` or `no_hire"` | `hire`, `h`, `no`, `n`, `no_` | `no` (see below) |
| 6 | `{"verdict": "no` | must continue `_hire"` | `_`, `_h`, `_hire` | `_hire` |
| 7 | `{"verdict": "no_hire` | close the string, then the object | `"`, `"}` | `"}` |
| 8 | `{"verdict": "no_hire"}` | accepting state | end of sequence only | stop |

Step 5 is where the decision happens. Suppose the model's raw logits for six candidates are as below (illustrative numbers; the arithmetic is exact):

| Token | Logit | $e^{\text{logit}}$ | Probability before the mask | After the mask |
|---|---|---|---|---|
| `maybe` | 2.0 | 7.389 | 0.441 | 0 |
| `hire` | 1.5 | 4.482 | 0.268 | 4.482 / 7.200 = 0.622 |
| `no` | 1.0 | 2.718 | 0.162 | 2.718 / 7.200 = 0.378 |
| `strong` | 0.5 | 1.649 | 0.098 | 0 |
| `\n` | −1.0 | 0.368 | 0.022 | 0 |
| `Sure` | −2.0 | 0.135 | 0.008 | 0 |

The unmasked denominator is 16.741; after masking only $e^{1.5} + e^{1.0} = 7.200$ remains, so the two legal tokens are renormalised in proportion to the model's own preference between them. Three consequences follow.

1. **The mask discards information.** The model put 44% on `maybe` and only 43% on both legal answers combined. After masking you get a confident-looking `hire` 62% of the time. If "maybe" was the honest answer, the schema forced a guess. The fix is in the schema, not the prompt: add an honest escape value such as `"insufficient_evidence"` to the enum, so that what the model believes is representable.
2. **Tokens are not characters.** `no` is legal at step 5 only because it is a prefix of `no_hire"`. The engine must walk every candidate token's characters through the automaton; doing that for 150,000 tokens at every step would dominate generation time. Open-source engines show how it is made cheap: [Outlines](https://arxiv.org/abs/2307.09702) compiles regular-expression-shaped schemas to a finite-state machine and precomputes, for each state, the set of tokens that keep it alive; nested JSON needs a stack, and [XGrammar](https://arxiv.org/abs/2411.15100) precomputes the tokens whose validity depends only on the current state and checks the few that depend on the stack at run time, while [llguidance](https://github.com/guidance-ai/llguidance) skips precomputation and walks a trie of the vocabulary through an Earley parser at every step, in about 50 µs per token by its own benchmarks. Providers do not publish their implementations. What you can observe is a compile cost: at the time of writing, Anthropic documents extra latency on the first request that uses a new schema and caches the compiled grammar for 24 hours from its last use.
3. **Key order is fixed by the grammar.** Implementations generate properties in the order the schema lists them: OpenAI documents this for its strict mode, and Anthropic documents schema order with one twist, required properties before optional ones. The order of fields is therefore a decision you make in the schema. It matters because generation runs left to right: put `reasoning` before `verdict` and the verdict is conditioned on the reasoning; the other way round, the reasoning is a justification of a verdict already emitted.

```viz
{"type": "ml", "algorithm": "next-token-sampling", "text": "The candidate's verdict is", "temperature": 0.7, "topP": 0.9,
 "title": "A grammar mask is a sampling mask",
 "caption": "Top-p zeroes the tokens outside the nucleus and renormalises the rest. A schema grammar does the same with a different rule: every token that would leave the grammar gets probability zero."}
```

The guarantee therefore holds for completed outputs, so you can delete the retry-on-parse-error loop. Read the small print, though: at the time of writing, Anthropic's documentation warns that an `enum` or `const` string can come back differing only in capitalisation, so compare enum values case-insensitively. The mask does not make the model any smarter: if its preferred continuation was invalid, it now emits the most probable *valid* continuation, which can be a confident wrong answer in a perfect shape.

## The request shape

Here is a structured-output request to the Anthropic Messages API. The schema goes in `output_config.format`:

```json
{
  "model": "<model-id>",
  "max_tokens": 2000,
  "system": "You triage support tickets for an online store. ...",
  "messages": [
    {"role": "user", "content": "<ticket>My parcel ORD-48213 arrived crushed ...</ticket>"}
  ],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["category", "urgency", "order_id", "summary"],
        "properties": {
          "category": {"type": "string", "enum": ["billing", "delivery", "account", "product", "other"]},
          "urgency": {"type": "string", "enum": ["high", "normal"]},
          "order_id": {"anyOf": [{"type": "string"}, {"type": "null"}]},
          "summary": {"type": "string", "description": "One sentence for a support agent"}
        }
      }
    }
  }
}
```

The response is an ordinary message whose text block contains the JSON document:

```json
{
  "role": "assistant",
  "stop_reason": "end_turn",
  "content": [
    {"type": "text", "text": "{\"category\":\"delivery\",\"urgency\":\"normal\",\"order_id\":\"ORD-48213\",\"summary\":\"Parcel arrived crushed; customer wants a replacement.\"}"}
  ],
  "usage": {"input_tokens": 612, "output_tokens": 41}
}
```

Other providers offer the same capability under different names: OpenAI accepts a JSON-schema response format with a strict flag, and Gemini takes a response schema alongside a JSON MIME type. The concepts transfer directly; the supported subset of JSON Schema differs between them, so read your provider's list before relying on a keyword.

Schema design rules that follow from the mechanism:

- **Close every object** with `additionalProperties: false` and list every field in `required`. OpenAI's strict mode demands both and Anthropic's the first, and together they remove the extra-key failure.
- **Use enums for closed sets.** The grammar makes an out-of-set value impossible (capitalisation aside), which is the cheapest correctness you will ever buy.
- **Give the model an honest exit**: an `"unknown"` enum value or a nullable field, so absence and uncertainty are values it can choose rather than guesses the mask forces.
- **Describe fields** with the same care as the prompt. The model reads the descriptions.
- **Put reasoning before conclusions**, because the grammar fixes the order and generation runs left to right.

## What the schema cannot say

Constrained decoding supports a subset of JSON Schema. At the time of writing, [Anthropic's implementation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) supports the basic types, `enum`, `const`, `anyOf`, `allOf`, `$ref`, simple regex `pattern`s and a list of string formats, requires `additionalProperties: false` on every object, and does not support recursive schemas, numeric ranges (`minimum`, `maximum`), string lengths (`minLength`, `maxLength`) or array constraints beyond `minItems` of 0 or 1; an unsupported keyword is a 400 error. Its Python, TypeScript, Ruby and PHP SDKs strip the unsupported keywords from the request and check them client-side. No provider's schema can express cross-field rules such as "`answer` is a valid index into `options`".

This app calls the API over plain HTTP from Rust (there is no official Rust SDK), so nothing strips or checks anything for it; the code does. The quiz generator (`crates/core/src/ai/quiz.rs`) requests questions with a schema of `{q, options, answer, explanation}`, and its system prompt says each question has exactly four options and exactly one correct index. After parsing, it still enforces the invariant the schema could not:

```rust
let mut quiz: GeneratedQuiz = serde_json::from_str(&completion.text)
    .map_err(|e| AppError::ai_upstream("the quiz could not be generated; try again", e))?;
quiz.questions.retain(|q| q.options.len() >= 2 && q.answer < q.options.len());
if quiz.questions.is_empty() {
    return Err(AppError::AiUpstream("quiz generation returned no usable questions".into()));
}
```

The parse failure goes through `AppError::ai_upstream(public, detail)`, which logs the parser's message and shows the learner only the public sentence, because a parse error can quote the text it choked on. Two sibling features apply the same division of labour:

- **The roadmap personaliser** (`roadmap.rs`) builds its schema at run time: `module` is an enum of every module slug in the loaded curriculum, and `preference` an enum of `confident` and `priority`. The grammar already makes an unknown slug impossible, and the code still drops unknown modules and duplicates, truncates to 12 suggestions, and applies nothing on the server; the learner reviews each suggestion, so a model mistake costs one click.
- **The mock-interview grader** (`interview.rs`) declares `overall_score` as an integer, which the grammar enforces, and clamps it to 0–100 after parsing, which the schema subset cannot express.

**Before and after: the serialiser chose the key order.** Point 3 above says field order is a decision you make in the schema. Ascend wrote its schemas in a sensible order and still shipped the wrong one, because `serde_json`'s default map sorts keys alphabetically. The roadmap schema reached the API as `suggestions` before `summary`; the quiz schema as `answer` before `explanation`, `options` and `q`, so the model chose the correct index before writing the question; the grader as `overall_score` and `verdict` after `dimensions` but before `summary`. The symptom surfaced as a flaky end-to-end test: about one roadmap request in four returned `{"suggestions":[],"summary":""}` after 20 output tokens, a valid parse that the page rendered as "no changes suggested". Logging the raw reply showed the empty list written first. The fix has three parts: enable `serde_json`'s `preserve_order` feature so schemas keep their written order; write each schema evidence first (the summary before the suggestions, each reason before its preference, the grade's dimension notes, strengths, improvements and summary before the score and verdict); and pin the order with unit tests, because a dependency change could silently undo it. Two related guards came with it. A well-formed but empty reply is treated as a failed generation, retried once and then reported, since the schema cannot forbid it: the subset has no `minLength`, so an empty `summary` is valid, and an empty `suggestions` list is a legitimate answer that `minItems` must not rule out. And the three structured calls share a 16,000-token `max_tokens` (`STRUCTURED_MAX_TOKENS`), because adaptive thinking counts toward the cap: at the old 3,000, a retry spent every token thinking and stopped at `max_tokens`. Measured on the same learner and background afterwards, 10 of 10 requests returned suggestions.

The schema guarantees the parse, the code guarantees the invariants, and an eval set tells you whether the content is any good ([Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability)).

Check the stop reason before trusting the output at all. `max_tokens` means generation was cut off: every token so far was legal, but the document is incomplete. `refusal` means the model declined, and the content may not match the schema. Give both explicit handling rather than letting them surface as parse errors.

## Tool use on the wire: one question, two tools

Structured output shapes the final answer. Tool use lets the model gather information or act *before* answering. Here is a complete exchange in which the model calls two tools in parallel. A customer writes: "I'm in Germany. Can I still return ORD-48213?" The system prompt includes today's date, 2026-09-20.

**Request 1.** You declare the tools, each with a name, a description and an input schema; `strict: true` applies constrained decoding to the arguments:

```json
{
  "model": "<model-id>",
  "max_tokens": 1024,
  "system": "You answer questions about the customer's own orders. Today is 2026-09-20.",
  "tools": [
    {"name": "get_order",
     "description": "Look up one of the signed-in customer's orders by id. Call this when the user asks about a specific order. Returns status, delivery date and category.",
     "input_schema": {"type": "object", "additionalProperties": false, "required": ["order_id"],
                      "properties": {"order_id": {"type": "string", "description": "Exactly as the user wrote it, e.g. ORD-48213"}}},
     "strict": true},
    {"name": "get_return_policy",
     "description": "Return windows for one country. Call this before answering any question about returns or refunds.",
     "input_schema": {"type": "object", "additionalProperties": false, "required": ["country"],
                      "properties": {"country": {"type": "string", "description": "ISO 3166 two-letter code, e.g. DE"}}},
     "strict": true}
  ],
  "messages": [{"role": "user", "content": "I'm in Germany. Can I still return ORD-48213?"}]
}
```

**Response 1.** The model needs both facts and neither depends on the other, so it emits two `tool_use` blocks in one message and stops:

```json
{
  "role": "assistant",
  "stop_reason": "tool_use",
  "content": [
    {"type": "text", "text": "Let me check the order and the German return policy."},
    {"type": "tool_use", "id": "toolu_01", "name": "get_order", "input": {"order_id": "ORD-48213"}},
    {"type": "tool_use", "id": "toolu_02", "name": "get_return_policy", "input": {"country": "DE"}}
  ],
  "usage": {"input_tokens": 1012, "output_tokens": 118}
}
```

Nothing has happened yet. Your code, the **harness**, validates both calls, runs them (concurrently, since they are independent) and builds the next request.

**Request 2.** The same `system` and `tools` (omitted here), and the whole conversation: the user's message, the assistant message *exactly as it came back*, and one user message carrying both results, each keyed by its call's id:

```json
{
  "messages": [
    {"role": "user", "content": "I'm in Germany. Can I still return ORD-48213?"},
    {"role": "assistant", "content": [
      {"type": "text", "text": "Let me check the order and the German return policy."},
      {"type": "tool_use", "id": "toolu_01", "name": "get_order", "input": {"order_id": "ORD-48213"}},
      {"type": "tool_use", "id": "toolu_02", "name": "get_return_policy", "input": {"country": "DE"}}
    ]},
    {"role": "user", "content": [
      {"type": "tool_result", "tool_use_id": "toolu_01",
       "content": "{\"status\": \"delivered\", \"delivered_on\": \"2026-09-02\", \"category\": \"electronics\"}"},
      {"type": "tool_result", "tool_use_id": "toolu_02",
       "content": "{\"return_days\": 30, \"electronics_return_days\": 14}"}
    ]}
  ]
}
```

**Response 2.** The model has what it needs and ends its turn:

```json
{
  "role": "assistant",
  "stop_reason": "end_turn",
  "content": [{"type": "text", "text": "Unfortunately not. Electronics bought in Germany can be returned within 14 days of delivery. ORD-48213 was delivered on 2 September, 18 days ago."}],
  "usage": {"input_tokens": 1203, "output_tokens": 46}
}
```

Read the token counts (illustrative, but the shape is exact). Request 2's input is request 1's 1,012 tokens plus the 118 tokens of the assistant's calls plus about 70 tokens of results and framing. Every later request in the conversation carries all of it again, which is why result size is a cost decision ([Agents](/learn/ai-and-llms/building-with-llms/agents) computes the growth over a long loop). The model computed "18 days" itself from the date in the system prompt; if date arithmetic must be right, give it a tool rather than trusting it.

```viz
{"type": "ml", "algorithm": "agent-loop", "text": "How many open PRs are older than 7 days?",
 "title": "The tool-use loop",
 "caption": "The model only ever emits text or a structured call. The harness runs the tool and appends the result, and the whole transcript is sent again on every iteration."}
```

## Parallel tool calls

The rules for parallel calls, and the reasons behind them:

- **Return every result in one user message.** Each `tool_use` must be answered by a `tool_result` with the matching `tool_use_id` in the very next user message, and the `tool_result` blocks come first in that message's content, before any text. A missing result is a 400 on the next request. Anthropic's tool-use guidance also warns that returning results piecemeal teaches the model to stop making parallel calls.
- **Run independent calls concurrently.** With a model call of about 1.5 seconds and tools taking 0.2 s and 0.3 s, the parallel version above costs 1.5 + max(0.2, 0.3) + 1.5 = 3.3 seconds. If the model had called them one at a time, it would have taken three model calls: 1.5 + 0.2 + 1.5 + 0.3 + 1.5 = 5.0 seconds. The saving is a whole model round trip, not the tool time.
- **Dependent calls stay sequential, and the model decides.** If the policy depended on the order's category, the model would call `get_order`, read the category, then call the policy tool. Nothing in the protocol expresses the dependency; the model infers it from the descriptions.
- **Turn parallelism off where order matters.** `disable_parallel_tool_use: true` on `tool_choice` limits the model to at most one call per turn: use it when two side effects must not race, such as "cancel the subscription" and "refund the last invoice".

A harness that runs a turn's calls concurrently, never raises, and always answers every id, with the exception types doing the work (runnable as is; the handlers stand in for real services):

```python
import asyncio
import json


class ToolError(Exception):
    """An error the model can act on; its message goes back as the result."""


ORDERS = {"ORD-48213": {"owner": "u_17", "status": "delivered",
                        "delivered_on": "2026-09-02", "category": "electronics"}}
POLICIES = {"DE": {"return_days": 30, "electronics_return_days": 14}}


async def get_order(session, order_id):
    order = ORDERS.get(order_id)
    if order is None or order["owner"] != session["user_id"]:   # authorise from the session
        raise ToolError(f"No order {order_id} on this account. Ask the user to check the id.")
    return {k: v for k, v in order.items() if k != "owner"}


async def get_return_policy(session, country):
    if country not in POLICIES:
        raise ToolError(f"No policy for country {country!r}; use a two-letter code such as DE.")
    return POLICIES[country]


TOOLS = {"get_order": get_order, "get_return_policy": get_return_policy}
TIMEOUT_S = 5.0
MAX_RESULT_CHARS = 4_000


async def run_one(session, block):
    def result(content, is_error=False):
        out = {"type": "tool_result", "tool_use_id": block["id"], "content": content}
        if is_error:
            out["is_error"] = True
        return out

    handler = TOOLS.get(block["name"])
    if handler is None:
        return result(f"Unknown tool {block['name']}.", is_error=True)
    try:
        value = await asyncio.wait_for(handler(session, **block["input"]), TIMEOUT_S)
    except ToolError as e:                     # expected: tell the model what to do next
        return result(str(e), is_error=True)
    except TypeError:                          # wrong or missing arguments
        return result(f"Bad arguments for {block['name']}: {json.dumps(block['input'])}", is_error=True)
    except asyncio.TimeoutError:
        return result(f"{block['name']} timed out after {TIMEOUT_S}s; try again later.", is_error=True)
    return result(json.dumps(value)[:MAX_RESULT_CHARS])


async def run_tool_calls(session, assistant_content):
    calls = [b for b in assistant_content if b["type"] == "tool_use"]
    results = await asyncio.gather(*(run_one(session, b) for b in calls))
    return {"role": "user", "content": list(results)}   # every result, one message, in call order


if __name__ == "__main__":
    content = [
        {"type": "tool_use", "id": "toolu_01", "name": "get_order", "input": {"order_id": "ORD-48213"}},
        {"type": "tool_use", "id": "toolu_02", "name": "get_return_policy", "input": {"country": "DE"}},
        {"type": "tool_use", "id": "toolu_03", "name": "get_order", "input": {"order_id": "ORD-99999"}},
    ]
    print(json.dumps(asyncio.run(run_tool_calls({"user_id": "u_17"}, content)), indent=1))
```

The third call returns `{"tool_use_id": "toolu_03", "is_error": true, "content": "No order ORD-99999 on this account. Ask the user to check the id."}` next to the two successes. The non-obvious lines: `asyncio.gather` preserves call order, so results line up with ids; the ownership check uses `session["user_id"]`, never an argument; the result is truncated before it enters the transcript; and `TypeError` is caught because the model's arguments can be wrong even when parseable (in a larger harness, validate against the schema first, which is what the exercise below builds, so that a `TypeError` raised by a bug inside a handler is not misreported as the model's mistake).

## Errors and retries, layer by layer

Failures happen at four layers, and each has a different owner and a different retry rule.

| Layer | Examples | Who handles it | Retry? |
|---|---|---|---|
| Transport and API | 429 rate limit, 529 or 503 overloaded, 5xx, connection reset, timeout | The harness, before the model sees anything | Yes, with backoff and jitter, honouring `retry-after`; for streams, only before the first byte |
| Request validity | 400: missing `tool_result`, schema feature unsupported, prompt too long | The developer | No; the same request fails the same way |
| Tool execution | The order service times out; an id does not exist; arguments fail validation | The model, via an `is_error` result | The model decides; the harness caps repeats |
| Output | `max_tokens` mid-document or mid-call; `refusal` | The harness | `max_tokens`: retry once with a larger limit; `refusal`: do not retry the same request |

**Transport retries** are safe for the provider (a model call has no side effects) but not free, and they multiply load exactly when the provider is struggling. If each attempt fails with probability $f$ and you allow $r$ retries, the expected number of attempts per request is $1 + f + f^2 + \dots + f^r$. At a normal 2% failure rate, two retries cost 1.02 attempts per request and leave $0.02^3 = 0.000008$ of requests failed. During an overload with $f = 0.5$, three retries send $1 + 0.5 + 0.25 + 0.125 = 1.875$ times the traffic to a provider that is already refusing half of it. Hence exponential backoff with full jitter (wait a random time between 0 and 1 s, 2 s, 4 s, capped), a small retry cap, and a retry budget across the service ([Idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries), [Resilience patterns](/learn/system-design/building-blocks/resilience-patterns)). At the time of writing Anthropic's official SDKs retry twice by default on 408, 409, 429, 5xx and connection errors; if you add your own loop on top, you multiply the two.

**Tool errors are observations, not exceptions.** Return a `tool_result` with `is_error: true` and a message the model can act on: `order_id must look like ORD-12345; you passed "48213". Ask the user for the full id.` produces a recovery; `400 Bad Request` produces the same call again. Cap it in the harness: after two consecutive errors from the same tool with the same arguments, stop the loop and escalate instead of letting the model try a third time.

**`max_tokens` during a tool call** means the `input` of the last `tool_use` block may be incomplete. Never execute it; retry with a larger limit or fail the turn.

## Designing tools the model can use well

A tool definition is a prompt. The model decides whether and how to call a tool almost entirely from its name, description and schema.

- **Say when to call it**, not only what it does. "Call this before answering any question about returns" is a trigger condition the model can match.
- **Prefer a few task-level tools to many endpoint-level ones.** `search_orders(customer_query, status, since)` beats exposing `list_orders`, `get_order`, `filter_orders` and `count_orders`: each extra tool is another decision the model can get wrong and more tokens on every request.
- **Return what the model needs, compactly.** Trim fields, paginate, summarise, and include stable ids the model can pass to the next tool.
- **Write errors for the model**, as above.
- **Make invalid arguments unrepresentable** with enums and formats in the input schema, instead of rejecting them after the fact.

Tool definitions cost tokens on every request. The provider renders them into the model's context, along with a model-dependent tool-use preamble of a few hundred tokens listed in its documentation (286 to 675 on current Anthropic models). A definition like the ones above is around 600 characters, roughly 150 tokens; twenty of them are about 3,000 tokens per request. At a million requests a day that is 3 billion input tokens, $15,000 a day at an illustrative $5 per million, or $1,500 if the tool block is served from the prompt cache at a tenth of the price. Tools render first, before the system prompt, so a tool list that changes between requests invalidates every cached byte after it ([LLM system design](/learn/ai-and-llms/building-with-llms/llm-system-design)).

## The harness owns validation and authority

The model proposes; the harness decides. Every tool call is untrusted input from a component that can be wrong and can be manipulated by text it has read ([LLM security](/learn/ai-and-llms/building-with-llms/llm-security)).

1. **Schema validation.** Validate arguments even when strict mode is on. It is cheap, and it protects you when a model or provider without strict support is swapped in. The exercise below builds the core of such a validator.
2. **Authorisation from the session, never from the arguments.** When the model calls `get_order("ORD-1")`, the harness checks that ORD-1 belongs to the *authenticated user of this session*. A `user_id` parameter that the model fills in is an invitation to read another customer's orders.
3. **Semantic checks.** Does the order exist? Is the refund amount no larger than the order total? Is the date in the future?
4. **Idempotency for side effects.** The harness can retry a call after a timeout, and the model can issue the same call again on a later step. An `issue_refund` tool needs an idempotency key tied to the operation rather than the attempt (the dispute being resolved, say), or a retry pays out twice.
5. **Timeouts and size limits** on every tool, so one slow dependency or one enormous response cannot stall or bloat the loop.

## Choosing the mechanism

| You need | Use |
|---|---|
| A typed final answer: a classification, an extraction, a grade | Structured output |
| Information the model does not have, fetched before it answers | Tools |
| An action in another system | Tools, with human confirmation for anything irreversible |
| Both: gather information, then answer in a fixed shape | Tools during the loop, structured output for the final turn |

Before native structured outputs, a common trick was to declare a fake tool whose input schema was the desired output and force the model to call it. At the time of writing, some of the newest models reject a forced `tool_choice` outright and expect `auto` plus `strict: true`; a response schema says what you mean without that dependency. How the approaches compare:

| Approach | Structural guarantee | Latency cost | Schema features | Portability | Typical failure |
|---|---|---|---|---|---|
| Prompt, parse, retry | None | A full extra call per retry | Anything you can describe | Any model | Parse errors at a rate you only learn in production |
| JSON mode | Valid JSON, any shape | None | None | Some providers | Wrong keys and types, discovered downstream |
| Response schema (constrained) | Validates against the supported subset | One-time schema compile | A provider-specific subset | Concept portable, subset differs | Confident wrong values; truncation |
| Forced tool call as output | Arguments validate if strict | None | Same subset | Forcing not supported on every model | A transcript claiming an action that never happened |

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A small fraction of structured responses fail to parse although the schema is enforced | `stop_reason` is `max_tokens`: long outputs are cut off mid-document | Branch on the stop reason before parsing; raise `max_tokens` or ask for fewer items |
| The next request after a tool turn fails with a 400 about missing results | A failed or timed-out tool was dropped instead of answered, so a `tool_use` id has no `tool_result` | Answer every id, failures included, with `is_error: true`; the harness above never raises |
| The model calls the same tool with the same bad argument five times | The error message did not say what to change (`400 Bad Request`) | Actionable error text; a repeat detector that stops after two identical failures |
| p95 latency jumps on the first requests after a deploy, then recovers | A new or changed schema is being compiled; later requests hit the compiled-grammar cache | Keep schemas stable; warm them with one request at deploy; expect it when you edit a schema |
| Scores cluster on `hire` for borderline candidates | The enum has no honest middle value, so the mask renormalises "unsure" into a guess | Add an explicit `insufficient_evidence` value and measure how often it is chosen |
| A support assistant reads another customer's order | The tool took a `customer_id` argument the model filled in from the conversation | Derive identity from the session; drop the parameter from the schema |
| Input tokens per conversation triple after adding one tool | The tool returns raw API JSON, resent on every later request | Trim and paginate results; cap result size in the harness |

## Exercise

```exercise
id: validate-tool-args
title: Validate tool arguments against a schema
prompt: |
  Implement `validate(schema, value)` for a small subset of JSON Schema. Return
  a **sorted** list of error strings, or an empty list if `value` is valid.

  Supported keywords:

  - `type`: one of `object`, `array`, `string`, `integer`, `number`, `boolean`.
    `integer` is a whole number that is not a boolean; `number` is any number
    that is not a boolean. On a type mismatch, report `"<path>: type"` and check
    nothing else at or below that path.
  - `enum`: if present and the value is not in the list, report `"<path>: enum"`.
  - Objects: each key in `required` that is absent reports
    `"<path>.<key>: missing"`; each present key listed in `properties` is
    validated against its sub-schema; if `additionalProperties` is `false`,
    each key not in `properties` reports `"<path>.<key>: unexpected"`.
  - Arrays: each element is validated against `items` at path `"<path>[<i>]"`.

  The root path is `$`. Sort the final list with ordinary string ordering.
languages: [python, javascript]
entry: validate
starter:
  python: |
    def validate(schema, value):
        errors = []
        # write a recursive walk(schema, value, path) that appends to errors,
        # then call it with path "$"
        return sorted(errors)
  javascript: |
    function validate(schema, value) {
      const errors = [];
      // write a recursive walk(schema, value, path) that pushes to errors,
      // then call it with path "$"
      return errors.sort();
    }
tests:
  - args: [{"type": "object", "additionalProperties": false, "required": ["city", "unit"], "properties": {"city": {"type": "string"}, "unit": {"type": "string", "enum": ["c", "f"]}, "days": {"type": "integer"}}}, {"city": "Paris", "unit": "c"}]
    expected: []
    label: valid call
  - args: [{"type": "object", "additionalProperties": false, "required": ["city", "unit"], "properties": {"city": {"type": "string"}, "unit": {"type": "string", "enum": ["c", "f"]}, "days": {"type": "integer"}}}, {"unit": "kelvin"}]
    expected: ["$.city: missing", "$.unit: enum"]
    label: missing field and bad enum
  - args: [{"type": "object", "additionalProperties": false, "required": ["city", "unit"], "properties": {"city": {"type": "string"}, "unit": {"type": "string", "enum": ["c", "f"]}, "days": {"type": "integer"}}}, {"city": "Oslo", "unit": "f", "days": "3", "verbose": true}]
    expected: ["$.days: type", "$.verbose: unexpected"]
    label: wrong type and unexpected key
  - args: [{"type": "object", "required": ["city"], "properties": {"city": {"type": "string"}}}, "Paris"]
    expected: ["$: type"]
    label: wrong root type stops descent
  - args: [{"type": "object", "required": ["ids"], "properties": {"ids": {"type": "array", "items": {"type": "integer"}}}}, {"ids": [1, 2.5, "3", 4]}]
    expected: ["$.ids[1]: type", "$.ids[2]: type"]
    hidden: true
    label: array items
  - args: [{"type": "object", "required": ["n"], "properties": {"n": {"type": "integer"}}}, {"n": true, "extra": 1}]
    expected: ["$.n: type"]
    hidden: true
    label: booleans are not integers
  - args: [{"type": "array", "items": {"type": "object", "additionalProperties": false, "required": ["name"], "properties": {"name": {"type": "string"}}}}, [{"name": "a"}, {"nam": "b"}]]
    expected: ["$[1].nam: unexpected", "$[1].name: missing"]
    hidden: true
    label: objects inside arrays
hints:
  - "Check the type first and return from that branch on a mismatch; only then look at enum, properties and items."
  - "In Python, bool is a subclass of int, so test isinstance(v, bool) before accepting an integer. In JavaScript, use typeof and Number.isInteger."
  - "For objects, loop over required to find missing keys, then over the value's own keys to recurse into properties or report unexpected keys."
```

## Interviewer follow-ups

**"How does the provider guarantee the output matches the schema, and what does that guarantee not cover?"** Model answer: the schema is compiled to a grammar, and at each decoding step tokens that would leave the grammar get probability zero, so every completed output parses and validates; it does not cover truthfulness, cross-field invariants, truncation at `max_tokens` or refusals, and when the model's preferred answer is illegal the mask renormalises it into a legal guess. Common wrong answer: "the model is fine-tuned on the schema" or "the provider retries until it validates".

**"The model returns three tool calls in one message and one of them fails. What exactly do you send back?"** Model answer: one user message with three `tool_result` blocks, one per `tool_use_id`, results first in the content; the failed one has `is_error: true` and a message saying what to change. The model then decides whether to retry, ask the user or answer with what it has. Common wrong answer: "retry the failed tool until it works, then send only the successes".

**"Your structured-output feature has a 0.3% parse failure rate. Where do you look?"** Model answer: at the stop reasons of the failures, which will almost all be `max_tokens` (outputs that outgrew the limit, often a list with no bound) or `refusal`; then at whether a lenient parser upstream turned truncations into partial objects. Common wrong answer: "the constrained decoder has bugs; add a retry loop".

**"How do you retry LLM calls without making an outage worse?"** Model answer: retry only transient classes (429, overloaded, 5xx, connection errors), with exponential backoff and full jitter, honouring `retry-after`, a small cap and a service-wide retry budget; never retry a stream after the first byte; know that the SDK may already retry. Common wrong answer: "retry up to five times immediately", which nearly doubles load at a 50% failure rate.

## What mid-level engineers get wrong

- **Parsing before checking `stop_reason`.** A truncated document becomes a parse error in the logs, or worse, a partial object from a lenient parser, and nobody raises `max_tokens`.
- **Trusting "valid JSON" as "valid data".** The enum is right and the index is out of range; the score is an integer and it is 340. Invariants the schema subset cannot express need code.
- **Designing schemas without an honest exit.** No `unknown` value means the mask converts uncertainty into a confident answer, and the eval shows a skew nobody can explain.
- **Dropping failed tool results.** The next request fails with a 400, or the harness "fixes" it by deleting the call, and the model loses the evidence it needed.
- **Taking identity from arguments.** A `user_id` or `tenant_id` parameter turns one successful injection into a cross-tenant read.
- **Returning raw API payloads from tools.** Twenty kilobytes of JSON are resent on every later iteration; the cost and latency grow with each step.
- **Stacking retry loops.** An SDK that retries twice inside an application loop that retries three times sends up to twelve requests per user action during an incident.

## Senior signals

- You explain constrained decoding **mechanically**: schema to grammar to automaton, a per-step token mask, renormalisation, and the compile cost you can observe.
- You separate **structural guarantees from semantic correctness**, give schemas an honest exit value, and enforce the invariants the supported subset cannot express.
- You check **`stop_reason` before parsing** anything: `max_tokens`, `refusal` and `tool_use` each need their own path.
- You can write the **full message exchange** for parallel tool calls from memory: ids, one user message of results, errors as `is_error` results.
- You place **retries by layer**: backoff with jitter for transport errors, actionable errors for tool failures, no retries for invalid requests, and you know the SDK's own retries count.
- You treat every tool call as an **untrusted request**: validate, authorise from the session, make side effects idempotent, bound time and size.
- You know **tool definitions and results are tokens on every request**, and you design their size and stability with caching in mind.

## Check yourself

```quiz
- q: >-
    With schema-constrained decoding, how does the provider stop the model from emitting a value outside an enum?
  options: ["It retries the request in the background until the output validates", "It masks the logits of tokens the schema's grammar forbids at each step", "It fine-tunes a copy of the model on your schema before serving the request", "It post-processes the output and swaps invalid values for the nearest valid one"]
  answer: 1
  explanation: >-
    The schema is compiled into a grammar that masks illegal next tokens before sampling, the same mask-and-renormalise step as top-p, so invalid continuations have zero probability. Nothing is repaired after the fact and no retries are needed for structure, but the model now picks the most probable valid value, which can still be wrong.
- q: >-
    At the enum step, the model's probabilities are 0.44 for an illegal token, 0.27 for hire and 0.16 for no. After the grammar mask, what is the probability of hire?
  options: ["About 0.50, because the mask makes every legal continuation equally likely", "About 0.71, because the illegal token's mass is added to the top legal token", "About 0.27, because masking removes illegal tokens without rescaling the rest", "About 0.62, because the legal tokens are renormalised in proportion"]
  answer: 3
  explanation: >-
    The mask zeroes the illegal tokens and renormalises the survivors in proportion to the model's own preferences: 0.27 / (0.27 + 0.16) is about 0.62. That is why a schema without an honest escape value turns uncertainty into a confident-looking answer; the mass the model put on the illegal option is redistributed, not reported.
- q: >-
    A structured-output response comes back with stop_reason "max_tokens". What should your code conclude?
  options: ["The model refused the request, and the partial text explains the refusal", "The output is incomplete; treat it as an error, then raise max_tokens", "The JSON is valid and complete, because every token was constrained", "The schema was too complex, so the provider ignored it for this request"]
  answer: 1
  explanation: >-
    Constrained decoding guarantees every emitted token is legal, not that generation finished. A truncated document fails to parse or, worse, parses into a partial object in lenient parsers. Treat it as an error, then raise max_tokens or bound the output. A refusal has its own stop reason.
- q: >-
    A tool is declared as get_invoice(user_id, invoice_id), and the model fills in both arguments from the conversation. What is the flaw?
  options: ["Tools must never take ids, only natural-language descriptions of records", "Two required parameters are too many; each tool should take one argument", "invoice_id should be declared as an integer so the model cannot invent ids", "The user should come from the session, not from an id the model supplies"]
  answer: 3
  explanation: >-
    The model's arguments are untrusted input: an injected or confused model can ask for another user's invoices. Deriving the user from the authenticated session makes cross-tenant reads impossible regardless of what text the model has read; checking a model-supplied user_id against itself checks nothing. Typing invoice_id as an integer changes its format, not whose invoice it is.
- q: >-
    The model returns one assistant message with three tool_use blocks, and one of the three tools times out. How do you continue?
  options: ["Drop the failed call from the assistant message and send the two results", "Send one user message with all three tool_result blocks, the timeout marked is_error", "Retry the timed-out tool until it succeeds, then send all three results together", "Send the two successful results now and the third in a later user message"]
  answer: 1
  explanation: >-
    Every tool_use id needs a tool_result in the next user message, so the failure is reported as an is_error result the model can act on: retry, ask the user or answer without it. Retrying indefinitely stalls the loop, splitting results breaks the pairing, and editing the assistant message rewrites history the model produced.
- q: >-
    During a provider overload, half of all calls fail. Your code retries each failure up to three times. Roughly how much traffic does it send per user request?
  options: ["About 4.0 times, since every request is sent four times in the worst case", "About 1.9 times, since each failure spawns a retry until the cap", "About 1.5 times, since later retries rarely happen at all", "About 1.0 times, since retries only replace requests that already failed"]
  answer: 1
  explanation: >-
    With failure probability 0.5 and three retries the expected attempts are 1 + 0.5 + 0.25 + 0.125, about 1.9, sent to a provider that is already refusing work. Backoff with jitter, a small cap, a service-wide retry budget and awareness of the SDK's own retries keep a slowdown from becoming an outage. Four times is the worst case for one request, not the average.
```
