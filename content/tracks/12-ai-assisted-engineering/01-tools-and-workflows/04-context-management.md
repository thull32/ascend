---
slug: context-management
title: "Context management: what the model sees, and how it rots"
description: The context window as the agent's entire world, a hand-traced token budget across eight iterations with and without prompt caching, what compaction keeps and drops, why quality degrades long before the limit, agentic search versus embedding indexes, repo maps, handoff notes, subagents and session hygiene.
minutes: 20
difficulty: medium
tags: [ai-tools, context-window, rag, repo-map, memory-files, coding-agents, prompt-caching]
---
Two hours into a session, the agent starts contradicting a decision it made in the first ten minutes. It re-reads files it already read. It "fixes" a failing test by reintroducing a bug the two of you fixed an hour ago. The model did not get worse. Its context did: 170,000 tokens of file dumps, test logs, failed attempts and superseded plans, with your original constraints somewhere in the middle.

A model has no memory between calls. Every decision is computed from the tokens in the context window at that moment, and nothing else. Everything the agent "knows" about your repository is what has been read into that window during this session, plus the memory files loaded at the start. Managing that window is not an optimisation; it is the main lever you have on output quality once the spec is written, and it is also the main lever on cost, because the window is resent on every iteration.

## What is in the window

Everything the harness sends on each call:

- The harness's own system prompt and built-in tool definitions.
- The schemas of connected MCP tools. At the time of writing, Claude Code defers loading a server's tool list until a tool from it is first needed (it calls this tool search); older clients and other tools load every schema from every connected server at start-up, whether or not this task uses it.
- Memory files (`CLAUDE.md`, `AGENTS.md` and friends).
- Your messages.
- Every tool call and every tool result: each file read, each grep, each test run's output.

Here is a plausible budget for an ordinary bug fix, against a 200,000-token window as a round number (a common size at the time of writing; some models offer a million):

| Item | Tokens (approx.) | Running total |
|---|---|---|
| Harness system prompt and built-in tools | 12,000 | 12,000 |
| Two MCP servers exposing 40 tools, loaded eagerly | 8,000 | 20,000 |
| Memory file | 1,500 | 21,500 |
| Your task spec | 800 | 22,300 |
| 15 file reads averaging 3,000 tokens | 45,000 | 67,300 |
| 6 test runs averaging 4,000 tokens of output | 24,000 | 91,300 |
| One full CI log pasted in | 40,000 | 131,300 |
| Agent reasoning and edits over 25 iterations | 30,000 | 161,300 |

Rules of thumb for estimating: roughly four characters per token for English prose, often three to four for code, so `wc -c file` divided by four is a usable estimate. A 400-line source file at 40 characters per line is 16,000 characters, about 4,000–5,000 tokens. Notice that the single pasted CI log costs nearly as much as all fifteen file reads, and almost all of it is irrelevant. The tokeniser's own mechanics are in [Tokenization](/learn/ai-and-llms/how-llms-work/tokenization).

## A hand trace: eight iterations of one bug fix

The window is resent on every loop iteration, so the cost of a session is not the size of the transcript but the *sum* of its sizes over every call. Trace an eight-iteration fix with a fixed prefix of 14,300 tokens (system prompt and tools, memory file, spec) and about 1,200 tokens of model output per iteration. "New" is what the model has not seen before on that call: its own previous output plus the last tool result.

| Iteration | Action | Input tokens on this call | Of which new | Billed, no caching | Billed with caching |
|---|---|---|---|---|---|
| 1 | read `orders/list.py` | 14,300 | 14,300 | 14,300 | 17,875 |
| 2 | read `pagination.py` | 18,500 | 4,200 | 18,500 | 6,680 |
| 3 | grep `encode_cursor` | 22,200 | 3,700 | 22,200 | 6,475 |
| 4 | run one test, `-x -q` | 24,000 | 1,800 | 24,000 | 4,470 |
| 5 | edit `list.py` | 25,700 | 1,700 | 25,700 | 4,525 |
| 6 | run one test, `-x -q` | 27,200 | 1,500 | 27,200 | 4,445 |
| 7 | run the full suite, verbose | 28,900 | 1,700 | 28,900 | 4,845 |
| 8 | read `repo/orders.py` | 39,100 | 10,200 | 39,100 | 15,640 |
| | **Total** | **199,900** | | **199,900** | **64,955** |

The final transcript is 44,300 tokens, but the model processed 199,900 input tokens to get there: with a growing transcript the total grows roughly with the square of the number of iterations. Three things to read off the table:

