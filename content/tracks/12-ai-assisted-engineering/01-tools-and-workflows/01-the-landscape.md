---
slug: the-landscape
title: "The AI coding tool landscape: completion, agents and background workers"
description: What Claude Code, OpenAI Codex, GitHub Copilot, Cursor and Gemini CLI actually are, sorted into the three harness categories that matter, and how to choose and evaluate them on real work.
minutes: 25
difficulty: easy
tags: [ai-tools, coding-agents, claude-code, codex, copilot, cursor, gemini-cli]
---
Your director asks you to recommend "the AI coding tool" for a 40-person engineering org. Five names come up in the first minute: Claude Code, OpenAI Codex, GitHub Copilot, Cursor and Gemini CLI. Every vendor page promises agents, deep codebase context and enterprise-grade security, and every feature list changes monthly. A comparison by feature will be stale before your recommendation is approved.

The comparison that lasts is by mechanism. Each of these products is a language model plus a **harness**: the program that decides what context the model sees, which tools it may call, where those tools run, and how much it may do before a human looks. The model writes the code; the harness decides whether that code appears as a grey suggestion at your cursor, a diff in your terminal waiting for approval, or a pull request that arrived while you were asleep. Learn the harness categories and you can place any new tool, including ones that do not exist yet, in thirty seconds.

## One model, three harnesses

A language model does one thing: given a sequence of tokens, it predicts the next one. There are two ways to turn that into a coding tool.

- **Completion.** Show the model the code around your cursor and ask it to continue. The output is text; nothing runs.
- **Agent.** Put the model in a loop. It reads a task, decides to call a tool (search the repo, read a file, edit a file, run the tests), the harness executes the call and appends the result, and the model decides again. The loop ends when the model answers instead of calling a tool.

Step through the loop once. The tools here are a pull-request API and a clock; in a coding agent they are `read_file`, `grep`, `edit_file` and `run_command`, but the mechanics are identical.

```viz
{"type": "ml", "scenario": "agent-loop", "text": "How many open PRs are older than 7 days?", "title": "The loop inside every coding agent", "caption": "The model only decides; the harness executes. Every tool result is appended to the transcript, which is why long sessions get slower, more expensive and less focused. Swap list_prs and today for grep, edit_file and run_tests and this is a coding agent."}
```

The agent loop splits into two deployment styles, which gives three categories:

| Category | You interact by | Time per step | Context comes from | Autonomy | Examples |
|---|---|---|---|---|---|
| **Inline completion** | Typing; Tab to accept | Hundreds of milliseconds | Code around the cursor, open files, recent edits | None: it suggests text | Copilot inline suggestions, Cursor Tab |
| **Interactive agent** (terminal or IDE) | Giving a task, approving actions, watching | Seconds per step, minutes per task | The agent searches and reads files itself, plus memory files and your messages | Edits files and runs commands on your machine, gated by permissions | Claude Code, Codex CLI, Gemini CLI, Cursor's agent, Copilot agent mode |
| **Cloud / background agent** | Assigning a task or issue; reviewing a PR | Minutes to an hour, unattended | A fresh clone in a remote sandbox, setup scripts, memory files | Works alone inside a sandbox; output is a branch or pull request | Codex cloud tasks, Copilot coding agent, Cursor background agents, Claude Code in CI or on the web |

### Inline completion

The harness sends the model a *prefix* (code before the cursor) and a *suffix* (code after it) and asks for the middle; this is called fill-in-the-middle. The latency budget is brutal: a suggestion that arrives after you have typed the next word is useless, so completion uses fast models and small prompts, typically a few thousand tokens chosen by heuristics such as open tabs and recently edited code. Newer variants predict your next *edit* anywhere nearby, not just the next characters.

Completion never runs your code, so it cannot know whether the suggestion compiles. It is excellent at the next 1–20 lines when intent is obvious from surroundings: the fourth test case that follows the pattern of the first three, a mapping function between two structs, the body of a loop you just named. Its failure mode is subtle: it continues the pattern it sees, including a wrong one, and you accept it at typing speed, so review happens at typing speed too.

### Interactive agents

