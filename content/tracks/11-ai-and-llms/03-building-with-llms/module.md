---
slug: building-with-llms
title: Building with LLMs
description: "Turn a model API into a product feature you can trust, measure, secure and afford: prompts, structured outputs, tools, retrieval, agents, evals, security and system design."
prerequisites: [ai-and-llms/how-llms-work]
---
Calling a model API takes ten lines of code. Shipping a feature on top of one takes engineering: a prompt that behaves the same way on the ten-thousandth input as on the demo, output your code can parse without a retry loop, answers grounded in your own documents, tools the model can call without being able to do damage, a way to know whether last week's prompt change made things better or worse, and a cost per user that does not grow without bound.

This module builds that practice in the order you meet it in a real project. It starts with prompts as specifications, then structured outputs and the tool-use loop, then retrieval-augmented generation (chunking, embeddings, hybrid search, reranking) and agents (planning, memory, MCP, guardrails, and when not to build one). It then covers the two disciplines that separate a prototype from a product: evals and observability, and security against prompt injection and data exfiltration.

The final lesson puts it all together as a system design, using this app's own AI coach as the worked example: how its system prompt is laid out for prompt caching, how replies stream over Server-Sent Events without being lost when the browser disconnects, how per-user daily budgets cap cost with atomic database upserts, how quizzes and interview grades come back as schema-constrained JSON, and how the coach is kept to hints rather than solutions. Every claim about that code is taken from the repository, including the parts a design review would push back on.
