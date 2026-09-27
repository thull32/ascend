---
slug: inference-serving
title: "Inference serving: batching, quantisation, speculative decoding and cost"
description: Why decode is memory-bandwidth-bound and batching is nearly free, how continuous batching, quantisation and speculative decoding each attack a term of the cost equation, and how to engineer latency and cost whether you self-host or call an API.
minutes: 20
difficulty: hard
tags: [llm, inference, batching, quantisation, speculative-decoding, latency, cost]
problems: []
---
You self-host an open-weight model for an internal coding assistant. A single request streams at a pleasant 100 tokens per second, but when 50 engineers use it at once, the p99 latency climbs past 30 seconds. You double the GPUs by splitting the model across two cards, and throughput barely moves. Meanwhile, a sibling team calling a hosted API sees a bill five times their estimate, dominated by a feature that sends the same 6,000-token preamble with every request.

Both teams are running into the physics of LLM inference. Generation is limited by how fast weights and caches can be read from memory, not by arithmetic. That single fact explains why batching is nearly free, why memory rather than compute caps concurrency, why quantisation speeds things up, why speculative decoding works, and why hosted APIs price the way they do. This lesson builds from that fact to the engineering choices.

## The anatomy of a request

A request passes through tokenisation, a queue, **prefill** (one parallel pass over the prompt that fills the KV cache), the **decode** loop (one token per step), and detokenisation and streaming back to the client. The metrics that matter:

- **Time to first token (TTFT):** queueing plus prefill. What a user feels as "is it doing anything?"
- **Time per output token (TPOT)**, or inter-token latency: the duration of one decode step for this sequence.
- **End-to-end latency** $\approx \text{TTFT} + \text{output tokens} \times \text{TPOT}$. With a 2,000-token prompt, TTFT of 0.4 s and TPOT of 25 ms, a 400-token answer takes $0.4 + 400 \times 0.025 = 10.4$ seconds. Output length dominates, so the cheapest latency win is very often asking for a shorter answer.
- **Throughput:** total tokens per second per GPU across all concurrent requests, which sets **cost per token**. **Goodput** is the throughput achieved while still meeting the latency target, and it is the number worth optimising.

## Why decode is memory-bound

Each decode step must push one new token through every layer, which means reading **every weight of the model** from GPU memory. A 7B-class model in 16-bit is about 13.4 GB. A current data-centre GPU reads memory at a few terabytes per second, depending on the generation; take 2.5 TB/s for round numbers. Then:

- Reading the weights once takes $13.4 \text{ GB} / 2.5 \text{ TB/s} \approx 5.4$ ms, so a single sequence can never exceed about **185 tokens per second**, however fast the arithmetic is.
- The arithmetic for one token is about $2 \times 6.7 \times 10^9 = 13.4$ GFLOPs. At roughly $10^{15}$ FLOP/s, that is **13 microseconds**.

At batch size 1 the arithmetic units are idle more than 99% of the time, waiting for memory. In roofline terms, the step performs about 1 FLOP per byte read (2 FLOPs per 2-byte weight), while the GPU needs around $10^{15} / 2.5 \times 10^{12} = 400$ FLOPs per byte to be compute-bound.

That idle arithmetic is free capacity. If 32 sequences decode together, the weights are read **once** and applied to 32 tokens. The step gets somewhat slower, because each sequence's own KV cache must also be read, and that does not amortise. With grouped-query attention (128 KiB of cache per token, from [Context windows and the KV cache](/learn/ai-and-llms/how-llms-work/context-windows-and-kv-cache)) and 2,048 tokens of context each, 32 sequences hold 8 GiB of cache:

| Batch | Bytes read per step | Step time | Tokens/s per user | Total tokens/s |
|---|---|---|---|---|
| 1 | 13.4 GB of weights | 5.4 ms | 185 | 185 |
| 32 | 13.4 GB weights + 8.6 GB cache | 8.8 ms | 114 | 3,640 |

Twenty times the throughput for each user getting 40% slower. That trade between **per-user latency and total throughput** is the central dial of LLM serving, and it is why hosted APIs are affordable at all: your request shares every weight read with dozens of strangers'. The limits on batch size are the KV-cache memory that each sequence needs and the latency target each user must still meet.

## Batching: static versus continuous

**Static batching** waits for a group of requests, runs them together, and returns when the longest one finishes. A 20-token answer sits waiting for a 2,000-token answer in the same batch, and GPU slots go idle as sequences finish.

**Continuous batching** (also called in-flight or iteration-level batching) schedules at every decode step: finished sequences leave and waiting requests join immediately. Combined with the paged KV cache, it keeps the batch full and is the default in modern serving engines such as vLLM, SGLang, TensorRT-LLM and Hugging Face's TGI.

Prefill complicates this. A newly admitted 30,000-token prompt needs a large, compute-heavy pass, and if it runs as one block, every other user's next token waits behind it: a latency spike for everyone. Servers use **chunked prefill** (split long prompts into pieces interleaved with decode steps) or **disaggregate** prefill and decode onto separate pools of GPUs, each tuned for its own bottleneck, with the KV cache transferred between them.

