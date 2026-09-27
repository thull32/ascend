---
slug: structured-outputs-and-tool-use
title: "Structured outputs and tool use: schemas, function calling and validation"
description: How schema-constrained decoding guarantees parseable output, how the tool-use loop works on the wire, and why your harness still validates everything the model produces.
minutes: 25
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

The third works by changing the sampling step, not the prompt. The provider compiles your schema into a grammar. At every generation step the grammar determines which tokens may legally come next, and the logits of all other tokens are set to negative infinity before the softmax. That is the same mask-and-renormalise operation top-p sampling performs ([Generation and sampling](/learn/ai-and-llms/how-llms-work/generation-and-sampling)), with the grammar choosing the mask. After the model has emitted `{"verdict": "` and the schema says `verdict` is an enum of `"hire"` and `"no_hire"`, only tokens that begin one of those two strings have non-zero probability. The model cannot write `"maybe"`, because no path through the grammar allows it.

Two consequences follow from the mechanism. The structural guarantee is absolute for completed outputs, so you can delete the retry-on-parse-error loop. And the mask does not make the model any smarter: if the model's preferred continuation was invalid, it now gets the most probable *valid* continuation, which can be a confident wrong answer in a perfect shape.

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

Schema design rules that matter in practice:

- **Close every object** with `additionalProperties: false` and list every field in `required`. Strict modes usually demand it, and it removes the extra-key failure.
- **Use enums for closed sets.** They are the cheapest correctness you will ever buy.
- **Make absence explicit** with a nullable type rather than an optional field, so "not present" is a value the model chooses deliberately.
- **Describe fields** with the same care as the prompt. The model reads the descriptions.
- **Put reasoning before conclusions.** Generation runs left to right. If the schema has `reasoning` before `verdict`, the verdict is conditioned on the reasoning; the other way round, the reasoning is a post-hoc justification of a verdict already emitted.

## What the schema cannot say

Constrained decoding supports a subset of JSON Schema, and the subset is smaller than you might assume. At the time of writing, Anthropic's implementation does not enforce numeric ranges (`minimum`, `maximum`), string lengths or complex array constraints; its Python and TypeScript SDKs strip those keywords from the request and check them client-side instead. No provider's schema can express cross-field rules such as "`answer` is a valid index into `options`".

This app's quiz generator (`crates/core/src/ai/quiz.rs`) handles that gap in a few lines. It requests questions with a schema of `{q, options, answer, explanation}`, and its system prompt says each question has exactly four options and exactly one correct index. After parsing, it still enforces the invariant the schema could not:

```rust
let mut quiz: GeneratedQuiz =
    serde_json::from_str(&completion.text).map_err(|e| AppError::AiUpstream(format!("quiz did not parse: {e}")))?;
quiz.questions.retain(|q| q.options.len() >= 2 && q.answer < q.options.len());
if quiz.questions.is_empty() {
    return Err(AppError::AiUpstream("quiz generation returned no usable questions".into()));
}
```

The mock-interview grader does the same with its score: the schema says `overall_score` is an integer, and the code clamps it to 0–100 after parsing. That is the division of labour to copy. The schema guarantees the parse, the code guarantees the invariants, and an eval set tells you whether the content is any good.

Check two stop reasons before trusting the output at all. `max_tokens` means generation was cut off: every token so far was legal, but the document is incomplete. `refusal` means the model declined, and the content may not match the schema. Give both explicit handling rather than letting them surface as mysterious parse errors.

## Tool use: the model asks, your code acts

Structured output shapes the final answer. Tool use lets the model gather information or take actions *before* answering. You declare tools, each with a name, a description and a JSON schema for its input:

```json
{
  "model": "<model-id>",
  "max_tokens": 1024,
  "tools": [{
    "name": "get_order",
    "description": "Look up one order by id. Call this when the user asks about the status, contents or delivery date of a specific order. Returns status, items and estimated delivery date.",
    "input_schema": {
      "type": "object",
      "additionalProperties": false,
      "required": ["order_id"],
      "properties": {
        "order_id": {"type": "string", "description": "Order id exactly as the user wrote it, e.g. ORD-48213"}
      }
    },
    "strict": true
  }],
  "messages": [{"role": "user", "content": "Where is ORD-48213?"}]
}
```

The provider renders the tool definitions into the model's context. When the model decides a tool is needed, it emits a structured call instead of (or after) some text, and the response ends with `stop_reason: "tool_use"`:

