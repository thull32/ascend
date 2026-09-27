---
slug: ai-and-llms
title: "AI, LLMs & RAG"
description: Understand machine learning and large language models from the loss function up, so you can design, cost, debug and evaluate LLM-powered systems instead of treating them as magic.
icon: brain
phase: 6
---
Every engineering team is now expected to ship features built on large language models, and most engineers are doing it with a mental model of "send text, get text back". That model is enough for a demo. It is not enough to explain why a prompt that worked yesterday fails today, why a 100k-token request costs forty times more than a 2.5k one and makes the user wait seconds for the first word, why the model invents an API method that does not exist, or why doubling the GPU count did not double throughput. Senior engineers are the ones who can answer those questions from the mechanism.

This track builds that mechanism in three steps. **Machine learning foundations** gives you the core loop that every model shares: a parameterised function, a loss, and gradient descent, worked by hand with small numbers, then neural networks, generalisation, the classical models that still run most tabular ML, and embeddings. **How LLMs work** applies it to language: tokenization, the transformer block, sampling, the KV cache and why context is expensive, how pretraining and post-training shape behaviour, where the failure modes come from, and how inference is served at scale. **Building with LLMs** turns that into engineering practice: prompting, structured outputs and tools, retrieval-augmented generation, agents, evals, security, and full system designs.

The math never goes beyond what a working engineer can check with a pocket calculator: dot products, a softmax, one step of the chain rule. Every lesson works the numbers through on a tiny example you can step through in a visualisation, and the exercises have you implement the pieces (softmax, cosine similarity, a gradient step, a BPE merge, top-p filtering, KV-cache capacity planning) in plain Python or JavaScript.