1. **Caching cuts the bill to about a third** here (the ratio depends on how much is new per turn), because everything already seen is a cache read at 0.1 times the input rate and only the new tail is a cache write at 1.25 times. The first call is *more* expensive with caching: it writes the whole prefix.
2. **Iteration 7's verbose test run is paid for on iteration 8 and every iteration after it.** The 9,000 tokens of test output became "new" once, then a cache read forever. Had it been `-x -q`, iteration 8 would have cost about 4,500 billed-equivalent tokens instead of 15,640.
3. **Nothing in the table removes anything.** The transcript only grows. The only ways down are compaction, a fresh session or delegation to a subagent.

```viz
{"type": "ml", "scenario": "agent-loop", "title": "Why long fix loops get expensive", "caption": "Every observation stays in the transcript and is resent on the next decision. The token counter in this loop is the input-tokens column of the table above; the harness's iteration cap and budget exist because the sum grows quadratically."}
```

## Under the hood: prompt caching

Prompt caching lets the serving system reuse the work of processing a prefix it has seen before. The expensive part of a call is the prefill, which computes the attention keys and values for every input token; if the first 30,000 tokens are byte-for-byte identical to a recent request, their keys and values can be reused rather than recomputed. Step through the mechanism at token scale:

```viz
{"type": "ml", "scenario": "kv-cache", "text": "The cat sat", "title": "The cache the prompt cache reuses", "caption": "Prefill computes a key and value for every prompt token; decode appends one pair per new token. Prompt caching stores the prefill result for a prefix and serves it again to the next request with the same prefix, which is why a cache hit is billed at a fraction of the input rate."}
```

Two rules follow from "byte-for-byte prefix":

- **Order matters.** The cacheable part must come first and must not change. This repository's Anthropic client (`crates/core/src/ai/anthropic.rs`) sends the system prompt as a block with a cache breakpoint and the volatile context (the current lesson, the learner's code) as a second block *after* it, without one; a unit test asserts that the "volatile context must sit after the breakpoint". The coach's system prompt is assembled stable-first (persona, rules) and volatile-last for the same reason. Change one byte early in the prefix and every byte after it misses.
- **Anything that changes the prefix invalidates the cache.** In Claude Code, at the time of writing, that includes switching model, changing the effort level on most models, adding or removing an MCP server when its tools are loaded eagerly, and compacting the conversation. Editing files does not invalidate anything, and editing `CLAUDE.md` mid-session does not apply until `/clear` or `/compact`.

The prices, from Anthropic's pricing page at the time of writing: a cache write is billed at 1.25 times the input rate and a cache read at 0.1 times. The cache lives for 5 minutes by default, refreshed on each hit, with a 1-hour option; Claude Code uses the 1-hour lifetime for the main conversation on subscription plans and 5 minutes elsewhere. This repository's per-user AI budget (`crates/core/src/ai/budget.rs`) counts billed input as `input + cache_write × 5/4 + cache_read / 10` so that both kinds of cached token are inside the limit; counting only uncached input would leave the most expensive input of all outside it. The wider mechanics of the KV cache are in [Context windows and the KV cache](/learn/ai-and-llms/how-llms-work/context-windows-and-kv-cache).

Caching changes cost and latency. It does nothing for the other problem: the model still has to attend over all of it.

## Context rot: why quality drops before the limit

The window does not have to be full for results to degrade. Four mechanisms are at work.

**Dilution.** Your constraint "do not change the public API" is 12 tokens out of 160,000. Research on long contexts (the "Lost in the Middle" study by Liu and colleagues, 2023) found models use information at the start and end of a long input more reliably than information in the middle, and later long-context evaluations show the same qualitative pattern: finding one planted fact is easy, but reasoning that depends on many scattered facts gets worse as the input grows.

**Staleness.** The agent read `orders.py` at iteration 5 and has edited it three times since. The old contents are still in the transcript. Unless it re-reads the file, it may reason from a version that no longer exists.

**Poisoning by failed attempts.** A wrong hypothesis the agent explored for twenty minutes stays in context, along with the code it wrote for it, and keeps pulling later decisions towards it.

**Compaction losses.** When the window fills, harnesses summarise older turns to make room. A summary keeps "we are adding rate limiting to exports" and can drop "the limiter must use the injected clock", which was the one detail that mattered.

The symptoms are recognisable: re-reading files it already has, asking questions you already answered, contradicting earlier decisions, re-introducing fixed bugs. When you see two of them, stop feeding the session and reset it (see handoffs below).

## Compaction: what the harness keeps and drops

