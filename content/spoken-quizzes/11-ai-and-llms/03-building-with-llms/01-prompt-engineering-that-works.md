---
lesson: prompt-engineering-that-works
source: 06db1032b2b4ed00
---
## 1

A support chat uses automatic prompt caching with the default lifetime. The customer reads a long reply, and answers 12 minutes later. What happens to the input cost of that turn?

A, the prefix is billed at full price, and caching stays off for the rest of the chat. B, it matches the previous turn, since the cache lasts for the whole conversation. C, it costs nothing extra, since each hit extends the entry for another hour. D, the whole prefix is written to the cache again, at 1.25 times the input price.

[think]

The answer is D: the whole prefix is written to the cache again, at 1.25 times the input price.

The default entry lives 5 minutes from the start of the last request that read or wrote it, so after 12 minutes it is gone, and the turn rewrites its whole input. In the traced conversation, that was about 6,940 billed-equivalent tokens instead of 1,015. Later turns are cached again. Hits refresh the 5-minute lifetime, not an hour; the 1-hour option exists, at twice the input price for writes.

## 2

You replace 1,500 tokens of static examples with 900 tokens of examples retrieved per request, at a million requests a day. Why can the bill rise, although the prompt got shorter?

A, they make outputs longer, since the model copies the length of real tickets. B, they change per request, so they sit after the cache breakpoint, at full price. C, the embedding lookup per request costs more than the tokens it replaces. D, short prompts disable caching, because the minimum prefix is 1,500 tokens.

[think]

The answer is B: they change per request, so they sit after the cache breakpoint, at full price.

The static set was read from cache at a tenth of the price, 750 dollars a day; 900 uncached tokens cost 4,500 dollars a day. The switch pays only if the eval shows an accuracy gain worth 3,750 dollars a day. An embedding call is cheap next to the uncached input, and the minimum cacheable prefix depends on the model, from 512 to 4,096 tokens at the time of writing.

## 3

A cached prompt must include the current time, to the second. Where should it go?

A, inside each few-shot example, so the examples appear to be current. B, at the top of the system prompt, so the model reads it before the rules. C, after the last cache breakpoint, in the user turn or a trailing block. D, nowhere, because models know the time from their training data.

[think]

The answer is C: after the last cache breakpoint, in the user turn or a trailing block.

Caching matches byte-identical prefixes, so a value that changes on every request, placed at the top or inside the examples, makes every request a unique prefix, and every byte after it a miss. After the last breakpoint, it costs only its own tokens. A model knows the time only if the prompt tells it; its training data ends at some earlier point.

## 4

How does a chat model tell your system prompt apart from a ticket that says to ignore all previous instructions?

A, tags around the ticket escape its contents, so instructions become inert. B, it discards imperative sentences that appear after the user role marker. C, role tokens in one sequence, plus a trained deference to the system turn. D, the API sends the system prompt on a channel that ticket text cannot reach.

[think]

The answer is C: role tokens in one sequence, plus a trained deference to the system turn.

The chat template renders every turn into one token sequence, separated by special role tokens, and post-training teaches the instruction hierarchy: prefer the system turn over the user turn, over tool results. It is a learned tendency, so injections sometimes win; one in twelve did, against the best prompt. Tags are formatting, not escaping, and a customer can type a closing tag.

## 5

In the lesson's comparison of five prompt versions, placeholder and invented order ids fell from 27 to 1, out of 180. Which change did that, and why?

A, few-shot examples, because they show several valid order number formats. B, the JSON schema, because decoding only allows ids that occur in the ticket. C, the explicit null path, because "absent" now has a sanctioned value. D, a lower temperature, because sampling stops picking unlikely digits.

[think]

The answer is C: the explicit null path, because "absent" now has a sanctioned value.

Asked for four keys, with no way to say a value was absent, the model wrote something: N/A, none, or a plausible id. The null path, with its reason, gives it a value to choose, and that was the change from version 3 to version 4. A schema constrains shape, not whether a string appears in the ticket, and the examples arrived in version 5, after the drop. Temperature cannot add an option the prompt never offered.

## 6

Your example selector takes the best example of each label before filling by similarity, and places the most similar example last. What does each part do?

A, coverage fixes class imbalance in training, and last place lowers the temperature. B, coverage stops one label being copied, and last place uses the recency pull. C, coverage cuts tokens per request, and last place lets the cache reuse that example. D, coverage replaces the eval set, and last place hides the example from the model.

[think]

The answer is B: coverage stops one label being copied, and last place uses the recency pull.

Pure nearest-neighbour selection often returns several examples with the same label, and the model copies that label; taking one per label first shows the alternatives. The most similar example goes last, because examples nearest the input pull hardest, the same recency effect that skews static sets. Dynamic examples change per request, so no ordering makes them cacheable.
