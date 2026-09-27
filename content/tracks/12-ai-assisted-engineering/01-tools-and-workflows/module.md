---
slug: tools-and-workflows
title: Tools and workflows
description: How AI coding tools work, how to drive an agent through plan, implement and verify, and how to give it specs, context and integrations without giving away your secrets.
---
Every AI coding tool is a model plus a harness: the program that chooses what the model sees, which tools it can call and how much it may do before a human looks. This module starts by sorting the current tools (Claude Code, OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI) by harness category, then builds the workflow that makes any of them safe to use on production code.

You will learn the plan → implement → verify loop and how to scope a task to one reviewable diff; how to write task specs and standing memory files (`CLAUDE.md`, `AGENTS.md`) that an agent can execute; how to keep the context window useful as a session grows; how MCP connects agents to your systems and where its permission model actually enforces anything; how to verify generated code with tests, properties and a review checklist; and what a sensible team policy says about secrets, data handling and licensing.

The module ends where senior judgement starts: knowing which checks are real guardrails and which are only instructions the model may ignore.
