---
lesson: structured-outputs-and-tool-use
source: 95fb577ca4f87ae9
---
## 1

With schema-constrained decoding, how does the provider stop the model from emitting a value outside an enum?

A, it retries the request in the background until the output validates. B, it masks the logits of tokens the schema's grammar forbids at each step. C, it fine-tunes a copy of the model on your schema before serving the request. D, it post-processes the output, and swaps invalid values for the nearest valid one.

[think]

The answer is B: it masks the logits of tokens the schema's grammar forbids at each step.

The schema is compiled into a grammar that masks illegal next tokens before sampling, the same mask-and-renormalise step as top-p, so invalid continuations have zero probability. Nothing is repaired after the fact, and no retries are needed for structure. But the model now picks the most probable valid value, which can still be wrong.

## 2

At the enum step, the model's probabilities are 0.44 for an illegal token, 0.27 for "hire", and 0.16 for "no". After the grammar mask, what is the probability of "hire"?

A, about 0.50, because the mask makes every legal continuation equally likely. B, about 0.71, because the illegal token's mass is added to the top legal token. C, about 0.27, because masking removes illegal tokens without rescaling the rest. D, about 0.62, because the legal tokens are renormalised in proportion.

[think]

The answer is D: about 0.62, because the legal tokens are renormalised in proportion.

The mask zeroes the illegal tokens, and renormalises the survivors in proportion to the model's own preferences: 0.27 over 0.43 is about 0.62. That is why a schema without an honest escape value turns uncertainty into a confident-looking answer. The mass the model put on the illegal option is redistributed, not reported.

## 3

A structured-output response comes back with a stop reason of max tokens. What should your code conclude?

A, the model refused the request, and the partial text explains the refusal. B, the output is incomplete; treat it as an error, then raise the max tokens limit. C, the JSON is valid and complete, because every token was constrained. D, the schema was too complex, so the provider ignored it for this request.

[think]

The answer is B: the output is incomplete, so treat it as an error, then raise the limit.

Constrained decoding guarantees every emitted token is legal, not that generation finished. A truncated document fails to parse, or worse, parses into a partial object in lenient parsers. Treat it as an error, then raise max tokens or bound the output. A refusal has its own stop reason.

## 4

A tool is declared as get invoice, taking a user id and an invoice id, and the model fills in both arguments from the conversation. What is the flaw?

A, tools must never take ids, only natural-language descriptions of records. B, two required parameters are too many; each tool should take one argument. C, the invoice id should be declared as an integer, so the model cannot invent ids. D, the user should come from the session, not from an id the model supplies.

[think]

The answer is D: the user should come from the session, not from an id the model supplies.

The model's arguments are untrusted input: an injected or confused model can ask for another user's invoices. Deriving the user from the authenticated session makes cross-tenant reads impossible, whatever text the model has read; checking a model-supplied user id against itself checks nothing. Typing the invoice id as an integer changes its format, not whose invoice it is.

## 5

The model returns one assistant message with three tool use blocks, and one of the three tools times out. How do you continue?

A, drop the failed call from the assistant message, and send the two results. B, send one user message with all three tool results, the timeout marked as an error. C, retry the timed-out tool until it succeeds, then send all three results together. D, send the two successful results now, and the third in a later user message.

[think]

The answer is B: one user message with all three tool results, the timeout marked as an error.

Every tool use id needs a tool result in the next user message, so the failure is reported as an error result the model can act on: retry, ask the user, or answer without it. Retrying indefinitely stalls the loop, splitting the results breaks the pairing, and editing the assistant message rewrites history the model produced.

## 6

During a provider overload, half of all calls fail. Your code retries each failure up to three times. Roughly how much traffic does it send per user request?

A, about 4 times, since every request is sent four times in the worst case. B, about 1.9 times, since each failure spawns a retry until the cap. C, about 1.5 times, since later retries rarely happen at all. D, about 1 times, since retries only replace requests that already failed.

[think]

The answer is B: about 1.9 times, since each failure spawns a retry until the cap.

With a failure probability of a half and three retries, the expected attempts are 1, plus a half, plus a quarter, plus an eighth: about 1.9, sent to a provider that is already refusing work. Backoff with jitter, a small cap, a service-wide retry budget, and awareness of the SDK's own retries keep a slowdown from becoming an outage. Four times is the worst case for one request, not the average.
