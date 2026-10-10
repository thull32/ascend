---
lesson: inference-serving
source: 8e1a38b7cda23e05
fit: great
desk:
  - "The arithmetic intensity and ridge point calculation, and the prefill time table"
  - "The batch-size table from step time to cost per million tokens"
  - "The continuous batching trace slot by slot, and the paged KV block tables"
  - "The quantisation memory table and the four-weight 4-bit worked example"
  - "The speculative decoding acceptance trace and the expected-tokens formula"
  - "The API cost model step by step, and the optimisation and deployment tables"
  - "Exercises: static versus continuous batching, and tokens per target pass"
---
## Introduction

You self-host an open-weight model for an internal coding assistant. A single request streams at a pleasant 100 tokens a second. But when 50 engineers use it at once, the 99th percentile latency climbs past 30 seconds. You double the GPUs by splitting the model across two cards, and throughput barely moves. Meanwhile, a sibling team calling a hosted API gets a bill five times their estimate, mostly from one feature that sends the same 6 thousand token preamble with every request.

Both teams are running into the same physics. Generation is limited by how fast weights and caches can be read from memory, not by arithmetic. That one fact explains why batching is nearly free, why memory rather than compute caps concurrency, why quantisation speeds things up, why speculative decoding works, and why hosted APIs price the way they do.

First that fact, then the three tools that exploit it, then the bills.

## Why decode is memory-bound

A request has two phases. Prefill pushes the whole prompt through the model in one parallel pass and fills the key-value cache. Then decode produces one token per step. The user feels two numbers: the time to first token, which is queueing plus prefill, and the time per output token after that.

End-to-end latency is roughly the time to first token plus the number of output tokens times the time per token. With a 0.4 second first token and 25 milliseconds per token, a 400-token answer takes about 10 seconds, almost all of it decode. Output length dominates, so the cheapest latency win is very often asking for a shorter answer.

Now the physics, with one set of assumptions: a 7 billion parameter model, about 13 gigabytes in 16-bit, on a GPU that does about 10 to the 15 operations a second and reads memory at 2.5 terabytes a second. Each decode step has to read every weight from memory to produce one token. Reading 13 gigabytes at that speed takes about 5 milliseconds. So a single sequence can never exceed about 185 tokens a second, however fast the arithmetic is. And the arithmetic for that token takes 13 microseconds. At a batch of one, the arithmetic units sit idle more than 99 percent of the time.

Another way to say it. The GPU can do about 400 operations in the time it reads one byte; that balance is called the ridge point. Decode does about one operation per byte it reads. Deeply memory-bound. Prefill reuses each weight once for every prompt token, so a long prompt does far more than 400 operations per byte: compute-bound. A 2 thousand token prefill takes about 56 milliseconds here, and a 30 thousand token one about 1.3 seconds.

That idle arithmetic is free capacity. Before I give you the numbers: if 32 sequences decode together, roughly what happens to total throughput, and to each user's speed?

[pause]

The weights are read once and applied to all 32 tokens. Each step gets a little slower, because every sequence's own cache must also be read, and that does not share. Under the lesson's assumptions, one sequence gets 183 tokens a second. At a batch of 32, each user gets 114, about 40 percent slower, but the total is over 3,600: twenty times the throughput. At 128, each user gets 52 and the total is 6,700. At 256, the caches no longer fit on an 80 gigabyte GPU.

That is the central dial of LLM serving: per-user latency against total throughput. At an assumed 3 dollars per GPU-hour, cost per million tokens goes from about 4.56 dollars at a batch of one to 23 cents at 32 and 12 cents at 128. Cache memory sets the ceiling, and your latency target sets where below it you stop. And all of this assumes the GPU is busy. At 10 percent utilisation, the batch of 32 costs ten times as much per token.

## Continuous batching and paged memory

Static batching waits for a group of requests, runs them together, and returns when the longest one finishes. Continuous batching reschedules at every decode step: finished sequences leave, and waiting requests join immediately.

The lesson's small trace: three slots, five requests that need 6, 2, 3, 4 and 2 tokens. Static batching runs the first three for 6 steps, because of the longest, then the last two for 4: 10 steps. Continuous batching slots each new request in the moment one finishes, and everything is done in 6. The useful work is the same 17 token-steps either way, but static batching kept the slots 57 percent busy and continuous kept them 94 percent busy. The last request finishes at step 5 instead of step 8. With real traffic the static waste is far larger, and continuous batching is the default in modern serving engines such as vLLM.

Prefill complicates it. Admitting a 30 thousand token prompt in one block stalls everyone else's next token for 1.3 seconds. Chunked prefill splits it into pieces of about 14 milliseconds, interleaved with decode, so nobody waits more than one chunk.

Continuous batching needs one more piece: somewhere to put caches that grow one token at a time to a length nobody knows in advance. The naive way reserves room for the maximum context per sequence. Four sequences of very different lengths, with a 4 thousand token maximum, wasted 75 percent of what was reserved.

Paged attention borrows the operating system's answer from virtual memory. Split the cache into fixed blocks of 16 tokens, allocate a block only when a sequence fills its last one, and keep a table per sequence that maps its blocks to wherever they sit in GPU memory. The waste falls to the unfilled end of each last block: half a percent. The memory you free becomes batch size, which is throughput. When blocks do run out, the engine preempts a sequence, and that user sees a stall.

## Quantisation

If decode time is dominated by bytes read, storing weights in fewer bits speeds it up almost proportionally, and lets the model fit on fewer GPUs. A 7 billion parameter model is 14 gigabytes at 16 bits, 7 at 8 bits, and about 3.6 at 4 bits. A 70 billion parameter model: 140, 70, and about 36.