## Quantisation: fewer bytes per weight

If decode time is dominated by bytes read, storing weights in fewer bits speeds it up almost proportionally, and lets the model fit on fewer GPUs.

| Precision | Bytes per parameter | 70B-class weights |
|---|---|---|
| fp16 / bf16 | 2 | 140 GB |
| int8 / fp8 | 1 | 70 GB |
| 4-bit | about 0.5 plus scales | about 35 to 40 GB |

The mechanism is a scale factor per small group of weights. Take a group of four weights $(0.12, -0.40, 0.33, 0.05)$ and quantise to signed 4-bit integers in $[-7, 7]$. The largest magnitude is 0.40, so the scale is $0.40 / 7 = 0.0571$. Each weight becomes $\text{round}(w / \text{scale})$: $(2, -7, 6, 1)$, stored in 4 bits each plus one shared scale. Dequantised, they read back as $(0.114, -0.400, 0.343, 0.057)$, errors of at most 0.013. Real schemes use groups of around 64 to 128 weights, and handle the rare **outlier** weights and activations that would otherwise stretch a group's scale and crush everything else in it to zero.

Variants: **weight-only** quantisation speeds up memory-bound decode; quantising **activations as well** (8-bit floating point, for instance) also speeds up compute-bound prefill on hardware with low-precision tensor cores; **KV-cache quantisation** increases concurrency. On quality: 8-bit is usually close to indistinguishable from 16-bit; 4-bit costs measurably more, and unevenly, with long-tail knowledge and multi-step reasoning tending to degrade first. Run your own eval set against the quantised model before switching; a small drop on a public benchmark can hide a larger drop on your task.

## Speculative decoding: guess cheaply, verify in parallel

Decode leaves the GPU's arithmetic idle, and checking $k$ tokens at once costs about the same as generating one, because verifying them is a small prefill: the weights are read once either way. **Speculative decoding** exploits this. A small, fast **draft** model proposes the next $k$ tokens; the large **target** model scores all $k$ positions in a single forward pass; the longest prefix of drafted tokens that the target agrees with is accepted, and at the first disagreement the target's own token is used instead. Each target pass therefore yields between 1 and $k + 1$ tokens. The acceptance rule is a form of rejection sampling that makes the output distribution **exactly** the target model's, so quality is unchanged.

```viz
{"type": "ml", "algorithm": "speculative-decoding", "k": 4, "text": "The quick brown",
 "title": "Speculative decoding with a draft of 4 tokens",
 "caption": "The draft proposes four tokens cheaply; the target verifies all four in one pass, keeps the agreed prefix and supplies its own token at the first rejection."}
```

If each drafted token is accepted with probability $\alpha$, the expected number of tokens per target pass is $\frac{1 - \alpha^{k+1}}{1 - \alpha}$. With $\alpha = 0.8$ and $k = 4$ that is $(1 - 0.328) / 0.2 = 3.36$ tokens. If each draft token costs 5% of a target step, a round costs $1 + 4 \times 0.05 = 1.2$ target steps, so the speed-up is about $3.36 / 1.2 = 2.8\times$. At $\alpha = 0.6$ it falls to about $1.9\times$.

Acceptance is high on predictable text (code, structured output, boilerplate, edits that copy much of the input) and lower on creative writing. Variants replace the separate draft model with extra prediction heads on the target itself, or with lookup of n-grams from the prompt, which works very well for "rewrite this file with one change". Gains shrink at large batch sizes, because the arithmetic that speculation borrows is no longer idle.

## Scaling out

When a model does not fit on one GPU, **tensor parallelism** splits every layer's matrices across the GPUs in a server, which exchange partial results at each layer over a fast interconnect. It reduces per-token latency, and it adds communication at every layer, so it scales well to a handful of tightly connected GPUs and poorly beyond. **Pipeline parallelism** places consecutive layers on different servers and mainly adds capacity, not speed.

That explains the opening's disappointment. If the model already fits on one GPU, splitting it across two mostly buys lower latency per token, at a communication cost; for **throughput**, two independent replicas behind a load balancer are better. And balance that load by queue depth and KV-cache usage rather than round-robin, since requests vary enormously in cost. **Prefix-aware routing**, sending requests with the same prompt prefix to the same replica, lets its prefix cache hit.

## Cost engineering when you call an API

Most teams consume hosted models, and the same physics appears in the price list:

- **Output tokens cost several times more than input tokens**, because they are generated sequentially while input is processed in parallel.
- **Cached input tokens are heavily discounted**, because prefix reuse skips prefill.
- **Batch APIs** that return results within hours are discounted, because the provider can fill otherwise idle capacity.
- **Smaller model tiers** are much cheaper per token and faster.

