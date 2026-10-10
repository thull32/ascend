---
review: how-llms-work
source: 7d0a4bdc8e09aad9
---
## Introduction

Twelve questions from the how-LLMs-work module. Answer out loud before the answer comes.

They run in the order of the lessons: tokenization, the transformer, generation and sampling, context windows and the KV cache, training, capabilities and failure modes, and inference serving. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Your feature launches in a new language, and the cost per request rises far more than the change in request volume. What is the most likely explanation?

A, the model writes longer answers in other languages by design. B, the provider charges a higher rate per token for text that is not English. C, prompts that are not in English bypass the provider's prompt cache entirely. D, the tokenizer splits that language into many more tokens per word.

[think]

The answer is D: the tokenizer splits that language into many more tokens per word.

Pricing is per token, and tokenizers learn fewer merges for languages that were less represented in their training mix, so the same content costs more input and output tokens. In the lesson's toy experiment, the Japanese sentence cost 4.4 times the English one. Answers may also be longer, but the tokenization effect is systematic. Per-token rates do not depend on language.

## Question 2

A streaming chat interface shows a replacement character that flickers, and then turns into the right emoji. What is happening?

A, a token ended in the middle of a character, and the client decoded the partial bytes. B, the model first sampled a wrong token, and then corrected it. C, the emoji is a special token that the server escapes while streaming. D, the font lacks the emoji until the whole response has been received.

[think]

The answer is A: a token ended in the middle of a character, and the client decoded the partial bytes.

With byte-level tokens, one emoji can span several tokens, between four and eighteen bytes of UTF-8. So the first token carries an incomplete byte sequence, which decodes to a replacement character. The client should buffer until the bytes form complete characters. Sampled tokens are never revised, and emoji are ordinary bytes, not special tokens.

## Question 3

Why are the dot products between queries and keys divided by the square root of the head dimension?

A, to normalise the value vectors to unit length before mixing them. B, to stop the scores growing with the dimension and saturating the softmax. C, to reduce the memory the attention matrix needs for long inputs. D, to keep the attention matrix symmetric between queries and keys.

[think]

The answer is B: to stop the scores growing with the dimension and saturating the softmax.

A dot product over d terms has a spread of about the square root of d. Large scores push the softmax into nearly all-or-nothing weights, with vanishing gradients. Scaling keeps the scores near unit size, so the softmax stays soft and trainable. It changes neither symmetry nor memory, and the values are not normalised by it.

## Question 4

A custom transformer's training loss falls to almost zero within hours, but the text it generates is gibberish. What is the most likely bug?

A, the vocabulary is too small for the training corpus. B, the learning rate is far too high for a model of this size. C, the residual connections were removed from each block. D, the causal mask lets each position see the token it is supposed to predict.

[think]

The answer is D: the causal mask lets each position see the token it is supposed to predict.

Without a correct causal mask, each position can attend to the next token and simply copy it. The training loss collapses while nothing useful is learned, and at generation time there is no future token to copy. A learning rate that is too high makes the loss unstable rather than near zero. Missing residuals make deep models hard to train, not suspiciously easy.

## Question 5

Why does top-p sampling adapt better than top-k across different contexts?

A, it keeps as many tokens as it takes to reach probability mass p. B, it is cheaper to compute, because it skips sorting the vocabulary. C, it works on the raw logits, so no softmax is needed at each step. D, it never drops tokens, so rare but valid words stay reachable.

[think]

The answer is A: it keeps as many tokens as it takes to reach probability mass p.

A peaked distribution keeps one or two tokens, and a flat one keeps many. In the France example, that was three tokens at temperature 1 and four at 1.5. A fixed k is too permissive when one answer dominates, and too restrictive when many continuations are fine. Top-p still needs sorted probabilities, and it does drop the tail.

## Question 6

A regression test sends the same prompt at temperature 0 and checks for an exact output string. It passes locally, but fails now and then in CI against the hosted API. What is the most likely cause?

A, batched GPU maths can flip nearly tied tokens between runs. B, the tokenizer splits the prompt differently on each call. C, the hosted API silently ignores a temperature of exactly 0. D, temperature 0 still samples randomly, just from fewer tokens.

[think]

The answer is A: batched GPU maths can flip nearly tied tokens between runs.

Floating-point addition is not associative, and the makeup of each batch changes the order of the sums, so logits differ in their last bits. When two candidates are nearly tied, the top choice flips, and every later token can differ. Temperature 0 is greedy, not random, and tokenization is deterministic. Tests should check structure or meaning, not exact strings.

## Question 7

Your system prompt starts with the current time, to the second, followed by 5 thousand tokens of fixed instructions and tools. Prompt caching shows almost no hits. Why?

A, cache hits require temperature 0, which the request does not set. B, prompt caching only applies to prompts under a thousand tokens. C, timestamps become special tokens that the cache always skips. D, caches match exact prefixes, and the timestamp changes on every call.

