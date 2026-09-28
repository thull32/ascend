---
slug: building-with-llms
title: Building with LLMs
description: "Turn a model API into a product feature you can trust, measure, secure and afford: prompts, structured outputs, tools, retrieval, agents, evals, security and system design."
prerequisites: [ai-and-llms/how-llms-work]
---
Calling a model API takes ten lines of code. Shipping a feature on top of one takes engineering: a prompt that behaves the same way on the ten-thousandth input as on the demo, output your code can parse without a retry loop, answers grounded in your own documents, tools the model can call without being able to do damage, a way to know whether last week's prompt change made things better or worse, and a cost per user that does not grow without bound.

This module builds that practice in the order you meet it in a real project, and it works at the level of mechanism and arithmetic. You watch a grammar mask renormalise the model's probabilities at one decoding step, write out a parallel tool call message by message, chunk one document four ways and compute cosine, BM25 and reciprocal-rank-fusion scores by hand, trace an agent call by call with its token growth and cost, measure an LLM judge's position and length biases with exact tests, and follow an indirect prompt injection through a tool-using agent to see which defence stops which step.

The final lesson puts it together as a system design, using this app's own AI coach as the worked example: requirements and a cost model per request, a prompt laid out for caching with a stepped history window that keeps the cached prefix alive, effort routing, replies streamed over Server-Sent Events that survive a closed tab, a fallback ladder, per-session rate limits and per-user billed-token budgets enforced by one atomic database statement, and the counters that make cost and cache hit rate observable. Every claim about that code is taken from the repository, including the parts a design review pushed back on and the gaps that remain.

Every lesson ends with exercises you can run in the browser: a few-shot example selector with label coverage, a JSON-schema validator for tool arguments, a chunker, reciprocal rank fusion, a token-budget context packer, an agent cost model, retrieval metrics for a golden set, a tool-call policy with taint tracking, an injection detector built to show its own limits, and a replay of the coach's daily budget.
