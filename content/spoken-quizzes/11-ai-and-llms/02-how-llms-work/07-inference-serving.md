---
lesson: inference-serving
source: 0a5bb19eafb63ab1
---
## 1

A 7-billion-class model in 16-bit, about 13.4 gigabytes of weights, runs on a GPU with about 2.5 terabytes a second of memory bandwidth. What is the approximate ceiling on decode speed for a single sequence?

A, about 18 tokens a second, limited by memory bandwidth. B, effectively unlimited, since decode is bound by compute alone. C, about 185 tokens a second, limited by memory bandwidth. D, about 75,000 tokens a second, limited by arithmetic.

[think]

The answer is C: about 185 tokens a second, limited by memory bandwidth.

Each decode step reads every weight: 13.4 gigabytes at 2.5 terabytes a second takes about 5.4 milliseconds, so at most about 185 steps a second. 18 slips a factor of ten in that division. The arithmetic per token takes microseconds, so compute is not the limit at a batch size of one.

## 2

Why can a server raise total throughput about 20 times by decoding 32 sequences together, while each user slows down only modestly?

A, the GPU boosts its clock speed when it has more work, so each step is faster. B, each step reads the weights once and applies them to all 32 sequences. C, batching lets each token skip some layers, so the per-step work shrinks. D, each sequence runs on its own copy of the model, so they proceed in parallel.

[think]

The answer is B: each step reads the weights once and applies them to all 32 sequences.

Decode is limited by reading the weights, and a batched step reads them once for every sequence in the batch, so the dominant memory cost is shared. What grows with the batch is reading and storing the KV cache, which adds a little time per step and eventually limits the batch size. The model is not copied, and every token still passes through every layer.

## 3

Three slots serve five requests, A to E, with output lengths 6, 2, 3, 4 and 2, in arrival order. How many decode steps do static and continuous batching take?

A, static 6, continuous 6, since the longest request sets both totals. B, static 17, continuous 10, since each token needs its own step. C, static 10, continuous 8, since new requests wait for a full batch. D, static 10, continuous 6, since freed slots are refilled every step.

[think]

The answer is D: static 10, continuous 6, since freed slots are refilled every step.

Static batching runs the first three, of lengths 6, 2 and 3, for 6 steps, then the last two, of lengths 4 and 2, for 4 more: 10. Continuous batching admits D when B finishes after step 2, and E when C finishes after step 3, and everything is done after step 6. The 17 tokens of useful work fill 94 percent of 18 slot-steps, instead of 57 percent of 30.

## 4

Speculative decoding uses a draft of 4 tokens, with a per-token acceptance rate of 0.8. About how many tokens does each pass of the target model produce, on average?

A, 5.0. B, 0.8. C, 4.0. D, 3.4.

[think]

The answer is D: 3.4.

The expected count is one minus the acceptance rate to the power of the draft length plus one, all over one minus the acceptance rate: one minus 0.8 to the fifth, over 0.2, which is about 3.36. It is below 5 because a rejection ends the round early, and at least 1 because the target always contributes its own token.

## 5

A model that fits on one GPU is split across two GPUs with tensor parallelism, and total throughput barely improves. What would most likely raise throughput?

A, lower the temperature, so each request generates fewer tokens on average. B, split it across four GPUs with tensor parallelism, to spread the load further. C, disable the KV cache, to free memory for a larger batch on each GPU. D, run two independent replicas behind a load balancer that routes by queue depth.

[think]

The answer is D: run two independent replicas behind a load balancer that routes by queue depth.

Tensor parallelism mainly cuts per-token latency, and it adds communication at every layer, so splitting across more GPUs makes that worse. Independent replicas double capacity without that overhead; balance them by queue depth and KV cache usage, rather than round-robin. Temperature does not control throughput, and disabling the KV cache would make generation quadratic.

## 6

A feature sends the same 2,500 tokens of instructions plus a 500-token user message on every request. In the lesson's cost model, which change most directly halves its API bill?

A, switching from streaming to non-streaming, which bills fewer output tokens. B, keeping the shared prefix identical and first, so it is billed at the cached rate. C, moving the instructions after the user message, where the model attends more. D, lowering max tokens, so each response is capped well below its current length.

[think]

The answer is B: keeping the shared prefix identical and first, so it is billed at the cached rate.

Cached prefix tokens cost a fraction of normal input, and in the example, caching the 2,500-token prefix cut the daily bill from 13,500 to 6,750. Moving the static instructions after the variable message would break prefix caching. Output is only a third of the bill, so capping it cannot halve it, and streaming does not change token counts.