Here the model gets feedback from reality. It runs the compiler, reads the error, fixes the import, reruns the tests. That feedback is the whole reason agents can complete multi-file tasks, and it is also why they can go further wrong: forty iterations of confident edits, each individually plausible. The mechanics of the loop, tool schemas and guardrails are covered in [Agents](/learn/ai-and-llms/building-with-llms/agents); this track is about operating one.

Terminal agents (Claude Code, Codex CLI, Gemini CLI) run in your shell with your environment and your credentials. IDE agents (Cursor's agent, Copilot's agent mode in VS Code) show diffs inline in the editor. The distinction is mostly UI now: the terminal agents ship IDE extensions, and the IDE agents run terminal commands.

### Cloud and background agents

Same loop, different place. The task (a prompt, an issue, a chat message) starts a remote container or VM with a fresh clone of your repository; the agent works unattended and hands back a branch or a pull request. Three consequences follow:

1. **Parallelism.** You can run five tasks at once without five terminal windows fighting over one working tree.
2. **Isolation.** The sandbox does not have your laptop's SSH keys, cloud credentials or `.env` file unless you put them there. That is a security feature; keep it.
3. **Reproducibility becomes mandatory.** If your repository cannot be built and tested from a clean checkout with one documented command, a background agent will spend its budget failing to install dependencies. Teams that adopt cloud agents usually discover how much of their build lived in someone's head.

You also review cold. With an interactive agent you watched the reasoning; with a background agent you get a diff and a summary, and the summary is written by the same model that wrote the diff.

## The five tools, as publicly documented

These descriptions follow each vendor's public documentation at the time of writing. All five ship changes monthly, so verify specifics against current docs before a team decision. What has been stable is the category each tool sits in and the conventions they share: memory files, MCP, and permission prompts.

### Claude Code (Anthropic)

A terminal-first agent, with IDE integrations and options to run it on the web and in CI. It reads project instructions from `CLAUDE.md` files (a repository-level file, a personal one in your home directory, and ones in subdirectories), and `/init` generates a starter file by reading the repository. Permissions are explicit: by default it asks before editing files or running commands, and allow, ask and deny rules in settings files can pre-approve safe commands or block paths such as `.env`. It has a plan mode that proposes an approach without editing, hooks that run your own scripts at points in the loop (for example, before a tool call, with the ability to block it), subagents for delegating work to a separate context, MCP for integrations, and a non-interactive mode (`claude -p`) for scripts and CI.

### OpenAI Codex

OpenAI uses the Codex name for a family of agent products: an open-source command-line agent, an IDE extension, and a cloud agent that runs tasks in sandboxed containers and proposes changes as diffs or pull requests. (The name was used earlier for the 2021 code model behind the original Copilot; the current products are agents.) Codex reads `AGENTS.md` files for project instructions. The CLI has configurable approval policies and a sandbox that can restrict writes to the workspace and block network access, and it supports MCP servers.

### GitHub Copilot

The tool that made inline completion mainstream, now spanning several categories: completions and next-edit suggestions in the editor, chat, an agent mode in VS Code and other IDEs, a coding agent you can assign a GitHub issue to (it works in a GitHub Actions-powered environment and opens a pull request for review), and AI code review on pull requests. Repository-wide instructions live in `.github/copilot-instructions.md`. It offers models from several vendors, supports MCP in agent mode, and has organisation-level controls such as excluding content from Copilot and blocking suggestions that match public code.

### Cursor

An editor built on a fork of VS Code, designed around AI. It has a Tab model that predicts multi-line edits, an agent that edits and runs commands inside the editor, and a codebase index built from embeddings for semantic search across the repository. Project rules live under `.cursor/rules`, it can read `AGENTS.md`, it supports MCP servers, and it offers background agents that run in remote environments.

### Gemini CLI (Google)

An open-source terminal agent backed by Google's long-context Gemini models. It reads `GEMINI.md` context files hierarchically (global, project, subdirectory), configures MCP servers in its `settings.json`, has built-in tools for files, shell commands, web fetch and Google Search grounding, and can run tools inside a sandbox.

