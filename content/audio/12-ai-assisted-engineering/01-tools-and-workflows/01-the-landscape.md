---
lesson: the-landscape
source: c0a9a3b768f8ac85
fit: great
desk:
  - "The agent-loop visualisation and the twelve-step iteration table"
  - "Run the sixty-line harness and read its output"
  - "The five-tool comparison table: instruction files, permission models, sandboxes"
---
## Introduction

Your director asks you to recommend "the AI coding tool" for a 40-person engineering org. Five names come up in the first minute: Claude Code, OpenAI Codex, GitHub Copilot, Cursor and Gemini CLI. Every vendor page promises agents, deep codebase context and enterprise-grade security, and every feature list changes monthly. A comparison by feature will be stale before your recommendation is approved.

The comparison that lasts is by mechanism. Each of these products is a language model plus a harness: the program that decides what context the model sees, which tools it may call, where those tools run, and how much it may do before a human looks. The model writes the code. The harness decides whether that code appears as a grey suggestion at your cursor, a diff in your terminal waiting for approval, or a pull request that arrived while you were asleep.

Three ideas, then. What the model does and what the harness does, traced through one iteration. The three categories of harness, and which tasks belong to each. And how to choose a tool for a team in a way that still holds next year.

## One iteration, by hand

A language model does one thing: given a sequence of tokens, it predicts the next one. There are two ways to turn that into a coding tool. Completion shows the model the code around your cursor and asks it to continue. The output is text, and nothing runs. An agent puts the model in a loop. It reads a task, decides to call a tool, like search the repo, read a file, edit a file or run the tests. The harness executes the call and appends the result, and the model decides again. The loop ends when the model answers instead of calling a tool.

Walk through one iteration of a terminal agent fixing a bug. You type the task: the page count drops a partial page, fix it. The harness assembles a request: the system prompt, the tool definitions, the memory file and your message. Call that fixed prefix about 14 thousand tokens. The model does not run anything. It emits a structured tool call: grep for the words "per page".

Now the harness acts. It checks its permission rules, finds that grep is pre-approved, runs it, and appends the six matching lines to the transcript. The model decides again, now with those lines in view, and asks to read the file. Reads are pre-approved too, so the file is appended. Then the model proposes an edit. Edits are not pre-approved, so the harness shows you the diff and waits. You approve. The edit is applied, the model asks to run the tests, that command matches an allow rule, and the output says one passed. The model answers in prose instead of calling a tool, and the loop ends.

Two things to notice. Between the model's request and the result, the model did nothing. It produced a request, and the harness decided whether to honour it. Every enforcement point is on the harness side. And every request resends everything before it: 14 thousand tokens, then 14 thousand 250, then 14 thousand 700. The sum over a session grows much faster than the transcript does, which is why harnesses rely on prompt caching to keep it affordable.

The lesson also builds a working harness in sixty lines, with four tools and a permission table, and a scripted model in place of the real one. In its run, the model asks to read the environment file with the database password, and a deny rule refuses it. Here is the catch. That deny rule is string matching on the tool call. A shell command that prints the same file would have passed it, and no parser can follow every program that opens a file, like a Python one-liner or a build script. That is why real harnesses add an operating-system sandbox underneath the pattern rules.

## The three categories

The agent loop splits into two deployment styles, which gives three categories in all.

First, inline completion. You type and press Tab to accept. The harness sends the code before the cursor and the code after it, and asks for the middle; this is called fill-in-the-middle. The latency budget is brutal: a few hundred milliseconds. A suggestion that arrives after you have typed the next word is useless. So completion uses fast models and small prompts, a few thousand tokens chosen by heuristics such as open tabs and recent edits. That is why it cannot see your whole repository, and why it is wrong in ways that depend on which tabs you had open.

Completion never runs your code, so it cannot know whether the suggestion compiles. It is excellent at the next one to 20 lines when intent is obvious: the fourth test case that follows the first three. Its failure mode is subtle. It continues the pattern it sees, including a wrong one, and you accept it at typing speed, so review happens at typing speed too.

Second, the interactive agent, in a terminal or an IDE. Claude Code, Codex CLI, Gemini CLI, Cursor's agent, Copilot's agent mode. Here the model gets feedback from reality. It runs the compiler, reads the error, fixes the import, reruns the tests. That feedback is why agents can finish multi-file tasks, and also why they can go further wrong: forty iterations of confident edits, each individually plausible. A terminal agent runs in your shell, with your environment and your credentials. Whatever your shell can read, its shell tool can read too, unless the harness adds a sandbox.

Third, the cloud or background agent. Same loop, different place. A task starts a remote container with a fresh clone of your repository, the agent works unattended, and you get back a branch or a pull request. Three consequences. Parallelism: five tasks at once without five terminals fighting over one working tree. Isolation: the sandbox does not have your laptop's keys or credentials unless you put them there, and that is a security feature worth keeping. And reproducibility becomes mandatory.

Before I explain that last one: a team adopts cloud agents. What breaks first?

[pause]

The build. A cloud agent starts from a clean clone and cannot ask you how to set up the environment. If your repository cannot be built and tested from a clean checkout with one documented command, the agent spends its budget failing to install dependencies. Teams that adopt cloud agents discover how much of their build lived in someone's head. And you review cold: you get a diff and a summary, and the summary was written by the same model that wrote the diff.