Compaction is the harness's own answer to a full window. In Claude Code, at the time of writing, it runs automatically when the window fills and can be run by hand with `/compact`: the message history is replaced by a model-written summary, while the system prompt and the project context (memory files, rules loaded at start) are preserved. `/context` shows what is occupying the window and `/cost` the session's token usage, which is how you find out that a pasted log is 40% of your context.

What a summary keeps is what the summariser judged important, which is not always what you judged important. Two habits make compaction safe:

- **Compact with instructions.** `/compact` accepts a sentence saying what to preserve: "keep the list of files changed, the names of the failing tests, and the constraint that `encode_cursor`'s signature must not change." The summary is then written against your priorities rather than the model's guess.
- **Compact at a boundary, not mid-task.** After a green step and a commit, the summary has little to lose; halfway through a debugging thread, it drops the thread.

Compaction also invalidates the conversation's cache, so the first call after it is a full write. That is a one-off cost, small next to a transcript that has doubled.

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

The most effective habit combines the three: give the agent the **entry points** explicitly ("start at `api/orders/list.py` and `repo/orders.py`; the failing test is `test_orders.py::test_tie_break`") and let search follow the references from there. You spend one sentence and save a dozen exploratory reads, which in the table above is the difference between a 4,000-token iteration and a 15,000-token one.

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

**Memory files** hold stable facts about the repository ([previous lesson](/learn/ai-assisted-engineering/tools-and-workflows/writing-effective-specs)). They are loaded at the start of every session, which is exactly where the model attends best, and they survive compaction.

**Handoff notes** carry state between sessions. At the end of a session, or when a session starts to rot, ask the agent to write one. The next session reads a page instead of inheriting 150,000 tokens of history. A template that has held up:

```markdown
# Handoff: export rate limiting (2026-09-27, session 3)

## Done and verified
- FixedWindowLimiter in app/ratelimit.py; tests/test_ratelimit.py green (7 tests)
- Committed as 4f1c2a9 on agent/export-rate-limit

## In progress
- Redis-backed limiter: app/ratelimit_redis.py written, integration test
  fails on window reset (test_window_resets_redis); suspect TTL rounding

## Known failures and dead ends
- Do not retry the "use INCR without EXPIRE" approach; it leaks keys (tried, reverted)

## Constraints that still apply
- Clock is injected via Clock; never datetime.now()
- middleware.py must not change in this task

## How to run
- pytest tests/test_ratelimit*.py -x -q; redis via docker compose up -d redis

## Next step
- Fix the TTL rounding, then step 3 (middleware on POST /exports)
```

The "dead ends" section is the one people leave out and the one that saves the most: it stops the next session from re-exploring the failed hypothesis that poisoned this one.

**Subagents** isolate exploration. The main session delegates "find every place we compute refund amounts and summarise how they differ" to a separate agent with its own context window. The subagent reads 40 files (perhaps 120,000 tokens) and returns a 400-token summary. The main context grows by the summary, not the reading. In Claude Code, at the time of writing, subagents are Markdown files with front matter under `.claude/agents/` (fields include `name`, `description`, `tools`, `model`, and `isolation: worktree` for a separate checkout), and a built-in read-only `Explore` agent handles searches; with any tool you can do the same by hand, running the survey in a separate session and pasting the conclusion. The trade-off is that the summary is lossy: delegate surveys and questions, never the decision.

## Session hygiene

- **One task per session.** Start fresh (`/clear`) between tasks. Yesterday's refactor has no business in today's bug fix.
- **Put constraints where they survive.** A constraint that only exists in message 3 of 80 is in the worst position in the window and the first thing compaction drops. Put stable ones in the memory file and restate task constraints in the spec.
- **Filter tool output before it enters the context.** `pytest -x -q path::test_name` instead of the whole suite; `grep -E 'FAILED|Error'` over a log; `| tail -5` on chatty commands. The validation command in this repository's agent brief ends in `2>&1 | tail -5` for exactly this reason: the loader prints a line per track and module, and only the last lines say whether anything failed.
- **Reduce logs before pasting them.** Extract the failing test's stack trace, not the 40,000-token CI transcript.
- **Disconnect tools you are not using.** Where the client loads tool schemas eagerly, every connected MCP server occupies context on every call, and a longer tool list also makes it more likely the model picks the wrong tool. Where the client defers loading, the cost is smaller but the wrong-tool risk remains.
- **Ask for a re-read before an edit** when a file has changed since the agent last read it.

## Worked example: two sessions, one bug

The bug: a pagination test fails intermittently when two orders share a timestamp.

