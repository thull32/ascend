---
slug: inference-serving
title: "Inference serving: batching, quantisation, speculative decoding and cost"
description: Why decode is memory-bandwidth-bound and prefill is compute-bound (arithmetic intensity computed against the GPU's ridge point), static versus continuous batching traced slot by slot, paged KV memory and its fragmentation arithmetic, quantisation memory for 7B and 70B models, speculative decoding's acceptance rule traced token by token, the batch-size curve from latency to cost per million tokens, and how to engineer cost whether you self-host or call an API.
minutes: 50
difficulty: hard
tags: [llm, inference, batching, quantisation, speculative-decoding, latency, cost]
problems: []
---
You self-host an open-weight model for an internal coding assistant. A single request streams at a pleasant 100 tokens per second, but when 50 engineers use it at once, the p99 latency climbs past 30 seconds. You double the GPUs by splitting the model across two cards, and throughput barely moves. Meanwhile, a sibling team calling a hosted API sees a bill five times their estimate, dominated by a feature that sends the same 6,000-token preamble with every request.

Both teams are running into the physics of LLM inference. Generation is limited by how fast weights and caches can be read from memory, not by arithmetic. That single fact explains why batching is nearly free, why memory rather than compute caps concurrency, why quantisation speeds things up, why speculative decoding works, and why hosted APIs price the way they do. This lesson builds from that fact to the engineering choices, with every number computed from stated assumptions.

## The anatomy of a request

A request passes through tokenisation, a queue, **prefill** (one parallel pass over the prompt that fills the KV cache), the **decode** loop (one token per step), and detokenisation and streaming back to the client. The metrics that matter:

- **Time to first token (TTFT):** queueing plus prefill. What a user feels as "is it doing anything?"
- **Time per output token (TPOT)**, or inter-token latency: the duration of one decode step for this sequence.
- **End-to-end latency** $\approx \text{TTFT} + \text{output tokens} \times \text{TPOT}$. With a 2,000-token prompt, TTFT of 0.4 s (about 56 ms of it prefill under the assumptions below, the rest queueing) and TPOT of 25 ms, a 400-token answer takes $0.4 + 400 \times 0.025 = 10.4$ seconds. Output length dominates, so the cheapest latency win is very often asking for a shorter answer.
- **Throughput:** total tokens per second per GPU across all concurrent requests, which sets **cost per token**. **Goodput** is the throughput achieved while still meeting the latency target, and it is the number worth optimising.

## Prefill versus decode: arithmetic intensity

Use one set of assumptions throughout: a 7B-class model (6.7 billion parameters, 13.4 GB in 16-bit), and a data-centre GPU with about $10^{15}$ dense 16-bit FLOP/s and 2.5 TB/s of memory bandwidth (round numbers of the right order for current hardware; check your own card's datasheet).

The GPU's **ridge point** is $10^{15} / 2.5 \times 10^{12} = 400$ FLOPs per byte: a kernel doing fewer operations per byte it reads waits on memory; one doing more waits on arithmetic. Each weight read costs 2 bytes and is used for one multiply-add (2 FLOPs) per token that passes through it. So a pass over $P$ tokens has an **arithmetic intensity** of about $P$ FLOPs per byte of weights.

- **Decode**, one new token per sequence: about 1 FLOP per byte. Deeply memory-bound.
- **Prefill** of a long prompt: intensity equals the prompt length, far above 400. Compute-bound.

| Prompt length | Linear-layer FLOPs | Attention FLOPs | Prefill time at 50% of peak | Bound by |
|---|---|---|---|---|
| 400 | $5.4 \times 10^{12}$ | 1% extra | 11 ms | the ridge: balanced |
| 2,000 | $2.7 \times 10^{13}$ | 4% extra | 56 ms | compute |
| 30,000 | $4.0 \times 10^{14}$ | 59% extra | 1.3 s | compute, with attention growing as $P^2$ |

The two phases want different hardware configurations and different scheduling, which is the root of chunked prefill and disaggregation below.

## Why decode is memory-bound

Each decode step must push one new token through every layer, which means reading every weight from GPU memory. Reading 13.4 GB at 2.5 TB/s takes 5.4 ms, so a single sequence can never exceed about **185 tokens per second**, however fast the arithmetic is; the arithmetic for one token, $2 \times 6.7 \times 10^9 = 13.4$ GFLOPs, takes **13 microseconds** at peak. At batch size 1 the arithmetic units are idle more than 99% of the time.

That idle arithmetic is free capacity. If $B$ sequences decode together, the weights are read **once** and applied to $B$ tokens. The step gets somewhat slower, because each sequence's own KV cache must also be read, and that does not amortise. With grouped-query attention (32 layers × 8 KV heads × 128 dimensions × 2 for K and V × 2 bytes = 128 KiB of cache per token, from [Context windows and the KV cache](/learn/ai-and-llms/how-llms-work/context-windows-and-kv-cache)) and 2,048 tokens of context per sequence:

| Batch | KV cache | Memory in use | Step time | Tokens/s per user | Total tokens/s | Cost per million tokens at \$3/GPU-hour |
|---|---|---|---|---|---|---|
| 1 | 0.3 GB | 13.7 GB | 5.5 ms | 183 | 183 | \$4.56 |
| 8 | 2.1 GB | 15.5 GB | 6.2 ms | 161 | 1,286 | \$0.65 |
| 32 | 8.6 GB | 22.0 GB | 8.8 ms | 114 | 3,638 | \$0.23 |
| 128 | 34.4 GB | 47.8 GB | 19.1 ms | 52 | 6,700 | \$0.12 |
| 256 | 68.7 GB | 82.1 GB | does not fit an 80 GB GPU | | | |

(The \$3 per GPU-hour is an assumed price for illustration; the cost column is that price divided by tokens per hour.) Read the table as the central dial of LLM serving: **per-user latency against total throughput**. Batch 32 gives twenty times the throughput of batch 1 for each user getting 40% slower; batch 128 halves the cost again but each user now sees 52 tokens per second. KV-cache memory sets the ceiling, and the latency target sets where below it you stop. Two more facts hide in the table. The arithmetic at batch 256 is still only 3.4 ms of a 33 ms step, so even large batches remain memory-bound. And the cost column assumes the GPU is busy: at 10% utilisation, batch 32 costs \$2.29 per million tokens, ten times more.

## Batching: static versus continuous, traced

**Static batching** waits for a group of requests, runs them together, and returns when the longest one finishes. **Continuous batching** (also called in-flight or iteration-level batching) schedules at every decode step: finished sequences leave and waiting requests join immediately.

Trace both with 3 slots and five queued requests whose outputs are A = 6, B = 2, C = 3, D = 4 and E = 2 tokens. Static batching runs {A, B, C} for 6 steps (the longest), then {D, E} for 4: **10 steps**. Continuous batching:

| Step | Slot 1 | Slot 2 | Slot 3 | Event after the step |
|---|---|---|---|---|
| 1 | A | B | C | |
| 2 | A | B | C | B finishes |
| 3 | A | D | C | C finishes |
| 4 | A | D | E | |
| 5 | A | D | E | E finishes |
| 6 | A | D | | A and D finish |

**6 steps.** Useful work is $6 + 2 + 3 + 4 + 2 = 17$ token-steps either way; static batching spent 30 slot-steps on it (57% utilisation), continuous 18 (94%). Latency moves even more: E finishes at step 5 instead of step 8, D at step 6 instead of step 10. With real traffic, where output lengths range from 5 to 2,000 tokens, the static waste is far larger. Continuous batching over a paged KV cache is the default in modern serving engines such as vLLM, SGLang, TensorRT-LLM and Hugging Face's TGI.

Prefill complicates the picture. Admitting a 30,000-token prompt as one block stalls every other sequence's next token for the 1.3 s it takes: a latency spike for everyone. **Chunked prefill** splits the prompt into pieces (512 tokens is about 14 ms of compute here) interleaved with decode steps, so no one waits more than one chunk. **Disaggregation** goes further and runs prefill and decode on separate GPU pools, each tuned to its own bottleneck, transferring the KV cache between them.

## Under the hood: paged KV memory

A serving engine must hold every active sequence's KV cache, and sequences grow one token at a time to a length nobody knows in advance. The naive allocator reserves a contiguous region for the maximum context per sequence. Four sequences currently at 300, 1,200, 2,500 and 90 tokens, with a 4,096-token maximum, reserve 16,384 token slots and use 4,090: **75% wasted**, 2 GiB reserved at 128 KiB per token.

**Paged attention** (introduced with vLLM) borrows the operating system's answer from [virtual memory](/learn/systems/operating-systems/virtual-memory): split the cache into fixed-size blocks (16 tokens here), allocate a block only when a sequence fills its last one, and keep a per-sequence **block table** mapping logical blocks to physical ones anywhere in GPU memory. The same four sequences need 19, 75, 157 and 6 blocks, 4,112 slots, 514 MiB: the only waste is the unfilled tail of each last block, 22 tokens or 0.5%. The attention kernel follows the block table instead of assuming contiguity.

| Sequence | Tokens | Blocks | Block table (first entries) |
|---|---|---|---|
| A | 300 | 19 | 7, 2, 41, 13, … |
| B | 1,200 | 75 | 5, 88, 3, … |

Pages also enable **sharing**. Three requests with the same 1,024-token system prompt can point their first 64 block-table entries at the same physical blocks (reference-counted, copied on write), saving 256 MiB; that is the in-GPU half of prefix caching. When blocks run out, the scheduler **preempts** a sequence, either discarding its blocks to recompute later or swapping them to CPU memory, and its user sees a stall.

```viz
{"type": "ml", "algorithm": "kv-cache", "text": "The cat sat",
 "title": "The cache that paging manages",
 "caption": "Each decode step appends one key and one value per layer. A paged allocator stores these in 16-token blocks and allocates a new block only when the last one fills."}
```

## Quantisation: fewer bytes per weight

If decode time is dominated by bytes read, storing weights in fewer bits speeds it up almost proportionally, and lets the model fit on fewer GPUs.

| Precision | Bytes per parameter | 7B-class weights | 70B-class weights |
|---|---|---|---|
| fp16 / bf16 | 2 | 14 GB | 140 GB |
| int8 / fp8 | 1 | 7 GB | 70 GB |
| 4-bit, one 16-bit scale per 128 weights | 0.516 | 3.6 GB | 36 GB |

Weights are half the budget; the KV cache is the other. A typical 70B-class configuration with grouped-query attention (80 layers, 8 KV heads of 128 dimensions) needs $80 \times 8 \times 128 \times 2 \times 2 = 320$ KiB per token in 16-bit. At 4-bit weights on one 80 GB GPU, about 44 GB remains for about 134,000 tokens of cache (fewer after activations and engine overhead): thirty-odd sequences of 4,000 tokens. At 16-bit, the weights alone need two such GPUs.

The mechanism is a scale factor per small group of weights. Take a group of four weights $(0.12, -0.40, 0.33, 0.05)$ and quantise to signed 4-bit integers in $[-7, 7]$. The largest magnitude is 0.40, so the scale is $0.40 / 7 = 0.0571$. Each weight becomes $\text{round}(w / \text{scale})$: $(2, -7, 6, 1)$, stored in 4 bits each plus one shared scale. Dequantised, they read back as $(0.114, -0.400, 0.343, 0.057)$, errors of at most 0.013. Real schemes use groups of 64 to 128 weights and handle the rare **outlier** weights and activations that would otherwise stretch a group's scale and crush everything else in it to zero.

**Weight-only** quantisation speeds up memory-bound decode; quantising **activations as well** (8-bit floating point, for instance) also speeds up compute-bound prefill on hardware with low-precision tensor cores; **KV-cache quantisation** raises concurrency. 8-bit is usually close to indistinguishable from 16-bit; 4-bit costs measurably more, and unevenly, with long-tail knowledge and multi-step reasoning tending to degrade first. Run your own eval set against the quantised model before switching.

## Speculative decoding: guess cheaply, verify in parallel

Decode leaves the arithmetic idle, and checking $k$ tokens at once costs about the same as generating one, because verification is a small prefill: the weights are read once either way. **Speculative decoding** exploits this. A small, fast **draft** model proposes $k$ tokens; the **target** model scores all $k$ positions in one forward pass; each drafted token is accepted with probability $\min(1, p/q)$, where $q$ is the draft's probability for it and $p$ the target's. At the first rejection, the target samples a replacement from the leftover distribution $\max(0, p - q)$, renormalised, and the round ends; if all $k$ are accepted, the target's pass also yields a bonus token. This rejection-sampling rule makes the output distribution **exactly** the target model's.

Trace one round with $k = 4$ after "The quick brown":

| Drafted token | Draft $q$ | Target $p$ | Accept probability | Uniform draw | Outcome |
|---|---|---|---|---|---|
| " fox" | 0.90 | 0.95 | $\min(1, 1.06) = 1$ | | accepted |
| " jumps" | 0.70 | 0.56 | 0.80 | 0.35 | accepted |
| " over" | 0.60 | 0.15 | 0.25 | 0.70 | rejected: target samples from $\max(0, p - q)$ |
| " the" | | | | | not examined |

One target pass produced three tokens: two accepted and one replacement.

```viz
{"type": "ml", "algorithm": "speculative-decoding", "k": 4, "text": "The quick brown",
 "title": "Speculative decoding with a draft of 4 tokens",
 "caption": "The draft proposes four tokens cheaply; the target verifies all four in one pass, keeps the agreed prefix and supplies its own token at the first rejection."}
```

If each drafted token is accepted with probability $\alpha$, the expected number of tokens per target pass is $\frac{1 - \alpha^{k+1}}{1 - \alpha}$. With $k = 4$: 2.31 tokens at $\alpha = 0.6$, 3.36 at 0.8, 4.10 at 0.9. If each draft token costs 5% of a target step, a round costs $1 + 4 \times 0.05 = 1.2$ target steps, so the speed-ups are $1.9\times$, $2.8\times$ and $3.4\times$. Acceptance is high on predictable text (code, structured output, edits that copy much of the input) and lower on creative writing. Variants replace the draft model with extra prediction heads on the target, or with n-gram lookup from the prompt, which works very well for "rewrite this file with one change". Gains shrink at large batch sizes, because the arithmetic that speculation borrows is no longer idle.

## Scaling out

When a model does not fit on one GPU, **tensor parallelism** splits every layer's matrices across the GPUs in a server, which exchange partial results at each layer over a fast interconnect. It reduces per-token latency and adds communication at every layer, so it scales well to a handful of tightly connected GPUs and poorly beyond. **Pipeline parallelism** places consecutive layers on different servers and mainly adds capacity, not speed.

That explains the opening's disappointment. If the model already fits on one GPU, splitting it across two mostly buys lower latency per token, at a communication cost; for **throughput**, two independent replicas behind a load balancer are better. Balance by queue depth and KV-cache usage rather than round-robin, since requests vary enormously in cost, and use **prefix-aware routing** (requests with the same prompt prefix go to the same replica) so its prefix cache hits.

## Cost engineering when you call an API

The same physics appears in hosted price lists: **output tokens cost several times more than input** (generated sequentially; input is processed in parallel); **cached input is heavily discounted** (prefix reuse skips prefill); **batch APIs** returning within hours are discounted (they fill idle capacity); **smaller tiers** are much cheaper and faster.

A cost model with illustrative round-number prices (not any provider's actual rates): input \$3 per million tokens, output \$15 per million, cached input at 10% of the input price. A feature handles 1,000,000 requests per day, each with 3,000 input tokens and 300 output tokens.

1. **Baseline:** 3 billion input tokens cost \$9,000, 300 million output tokens cost \$4,500: **\$13,500 per day**.
2. **Prompt caching** on the shared 2,500-token prefix: 0.5 billion uncached input tokens cost \$1,500, 2.5 billion cached tokens cost \$750, output unchanged: **\$6,750 per day**, half the bill.
3. **Routing** 70% of requests, the easy ones, to a model at a tenth of the price, and escalating the rest: $0.3 \times 6{,}750 + 0.7 \times 675 \approx$ **\$2,500 per day**.

Each step is an architectural decision: a stable prompt prefix, a router with an escalation rule, and an eval set proving the small model is good enough on the traffic it receives ([LLM system design](/learn/ai-and-llms/building-with-llms/llm-system-design) builds a full budget this way). Providers also enforce **rate limits** in requests and tokens per minute; treat them like any shared dependency, with client-side token budgets, retries with exponential backoff and jitter ([Idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries)), queues for non-interactive work, and streaming for perceived latency.

## Choosing: optimisations and deployment

| Technique | Attacks | Per-user latency | Throughput | Quality risk | Stops helping when |
|---|---|---|---|---|---|
| Larger batches (continuous) | idle arithmetic during decode | worse | much better | none | KV memory or the latency target runs out |
| Paged KV cache | reserved but unused cache memory | neutral | better (more sequences fit) | none | fragmentation is already low |
| Chunked prefill | decode stalls behind long prompts | better p99 | slightly worse | none | prompts are short |
| Weight quantisation | bytes per weight | better | better | small at 8-bit, task-dependent at 4-bit | the kernel for that format is slow on your hardware |
| Speculative decoding | idle arithmetic, sequential steps | better | neutral to worse | none (exact) | acceptance is low or batches are large |
| Tensor parallelism | model too big or too slow for one GPU | better | often worse per GPU | none | beyond one server's fast interconnect |
| Replicas | queueing | better under load | linear | none | traffic is too low to keep them busy |

And the deployment decision:

| Factor | Favours hosted API | Favours self-hosting |
|---|---|---|
| Utilisation | Spiky or low traffic | Steady high volume that keeps GPUs busy |
| Model choice | You need the strongest proprietary models | An open-weight model meets your eval bar |
| Data control | Provider terms and regions are acceptable | Strict residency or isolation requirements |
| Team | No inference specialists | Engineers who can run and tune serving stacks |
| Latency control | Standard latency is fine | You need custom batching, speculative decoding or co-location |

The utilisation row decides most cases: a GPU costs the same per hour whether it serves 10 or 3,000 tokens per second.

## Failure modes

**p99 TTFT spikes whenever a long document arrives.** *Symptom:* median latency is fine; every few minutes all users' streams freeze for a second or more. *Diagnosis:* a 30,000-token prefill ran as one block (1.3 s under this lesson's assumptions) and every decode step waited behind it; correlate the spikes with prompt length in the logs. *Fix:* chunked prefill, a cap on prompt length per request, or a separate prefill pool.

**Throughput collapses under load with preemption messages.** *Symptom:* at peak, tokens per second drops and some requests stall mid-answer. *Diagnosis:* KV blocks ran out, so the scheduler preempted sequences and recomputed or swapped them; the engine's logs and cache-usage metrics show it. *Fix:* cap concurrent sequences or total tokens per replica, quantise the KV cache, shorten maximum outputs, add replicas.

**The quantised model is cheaper and worse.** *Symptom:* after moving to 4-bit, support escalations rise although the public benchmark moved by under a point. *Diagnosis:* degradation concentrated on long-tail facts and multi-step tasks; your eval set, sliced by task type, shows it. *Fix:* 8-bit weights, or 4-bit with outlier handling, validated on your own eval before rollout.

**Speculative decoding made it slower.** *Symptom:* tokens per second fell after enabling it. *Diagnosis:* acceptance rate below about 0.5 on this traffic (creative text), or batches large enough that the verification compute is no longer free; the engine reports acceptance. *Fix:* enable it only for low-batch, predictable workloads, or switch to prompt n-gram drafting for edit tasks.

**The API bill doubled after a harmless deploy.** *Symptom:* same traffic, twice the cost. *Diagnosis:* a timestamp or request ID was added near the top of the system prompt, so the shared prefix changed on every request and caching stopped; the cached-token count in the usage data fell to zero. *Fix:* keep volatile content after the stable prefix and alert on the cache-hit ratio.

## Exercises

```exercise
id: continuous-batching-steps
title: Static versus continuous batching
prompt: |
  `lengths` lists how many tokens each queued request will generate, in
  arrival order (all at least 1), and `slots` is the maximum batch size.
  Return `[static_steps, continuous_steps]`, the number of decode steps
  until every request has finished under each policy.

  - Static: requests are taken in order in groups of `slots`; a group runs
    until its longest member finishes, then the next group starts.
  - Continuous: at the start of every step, free slots are filled from the
    queue in order; every active request emits one token per step; a
    request with length L leaves after its L-th step, and its slot is
    available at the next step.

  An empty queue takes 0 steps under both.
languages: [python, javascript]
entry: batching_steps
starter:
  python: |
    def batching_steps(lengths, slots):
        # your code here
        return [0, 0]
  javascript: |
    function batching_steps(lengths, slots) {
      // your code here
      return [0, 0];
    }
tests:
  - args: [[6, 2, 3, 4, 2], 3]
    expected: [10, 6]
    label: the worked trace
  - args: [[5, 5, 5, 5], 2]
    expected: [10, 10]
    label: equal lengths gain nothing
  - args: [[10, 1, 1, 1, 1, 1, 1, 1, 1], 2]
    expected: [14, 10]
    label: short requests flow past a long one
  - args: [[], 4]
    expected: [0, 0]
    label: empty queue
  - args: [[7], 3]
    expected: [7, 7]
    hidden: true
  - args: [[3, 1, 4, 1, 5, 9, 2, 6], 3]
    expected: [19, 12]
    hidden: true
hints:
  - "Static: sum max(lengths[i:i + slots]) over groups starting at 0, slots, 2 * slots, ..."
  - "Continuous: keep a list of remaining tokens for active requests; each step, top it up from the queue, subtract 1 from every entry, and drop the zeros."
```

```exercise
id: speculative-expected-tokens
title: Tokens per target pass in speculative decoding
prompt: |
  A draft model proposes `k` tokens per round and each is accepted
  independently with probability `alpha` (0 <= alpha <= 1). Return the
  expected number of tokens produced per target-model pass:

      (1 - alpha^(k + 1)) / (1 - alpha)

  When alpha is exactly 1 the formula divides by zero; every drafted token
  is accepted and the target adds one more, so return k + 1. Results are
  compared to 6 decimal places.
languages: [python, javascript]
entry: expected_tokens_per_pass
starter:
  python: |
    def expected_tokens_per_pass(alpha, k):
        # your code here
        return 1.0
  javascript: |
    function expected_tokens_per_pass(alpha, k) {
      // your code here
      return 1;
    }
tests:
  - args: [0.8, 4]
    expected: 3.3616
    label: the lesson's main example
  - args: [0.6, 4]
    expected: 2.3056
  - args: [0, 4]
    expected: 1
    label: a useless draft still yields the target's own token
  - args: [1, 4]
    expected: 5
    label: perfect acceptance
  - args: [0.8, 0]
    expected: 1
    hidden: true
    label: no draft is ordinary decoding
  - args: [0.7, 8]
    expected: 3.198821
    hidden: true
    label: longer drafts have diminishing returns
hints:
  - "It is a geometric series: 1 + alpha + alpha^2 + ... + alpha^k."
  - "Handle alpha == 1 before dividing."
```

## Interviewer follow-ups

**"Why is decode memory-bound, and what follows?"** *Model answer:* each step reads every weight to produce one token per sequence, about 1 FLOP per byte against a ridge point of about 400 on current GPUs, so a 7B model in 16-bit tops out near 185 tokens per second at batch 1 while its arithmetic is 99% idle; batching shares the weight read, so throughput rises twentyfold at batch 32 until KV-cache memory or the latency target stops it. *Common wrong answer:* "it is compute-bound, so buy faster GPUs".

**"Explain continuous batching and what it buys."** *Model answer:* the scheduler re-forms the batch at every decode step, admitting queued requests as others finish, so short requests do not wait for long ones; in the five-request trace it cut 10 steps to 6 and raised slot utilisation from 57% to 94%. It needs a paged KV cache so sequences can grow without reserved memory. *Common wrong answer:* "it batches requests as they arrive", which describes static batching with a timer.

**"How does paged attention reduce memory waste?"** *Model answer:* allocating the maximum context per sequence wasted 75% in the example; fixed 16-token blocks allocated on demand and mapped through a block table leave only the partial last block, 0.5%, and let sequences share prefix blocks. The freed memory becomes batch size, which is throughput. *Common wrong answer:* "it compresses the KV cache".

**"Does speculative decoding change the output?"** *Model answer:* no; accepting with probability $\min(1, p/q)$ and resampling rejections from $\max(0, p - q)$ makes the output distribution exactly the target's; it changes only speed, $(1 - \alpha^{k+1})/(1 - \alpha)$ tokens per pass, 3.36 at $\alpha = 0.8$, $k = 4$. *Common wrong answer:* "the small model's tokens slip through, so quality drops a little".

**"We will serve a 70B model. How many GPUs?"** *Model answer:* weights are 140 GB at 16-bit, 70 at 8-bit, about 36 at 4-bit; KV is about 320 KiB per token for a typical grouped-query configuration, so at 4-bit one 80 GB GPU holds roughly 130,000 tokens of cache; then size replicas from peak concurrent tokens and the latency target, and check quality at each precision on our eval. *Common wrong answer:* a number from weights alone, with no KV cache or concurrency.

## What mid-level engineers get wrong

- **Buying compute for a bandwidth problem.** Decode is limited by bytes read; batching, quantisation and speculation are the levers.
- **Splitting a model that fits across more GPUs to raise throughput.** Tensor parallelism buys latency; replicas buy throughput.
- **Sizing a deployment from weights alone.** The KV cache sets concurrency and is often the larger budget.
- **Quantising to 4-bit on the strength of a benchmark average.** Losses concentrate on long-tail and multi-step tasks.
- **Quoting cost per token at full utilisation.** At 10% utilisation it is ten times higher.
- **Putting a timestamp at the top of the system prompt.** Every request misses the prefix cache.

## Senior signals

- You explain decode as **memory-bandwidth-bound** with a number (weights ÷ bandwidth gives the single-stream ceiling), prefill as compute-bound by **arithmetic intensity against the ridge point**, and conclude that **batching is nearly free until KV-cache memory or the latency target runs out**.
- You can trace **continuous batching** step by step and explain why it needs a **paged KV cache**, with the fragmentation arithmetic.
- You describe latency as **TTFT plus output tokens × TPOT** and reach for shorter outputs, prompt caching and chunked prefill before bigger hardware.
- You know what each optimisation attacks: **quantisation** (bytes per weight), **speculative decoding** (idle arithmetic, exact output distribution), **replicas versus tensor parallelism** (throughput versus latency), and you validate quantised models on your own eval set.
- You turn a **batch-size curve into cost per million tokens** from a GPU-hour price, and build **per-feature API cost models** (input, cached input, output, tier).
- You decide self-host versus API mainly on **sustained utilisation**, data requirements and team capability.

## Check yourself

```quiz
- q: >-
    A 7B-class model in 16-bit (about 13.4 GB of weights) runs on a GPU with about 2.5 TB/s of memory bandwidth. What is the approximate ceiling on decode speed for a single sequence?
  options: ["About 18 tokens per second, limited by memory bandwidth", "Effectively unlimited, since decode is bound by compute alone", "About 185 tokens per second, limited by memory bandwidth", "About 75,000 tokens per second, limited by arithmetic"]
  answer: 2
  explanation: >-
    Each decode step reads every weight: 13.4 GB ÷ 2.5 TB/s is about 5.4 ms, so at most about 185 steps per second (18 slips a factor of ten in that division). The arithmetic per token takes microseconds, so FLOPs are not the limit at batch size 1.
- q: >-
    Why can a server raise total throughput about 20× by decoding 32 sequences together, while each user slows down only modestly?
  options: ["The GPU boosts its clock speed when it has more work, so each step is faster", "Each step reads the weights once and applies them to all 32 sequences", "Batching lets each token skip some layers, so the per-step work shrinks", "Each sequence runs on its own copy of the model, so they proceed in parallel"]
  answer: 1
  explanation: >-
    Decode is limited by reading weights, and a batched step reads them once for every sequence in the batch, so the dominant memory cost is shared. What grows with the batch is KV-cache reading and memory, which adds a little time per step and eventually limits batch size. The model is not copied, and every token still passes through every layer.
- q: >-
    Three slots serve five requests with output lengths 6, 2, 3, 4 and 2 in arrival order. How many decode steps do static and continuous batching take?
  options: ["Static 6, continuous 6, since the longest request sets both totals", "Static 17, continuous 10, since each token needs its own step", "Static 10, continuous 8, since new requests wait for a full batch", "Static 10, continuous 6, since freed slots are refilled every step"]
  answer: 3
  explanation: >-
    Static batching runs {6, 2, 3} for 6 steps and then {4, 2} for 4: 10. Continuous batching admits D when B finishes after step 2 and E when C finishes after step 3, and everything is done after step 6. The 17 token-steps of useful work fill 94% of the 18 slot-steps instead of 57% of 30.
- q: >-
    Speculative decoding uses a draft with k = 4 and a per-token acceptance rate of 0.8. About how many tokens does each target-model pass produce on average?
  options: ["5.0", "0.8", "4.0", "3.4"]
  answer: 3
  explanation: >-
    The expected count is (1 − α^(k+1)) / (1 − α) = (1 − 0.8^5) / 0.2 ≈ 3.36. It is below k + 1 = 5 because a rejection ends the round early, and at least 1 because the target always contributes its own token.
- q: >-
    A model that fits on one GPU is split across two GPUs with tensor parallelism, and total throughput barely improves. What would most likely raise throughput?
  options: ["Lower the temperature so each request generates fewer tokens on average", "Split it across four GPUs with tensor parallelism to spread the load further", "Disable the KV cache to free memory for a larger batch on each GPU", "Run two independent replicas behind a load balancer routing by queue depth"]
  answer: 3
  explanation: >-
    Tensor parallelism mainly cuts per-token latency and adds communication at every layer, so splitting across more GPUs makes that worse. Independent replicas double capacity without that overhead; balance them by queue depth and KV-cache usage rather than round-robin. Temperature does not control throughput, and disabling the KV cache would make generation quadratic.
- q: >-
    A feature sends the same 2,500-token instructions plus a 500-token user message on every request. Which change most directly halves its API bill in the lesson's cost model?
  options: ["Switching from streaming to non-streaming, which bills fewer output tokens", "Keeping the shared prefix identical and first so it is billed at the cached rate", "Moving the instructions after the user message, where the model attends more", "Lowering max_tokens so each response is capped well below its current length"]
  answer: 1
  explanation: >-
    Cached prefix tokens cost a fraction of normal input, and in the example caching the 2,500-token prefix cut the daily bill from 13,500 to 6,750. Moving the static instructions after the variable message would break prefix caching, output is only a third of the bill so capping it cannot halve it, and streaming does not change token counts.
```
