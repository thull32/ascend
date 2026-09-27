---
slug: context-management
title: "Context management: what the model sees, and how it rots"
description: The context window as the agent's entire world, a worked token budget, why quality degrades long before the limit, agentic search versus embedding indexes, repo maps, handoff notes, subagents and session hygiene.
minutes: 20
difficulty: medium
tags: [ai-tools, context-window, rag, repo-map, memory-files, coding-agents]
---
Two hours into a session, the agent starts contradicting a decision it made in the first ten minutes. It re-reads files it already read. It "fixes" a failing test by reintroducing a bug the two of you fixed an hour ago. The model did not get worse. Its context did: 170,000 tokens of file dumps, test logs, failed attempts and superseded plans, with your original constraints somewhere in the middle.

A model has no memory between calls. Every decision is computed from the tokens in the context window at that moment, and nothing else. Everything the agent "knows" about your repository is what has been read into that window during this session, plus the memory files loaded at the start. Managing that window is not an optimisation; it is the main lever you have on output quality once the spec is written.

## What is in the window

Everything the harness sends on each call:

- The harness's own system prompt and built-in tool definitions.
- The schema of every tool from every connected MCP server, whether or not this task uses it.
- Memory files (`CLAUDE.md`, `AGENTS.md` and friends).
- Your messages.
- Every tool call and every tool result: each file read, each grep, each test run's output.

Here is a plausible budget for an ordinary bug fix, against a 200,000-token window as a round number:

| Item | Tokens (approx.) | Running total |
|---|---|---|
| Harness system prompt and built-in tools | 12,000 | 12,000 |
| Two MCP servers exposing 40 tools | 8,000 | 20,000 |
| Memory file | 1,500 | 21,500 |
| Your task spec | 800 | 22,300 |
| 15 file reads averaging 3,000 tokens | 45,000 | 67,300 |
| 6 test runs averaging 4,000 tokens of output | 24,000 | 91,300 |
| One full CI log pasted in | 40,000 | 131,300 |
| Agent reasoning and edits over 25 iterations | 30,000 | 161,300 |

Rules of thumb for estimating: roughly four characters per token for English prose, often three to four for code. A 400-line source file at 40 characters per line is 16,000 characters, about 4,000–5,000 tokens. Notice that the single pasted CI log costs nearly as much as all fifteen file reads, and almost all of it is irrelevant.

The window is resent on every loop iteration. Prompt caching makes the unchanged prefix cheaper to process, which helps cost and latency, but it does nothing for the other problem: the model has to attend over all of it. The mechanics are in [Context windows and the KV cache](/learn/ai-and-llms/how-llms-work/context-windows-and-kv-cache).

## Context rot: why quality drops before the limit

The window does not have to be full for results to degrade. Four mechanisms are at work.

**Dilution.** Your constraint "do not change the public API" is 12 tokens out of 160,000. Research on long contexts (for example the "Lost in the Middle" study from 2023) found models use information at the start and end of a long input more reliably than information in the middle, and later long-context evaluations show the same qualitative pattern: finding one planted fact is easy, but reasoning that depends on many scattered facts gets worse as the input grows.

**Staleness.** The agent read `orders.py` at iteration 5 and has edited it three times since. The old contents are still in the transcript. Unless it re-reads the file, it may reason from a version that no longer exists.

**Poisoning by failed attempts.** A wrong hypothesis the agent explored for twenty minutes stays in context, along with the code it wrote for it, and keeps pulling later decisions towards it.

**Compaction losses.** When the window fills, harnesses summarise older turns to make room. A summary keeps "we are adding rate limiting to exports" and can drop "the limiter must use the injected clock", which was the one detail that mattered.

The symptoms are recognisable: re-reading files it already has, asking questions you already answered, contradicting earlier decisions, re-introducing fixed bugs. When you see two of them, stop feeding the session and reset it (see handoffs below).

## Getting the right context in

There are three ways code reaches the window, and good tools combine them.

| Mechanism | How it works | Strong at | Weak at |
|---|---|---|---|
| **Agentic search** | The agent runs grep, glob and file reads on demand | Exact identifiers; always reflects the current files | Concepts without a searchable name; costs iterations |
| **Embedding index** | Chunks of the codebase are embedded ahead of time; the query is embedded and nearest chunks retrieved | "Where do we handle expired sessions?" when you do not know the function name | Stale after edits; chunk boundaries split functions; similar-looking code can outrank relevant code |
| **Explicit** | You name the files, paste the exact error, give line ranges | Precision | Requires you to know where to look |