| Tool | Primary surface | Instructions file | Extends via |
|---|---|---|---|
| Claude Code | Terminal, IDE, web, CI | `CLAUDE.md` | MCP, hooks, subagents, custom commands |
| OpenAI Codex | CLI, IDE extension, cloud | `AGENTS.md` | MCP |
| GitHub Copilot | IDE, GitHub.com | `.github/copilot-instructions.md` | MCP (agent mode), GitHub integrations |
| Cursor | Its own editor, background agents | `.cursor/rules`, `AGENTS.md` | MCP |
| Gemini CLI | Terminal | `GEMINI.md` | MCP |

Notice the convergence. Every tool now has an agent loop, a memory file, MCP support and a permission model. The differentiators that remain are model quality on your codebase, harness quality (how well it searches, how it recovers from errors, how it manages context), where the agent can run, and the data terms your company signs.

## Matching tasks to categories

The practical question is not "which tool" but "which category, for which task".

| Task | Best fit | Why |
|---|---|---|
| Finish the function you are writing | Inline completion | Intent is local and obvious; latency matters |
| Fix a failing test you can reproduce locally | Interactive agent | Needs your environment and a tight run-fix loop you can watch |
| Add an endpoint with validation, handler, tests and docs | Interactive agent, plan first | Multi-file, but one concern; reviewable in one sitting |
| Upgrade a dependency across 12 independent packages | Background agents, one per package | Parallel, isolated, each PR reviewable alone |
| Explore an unfamiliar codebase ("where is auth enforced?") | Interactive agent in read-only mode | Search and summarise; nothing should change |
| Choose between two architectures | You, with chat as a sparring partner | The output is a decision you own, not code |

### Worked example: a 212-call-site migration

Your service has 212 calls to `legacy_client.fetch(url, timeout_s)` across 61 files, and they must move to `http.get(url, timeout=Timeout(total=timeout_s))`. Three ways to do it:

- **By hand**, at about 5 minutes per file including a test run, it is roughly 5 hours of dull, error-prone work.
- **One big agent task** ("migrate all calls") takes perhaps 20 minutes of agent time and produces a 61-file diff. Reviewing 61 files of near-identical edits properly takes close to an hour, and reviewers skim identical-looking hunks, which is exactly where the one call that passed `timeout_s=None` hides.
- **Ask the agent for a codemod.** A 60-line script using your language's AST tooling that rewrites the call pattern and prints every site it could not handle. You review 60 lines of deterministic code, run it, review the list of exceptions by hand, and spot-check the diff. Total: about 45 minutes, and the review effort went into the part that deserves it.

The senior move is to turn a large nondeterministic edit into a small deterministic program. Agents are good at writing codemods, and a codemod is far easier to trust than a model's 212 independent decisions.

## Choosing for a team

Evaluate on the criteria that will still matter next year:

1. **Data handling.** Where code and prompts go, how long they are retained, whether they are used for training, which region processes them, and what your contract (not the marketing page) says. Consumer and enterprise terms often differ.
2. **Permission and sandbox model.** What can the agent do without asking? Is there an operating-system-level sandbox or only prompts? Can you block network egress?
3. **Context mechanism.** Agentic search (grep and read on demand) is always fresh; an embedding index finds concepts but can be stale. Which one does the tool use, and can you shape it with memory files?
4. **Integration.** Version control, CI, issue tracker, MCP servers for your internal systems.
5. **Model choice and portability.** Can you switch models? Are your instructions in a format other tools read, such as `AGENTS.md`?
6. **Cost model.** Seats versus tokens. Agents consume far more tokens than completion, because every loop iteration resends the growing transcript; a runaway background agent is a line on an invoice.
7. **Administration.** Single sign-on, audit logs, usage reporting, policy controls.

Then run a bake-off on your own work. Pick 10–20 tickets your team already closed, spanning a bug fix, a small feature, a refactor and some test writing. Replay each with each candidate and record: merged as-is, merged after edits, or discarded; reviewer minutes; defects found afterwards; cost. Do not measure lines generated or suggestions accepted. Those numbers go up when the tool is verbose, and a metric that rewards verbosity will get it.

## Failure modes every tool shares

Whatever you pick, expect these, because they come from how models and harnesses work, not from a bug a vendor will fix next quarter:

- **Invented APIs.** Functions, flags and config keys that look right and do not exist, or existed two major versions ago.
- **Solving a nearby problem.** The code satisfies the test you gave and misses the requirement you did not write down.
- **Gaming verification.** Weakening an assertion, skipping a test or catching and swallowing an exception to make the check go green.
- **Over-editing.** Reformatting files, refactoring adjacent code, adding a dependency you did not ask for.
- **Context rot.** Long sessions drift: earlier constraints get ignored and stale file contents get trusted.

The rest of this module is the workflow that contains them: [plan, implement, verify](/learn/ai-assisted-engineering/tools-and-workflows/agentic-coding-workflow), [specs](/learn/ai-assisted-engineering/tools-and-workflows/writing-effective-specs), [context](/learn/ai-assisted-engineering/tools-and-workflows/context-management), [integrations](/learn/ai-assisted-engineering/tools-and-workflows/mcp-and-integrations), [verification](/learn/ai-assisted-engineering/tools-and-workflows/verifying-ai-code) and [policy](/learn/ai-assisted-engineering/tools-and-workflows/ai-tool-security-and-policy).

## Senior signals

- You describe tools by **harness category** (completion, interactive agent, background agent) and can place a new product in one within a minute.
- You match **task to category**: completion for local intent, an interactive agent for tight run-fix loops, background agents for parallel, independent, reviewable units.
- You turn big mechanical edits into **codemods** so the thing you review is a small deterministic program.
- You evaluate tools by **replaying closed tickets** and measuring accepted diffs, review time and later defects, never lines generated.
- You know background agents require a **reproducible build from a clean checkout**, and you treat that as a feature of the codebase.
- You read the **data terms and permission model** before the benchmark results.

## Check yourself

```quiz
- q: >-
    Your repository needs three undocumented manual steps (a local certificate, a seeded database, a private package mirror) before tests pass. Which category of tool will struggle most?
  options: ["Inline completion", "An interactive terminal agent on your laptop", "A cloud or background agent", "All three equally"]
  answer: 2
  explanation: >-
    A background agent starts from a fresh clone in a remote sandbox and cannot ask you how to set up the environment, so it burns its budget failing to build. Completion never runs code, and an interactive agent runs in your already-configured environment.
- q: >-
    Why do inline completion tools use small prompts and fast models rather than the largest model with the whole repository in context?
  options: ["Large models cannot do fill-in-the-middle", "The suggestion must arrive within hundreds of milliseconds or it is useless", "Repositories are too large to tokenize", "Completion tools are not allowed to read other files"]
  answer: 1
  explanation: >-
    Completion competes with your typing speed. A better suggestion that arrives after you have typed the next word has no value, so the harness trades context size and model size for latency.
- q: >-
    You must migrate 212 call sites across 61 files to a new HTTP client. Which approach gives the most trustworthy result for the review effort?
  options: ["One agent task to edit all 61 files, then review the diff", "Ask the agent to write a codemod script, review the script, run it, and hand-check the sites it reports it could not handle", "Use inline completion file by file", "Split into 61 background agent tasks, one per file"]
  answer: 1
  explanation: >-
    A codemod turns 212 independent model decisions into one small deterministic program you can read. A 61-file diff of near-identical hunks invites skimming, and 61 separate PRs multiply review overhead without making any single edit easier to trust.
- q: >-
    Which bake-off metric is most likely to mislead you when comparing AI coding tools?
  options: ["Share of diffs merged without edits", "Reviewer minutes per merged change", "Lines of code generated per engineer", "Defects traced to AI-authored changes in the following month"]
  answer: 2
  explanation: >-
    Lines generated rewards verbosity: a tool that writes more code scores higher even if the code needs more review and causes more bugs. The other three measure accepted value, cost of review and downstream quality.
- q: >-
    What is the core capability an interactive agent has that inline completion does not?
  options: ["It uses a larger model", "It can call tools such as the compiler and test runner, read the results and iterate", "It never hallucinates APIs", "It works without network access"]
  answer: 1
  explanation: >-
    The loop with tool feedback is the difference: the agent sees compiler errors and test output and corrects itself. Model size varies by product, agents still invent APIs, and both need network access to a hosted model unless you run one locally.
```
