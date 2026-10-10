---
lesson: context-management
source: 969307c6c495fdd7
fit: great
desk:
  - "The token budget table for one bug fix"
  - "The eight-iteration trace with and without prompt caching"
  - "The repo map generator and the handoff note template"
---
## Introduction

Two hours into a session, the agent starts contradicting a decision it made in the first ten minutes. It re-reads files it already read. It fixes a failing test by reintroducing a bug the two of you fixed an hour ago. The model did not get worse. Its context did: 170 thousand tokens of file dumps, test logs, failed attempts and superseded plans, with your original constraints somewhere in the middle.

A model has no memory between calls. Every decision is computed from the tokens in the context window at that moment, and nothing else. Everything the agent knows about your repository is what has been read into that window during this session, plus the memory files loaded at the start. So managing that window is not an optimisation. Once the spec is written, it is the main lever you have on quality, and also on cost, because the window is resent on every iteration.

Three ideas. What fills the window and what it really costs. Why quality drops long before the window is full. And the tools for keeping knowledge out of the transcript: entry points, handoff notes and subagents.

## What fills the window

On every call, the harness sends its own system prompt and tool definitions, the schemas of any connected MCP tools, the memory files, your messages, and every tool call and every tool result so far: each file read, each grep, each test log.

Take a plausible budget for an ordinary bug fix, against a 200 thousand token window. The harness prompt and built-in tools: about 12 thousand. Two MCP servers with 40 tools, loaded eagerly: 8 thousand. Fifteen file reads at about 3 thousand each: 45 thousand. Six test runs: 24 thousand. And one full CI log pasted in: 40 thousand. That single pasted log costs nearly as much as all fifteen file reads, and almost all of it is irrelevant.

A rule of thumb for estimating: roughly four characters per token for English prose, often three to four for code. So a 400-line source file is about 4 to 5 thousand tokens.

## The cost is the sum, not the size

Here is the part people miss. The window is resent on every iteration, so the cost of a session is not the size of the transcript. It is the sum of its sizes over every call.

The lesson traces an eight-iteration bug fix. The final transcript is about 44 thousand tokens. Before I give you the number: how many input tokens did the model process to get there?

[pause]

About 200 thousand. Every call resends everything so far, and with a growing transcript the total grows roughly with the square of the number of iterations.

Prompt caching softens the bill. The serving system can reuse the work of processing a prefix it has seen before, as long as that prefix is byte-for-byte identical. Already-seen tokens are billed as a cache read at a tenth of the input rate on most models, and only the new tail is a cache write, at one and a quarter times. In the trace, that cut the bill to about a third, from about 200 thousand to about 65 thousand. The first call is actually more expensive with caching, because it writes the whole prefix.

Two rules follow from "byte-for-byte prefix". Order matters: the stable part must come first and must not change. This repository's own AI client puts the system prompt first with a cache breakpoint, and the volatile context, the current lesson and the learner's code, after it, with a unit test asserting exactly that. Change one byte early in the prefix and every byte after it misses. And anything that changes the prefix invalidates the cache: switching model, changing the effort level on most models, adding an MCP server whose tools load eagerly, or compacting the conversation. Editing source files does not; nothing in the prompt changes until a tool reads them.

One more lesson from the trace. Iteration 7 ran the full test suite with verbose output, and that output is paid for on iteration 8 and every iteration after it. Had it run one test quietly, iteration 8 would have cost about 5 thousand billed tokens instead of about 15 and a half thousand. And notice that nothing in the trace removes anything. The transcript only grows. The only ways down are compaction, a fresh session, or delegation to a subagent.

Caching changes cost and latency. It does nothing for the other problem: the model still has to attend over all of it.

## Context rot

The window does not have to be full for results to degrade. Four mechanisms.

Dilution. Your constraint "do not change the public API" is 12 tokens out of 160 thousand. The "Lost in the Middle" study, by Liu and colleagues in 2023, found that models use information at the start and end of a long input more reliably than information in the middle. Later evaluations show the same shape: finding one planted fact is easy, but reasoning over many scattered facts gets worse as the input grows.

Staleness. The agent read a file at iteration 5 and has edited it three times since. The old contents are still in the transcript, and unless it re-reads the file, it may reason from a version that no longer exists.

Poisoning by failed attempts. A wrong hypothesis explored for twenty minutes stays in context, with the code written for it, and keeps pulling later decisions towards it.

And compaction losses. When the window fills, the harness replaces the history with a model-written summary. That summary keeps "we are adding rate limiting to exports" and can drop "the limiter must use the injected clock", the one detail that mattered.

The symptoms are recognisable: re-reading files it already has, asking questions you already answered, contradicting earlier decisions, reintroducing fixed bugs. When you see two of them, stop feeding the session and reset it.