But weights are only half the budget; the cache is the other. A typical 70 billion parameter configuration needs about 320 kibibytes of cache per token. At 4-bit weights on one 80 gigabyte GPU, roughly 44 gigabytes remain, about 134 thousand tokens of cache, so thirty-odd conversations of 4 thousand tokens. At 16 bits, the weights alone need two such GPUs.

The mechanism is a scale factor per small group of weights. Map the group's largest magnitude to the largest small integer, round the rest to the nearest step, and store one shared scale. In the lesson's four-weight example, the round trip is off by at most about a hundredth. Real schemes must also handle rare outlier values that would stretch a group's scale and crush everything else in it to zero.

How much quality does it cost? 8-bit is usually close to indistinguishable from 16-bit. Well-calibrated 4-bit often comes close on published benchmarks too. But losses grow below 4 bits, they are largest on the hardest reasoning tasks, and a benchmark average can hide a regression on exactly the slice your traffic depends on. Run your own evaluation set against the quantised model before switching.

## Speculative decoding

Decode leaves the arithmetic idle, and checking several tokens at once costs about the same as generating one, because the weights are read once either way. Speculative decoding exploits that. A small, fast draft model proposes, say, four tokens. The large target model scores all four in one pass. Each drafted token is accepted with a probability that compares the two models: always, if the target likes it at least as much as the draft did, and otherwise in proportion. At the first rejection, the target supplies its own token, and the round ends.

The lesson's trace, after "The quick brown". The draft proposes fox, jumps, over, the. Fox: the target likes it more than the draft did, accepted. Jumps: accepted with probability 0.8, and the draw says yes. Over: the target thinks it much less likely than the draft did, accept probability a quarter, and the draw says no. The target substitutes its own token. One target pass, three tokens.

Here is the property interviewers probe. Does this change the output?

[pause]

No. That acceptance rule, plus how the replacement is chosen, makes the output distribution exactly the target model's. It changes only speed. With four drafted tokens and an acceptance rate of 0.8, each target pass yields about 3.4 tokens on average; at 0.6, about 2.3. If each draft token costs 5 percent of a target step, that is a speed-up of about 2.8 times at 0.8 and 1.9 times at 0.6.

Acceptance is high on predictable text: code, structured output, and edits that copy most of the input, where simply drafting from repeated phrases in the prompt works very well. It is lower on creative writing. And the gains shrink at large batch sizes, because the arithmetic that speculation borrows is no longer idle.

## Scaling out, and the bill

Now the opening's disappointment. Tensor parallelism splits every layer across GPUs, which exchange partial results at every layer. It cuts per-token latency and adds communication, so it scales well to a handful of tightly connected GPUs and poorly beyond. If the model already fits on one GPU, splitting it across two mostly buys latency. For throughput, run two independent replicas behind a load balancer. Balance by queue depth and cache usage rather than round-robin, since requests vary enormously in cost, and route requests with the same prompt prefix to the same replica so its prefix cache hits.

The same physics shows up in hosted price lists. Output tokens cost several times more than input, because they are generated one at a time while input is processed in parallel. Cached input is heavily discounted, because a reused prefix skips prefill. Batch APIs that return within hours are discounted, because they fill idle capacity.

The lesson's cost model, with illustrative round prices: 3 dollars per million input tokens, 15 per million output, cached input at a tenth of the input price. A million requests a day, each with 3 thousand input tokens and 300 output. That costs 13,500 dollars a day. Cache the shared 2,500-token prefix and it drops to 6,750: half the bill. Then route the easy 70 percent of requests to a model at a tenth of the price, escalating the rest, and it is about 2,500 dollars a day.

Each step is an architectural decision, with an evaluation set proving the small model is good enough. And the classic way to lose the first saving: someone adds a timestamp or request ID near the top of the system prompt. The prefix changes on every request, caching stops, and the bill doubles. Keep volatile content after the stable prefix, and alert on the cache-hit ratio.

Self-host or API? Utilisation decides most cases. A GPU costs the same per hour whether it serves 10 tokens a second or 3 thousand, so spiky or low traffic favours an API.

## In the interview

A follow-up the lesson expects. Why is decode memory-bound, and what follows from it?

[pause]

Each step reads every weight to produce one token per sequence: about one operation per byte, against a ridge point of about 400. A 7 billion parameter model in 16-bit tops out near 185 tokens a second for one sequence while its arithmetic is 99 percent idle. Batching shares the weight read, so throughput rises twentyfold at a batch of 32, until cache memory or the latency target stops it. The wrong answer is "it is compute-bound, so buy faster GPUs".

And the sizing one: we will serve a 70 billion parameter model; how many GPUs? Weights are 140 gigabytes at 16 bits, 70 at 8, about 36 at 4. The cache is about 320 kibibytes per token, so at 4 bits one 80 gigabyte GPU holds roughly 130 thousand tokens of cache. Then size replicas from peak concurrent tokens and the latency target, and check quality at each precision on your own evaluation. The wrong answer is a number from the weights alone, with no cache and no concurrency.

## Recap

Four things to remember. Decode is limited by bytes read, not arithmetic: weights divided by bandwidth gives the single-stream ceiling, and batching is nearly free until cache memory or the latency target runs out. Continuous batching refills slots every step, and paged cache memory is what makes it possible. Quantisation cuts bytes per weight and speculative decoding borrows the idle arithmetic, which leaves the output exactly the target model's; replicas, not tensor parallelism, buy throughput. And on an API, output costs more than input and a stable prefix is billed at the cached rate, so in the lesson's example caching and routing took the bill from 13,500 dollars a day to about 2,500.

At your desk: the ridge point arithmetic, the batch-size cost table, the batching and paging traces, the quantisation example, the speculative decoding trace, the cost model, and the two exercises.