**Session A.** You paste the full CI log (40,000 tokens). The agent reads 20 files looking for the pagination code (60,000), runs the whole test suite eight times with verbose output (32,000), and spends twenty minutes on a wrong hypothesis about database isolation levels (20,000). At around 150,000 tokens it changes the signature of `encode_cursor` to fix the bug, violating the "no public API changes" constraint you gave in your second message. The constraint was still in the transcript; it was 140,000 tokens away from where the model was looking, and the summed input over the session was on the order of two million tokens.

**Session B.** You extract the failing test's name and stack trace from the log (1,500 tokens). You name the entry points: `api/orders/list.py`, `repo/orders.py`, the failing test. The agent runs only that test with `-x -q` (about 500 tokens per run). You delegate "list every caller of `encode_cursor`" to a subagent, which returns 400 tokens. When the fix is written, the context is around 35,000 tokens and your constraints, restated in the spec, are near the top. The agent fixes the query to compare `(created_at, id)` tuples and leaves the signature alone.

Same model, same bug, same tool. The difference is what was in the window.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| The agent edits a function that no longer exists in that form, or its patch fails to apply | Stale file contents: it is reasoning from a read made several edits ago | Ask for a re-read before edits to files changed this session; keep edits and reads close together |
| After a long session, a constraint from your early messages is violated | Dilution in the middle of the window, or compaction dropped it | Restate task constraints in the spec at the top; put durable ones in the memory file; compact with instructions naming them |
| The agent keeps returning to a hypothesis you ruled out an hour ago | Poisoning: the failed attempt and its code are still in context | Write a handoff note with a "dead ends" section and start a fresh session |
| Cost per iteration jumps although the task did not change | A cache miss: model or effort switched, an MCP server added, or a compaction; or a verbose tool result entered the transcript | Check `/cost`; avoid mid-task model switches; filter tool output before it enters |
| The agent calls the wrong tool, or spends turns choosing between similar ones | Tool-list bloat from servers unrelated to the task | Disconnect unused servers; give explicit entry points so it searches less |
| The first message of a new session already shows the window a third full | Eagerly loaded tool schemas plus an oversized memory file | Prune the memory file to what changes behaviour; connect servers per project, not globally |

## Interviewer follow-ups

**"Why does an agent session get more expensive per step as it goes on, and what does prompt caching change?"** Model answer: the whole transcript is resent on each call, so total input grows roughly quadratically with iterations; caching bills the already-seen prefix at a tenth of the rate and the new tail at 1.25 times, cutting the bill by a large factor but not the attention cost. Common wrong answer: "each step costs the same, it is the output tokens that add up".

**"A constraint you gave in message 3 is violated at message 75. Whose fault is it and what do you change?"** Model answer: the workflow's: the constraint sat in the middle of a long context and may have been dropped by compaction; it belongs in the spec at the top or in the memory file, and the session should have been reset at the first sign of rot. Common wrong answer: "the model disobeyed; I would repeat it in capitals".

**"When would you use an embedding index over grep, and what is its failure mode?"** Model answer: when you need a concept without a name ("where do we handle expired sessions"); it can be stale after edits and can rank similar-looking code above the relevant code, so confirm by reading what it returns. Common wrong answer: "always, because it understands the code".

**"What would you put in a compaction instruction for a debugging session?"** Model answer: the files changed, the failing tests by name, the hypotheses ruled out, and the constraints still in force; and you would compact at a green checkpoint rather than mid-thread. Common wrong answer: "nothing, the summary is automatic".

**"How does a subagent reduce context, and what do you lose?"** Model answer: it reads in its own window and returns a short summary, so the main context grows by the summary; the summary is lossy, so you delegate surveys, not decisions. Common wrong answer: "it is a cheaper model, so it saves money".

## What mid-level engineers get wrong

- **Pasting the whole log.** A 40,000-token CI transcript is resent on every later call; the failing test's trace is 1,500 tokens and contains the same information.
- **Running the full suite verbosely inside the loop.** One verbose run costs on every subsequent iteration; `-x -q` on the one failing test costs a few hundred tokens.
- **Keeping the same session all day.** Yesterday's refactor, the abandoned hypothesis and three stale reads of the same file all shape the next decision.
- **Repeating a constraint instead of relocating it.** A repeated constraint is still in the middle of the window; the spec header and the memory file are where the model attends and where compaction preserves.
- **Switching models mid-task to "try a smarter one".** The prefix cache misses and the whole transcript is written again; if a reset is needed, a fresh session with a handoff note is cheaper and cleaner.
- **Connecting every MCP server globally.** Schemas or tool names for a dozen unrelated servers sit in every session, cost context where loading is eager, and raise wrong-tool errors everywhere.