```json
{
  "role": "assistant",
  "stop_reason": "tool_use",
  "content": [
    {"type": "text", "text": "Let me check that order."},
    {"type": "tool_use", "id": "toolu_01", "name": "get_order", "input": {"order_id": "ORD-48213"}}
  ]
}
```

Nothing has happened yet. Your code, the **harness**, now runs `get_order` and sends a new request containing the whole conversation: the original user message, the assistant message exactly as it came back, and a user message carrying the result, keyed by the call's id:

```json
{"role": "user", "content": [
  {"type": "tool_result", "tool_use_id": "toolu_01", "content": "{\"status\":\"in_transit\",\"eta\":\"2026-09-29\"}"}
]}
```

The model reads the result and either calls another tool or answers, ending with `stop_reason: "end_turn"`. If a tool fails, you still return a `tool_result`, with `"is_error": true` and a message the model can act on; silently dropping it breaks the pairing between calls and results, and the API rejects the next request.

```viz
{"type": "ml", "algorithm": "agent-loop", "text": "How many open PRs are older than 7 days?",
 "title": "The tool-use loop",
 "caption": "The model only ever emits text or a structured call. The harness runs the tool and appends the result, and the whole transcript is sent again on every iteration."}
```

Details that bite in production:

- **Parallel calls.** One assistant message can contain several `tool_use` blocks (look up three orders at once). Run them, concurrently if they are independent, and return every result in *one* user message.
- **`tool_choice`.** The default, `auto`, lets the model decide. You can forbid tool calls with `none`, and some models let you force a call to a specific tool; support for forcing varies by model, so check before designing around it.
- **`strict: true`** on a tool applies constrained decoding to the arguments, so `input` always validates against `input_schema`. Without it, arguments are nearly always valid, which is a different thing from always.
- **The transcript grows.** Every tool result is resent on every later iteration. A tool that returns 20,000 tokens of raw JSON costs 20,000 input tokens on each remaining turn of the loop.

Other providers run the same loop with different field names. OpenAI declares tools as functions with a `parameters` schema and returns calls with their arguments serialised as a JSON string; Gemini uses function declarations. The mechanism, a schema in the context and a structured call out, is identical, which is also why the [Model Context Protocol](/learn/ai-and-llms/building-with-llms/agents) can describe tools once for every client.

## Designing tools the model can use well

A tool definition is a prompt. The model decides whether and how to call a tool almost entirely from its name, description and schema.

- **Say when to call it**, not just what it does. "Call this when the user asks about a specific order" is a trigger condition the model can match.
- **Prefer a few task-level tools to many endpoint-level ones.** `search_orders(customer_query, status, since)` beats exposing `list_orders`, `get_order`, `filter_orders` and `count_orders`: each extra tool is another decision the model can get wrong and more tokens on every request.
- **Return what the model needs, compactly.** Trim fields, paginate, summarise, and include stable ids the model can pass to the next tool.
- **Write errors for the model.** `order_id must look like ORD-12345; you passed "48213". Ask the user for the full id.` produces a recovery. `400 Bad Request` produces the same call again.
- **Make invalid arguments unrepresentable** with enums and formats in the input schema, instead of rejecting them after the fact.

## The harness owns validation and authority

The model proposes; the harness decides. Every tool call is untrusted input from a component that can be wrong and can be manipulated by text it has read ([LLM security](/learn/ai-and-llms/building-with-llms/llm-security)). The real checks live in the harness.

1. **Schema validation.** Validate arguments even when strict mode is on. It is cheap, and it protects you when a model or provider without strict support is swapped in. The exercise below builds the core of such a validator.
2. **Authorisation from the session, never from the arguments.** When the model calls `get_order("ORD-1")`, the harness checks that ORD-1 belongs to the *authenticated user of this session*. A `user_id` parameter that the model fills in is an invitation to read another customer's orders.
3. **Semantic checks.** Does the order exist? Is the refund amount no larger than the order total? Is the date in the future?
4. **Idempotency for side effects.** The harness can retry a call after a timeout, and the model can issue the same call again on a later step. An `issue_refund` tool needs an idempotency key tied to the operation rather than the attempt (the dispute being resolved, say), or a retry pays out twice ([Idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries)).
5. **Timeouts and size limits** on every tool, so one slow dependency or one enormous response cannot stall or bloat the loop.

## Structured output or tool?

