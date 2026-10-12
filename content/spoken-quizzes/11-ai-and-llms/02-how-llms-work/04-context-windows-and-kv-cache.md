---
lesson: context-windows-and-kv-cache
source: 45c215bacaa33130
---
## 1

A request's context grows from 4 thousand to 128 thousand tokens. By roughly what factor does the number of attention scores per layer grow?

A, about 180 times, since it grows as n to the power 1.5. B, not at all, since FlashAttention keeps it flat. C, 1,024 times, since it grows as n squared. D, 32 times, since it is linear in length.

[think]

The answer is C: 1,024 times, since it grows as n squared.

Scores scale with the square of the length, and 128 thousand over 4 thousand is 32, and 32 squared is 1,024. The weight multiplications grow only 32 times, which is the tempting linear answer. FlashAttention avoids storing the n by n matrix, but it still computes every score, so the compute stays quadratic.

## 2

Users complain that responses take 6 seconds before the first word appears, and then stream quickly. Which phase is the bottleneck, and what helps most?

A, prefill of a long prompt; shorten or cache the prompt prefix. B, tokenization of the prompt; switch to a faster tokenizer. C, decode of each token; lower the temperature to speed up sampling. D, decode of the output; lower max tokens to cut generation.

[think]

The answer is A: prefill of a long prompt, so shorten or cache the prompt prefix.

Time to first token is dominated by prefill, which processes the whole prompt and grows with its length. Shrinking the prompt, or reusing a cached prefix, cuts it. Max tokens and temperature affect decode, which is already fast here.

## 3

A 7-billion-class model has 32 layers, and 32 key and value heads of dimension 128, stored in 16-bit floats. How much KV cache does one sequence of 4,096 tokens need?

A, 16 gibibytes. B, 512 mebibytes. C, 2 gibibytes. D, 64 mebibytes.

[think]

The answer is C: 2 gibibytes.

Per token, it is 2, for keys and values, times 32 layers, times 32 heads, times 128 dimensions, times 2 bytes: half a mebibyte. Times 4,096 tokens, that is 2 gibibytes. 512 mebibytes is the figure with 8 key and value heads under grouped-query attention, and 16 gibibytes is the figure at 32 thousand tokens.

## 4

Your system prompt starts with the current time, to the second, followed by 5,000 tokens of fixed instructions and tools. Prompt caching shows almost no hits. Why?

A, cache hits require temperature zero, which the request does not set. B, prompt caching only applies to prompts under 1,000 tokens. C, timestamps become special tokens that the cache always skips. D, caches match exact prefixes, and the timestamp changes on every call.

[think]

The answer is D: caches match exact prefixes, and the timestamp changes on every call.

Prefix caching reuses KV entries only for a token prefix that is identical from the very first token. A value that changes on every request, right at the start, invalidates the whole prompt after it, so nothing can be reused. Move volatile content to the end, after the static instructions and tools. Providers set a minimum prefix length, not a maximum, and sampling settings do not affect prefill.

## 5

Switching a model from 32 key and value heads to 8, with grouped-query attention, while keeping 32 query heads, mainly improves which serving metric?

A, the maximum context the model was trained on, by 4 times. B, the vocabulary size, by 4 times, so each word needs fewer tokens. C, KV cache memory per token, by 4 times, and so sequences per GPU. D, prefill compute per token, by 4 times, and so time to first token.

[think]

The answer is C: KV cache memory per token, by 4 times, and so sequences per GPU.

Grouped-query attention shares each key and value head across several query heads, so the cache stores a quarter as many key and value vectors. That multiplies how many concurrent sequences fit alongside the weights, which drives throughput. Query-side compute, and so prefill, is largely unchanged, and vocabulary and training context length are separate properties.

## 6

With a KV cache, a 7-billion-class model without grouped-query attention generates 128 tokens a second at a 4 thousand token context, and about 24 at 128 thousand, on the same GPU and batch size. What explains the slowdown?

A, the cache is recomputed for every new token at long context. B, sampling over the vocabulary takes longer as the context grows. C, the weights must be reloaded from disk for long prompts. D, each step reads the whole cache, which grows with the context.

[think]

The answer is D: each step reads the whole cache, which grows with the context.

Decode is bound by memory bandwidth. Every step streams the weights, 13.5 gigabytes, plus the sequence's entire KV cache: 2.1 gigabytes at 4 thousand tokens, and 68.7 gigabytes at 128 thousand. The cache prevents recomputation, but not the read. Sampling cost depends on the vocabulary, not the context, and the weights stay in GPU memory.
