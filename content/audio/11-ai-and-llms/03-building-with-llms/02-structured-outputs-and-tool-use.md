---
lesson: structured-outputs-and-tool-use
source: 537ee9ceaed1f779
fit: great
desk:
  - "The token-by-token grammar trace and the logit table at the enum step"
  - "The structured-output request and response, and the full wire exchange for two parallel tool calls"
  - "The concurrent tool harness code, and Ascend's quiz-validation snippet"
  - "Exercise: validate tool arguments against a schema"
---
## Introduction

Your code needs a dictionary; the model produces text. The first version of every LLM feature parses whatever comes back, and it works on 199 requests out of 200. At a million requests a day, the 200th is 5 thousand errors a day: a Markdown fence around the JSON, a friendly sentence before it, a field called urgent instead of urgency, a missing closing brace because the output hit its token limit.

Two API features close the gap, and they solve different halves of the problem. Structured outputs make the model's final answer conform to a JSON schema you supply. Tool use, also called function calling, lets the model pause mid-task, ask your code to run a function with typed arguments, and continue with the result. Both come out of the same token-by-token sampling loop, and neither removes the need for your code to check what comes back.

Three ideas, then. How a schema is enforced one token at a time, and what that guarantee leaves out. What a tool exchange looks like, and how errors are handled at each layer. And why your code, the harness, still validates and authorises everything.

## Constrained decoding

There have been three generations. First, ask in the prompt, parse, and retry on failure: no guarantee, and each retry is a full extra round trip. Second, JSON mode, which guarantees syntactically valid JSON of any shape at all, with missing fields, wrong types and extra keys. Third, schema-constrained decoding, which guarantees the output validates against your schema. What still goes wrong there is wrong values, truncation, and refusals.

The third works by changing the sampling step, not the prompt. The provider compiles your schema into a grammar, and the grammar into an automaton that tracks where in the document generation has got to. At every step, before sampling, it works out which tokens could extend the text without leaving the grammar, gives every other token zero probability, and samples from what remains. It is the same mask-and-renormalise step that top-p sampling performs, with the grammar choosing the mask.

Picture the smallest useful schema: one field, verdict, whose value must be hire or no hire. Generation reaches the opening quote of the value. The model's own preferences at that point are 44 percent on the word maybe, 27 percent on hire, 16 percent on no, the start of no hire, and the rest on tokens like a newline or "Sure". Maybe is illegal, so the mask throws it away and rescales the two legal tokens in proportion. What is the probability of hire now?

[pause]

About 62 percent: 27 divided by 27 plus 16. That is the first consequence. The mask discards information. The model put more weight on maybe than on both legal answers combined, and you get a confident-looking hire six times in ten. If maybe was the honest answer, the schema forced a guess. The fix is in the schema, not the prompt: add an honest escape value, such as insufficient evidence, so that what the model believes is representable.

Second, tokens are not characters. No is legal only because it is a prefix of no hire. The engine has to walk each candidate token's characters through the automaton, and doing that naively for 150 thousand tokens at every step would dominate generation time, so engines precompute most of it. What you can observe from a provider is a compile cost: at the time of writing, Anthropic documents extra latency on the first request that uses a new schema, and caches the compiled grammar for 24 hours from its last use.

Third, key order is fixed by the grammar. Properties are generated in the order the schema lists them, and Anthropic puts required properties before optional ones. Generation runs left to right, so put reasoning before the verdict and the verdict is conditioned on the reasoning. The other way round, the reasoning is a justification of a verdict already emitted.

So you can delete the retry-on-parse-error loop. But the mask does not make the model any smarter. If its preferred continuation was invalid, it now emits the most probable valid one, which can be a confident wrong answer in a perfect shape. One piece of small print: Anthropic warns that an enum value can come back differing only in capitalisation, so compare enums case-insensitively.

## What the schema cannot say

The design rules follow from the mechanism. Close every object against extra properties, and list every field as required. Use enums for closed sets, the cheapest correctness you will ever buy. And give the model an honest exit, an unknown value or a nullable field.

Constrained decoding supports only a subset of JSON Schema. At the time of writing, Anthropic's has no numeric ranges, no string lengths, no recursive schemas and almost no array constraints, and an unsupported keyword is a 400 error. No provider's schema can express a cross-field rule such as "the answer is a valid index into the options".

Ascend itself is the example. Its quiz generator asks for questions with options, an answer index and an explanation, and after parsing, the code still drops any question with fewer than two options or an answer index out of range. The mock-interview grader declares its score as an integer, which the grammar enforces, and clamps it to 0 to 100 after parsing, which the schema cannot express. The schema guarantees the parse, the code guarantees the invariants, and an eval set tells you whether the content is any good.

Ascend also shipped the key-order bug. Its schemas were written in a sensible order, but the Rust JSON library sorts keys alphabetically by default. So the quiz schema reached the API with the answer before the explanation, the options and the question itself: the model chose the correct index before writing the question. The roadmap schema put suggestions before the summary, and about one request in four came back with an empty list after 20 output tokens, a valid parse that the page showed as "no changes suggested". The fix had three parts: preserve the written order, write every schema evidence first, and pin the order with unit tests so a dependency change cannot silently undo it.

