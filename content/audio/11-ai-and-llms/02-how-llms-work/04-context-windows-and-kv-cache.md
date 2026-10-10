---
lesson: context-windows-and-kv-cache
source: e10df0e17a5d2cf9
fit: great
desk:
  - "The token-by-token KV cache trace for The cat sat, with and without the cache"
  - "The bytes-per-token formula and the KV cache size table for the 7B and 70B shapes"
  - "The prefill arithmetic and the decode time-per-token table"
  - "How servers hold the cache: paged blocks, chained prefix hashes and preemption"
  - "Exercise: how many sequences fit on the GPU"
---
## Introduction

A support assistant sails through testing. In production, conversations run to 40 turns, and three things go wrong at once. The first word of each reply takes six seconds to appear. The GPU fleet that was sized for 2,000 concurrent users tops out at 600. And the model ignores a clause on page 47 of a 90-page contract a customer pasted in, although the clause is plainly there.

None of these is a bug in your code. Each is a direct consequence of how a transformer processes its context, and each has a number a senior engineer can estimate before launch.

Start with what the context is: every token the model conditions on in one call. System prompt, tool definitions, history, retrieved documents, tool results, and the output so far. The model keeps nothing between calls. A chat that remembers your first message is re-sending your first message every turn. And every token you send is processed on every call, at a cost that is not linear.

Three ideas, then. The two phases of serving a request, and which one each complaint is about. The key-value cache, what it saves and what it costs in memory. And why the window you are sold is not the window you get.

## Why long context is expensive

Attention scores every position against every other, so the work grows with the square of the context. Go from 4 thousand tokens to 128 thousand, 32 times longer, and attention does 1,024 times the work.

The rest of the model, the weights, grows only linearly with length. For a 7 billion parameter model the two are equal at about 25 thousand tokens. Below that, a request's cost is mostly the weights, and grows roughly in line with length. Above it, attention takes over, and cost grows with the square.

Memory would be worse still. Building the full grid of scores for 128 thousand tokens would take 32 gibibytes for one head of one layer. No production system does that. FlashAttention computes it in tiles that fit in the GPU's fast on-chip memory, so the full grid never exists. It is exact, not an approximation, and memory becomes linear. But the compute is still quadratic.

## Prefill and decode

Serving a request has two phases with completely different characters.

Prefill processes the whole prompt in one parallel pass. Every prompt token goes through every layer at once as big matrix multiplications, which keeps the GPU's arithmetic units busy. Prefill is compute-bound. It sets the time to first token, and it grows with prompt length, faster than linearly once attention dominates. A 70 billion parameter model needs about 140 billion operations per prompt token for the weights alone, so a 100 thousand token prompt takes several seconds even spread across a server of GPUs. That was the six-second first word. For a 7 billion parameter model, under the lesson's assumptions about one GPU, prefill takes about 30 milliseconds for a thousand tokens, 0.4 seconds for 10 thousand, and 10 seconds for 100 thousand.

Decode then generates tokens one at a time. Each step does very little arithmetic, one token's worth, but must read every weight of the model, plus the stored keys and values of every previous token, from GPU memory. Decode is memory-bandwidth-bound. It sets the time between output tokens.

So when a latency complaint comes in, the first question is which phase. Slow first word, then fast streaming: that is prefill.

## The KV cache

When the model generates a token, attention at every layer needs the keys and values of all the earlier tokens. Because of the causal mask, those never change once computed: a token's representation depends only on tokens at or before it. So the server computes them once and keeps them. That store is the KV cache, short for key-value. Each decode step computes the new token's key and value, appends them, and attends over the cache.

Without the cache, every step would recompute keys and values for the whole sequence, and the total would grow with the square of the output. With it, it grows linearly.

Before I go on: does that make each decode step's cost independent of the context length?

[pause]

No, and this is the part people miss. The cache removes recomputation. But each step still attends over every cached token, and still reads the whole cache from memory. So the cost per output token grows with the context.

The numbers make it concrete. Take the 7 billion parameter model on a GPU with 2 terabytes a second of memory bandwidth, one sequence at a time, without key-value sharing. At 4 thousand tokens of context, each output token takes about 8 milliseconds, roughly 128 tokens a second. At 128 thousand tokens, each step streams a cache of about 69 gigabytes, and generation drops to about 24 tokens a second. A fifth of the speed. Long context slows decode, not only prefill.

## How big the cache is

For every token, every layer stores one key and one value for each key-value head. Multiply it out: layers, times key-value heads, times head size, times two for key and value, times bytes per number.

For the 7 billion parameter shape, 32 layers, 32 heads of 128, in 16-bit numbers, that is half a mebibyte per token, for every token of every active sequence. A 4 thousand token conversation needs 2 gibibytes. A single 128 thousand token conversation needs 64 gibibytes, more than the model's own weights, which are about 13.