[think]

The answer is D: caches match exact prefixes, and the timestamp changes on every call.

Prefix caching reuses stored keys and values only for an identical run of tokens from the very first one. A value that changes on every request, right at the start, invalidates everything after it. Move volatile content to the end, after the static instructions and tools. Providers set a minimum prefix length, not a maximum, and sampling settings do not affect prefill.

## Question 8

Your team wants the assistant to answer questions about 3 thousand internal wiki pages that change every week. A colleague proposes fine-tuning on the pages. What is the stronger design?

A, continue pretraining the base model on the wiki, so the facts are learned deeply. B, fine-tune every week on the changed pages, since fine-tuning is how you add knowledge. C, retrieve the relevant pages at query time, and fine-tune, if at all, only for format. D, fine-tune once on all the pages, then raise the temperature so it recalls more of them.

[think]

The answer is C: retrieve the relevant pages at query time, and fine-tune, if at all, only for format.

Facts seen a few times in fine-tuning are recalled unreliably, and they go stale when the pages change. Retrieval supplies current text and makes answers checkable. Fine-tuning suits form, meaning format and tone, not facts. Continued pretraining is vastly more expensive and has the same staleness problem, and temperature does not add knowledge.

## Question 9

Why does RLHF include a KL penalty that keeps the model close to the supervised model it started from?

A, because it makes generation more deterministic, so outputs stay consistent. B, because the reward model is an imperfect proxy that the policy would exploit. C, because it shrinks the policy's effective size, which makes training cheaper. D, because distance from the supervised model measures loss of factual accuracy.

[think]

The answer is B: because the reward model is an imperfect proxy that the policy would exploit.

Pushing hard on a learned reward finds its blind spots, such as padding or flattery that the reward model happens to like. In the lesson's example, a hacked answer scored 2.6 but drifted far from the reference, and after the penalty it scored 1.70, below an honest answer's 1.83. The penalty has nothing to do with model size or determinism, and it measures distance between distributions, not factual accuracy.

## Question 10

Why does asking a model to show its working improve its accuracy on multi-step arithmetic?

A, it prompts the model to retrieve the fully worked answer from its training data. B, it switches the model to a more accurate internal arithmetic routine. C, the intermediate tokens act as working memory, so each step is an easy prediction. D, it lowers the effective temperature, so the model samples fewer wrong digits.

[think]

The answer is C: the intermediate tokens act as working memory, so each step is an easy prediction.

Each token gets one fixed pass of computation, so the model cannot do unlimited serial work inside one token. Writing intermediate results lets later tokens build on earlier ones, at the price of more tokens: 300 tokens instead of 5 is 60 times the compute. There is no hidden calculator, and the temperature is unchanged.

## Question 11

Why can a server raise total throughput about 20 times by decoding 32 sequences together, while each user slows down only modestly?

A, the GPU raises its clock speed when it has more work, so each step is faster. B, each step reads the weights once, and applies them to all 32 sequences. C, batching lets each token skip some layers, so the work per step shrinks. D, each sequence runs on its own copy of the model, so they proceed in parallel.

[think]

The answer is B: each step reads the weights once, and applies them to all 32 sequences.

Decode is limited by reading the weights, and a batched step reads them once for every sequence in the batch, so the dominant memory cost is shared. What grows with the batch is reading each sequence's cache, which adds a little time per step and eventually limits the batch size. The model is not copied, and every token still passes through every layer.

## Question 12

A model that fits on one GPU is split across two GPUs with tensor parallelism, and total throughput barely improves. What would most likely raise throughput?

A, lower the temperature, so each request generates fewer tokens on average. B, split it across four GPUs with tensor parallelism, to spread the load further. C, disable the KV cache, to free memory for a larger batch on each GPU. D, run two independent replicas behind a load balancer that routes by queue depth.

[think]

The answer is D: run two independent replicas behind a load balancer that routes by queue depth.

Tensor parallelism mainly cuts the latency of each token and adds communication at every layer, so splitting across more GPUs makes that worse. Independent replicas double capacity without the overhead; balance them by queue depth and cache usage rather than round-robin. Temperature does not control throughput, and disabling the KV cache would make generation quadratic.

## Recap

Three ideas kept coming back. First, the model sees tokens, not text or characters. That one fact explains the bill for a new language, the flickering emoji, and a prompt cache that misses because one early token changed.

Second, the model's output is a choice over a probability distribution, and the details of that choice matter: top-p adapts where top-k cannot, and even temperature 0 can flip between nearly tied tokens. Showing the working gives each step more tokens of computation, and a learned reward is a proxy the model will exploit unless a penalty holds it near where it started.

Third, serving is limited by memory, not arithmetic. A batched step shares one read of the weights across every sequence, which is why batching is nearly free, and why independent replicas, not a split model, are what buy throughput.