Terminal agents such as Claude Code, Codex CLI and Gemini CLI lean on agentic search. Cursor also maintains an embedding index of the codebase for semantic search. An embedding index is retrieval-augmented generation over your repository; step through the pipeline, then imagine the chunks are functions instead of policy paragraphs.

```viz
{"type": "ml", "scenario": "rag-pipeline", "text": "What is the refund window?", "k": 2, "title": "Semantic retrieval, the mechanism behind codebase indexing", "caption": "Replace the policy documents with code chunks and the question with 'where do we compute refunds?'. The same failure modes apply: if the right chunk is not in the top-k, the model never sees it, and an index built before today's edits returns yesterday's code."}
```

The most effective habit combines the three: give the agent the **entry points** explicitly ("start at `api/orders/list.py` and `repo/orders.py`; the failing test is `test_orders.py::test_tie_break`") and let search follow the references from there. You spend one sentence and save a dozen exploratory reads.

## Repo maps

A repo map is a compact outline of the repository, file paths plus the key symbols in each, that lets a model navigate without reading everything. The open-source tool Aider popularised automatically generated repo maps built from parsed source code. You can generate a crude one yourself in a few lines:

```python
import ast
import pathlib

def repo_map(root: str, max_lines: int = 400) -> str:
    """One line per module: its public top-level functions and classes."""
    out = []
    for path in sorted(pathlib.Path(root).rglob("*.py")):
        if {"tests", ".venv", "migrations"} & set(path.parts):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        names = [
            node.name for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
            and not node.name.startswith("_")
        ]
        if names:
            out.append(f"{path}: {', '.join(names)}")
    return "\n".join(out[:max_lines])
```

```text
app/api/orders/list.py: list_orders
app/api/pagination.py: encode_cursor, decode_cursor, Page
app/repo/orders.py: OrderRepo
app/services/refunds.py: RefundPolicy, compute_refund
app/services/clock.py: Clock, SystemClock, FakeClock
```

The arithmetic is why maps work. A 900-file service is on the order of 900 × 3,000 ≈ 2.7 million tokens to read in full, far beyond any window. Its map might be 600 lines, around 8,000 tokens, and it answers "which file should I open?" for most tasks. The hand-written equivalent is the architecture section of your memory file: one line per directory saying what lives there and what does not.

## Memory, handoffs and subagents

Three tools for keeping knowledge out of the transcript and in a place where it survives.

**Memory files** hold stable facts about the repository (previous lesson). They are loaded at the start of every session, which is exactly where the model attends best.

**Handoff notes** carry state between sessions. At the end of a session, or when a session starts to rot, ask the agent to write one: what is done, what is known to be broken, what is not started, how to run things. The next session reads a page instead of inheriting 150,000 tokens of history. This repository's own handoff note is organised in four sections: current state, known failures, work not started, and how to run locally. That is a good default template.

**Subagents** isolate exploration. The main session delegates "find every place we compute refund amounts and summarise how they differ" to a separate agent with its own context window. The subagent reads 40 files (perhaps 120,000 tokens) and returns a 400-token summary. The main context grows by the summary, not the reading. Claude Code has subagents built in; with any tool you can do the same by hand, running the survey in a separate session and pasting the conclusion.

## Session hygiene

- **One task per session.** Start fresh between tasks. Yesterday's refactor has no business in today's bug fix.
- **Put constraints where they survive.** A constraint that only exists in message 3 of 80 is in the worst position in the window and the first thing compaction drops. Put stable ones in the memory file and restate task constraints in the spec.
- **Filter tool output before it enters the context.** `pytest -x -q path::test_name` instead of the whole suite; `grep -E 'FAILED|Error'` over a log; `| tail -5` on chatty commands. The validation command in this repository's agent brief ends in `2>&1 | tail -5` for exactly this reason: the loader prints a line per track and module, and only the last lines say whether anything failed.
- **Reduce logs before pasting them.** Extract the failing test's stack trace, not the 40,000-token CI transcript.
- **Disconnect tools you are not using.** Every connected MCP server's tool schemas occupy context on every call, and a longer tool list also makes it more likely the model picks the wrong tool.
- **Ask for a re-read before an edit** when a file has changed since the agent last read it.

## Worked example: two sessions, one bug

The bug: a pagination test fails intermittently when two orders share a timestamp.