That is why large models use grouped-query attention: sharing each key-value head across several query heads. On a 70 billion parameter model with 8 key-value heads, a token costs 320 kibibytes, and 32 thousand tokens of context costs 10 gibibytes. If that model used 64 key-value heads instead, the same context would need 80 gibibytes, more than a GPU holds. Without grouped-query attention, long context on that model would be impractical.

## Memory decides concurrency

GPU memory holds the weights, the caches, and some working space. Whatever is left after the weights is shared by the caches of all the sequences being decoded together. So cache size decides how many requests one GPU can serve at once.

Take one 80 gibibyte GPU serving the 7 billion parameter model: 14 for weights, 66 left for cache. With full attention at 4 thousand tokens per sequence, 33 sequences fit. With grouped-query attention, 132. Store the cache in 8 bits instead of 16, and it is 264. Now keep grouped-query attention, but let each conversation run to 128 thousand tokens. How many fit?

[pause]

Four. That is the fleet that topped out at 600 users instead of 2,000: the conversations were longer than the capacity model assumed. Context length per request is a capacity parameter as much as a product feature.

And concurrency is what makes serving affordable. Every decode step reads all the weights once, and that read is shared by every sequence in the batch. One sequence at 4 thousand tokens with grouped-query attention gets about 143 tokens a second. Thirty-two such sequences together get about 2,100 tokens a second between them. Batching is nearly free during decode, which is why the cache that limits the batch matters so much.

## Prompt caching

If thousands of requests start with the same 6 thousand token system prompt and tool definitions, recomputing their keys and values every time is pure waste. Prompt caching, also called prefix caching, keeps the cache for a prefix and reuses it for later requests that begin with exactly the same tokens. The cached part skips prefill, so the first word arrives sooner, and hosted providers bill cached input at a steep discount.

The mechanism dictates how you structure prompts. It matches exact token prefixes from the very start, and one changed token invalidates everything after it. Under the hood, each block of tokens is identified by a hash chained to the block before it, which is why one early change breaks every block that follows.

So put static content first: system prompt, tool definitions, reference documents, examples. Put the user's message last. The classic ways to defeat it are a timestamp or request ID at the top of the system prompt, tool definitions serialised in a random order, and per-user personalisation in the first paragraph. Caches also expire after minutes of inactivity. Check the cached-token counts in the usage data to confirm you are actually getting hits.

## The window you get

Models are trained at some length and stretched beyond it: rotary position frequencies rescaled, some layers that only look at a sliding window of recent tokens, attention variants that avoid the full square, and very long sequences split across GPUs.

But the advertised window is not the effective window. Models use information at the beginning and end of a long context more reliably than information in the middle; the paper is called "Lost in the Middle". They get worse as irrelevant material is added, and they find it harder to combine several facts spread far apart than to retrieve one. Needle-in-a-haystack tests, which plant one sentence in filler, are the easy case. That was the clause on page 47. If your feature depends on long context, measure it on your own documents and questions.

And chat cost grows with the square of conversation length, because the history is resent every turn. If each turn adds 500 tokens, 20 turns bill 105 thousand input tokens for 10 thousand tokens of actual conversation. So retrieve the three relevant passages rather than stuffing the manual, compact old turns and old tool results, trim tool output, put critical instructions at the start and briefly again near the end, and keep the prefix stable so caching works.

## In the interview

A follow-up the lesson expects. Users say the first word is slow, but streaming is fast. Where do you look?

[pause]

Prefill. Look at prompt length, the prefix-cache hit rate, and whether long prompts are queued behind others. The fixes are caching, shorter prompts, and chunked prefill. Decode settings will not help; the common wrong answer is "lower the maximum tokens".

And the capacity one: how would you size a GPU fleet for a chat product? From the distribution of context lengths, not the demo's. Cache bytes per token, times tokens in flight per GPU, after the weights, gives you concurrent sequences. Decode time per token at that batch size gives throughput. Then add headroom for bursts, because when the cache fills, the engine preempts sequences, and that shows up as latency spikes, not errors. The wrong answer divides requests per second by a benchmark's tokens per second measured at short context.

## Recap

Four things to remember. Prefill is compute-bound and sets the time to first token; decode is memory-bandwidth-bound and sets the time per output token. The KV cache removes recomputation, not the per-step read of the whole cache, so long context slows decode too. Cache size is layers times key-value heads times head size times two times bytes, and it decides how many sequences fit on a GPU, which makes context length a capacity input and grouped-query attention essential. And prompt caching needs a stable prefix, static first and volatile last, while the effective window is shorter than the advertised one.

At your desk: the token-by-token cache trace, the cache size and decode tables, how servers page and hash the cache, and the capacity exercise.