Before trusting any output, check the stop reason. Max tokens means generation was cut off: every token was legal, but the document is incomplete. Refusal means the model declined, and the content may not match the schema. Give both explicit handling, rather than letting them surface as parse errors.

## Tool use on the wire

Structured output shapes the final answer. Tool use lets the model gather information or act before answering. A customer writes: "I'm in Germany. Can I still return order 48213?" The system prompt includes today's date, the 20th of September.

You declare two tools, each with a name, a description and an input schema: get order, and get return policy for a country. The model needs both facts and neither depends on the other, so it replies with one message containing two tool calls, each with its own id, and stops. Nothing has happened yet. The harness validates both calls, runs them concurrently, and sends the whole conversation back: the question, the assistant's message exactly as it came, and one user message carrying both results, each keyed by its call's id. The order was delivered on the 2nd of September, and electronics in Germany have a 14-day window. The model answers: unfortunately not, it was delivered 18 days ago.

Notice that the second request carries everything the first did, plus the calls and the results, and every later request carries it all again. That is why result size is a cost decision.

Now the rules for parallel calls. Every call must be answered by a result with the matching id in the very next user message, all results in one message, before any text. A missing result is a 400 on the next request, and returning results piecemeal teaches the model to stop making parallel calls. Run independent calls concurrently: with model calls of a second and a half and tools taking 0.2 and 0.3 seconds, the parallel version takes 3.3 seconds, where three sequential model calls would take 5. The saving is a whole model round trip, not the tool time. Dependent calls stay sequential, and the model infers the dependency from the descriptions. Where two side effects must not race, such as cancelling a subscription and refunding the last invoice, turn parallel calls off.

## Errors and retries, layer by layer

Failures happen at four layers, each with its own owner. Transport errors, meaning rate limits, overloads, server errors and timeouts, belong to the harness, which retries with backoff before the model sees anything. Invalid requests, a 400 for a missing result or an unsupported keyword, belong to the developer: a retry fails the same way. Tool errors, a service timing out or an order that does not exist, go back to the model as a result marked as an error, and the model decides what to do. Output problems belong to the harness again: retry max tokens once with a larger limit, and never retry the same refused request.

Transport retries are safe for the provider, since a model call has no side effects, but they multiply load exactly when the provider is struggling. At a normal 2 percent failure rate, two retries cost 1.02 attempts per request. During an overload, half of all calls fail. How much traffic do three retries send per request?

[pause]

About 1.9 times: one, plus a half, plus a quarter, plus an eighth, sent to a provider already refusing half its work. Hence exponential backoff with full jitter, a small cap, and a retry budget across the service. And know that Anthropic's official SDKs already retry twice by default. Wrap your own loop of three around them, and one user action can become twelve requests during an incident.

Tool errors are observations, not exceptions. An error that says what format the id must have, what was passed, and to ask the user for the full id produces a recovery. "400 Bad Request" produces the same call again. Cap it in the harness: after two identical failures, stop and escalate. And if output hits max tokens in the middle of a tool call, its arguments may be incomplete. Never execute it.

## The harness owns authority

A tool definition is a prompt. Say when to call it, not only what it does: "call this before answering any question about returns". Prefer a few task-level tools to many endpoint-level ones, because each extra tool is another decision the model can get wrong.

Tools also cost tokens on every request. A definition is around 150 tokens, so twenty tools are about 3 thousand tokens per request. At a million requests a day and an illustrative 5 dollars per million, that is 15 thousand dollars a day, or 1,500 if the tool block is served from the cache. Tools render first, before the system prompt, so a tool list that changes between requests invalidates every cached byte after it.

Most important: the model proposes, the harness decides. Every tool call is untrusted input from a component that can be wrong, and can be manipulated by text it has read. Validate arguments against the schema even when strict mode is on. Take identity from the session, never from the arguments: a user id parameter the model fills in is an invitation to read another customer's orders. Check semantics: does the order exist, is the refund no larger than the total. Give side effects an idempotency key tied to the operation, not the attempt, or a retry pays out twice. And put timeouts and size limits on every tool.

## In the interview

Here is a follow-up the lesson expects. The model returns three tool calls in one message, and one of them fails. What exactly do you send back?

[pause]

One user message with three tool results, one per call id, results first. The failed one is marked as an error, with a message saying what to change. The model then decides whether to retry, ask the user, or answer with what it has. The wrong answer is to retry the failed tool until it works and then send only the successes.

And another: your structured output feature has a 0.3 percent parse failure rate. Where do you look? At the stop reasons of the failures, which will almost all be max tokens, often a list with no bound, or refusals. Not at bugs in the constrained decoder, and not by adding a retry loop.

## Recap

Four things to remember. Constrained decoding is a per-step token mask: it guarantees the shape, rescales the model's preference among legal tokens, and turns uncertainty into a confident guess unless the schema has an honest exit. The schema guarantees the parse, your code guarantees the invariants the subset cannot express, and the stop reason is checked before parsing. Every tool call gets a result, failures included, all in one message. And the harness owns authority: validate, take identity from the session, make side effects idempotent, and place retries by layer.

At your desk: the token-by-token mask trace, the full wire exchange for the two parallel calls, the concurrent harness code, and the exercise that validates tool arguments against a schema.