| You need | Use |
|---|---|
| A typed final answer: a classification, an extraction, a grade | Structured output |
| Information the model does not have, fetched before it answers | Tools |
| An action in another system | Tools, with human confirmation for anything irreversible |
| Both: gather information, then answer in a fixed shape | Tools during the loop, structured output for the final turn |

Before native structured outputs existed, a common trick was to declare a fake tool whose input schema was the desired output and force the model to call it. It still works where forcing is supported, but a response schema says what you mean, and it does not leave a transcript claiming an action took place.

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

## Senior signals

- You separate **structural guarantees from semantic correctness**: constrained decoding guarantees the parse, not the truth, so you still enforce the invariants the schema cannot express.
- You check **`stop_reason` before parsing** anything: `max_tokens`, `refusal` and `tool_use` each need their own path.
- You treat every tool call as an **untrusted request**: validate the arguments, authorise from the session rather than from model-supplied ids, and make side effects idempotent.
- You design tools as **prompts**: trigger conditions in descriptions, a few task-level tools, compact results and errors the model can act on.
- You know **the transcript is resent on every iteration**, so the size of a tool's output is a cost and latency decision.
- You order schema fields so **reasoning comes before the verdict**.

## Check yourself

```quiz
- q: >-
    With schema-constrained decoding, how does the provider stop the model from emitting a value outside an enum?
  options: ["It masks the logits of tokens the schema's grammar forbids at each step", "It post-processes the output and swaps invalid values for the nearest valid one", "It retries the request in the background until the output validates", "It fine-tunes a copy of the model on your schema before serving the request"]
  answer: 0
  explanation: >-
    The schema is compiled into a grammar that masks illegal next tokens before sampling, the same mask-and-renormalise step as top-p, so invalid continuations have zero probability. Nothing is repaired after the fact and no retries are needed for structure, but the model now picks the most probable valid value, which can still be wrong.
- q: >-
    A structured-output response comes back with stop_reason "max_tokens". What should your code conclude?
  options: ["The model refused the request, and the partial text explains the refusal", "The output is incomplete; treat it as an error, then raise max_tokens", "The JSON is valid and complete, because every token was constrained", "The schema was too complex, so the provider ignored it for this request"]
  answer: 1
  explanation: >-
    Constrained decoding guarantees every emitted token is legal, not that generation finished. A truncated document fails to parse or, worse, parses into a partial object in lenient parsers. Treat it as an error, then raise max_tokens or shorten the task. A refusal has its own stop reason.
- q: >-
    A tool is declared as get_invoice(user_id, invoice_id), and the model fills in both arguments from the conversation. What is the flaw?
  options: ["Two required parameters are too many; each tool should take one argument", "invoice_id should be declared as an integer so the model cannot invent ids", "Tools must never take ids, only natural-language descriptions of records", "The user should come from the session, not from an id the model supplies"]
  answer: 3
  explanation: >-
    The model's arguments are untrusted input: an injected or confused model can ask for another user's invoices. Deriving the user from the authenticated session makes cross-tenant reads impossible regardless of what text the model has read; checking a model-supplied user_id against itself checks nothing. Typing invoice_id as an integer changes its format, not whose invoice it is.
- q: >-
    The model returns one assistant message with three tool_use blocks. How do you send the results back?
  options: ["One user message holding all three tool_result blocks, each with its own id", "Three separate user messages, one per tool_result, in the order called", "An assistant message appended after the calls, holding all three results", "Only the first result; the model will ask again for the remaining two"]
  answer: 0
  explanation: >-
    Each tool_use must be answered by a tool_result with the matching tool_use_id in the next user message. Returning them together keeps the transcript well-formed and lets the model use all results in its next step; splitting them across several user messages breaks the alternation the API expects.
- q: >-
    A grading schema lists "verdict" before "reasoning". Why is swapping the order likely to improve the verdicts?
  options: ["Shorter fields should always come last so the model spends its effort early", "JSON parsers read keys alphabetically, so reasoning is always parsed before verdict", "Providers reject schemas whose last property is a short enum-like string", "Tokens are generated in order, so reasoning written first informs the verdict"]
  answer: 3
  explanation: >-
    Each token is conditioned on the tokens before it. Putting reasoning first lets the conclusion depend on it; with the verdict first, the reasoning can only justify a choice already made. It is the same reason step-by-step reasoning helps in free text. Key order matters to the generator, not to the parser.
```