If you do compact, two habits make it safe. Compact with instructions: say what to preserve, like the files changed, the failing tests by name, the hypotheses ruled out, and the constraints still in force. And compact at a boundary, after a green step and a commit, not halfway through a debugging thread, where the summary drops the thread.

## Getting the right context in

Code reaches the window three ways. Agentic search: the agent runs grep and reads files on demand. It is strong at exact identifiers and always reflects the current files, but weak at concepts without a searchable name, and every search costs an iteration. An embedding index: chunks of the codebase are embedded ahead of time, and the nearest ones are retrieved for a query. It shines on "where do we handle expired sessions?" when you do not know the function name. But it can be stale after edits, chunk boundaries split functions, and similar-looking code can outrank the relevant code, so confirm by reading what it returns. And explicit: you name the files and paste the exact error. Precise, but you need to know where to look.

The most effective habit combines them. Give the agent the entry points explicitly, the handler, the repository module and the failing test by name, and let search follow references from there. One sentence saves a dozen exploratory reads.

A repo map helps too: a compact outline of file paths and the key symbols in each. A 900-file service is on the order of 2.7 million tokens to read in full, far beyond any window. Its map might be around 8 thousand tokens, and it answers "which file should I open?" for most tasks. The hand-written equivalent is the architecture section of your memory file.

## Memory, handoffs and subagents

Three tools keep knowledge out of the transcript and somewhere it survives.

Memory files hold stable facts. They load at the start of every session, which is exactly where the model attends best, and they survive compaction. So a constraint that only exists in message 3 of 80 is in the worst position in the window and the first thing compaction drops. Put durable constraints in the memory file and restate task constraints at the top of the spec. Repeating a constraint in the chat does not relocate it; it is still in the middle.

Handoff notes carry state between sessions. When a session starts to rot, ask the agent to write one: what is done and verified, what is in progress, the constraints that still apply, how to run things, the next step. And one section people leave out: known failures and dead ends. That is the one that saves the most, because it stops the next session from re-exploring the hypothesis that poisoned this one. The next session reads a page instead of inheriting 150 thousand tokens of history.

Subagents isolate exploration. The main session delegates "find every place we compute refund amounts and summarise how they differ". The subagent reads 40 files, perhaps 120 thousand tokens, in its own window, and returns a 400-token summary. The main context grows by the summary, not the reading. The trade-off is that the summary is lossy. Delegate surveys and questions, never the decision.

And general hygiene. One task per session. Filter tool output before it enters: run one failing test quietly, not the whole suite verbosely, and put a tail on chatty commands. Paste the failing test's stack trace, not the CI log. Disconnect tools you are not using. Ask for a re-read before an edit when a file has changed.

## Two sessions, one bug

The bug: a pagination test fails intermittently when two orders share a timestamp.

Session A. You paste the full CI log, 40 thousand tokens. The agent reads 20 files looking for the pagination code, runs the whole suite eight times verbosely, and spends twenty minutes on a wrong hypothesis about database isolation levels. At around 150 thousand tokens, it changes the signature of the cursor-encoding function, violating the "no public API changes" constraint you gave in your second message. The constraint was still in the transcript. It was 140 thousand tokens away from where the model was looking, and the summed input over the session was on the order of two million tokens.

Session B. You extract the failing test's name and stack trace, 1,500 tokens. You name the entry points. The agent runs only that test, quietly, about 500 tokens a run. A subagent lists every caller of the cursor function and returns 400 tokens. When the fix is written, the context is around 35 thousand tokens and your constraints, restated in the spec, are near the top. The agent fixes the query to compare timestamp and ID together, and leaves the signature alone.

Same model, same bug, same tool. The difference is what was in the window.

## In the interview

A follow-up the lesson expects: a constraint you gave in message 3 is violated at message 75. Whose fault is it, and what do you change?

[pause]

The workflow's. The constraint sat in the middle of a long context and may have been dropped by compaction. It belongs in the spec at the top or in the memory file, and the session should have been reset at the first sign of rot. The common wrong answer is "the model disobeyed; I would repeat it in capitals."

And another: why does a session get more expensive per step as it goes on, and what does caching change? The whole transcript is resent on each call, so total input grows roughly quadratically with iterations. Caching bills the already-seen prefix at a tenth of the rate and the new tail at one and a quarter times, cutting the bill by a large factor, but not the attention cost.

## Recap

Four things to remember. The context window is the agent's entire world, and a session's cost is the sum over iterations, not the final size: 44 thousand tokens of transcript was about 200 thousand processed. Prompt caching needs a byte-identical prefix, so order prompts stable-first and avoid mid-task model switches. Quality rots before the window fills, through dilution, staleness, failed attempts and lossy compaction, so reset with a handoff note that records dead ends. And keep the window small on purpose: explicit entry points, filtered tool output, durable constraints in the memory file, and subagents for surveys, never decisions.

At your desk: the token budget table, the eight-iteration caching trace, the repo map generator and the handoff note template.