**Session A.** You paste the full CI log (40,000 tokens). The agent reads 20 files looking for the pagination code (60,000), runs the whole test suite eight times with verbose output (32,000), and spends twenty minutes on a wrong hypothesis about database isolation levels (20,000). At around 150,000 tokens it changes the signature of `encode_cursor` to fix the bug, violating the "no public API changes" constraint you gave in your second message. The constraint was still in the transcript; it was simply 140,000 tokens away from where the model was looking.

**Session B.** You extract the failing test's name and stack trace from the log (1,500 tokens). You name the entry points: `api/orders/list.py`, `repo/orders.py`, the failing test. The agent runs only that test with `-x -q` (about 500 tokens per run). You delegate "list every caller of `encode_cursor`" to a subagent, which returns 400 tokens. When the fix is written, the context is around 35,000 tokens and your constraints, restated in the spec, are near the top. The agent fixes the query to compare `(created_at, id)` tuples and leaves the signature alone.

Same model, same bug, same tool. The difference is what was in the window.

## Senior signals

- You treat the context window as the agent's **entire world** and budget it: you can estimate tokens for a file, a log or a tool list.
- You recognise **context rot** (re-reads, contradictions, reintroduced bugs) and reset with a handoff note instead of pushing on.
- You give **entry points** explicitly and let search follow references, and you know when an embedding index helps and when it is stale.
- You **filter tool output** before it enters the context and never paste a raw CI log.
- You put durable constraints in **memory files**, carry state in **handoff notes**, and isolate exploration in **subagents**.
- You disconnect **unused MCP servers** because their schemas cost context on every call.

## Check yourself

```quiz
- q: >-
    Two hours into a session the agent re-reads files it already read and contradicts a design decision from the start of the session. What is the most effective response?
  options: ["Have it write a handoff note, then start a fresh session from the note and spec", "Switch to a model with a larger context window and carry on in this session", "Paste the full transcript into a new session so nothing is lost", "Restate the original decision more forcefully in the same session"]
  answer: 0
  explanation: >-
    Those are symptoms of context rot: dilution, stale file contents and failed attempts in the window. A handoff note (state, known failures, next steps) keeps the useful state and drops the noise. A bigger window delays the problem without removing the noise, and pasting the transcript recreates it.
- q: >-
    You need to find where the codebase handles expired sessions, but you do not know any function or file names. Which context mechanism is most likely to help first?
  options: ["Agentic grep for the word session, then read every file it matches", "A semantic index query, then reading the files it returns to confirm", "Pasting the whole repository into the context so nothing is missed", "Asking the model, since it has seen similar session code in training"]
  answer: 1
  explanation: >-
    Semantic (embedding) retrieval finds concepts without exact identifiers. It can be stale and can mis-rank, so you confirm by reading the returned files. Grepping session in a large codebase returns hundreds of hits, and the model's training data knows nothing about your repository.
- q: >-
    Why does this repository's validation command in the agent brief end with 2>&1 | tail -5?
  options: ["tail makes the command finish faster, since it stops reading output early", "It hides warnings from the agent, so it does not try to fix unrelated ones", "The validator happens to write all of its errors to the last five lines", "The last lines carry the pass/fail signal; the rest would bloat context"]
  answer: 3
  explanation: >-
    Tool output enters the context and is resent on every later iteration. Keeping only the lines that answer the question (did it pass, which file failed) keeps hundreds of irrelevant lines out and saves tokens and attention on every run. It is not about speed or hiding information the agent needs.
- q: >-
    A subagent reads 40 files and returns a 400-token summary to the main session. What is the main benefit?
  options: ["The summary is more accurate than the files, since noise is removed", "The main context grows by the summary, not by all the tokens of reading", "The subagent has edit permissions on files the main agent cannot touch", "The subagent uses a cheaper model, so all that reading costs less overall"]
  answer: 1
  explanation: >-
    Delegation isolates exploration: the main context grows by 400 tokens rather than the tens of thousands the subagent read, so it keeps its constraints and plan in a small window. The trade-off is that the summary is lossy, not more accurate, so you delegate surveys and questions, not the decision itself.
- q: >-
    A constraint you gave in message 3 of an 80-message session is violated at message 75. Which explanation is most likely?
  options: ["Constraints expire after about 50 messages unless they are repeated", "The memory file overrode it, since memory files take precedence over chat", "The model deliberately disobeyed it, having decided a better approach existed", "It was diluted in the middle of a long context or dropped by compaction"]
  answer: 3
  explanation: >-
    Information in the middle of long contexts is used less reliably, and summarisation of older turns can lose details. There is no fixed expiry and no precedence rule; put durable constraints in the memory file and restate task constraints in the spec so they sit where the model attends best.
```