Work a cost model with illustrative round-number prices (not any provider's actual rates): input at \$3 per million tokens, output at \$15 per million, cached input at 10% of the input price. A feature handles 1,000,000 requests per day, each with 3,000 input tokens and 300 output tokens.

1. **Baseline:** 3 billion input tokens cost \$9,000, 300 million output tokens cost \$4,500: **\$13,500 per day**.
2. **Prompt caching** on the shared 2,500-token prefix: 0.5 billion uncached input tokens cost \$1,500, 2.5 billion cached tokens cost \$750, output unchanged: **\$6,750 per day**, half the bill.
3. **Routing** 70% of requests, the easy ones, to a model at a tenth of the price, and escalating the rest: about **\$2,500 per day**.

Each step is an architectural decision, not a prompt tweak: a stable prompt prefix, a router with an escalation rule, and an eval set proving the small model is good enough on the traffic it receives. Output length is the remaining lever: cap it, ask for concise formats, and do not request explanations that nobody reads.

Operationally, providers enforce **rate limits** in requests and tokens per minute. Treat them like any other shared dependency: client-side token budgets, retries with exponential backoff and jitter (see [Idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries)), queues for non-interactive work, and streaming to improve perceived latency for interactive work.

## Self-host or API?

| Factor | Favours hosted API | Favours self-hosting |
|---|---|---|
| Utilisation | Spiky or low traffic | Steady high volume that keeps GPUs busy |
| Model choice | You need the strongest proprietary models | An open-weight model meets your eval bar |
| Data control | Provider terms and regions are acceptable | Strict residency or isolation requirements |
| Team | No inference specialists | Engineers who can run and tune serving stacks |
| Latency control | Standard latency is fine | You need custom batching, speculative decoding or co-location |

The utilisation row decides most cases. A GPU costs the same per hour whether it serves 10 or 3,000 tokens per second, so at 10% utilisation your cost per token is ten times what the batching table promised. Hosted APIs amortise idle time across many customers; self-hosting pays off when your own traffic is steady enough to keep batches full.

## Senior signals

- You explain decode as **memory-bandwidth-bound** with a number (weights ÷ bandwidth gives the single-stream ceiling) and conclude that **batching is nearly free until KV-cache memory or the latency target runs out**.
- You describe latency as **TTFT plus output tokens × TPOT** and reach for shorter outputs, prompt caching and chunked prefill before bigger hardware.
- You know what each optimisation attacks: **continuous batching** (idle slots), **quantisation** (bytes per weight), **speculative decoding** (idle arithmetic during decode, with identical output distribution), **replicas versus tensor parallelism** (throughput versus latency).
- You validate **quantised models on your own eval set** rather than trusting average benchmark deltas.
- You build **cost models per feature** (input, cached input, output, model tier) and treat caching, routing and output length as architectural decisions.
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
  options: ["Batching lets each token skip some layers, so the per-step work shrinks", "Each step reads the weights once and applies them to all 32 sequences", "The GPU boosts its clock speed when it has more work, so each step is faster", "Each sequence runs on its own copy of the model, so they proceed in parallel"]
  answer: 1
  explanation: >-
    Decode is limited by reading weights, and a batched step reads them once for every sequence in the batch, so the dominant memory cost is shared. What grows with the batch is KV-cache reading and memory, which adds a little time per step and eventually limits batch size. The model is not copied, and every token still passes through every layer.
- q: >-
    Speculative decoding uses a draft with k = 4 and a per-token acceptance rate of 0.8. About how many tokens does each target-model pass produce on average?
  options: ["5.0", "0.8", "4.0", "3.4"]
  answer: 3
  explanation: >-
    The expected count is (1 − α^(k+1)) / (1 − α) = (1 − 0.8^5) / 0.2 ≈ 3.36. It is below k + 1 = 5 because a rejection ends the round early, and at least 1 because the target always contributes its own token.
- q: >-
    A model that fits on one GPU is split across two GPUs with tensor parallelism, and total throughput barely improves. What would most likely raise throughput?
  options: ["Split it across four GPUs with tensor parallelism to spread the load further", "Disable the KV cache to free memory for a larger batch on each GPU", "Run two independent replicas behind a load balancer routing by queue depth", "Lower the temperature so each request generates fewer tokens on average"]
  answer: 2
  explanation: >-
    Tensor parallelism mainly cuts per-token latency and adds communication at every layer, so splitting across more GPUs makes that worse. Independent replicas double capacity without that overhead; balance them by queue depth and KV-cache usage rather than round-robin. Temperature does not control throughput, and disabling the KV cache would make generation quadratic.
- q: >-
    A feature sends the same 2,500-token instructions plus a 500-token user message on every request. Which change most directly halves its API bill in the lesson's cost model?
  options: ["Keeping the shared prefix identical and first so it is billed at the cached rate", "Moving the instructions after the user message, where the model attends more", "Switching from streaming to non-streaming, which bills fewer output tokens", "Lowering max_tokens so each response is capped well below its current length"]
  answer: 0
  explanation: >-
    Cached prefix tokens cost a fraction of normal input, and in the example caching the 2,500-token prefix cut the daily bill from 13,500 to 6,750. Moving the static instructions after the variable message would break prefix caching, output is only a third of the bill so capping it cannot halve it, and streaming does not change token counts.
```