## Senior signals

- You treat the context window as the agent's **entire world** and budget it: you can estimate tokens for a file, a log or a tool list, and you know the session cost is the sum over iterations, not the final size.
- You know how **prompt caching** works (byte-identical prefix, breakpoints, 1.25x write and 0.1x read, short lifetimes) and what invalidates it, and you order prompts stable-first in systems you build.
- You recognise **context rot** (re-reads, contradictions, reintroduced bugs) and reset with a handoff note that records dead ends, instead of pushing on.
- You **compact with instructions** at green checkpoints and never mid-thread.
- You give **entry points** explicitly and let search follow references, and you know when an embedding index helps and when it is stale.
- You **filter tool output** before it enters the context and never paste a raw CI log.
- You put durable constraints in **memory files**, carry state in **handoff notes**, and isolate exploration in **subagents**, knowing the summary is lossy.

## Check yourself

```quiz
- q: >-
    Two hours into a session the agent re-reads files it already read and contradicts a design decision from the start of the session. What is the most effective response?
  options: ["Have it write a handoff note, then start a fresh session from that note", "Switch to a model with a larger context window and carry on in this session", "Paste the full transcript into a new session so nothing is lost", "Restate the original decision more forcefully in the same session"]
  answer: 0
  explanation: >-
    Those are symptoms of context rot: dilution, stale file contents and failed attempts in the window. A handoff note (state, dead ends, constraints, next steps) keeps the useful state and drops the noise. A bigger window delays the problem without removing the noise, and pasting the transcript recreates it.
- q: >-
    An eight-iteration session ends with a 44,000-token transcript. Roughly how many input tokens did the model process over the session, and why?
  options: ["About 200,000, because the growing transcript is resent on every iteration", "About 44,000, because the transcript is only sent once at the end", "About 88,000, because each iteration sends the transcript and its own output", "About 8,000, because caching means only new tokens are ever processed"]
  answer: 0
  explanation: >-
    Every call resends everything so far, so the total is the sum of the transcript sizes over the iterations, which grows roughly with the square of the iteration count; in the traced example it was 199,900 for a final transcript of 44,300. Caching changes what is billed and how fast prefill runs, not how many tokens the model attends over.
- q: >-
    Which action leaves the prompt cache intact in a Claude Code session, at the time of writing?
  options: ["Adding an MCP server whose tools load eagerly", "Editing source files in the repository", "Switching to a different model with /model", "Compacting the conversation with /compact"]
  answer: 1
  explanation: >-
    The cache keys on a byte-identical prefix of the request. Editing files changes nothing in the prompt until a tool reads them, which appends to the tail. A model switch uses a different cache, compaction rewrites the conversation, and an eagerly loaded server changes the tool definitions near the front of the prompt, so everything after them misses.
- q: >-
    You need to find where the codebase handles expired sessions, but you do not know any function or file names. Which context mechanism is most likely to help first?
  options: ["Agentic grep for the word session, then read every file it matches", "A semantic index query, then reading the files it returns to confirm", "Pasting the whole repository into the context so nothing is missed", "Asking the model, since it has seen similar session code in training"]
  answer: 1
  explanation: >-
    Semantic (embedding) retrieval finds concepts without exact identifiers. It can be stale and can mis-rank, so you confirm by reading the returned files. Grepping session in a large codebase returns hundreds of hits, and the model's training data knows nothing about your repository.
- q: >-
    You are about to run /compact in the middle of a debugging session. What is the best way to do it?
  options: ["Give it instructions naming the changed files, failing tests and live constraints", "Run it as is; the summary is generated by the model and keeps what matters", "Skip compaction and switch models instead, which frees context without losing history", "Paste the memory file into the chat first so the summary includes it"]
  answer: 0
  explanation: >-
    The summariser keeps what it judges important, which can drop the one detail you needed. Instructions make the summary follow your priorities, and compacting after a green step leaves little to lose. A model switch does not shrink the context, and the memory file survives compaction without being pasted.
- q: >-
    A subagent reads 40 files and returns a 400-token summary to the main session. What is the main benefit?
  options: ["The summary is more accurate than the files, since noise is removed", "The main context grows by the summary, not by all the tokens of reading", "The subagent has edit permissions on files the main agent cannot touch", "The subagent uses a cheaper model, so all that reading costs less overall"]
  answer: 1
  explanation: >-
    Delegation isolates exploration: the main context grows by 400 tokens rather than the tens of thousands the subagent read, so it keeps its constraints and plan in a small window. The trade-off is that the summary is lossy, not more accurate, so you delegate surveys and questions, not the decision itself.
```