## The five tools, and the convergence

Placed by category: Claude Code is terminal-first, with IDE, web and CI versions. OpenAI Codex is a family: a command-line agent, an IDE extension and a cloud agent. GitHub Copilot made inline completion mainstream and now spans every category, including a cloud agent you can assign an issue to. Cursor is an editor built around AI, with a Tab model, an agent and cloud agents. Gemini CLI is an open-source terminal agent.

The specifics, the instruction file names, the permission modes, the sandbox technology, change monthly, so check current documentation before a team decision. What matters more is the convergence. Every one of these tools now has an agent loop, an instruction file, support for MCP, the Model Context Protocol, a permission model and hooks. And AGENTS.md has become the neutral instruction file: most of these tools read it or can be pointed at it.

So the differentiators that remain are four. Model quality on your codebase. Harness quality: search, error recovery, context management. Where the agent can run. And the data terms your company signs.

## Matching tasks to categories

The practical question is not "which tool" but "which category, for which task". Finish the function you are writing: inline completion, because intent is local and latency matters. Fix a failing test you can reproduce: an interactive agent, because it needs your environment and a tight run-fix loop you can watch. Upgrade a dependency across 12 independent packages: background agents, one per package, each pull request reviewable alone. Explore an unfamiliar codebase: an interactive agent in read-only mode, because nothing should change. Choose between two architectures: you, with chat as a sparring partner, because the output is a decision you own.

Now the worked example. Your service has 212 calls to a legacy HTTP client across 61 files, and they must move to a new one. Which approach gives the most trustworthy result for the review effort?

[pause]

By hand, at about five minutes a file, it is roughly five hours of dull, error-prone work. One big agent task takes perhaps 20 minutes and hands you a 61-file diff. Reviewing that properly takes close to an hour, and reviewers skim identical-looking hunks, which is exactly where the one call that passed no timeout hides.

The third way: ask the agent for a codemod. A 60-line script using your language's syntax-tree tooling, which rewrites the call pattern and prints every site it could not handle. You review 60 lines of deterministic code, run it, check the exceptions by hand, and spot-check the diff. About 45 minutes in total, with the review effort on the part that deserves it. The senior move is to turn a large nondeterministic edit into a small deterministic program. A codemod is far easier to trust than 212 independent model decisions.

## Choosing for a team, and what every tool gets wrong

Evaluate on criteria that will still matter next year. Data handling: where code and prompts go, retention, training use, and what your contract says, not the marketing page. The permission and sandbox model: what can the agent do without asking, is there an operating-system sandbox or only prompts and pattern rules, can you block network egress. Context mechanism, integration, model portability, administration. And the cost model: seats versus tokens. Agents consume far more tokens than completion, because every iteration resends the growing transcript, and a runaway background agent is a line on an invoice.

Then run a bake-off on your own work. Pick 10 to 20 closed tickets: a bug fix, a small feature, a refactor, some test writing. Replay each with each candidate and record whether it merged as-is, merged after edits, or was discarded, plus reviewer minutes, defects found afterwards, and cost. Do not measure lines generated or suggestions accepted. Those rise when the tool is verbose, and a metric that rewards verbosity will get it.

Whatever you pick, expect a set of failures that come from how models and harnesses work, not from a bug a vendor will fix next quarter. Invented APIs: a function or flag that looks right and does not exist in your pinned version; the fix is a type checker and compile step in the loop. Solving a nearby problem: the tests pass and the requirement you did not write down is missed. Verification gaming: a green check, and the diff shows a loosened assertion or a skipped test, so review the test diff first. Over-editing: files reformatted and a dependency added that nobody asked for. And context rot: late in a long session, the agent contradicts earlier decisions and reintroduces a fixed bug. The rest of this module is the workflow that contains them.

## In the interview

A classic follow-up: in an agent loop, what does the model do and what does the harness do?

[pause]

The model reads the transcript and emits prose or a structured tool call. The harness assembles the prompt, validates the call, applies permissions, executes the tool, appends the observation and decides when to stop. Every enforcement point is on the harness side. The common wrong answer is "the model runs the tests", which confuses a request with an execution.

And a sharper one: what is the difference between a deny rule on reading the environment file, and a sandbox that hides the file? The rule is string matching on one tool call. Even a harness that also checks the obvious shell command cannot see a Python one-liner that opens the same file. A sandbox, or a container without the file, is enforced by the operating system whatever the model asks. The wrong answer treats the rule as sufficient because "the agent respects its settings".

## Recap

Four things to remember. Every AI coding tool is a model plus a harness, and the model only requests; the harness decides and acts. There are three categories: completion for local intent at typing speed, interactive agents for tight run-fix loops in your environment, background agents for parallel, isolated units, which need a build that works from a clean checkout. Turn big mechanical edits into a codemod, so what you review is a small deterministic program. And choose tools by data terms, permission model and sandbox, then a bake-off on your own closed tickets, never lines generated.

At your desk: the agent-loop visualisation and the iteration table, the sixty-line harness to run yourself, and the five-tool comparison table.
