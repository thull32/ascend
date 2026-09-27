---
slug: how-llms-work
title: How LLMs work
description: Tokenization, the transformer block, sampling, the KV cache, training and serving, each explained by mechanism and worked with numbers, so that cost, latency and failure modes stop being surprises.
prerequisites: [ai-and-llms/ml-foundations]
---
A large language model is a function that takes a sequence of tokens and returns a probability distribution over the next token. Everything else, from chat to tool use to "reasoning", is built by calling that function in a loop. This module opens the function up and follows a request through it: how text becomes token IDs, how a transformer block lets each token gather context through attention, how a probability distribution becomes text through sampling, why every token of context costs memory in the KV cache, how pretraining and post-training shape what comes out, where hallucination and other failures come from, and what a serving stack does to make all of it fast and affordable.

Each lesson works the mechanism on numbers small enough to check by hand: a BPE merge on a four-word corpus, attention across three tokens with real query, key and value vectors, a softmax at three temperatures, the KV-cache bytes for a 7B-class and a 70B-class model. The payoff is practical. By the end you can estimate what a feature will cost and how fast it will respond, explain why a model behaves the way it does, and make the design calls that [Building with LLMs](/learn/ai-and-llms/building-with-llms/prompt-engineering-that-works) turns into systems.
