---
slug: tools-and-workflows
title: Tools and workflows
description: How AI coding tools work, how to drive an agent through plan, implement and verify, and how to give it specs, context and integrations without giving away your secrets.
---
Every AI coding tool is a model plus a harness: the program that chooses what the model sees, which tools it can call and how much it may do before a human looks. This module starts by sorting the current tools (Claude Code, OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI) by harness category and showing what a harness does at the level of a single loop iteration, then builds the workflow that makes any of them safe to use on production code.

You will learn the plan → implement → verify loop with the real mechanics of permission modes, hooks and worktrees; how to write task specs and standing memory files (`CLAUDE.md`, `AGENTS.md`, scoped rule files) that an agent can execute, including how each tool loads and overrides them; how the context window fills, what prompt caching and compaction do to it, and how to keep it useful as a session grows; how MCP connects agents to your systems, what the current protocol revision looks like on the wire, and where its permission model actually enforces anything; how to verify generated code with hand traces, property and differential tests, mutation testing and a diff checker; and what a team policy says about secrets, data handling and licensing, with the controls that make it hold.

Every lesson has runnable code, a hand-traced example on concrete data, production failure modes with their symptoms and fixes, and the follow-up questions a senior interviewer asks. The module ends where senior judgement starts: knowing which checks are real guardrails and which are only instructions the model may ignore.
