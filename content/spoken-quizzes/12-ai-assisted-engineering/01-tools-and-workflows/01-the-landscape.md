---
lesson: the-landscape
source: 72f607a3a341e961
---
## 1

Your repository needs three undocumented manual steps before tests pass: a local certificate, a seeded database, and a private package mirror. Which category of tool will struggle most?

A, a cloud or background agent, since it starts from a fresh clone. B, all three equally, since none of them can create a local certificate. C, inline completion, since it only sees the code around the cursor. D, an interactive terminal agent, since it runs the tests itself.

[think]

The answer is A: a cloud or background agent, since it starts from a fresh clone.

A background agent starts from a fresh clone in a remote sandbox, and cannot ask you how to set up the environment, so it burns its budget failing to build. Completion never runs code. An interactive agent does run the tests, but in your already-configured environment, where the certificate, the database and the mirror exist.

## 2

In the agent loop, the model emits a call to delete a directory. Which component decides whether the deletion happens?

A, the model, which checks its own instructions before emitting the call. B, the operating system, which refuses deletions requested by AI processes. C, the MCP server, which validates every call against its schema first. D, the harness, which applies permission rules or asks you before executing.

[think]

The answer is D: the harness, which applies permission rules or asks you before executing.

The model only produces a structured request. The harness validates it, runs it through allow, ask and deny rules, or a prompt to the human, and only then executes it, and a sandbox underneath can refuse regardless. The operating system has no notion of an AI process, and an MCP server only sees calls the harness has already decided to forward.

## 3

Why do inline completion tools use small prompts and fast models, rather than the largest model with the whole repository in context?

A, whole repositories exceed any model's context window, so they cannot be sent. B, large models cannot fill in the middle, only generate left to right. C, the suggestion must arrive within hundreds of milliseconds to be useful. D, completion tools are not permitted to read files other than the open one.

[think]

The answer is C: the suggestion must arrive within hundreds of milliseconds to be useful.

Completion competes with your typing speed. A better suggestion that arrives after you have typed the next word has no value, so the harness trades context size and model size for latency. Context limits are real, but not the reason: completion deliberately sends a few thousand tokens, even when far more would fit.

## 4

You must migrate 212 call sites across 61 files to a new HTTP client. Which approach gives the most trustworthy result for the review effort?

A, inline completion file by file, so you review each edit as you accept it. B, one agent task that edits all 61 files, then a careful review of the full diff. C, have the agent write a codemod, review the script, and hand-check the sites it skips. D, 61 background agent tasks, one per file, each reviewed as its own pull request.

[think]

The answer is C: have the agent write a codemod, review the script, and hand-check the sites it skips.

A codemod turns 212 independent model decisions into one small, deterministic program you can read. You then run it, and hand-check the sites it reports it could not handle. A 61-file diff of near-identical changes invites skimming, and 61 separate pull requests multiply review overhead without making any single edit easier to trust.

## 5

A harness has a deny rule on reading the environment file. The agent then runs a Python one-liner that opens that file through its shell tool, and the contents appear in the transcript. What went wrong?

A, pattern rules match strings; only a sandbox, or a missing file, stops every read path. B, the model deliberately worked around the rule, which counts as a model bug. C, the deny rule was written in the wrong settings file, so it never loaded. D, shell tools bypass permissions by design, so shell access should be removed.

[think]

The answer is A: pattern rules match strings. Only a sandbox, or a missing file, stops every read path.

A rule on the read tool says nothing about a shell command that reads the same file; pattern rules narrow the honest paths, but do not close the others. Enforcement that holds on every path is the operating-system sandbox, or an environment where the secret is not present. Shell tools are gated too, by their own rules; the gap is between rule scope and file access, not a bypass by design.

## 6

Which bake-off metric is most likely to mislead you when comparing AI coding tools?

A, reviewer minutes per merged change. B, defects traced to AI changes the next month. C, lines of code generated per engineer. D, the share of AI diffs merged without edits.

[think]

The answer is C: lines of code generated per engineer.

Lines generated rewards verbosity: a tool that writes more code scores higher, even if that code needs more review and causes more bugs. The other three measure accepted value, the cost of review, and downstream quality.
