---
slug: the-landscape
title: "The AI coding tool landscape: completion, agents and background workers"
description: What Claude Code, OpenAI Codex, GitHub Copilot, Cursor and Gemini CLI actually are, sorted into the three harness categories that matter, one agent iteration traced by hand, a working harness in sixty lines, the version-honest facts about each tool's instruction files, permission model and sandbox, and how to choose and evaluate them on real work.
minutes: 30
difficulty: easy
tags: [ai-tools, coding-agents, claude-code, codex, copilot, cursor, gemini-cli]
---
Your director asks you to recommend "the AI coding tool" for a 40-person engineering org. Five names come up in the first minute: Claude Code, OpenAI Codex, GitHub Copilot, Cursor and Gemini CLI. Every vendor page promises agents, deep codebase context and enterprise-grade security, and every feature list changes monthly. A comparison by feature will be stale before your recommendation is approved.

The comparison that lasts is by mechanism. Each of these products is a language model plus a **harness**: the program that decides what context the model sees, which tools it may call, where those tools run, and how much it may do before a human looks. The model writes the code; the harness decides whether that code appears as a grey suggestion at your cursor, a diff in your terminal waiting for approval, or a pull request that arrived while you were asleep. Learn the harness categories and you can place any new tool, including ones that do not exist yet, in thirty seconds. This lesson traces one iteration by hand, builds a harness in sixty lines so you can see which part decides and which part acts, then places the five tools with the facts that hold at the time of writing.

## One model, three harnesses

A language model does one thing: given a sequence of tokens, it predicts the next one. There are two ways to turn that into a coding tool.

- **Completion.** Show the model the code around your cursor and ask it to continue. The output is text; nothing runs.
- **Agent.** Put the model in a loop. It reads a task, decides to call a tool (search the repo, read a file, edit a file, run the tests), the harness executes the call and appends the result, and the model decides again. The loop ends when the model answers instead of calling a tool.

Step through the loop once. The tools here are a pull-request API and a clock; in a coding agent they are `read_file`, `grep`, `edit_file` and `run_command`, but the mechanics are identical.

```viz
{"type": "ml", "scenario": "agent-loop", "text": "How many open PRs are older than 7 days?", "title": "The loop inside every coding agent", "caption": "The model only decides; the harness executes. Every tool result is appended to the transcript, which is why long sessions get slower, more expensive and less focused. Swap list_prs and today for grep, edit_file and run_tests and this is a coding agent."}
```

### One iteration, by hand

Trace a terminal agent fixing a bug, with illustrative token counts (about four characters per token; the fixed prefix of system prompt, tool schemas and memory file is taken as 14,000 tokens):

| Step | Who acts | What happens | Tokens on the wire |
|---|---|---|---|
| 1 | You | Type the task: "total_pages drops a partial page; fix it" | +40 in the transcript |
| 2 | Harness | Assembles the request: system prompt, tool schemas, memory file, transcript so far | 14,040 sent |
| 3 | Model | Emits a structured tool call, not text: `{"tool": "Grep", "pattern": "per_page"}` | 30 out |
| 4 | Harness | Permission check: `Grep` matches an allow rule, so no prompt | 0 |
| 5 | Harness | Runs grep, captures 6 matching lines, appends them as an observation | +150 in the transcript |
| 6 | Model | Next decision, now with the grep results in context: `Read("paginate.py")` | 14,250 sent, 30 out |
| 7 | Harness | Read is pre-approved; the 40-line file is appended | +400 |
| 8 | Model | Proposes `Edit("paginate.py", old, new)` | 14,700 sent, 90 out |
| 9 | Harness | Edits are not pre-approved: shows you the diff and waits | 0 until you answer |
| 10 | You | Approve | |
| 11 | Harness | Applies the edit; the model proposes `Bash("pytest -q")`, which matches an allow rule; output appended | +60 |
| 12 | Model | Sees "1 passed", answers in prose instead of calling a tool; the loop ends | 14,800 sent |

Two things to notice. Between step 3 and step 5 the model did nothing: it produced a request, and the harness decided whether to honour it. And every "sent" figure includes everything before it, so the sum over a session grows much faster than the transcript; prompt caching (below) keeps that affordable. The loop, tool schemas and guardrails are covered in [Agents](/learn/ai-and-llms/building-with-llms/agents); this track is about operating one.

### The three categories

The agent loop splits into two deployment styles, which gives three categories:

| Category | You interact by | Time per step | Context comes from | Autonomy | Examples |
|---|---|---|---|---|---|
| **Inline completion** | Typing; Tab to accept | Hundreds of milliseconds | Code around the cursor, open files, recent edits | None: it suggests text | Copilot inline suggestions, Cursor Tab |
| **Interactive agent** (terminal or IDE) | Giving a task, approving actions, watching | Seconds per step, minutes per task | The agent searches and reads files itself, plus memory files and your messages | Edits files and runs commands on your machine, gated by permissions | Claude Code, Codex CLI, Gemini CLI, Cursor's agent, Copilot agent mode |
| **Cloud / background agent** | Assigning a task or issue; reviewing a PR | Minutes to an hour, unattended | A fresh clone in a remote sandbox, setup scripts, memory files | Works alone inside a sandbox; output is a branch or pull request | Codex cloud tasks, Copilot cloud agent, Cursor cloud agents, Claude Code in CI or on the web |

### Inline completion

The harness sends the model a *prefix* (code before the cursor) and a *suffix* (code after it) and asks for the middle; this is called fill-in-the-middle. The latency budget is brutal: a suggestion that arrives after you have typed the next word is useless, so completion uses fast models and small prompts, a few thousand tokens chosen by heuristics such as open tabs and recent edits. Newer variants predict your next *edit* anywhere nearby, not only the next characters.

Completion never runs your code, so it cannot know whether the suggestion compiles. It is excellent at the next 1–20 lines when intent is obvious from surroundings: the fourth test case that follows the first three, a mapping between two structs, the body of a loop you named. Its failure mode is subtle: it continues the pattern it sees, including a wrong one, and you accept it at typing speed, so review happens at typing speed too.

### Interactive agents

Here the model gets feedback from reality. It runs the compiler, reads the error, fixes the import, reruns the tests. That feedback is why agents can complete multi-file tasks, and also why they can go further wrong: forty iterations of confident edits, each individually plausible.

Terminal agents (Claude Code, Codex CLI, Gemini CLI) run in your shell with your environment and credentials. IDE agents (Cursor's agent, Copilot's agent mode in VS Code) show diffs inline in the editor. The distinction is mostly UI now: terminal agents ship IDE extensions, and IDE agents run terminal commands.

### Cloud and background agents

Same loop, different place. The task (a prompt, an issue, a chat message) starts a remote container or VM with a fresh clone of your repository; the agent works unattended and hands back a branch or a pull request. Three consequences follow:

1. **Parallelism.** You can run five tasks at once without five terminal windows fighting over one working tree.
2. **Isolation.** The sandbox does not have your laptop's SSH keys, cloud credentials or `.env` file unless you put them there. That is a security feature; keep it. At the time of writing, Codex's cloud tasks give secrets only to the setup script and remove them before the agent phase, with internet off by default; Copilot's cloud agent runs in GitHub Actions behind a firewall allowlist.
3. **Reproducibility becomes mandatory.** If your repository cannot be built and tested from a clean checkout with one documented command, a background agent spends its budget failing to install dependencies. Teams that adopt cloud agents discover how much of their build lived in someone's head.

You also review cold: with a background agent you get a diff and a summary, and the summary is written by the same model that wrote the diff.

## Under the hood

**Fill-in-the-middle.** A completion model is trained on prompts with three segments, the text before the cursor, the text after it, and a marker where the middle belongs, so it emits the middle rather than continuing from the end of the file. The harness adds snippets it judges relevant: the imports, the enclosing function, fragments from recently opened files with similar names. The prompt stays at a few thousand tokens because the budget is a few hundred milliseconds end to end and prefill cost is linear in prompt length. That is why completion cannot see your whole repository, and why it is wrong in ways that depend on which tabs you had open.

**The agent harness.** A terminal agent sends the model a system prompt, tool definitions (each a name, a description and a JSON schema for its arguments: read, grep, glob, edit, bash, and any MCP tools), the memory files, and the transcript. The reply is prose or a structured tool call. The harness validates the call against the schema, runs it through the permission layer (pre-approved, denied, or ask the human), executes it, and appends the observation. Nothing the model emits runs by itself. Because the request is resent every turn, harnesses rely on prompt caching, which bills an already-seen prefix at a fraction of the rate; [Context management](/learn/ai-assisted-engineering/tools-and-workflows/context-management) traces the arithmetic.

**Where it runs.** An interactive agent runs on your machine as you: whatever your shell can read and your credentials can do, its `bash` tool can too, unless the harness adds an operating-system sandbox. At the time of writing, Claude Code offers a sandboxed Bash tool (Seatbelt on macOS, seccomp on Linux, a network allowlist), and Codex runs commands under Seatbelt or bubblewrap plus seccomp with `read-only`, `workspace-write` and `danger-full-access` modes. A cloud agent runs elsewhere as a service identity, in a container built from your repository and a setup script, which is why it can be given nothing and still work.

## A harness in sixty lines

Every claim above is easier to believe after watching a harness run. This one has four tools, a permission table with allow and deny patterns, and a "model" that is a scripted list of tool calls, the only part you would replace with an API call. Run it as is.

```python
"""A coding-agent harness in about 60 lines. The 'model' is scripted; the
harness owns the transcript, the permission check and every tool call."""
import fnmatch, pathlib, subprocess

ROOT = pathlib.Path("./sandbox")
RULES = {"deny": ["Read(.env)", "Bash(rm *)"], "allow": ["Read(*)", "Grep(*)", "Bash(pytest*)"]}

def read_file(path):  return (ROOT / path).read_text()
def grep(pattern):    return "\n".join(f"{p.name}: {l.strip()}" for p in ROOT.glob("*.py")
                                       for l in p.read_text().splitlines() if pattern in l) or "(no matches)"
def edit_file(path, old, new):
    p = ROOT / path; text = p.read_text()
    if old not in text: raise ValueError(f"old text not found in {path}")
    p.write_text(text.replace(old, new, 1)); return f"edited {path}"
def bash(cmd):        return subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True).stdout.strip() or "(exit 0, no output)"
TOOLS = {"Read": read_file, "Grep": grep, "Edit": edit_file, "Bash": bash}

def permission(tool, args):
    """allow / deny / ask, by first matching rule. Edits fall through to 'ask'."""
    key = f"{tool}({args[0]})"
    for decision in ("deny", "allow"):
        if any(fnmatch.fnmatch(key, rule) for rule in RULES[decision]): return decision
    return "ask"

def fake_model(transcript):
    """Stands in for the LLM: returns the next tool call, or a final answer."""
    script = [("Grep", ("per_page",)), ("Read", (".env",)), ("Read", ("paginate.py",)),
              ("Edit", ("paginate.py", "len(items) // per_page", "-(-len(items) // per_page)")),
              ("Bash", ("pytest -q 2>/dev/null || python3 test_paginate.py",)), None]
    return script[sum(1 for line in transcript if line.startswith("assistant:"))]

def run(task, approve):
    transcript = [f"user: {task}"]
    while True:
        call = fake_model(transcript)
        tokens = sum(len(line) for line in transcript) // 4     # rough: 4 chars per token
        if call is None:
            print(f"[{tokens:>5} tok] assistant: done"); return
        tool, args = call
        transcript.append(f"assistant: {tool}{args}")
        decision = permission(tool, args)
        if decision == "ask": decision = "allow" if approve(tool, args) else "deny"
        if decision == "deny":
            obs = f"permission denied for {tool}{args}"
        else:
            try: obs = TOOLS[tool](*args)
            except Exception as e: obs = f"error: {e}"
        transcript.append(f"tool: {obs}")
        print(f"[{tokens:>5} tok] {tool}{args} -> {decision}: {obs[:60]!r}")

if __name__ == "__main__":
    ROOT.mkdir(exist_ok=True)
    (ROOT / ".env").write_text("DB_PASSWORD=hunter2\n")
    (ROOT / "paginate.py").write_text("def total_pages(items, per_page):\n    return len(items) // per_page\n")
    (ROOT / "test_paginate.py").write_text("from paginate import total_pages\nassert total_pages([1], 2) == 1\nprint('1 passed')\n")
    run("fix total_pages so a partial page counts", approve=lambda tool, args: print(f"  ? approve {tool}{args}") or True)
```

Output:

```text
[   11 tok] Grep('per_page',) -> allow: 'paginate.py: def total_pages(items, per_page):\npaginate.py: '
[   42 tok] Read('.env',) -> deny: "permission denied for Read('.env',)"
[   58 tok] Read('paginate.py',) -> allow: 'def total_pages(items, per_page):\n    return len(items) // p'
  ? approve Edit('paginate.py', 'len(items) // per_page', '-(-len(items) // per_page)')
[   84 tok] Edit('paginate.py', 'len(items) // per_page', '-(-len(items) // per_page)') -> allow: 'edited paginate.py'
[  112 tok] Bash('pytest -q 2>/dev/null || python3 test_paginate.py',) -> allow: '1 passed'
[  133 tok] assistant: done
```

The lines to read closely: the scripted model asked to read `.env` (models do explore configuration when debugging) and the harness refused because a deny rule matched, appending the refusal as an observation; the edit fell through to `ask` and ran only after the approve callback said yes; the token count on the left only grows. The deny rule is string matching on the tool call, the weakest of the layers described in [MCP and integrations](/learn/ai-assisted-engineering/tools-and-workflows/mcp-and-integrations): `Bash("cat .env")` would have passed it, which is why real harnesses add an operating-system sandbox underneath the pattern rules.

## The five tools, as publicly documented

These descriptions follow each vendor's public documentation at the time of writing (late 2026); all five ship changes monthly, so verify specifics before a team decision. What has been stable is each tool's category and the conventions they share: instruction files, MCP, permission prompts and hooks.

### Claude Code (Anthropic)

A terminal-first agent, with IDE integrations, a web version, a non-interactive mode (`claude -p`, with `--output-format json` for scripts) and an official GitHub Action. Project instructions live in `CLAUDE.md` (repository root or `.claude/CLAUDE.md`, a personal `~/.claude/CLAUDE.md`, an untracked `CLAUDE.local.md`), plus topic-scoped rules under `.claude/rules/` whose `paths:` front matter loads them only when matching files enter context; `/init` generates a starter. Permissions have two parts: a mode (the default asks before writes and non-read-only commands; `plan` restricts to reading; `acceptEdits` pre-approves file edits; `auto` lets a classifier model judge actions; `dontAsk` denies anything that would prompt; `bypassPermissions` disables checks and can be disabled organisation-wide) and allow, ask and deny rules such as `Bash(npm run test:*)`, `Read(./.env)` or `mcp__server__tool`. Hooks run your scripts at points in the loop (before a tool call, with the power to deny it; after; on session start; on stop) and receive the call as JSON. Subagents are Markdown files under `.claude/agents/` with their own tools and context window, skills are `SKILL.md` files invoked as slash commands, and an optional sandboxed Bash tool enforces filesystem and network boundaries at the operating-system level.

### OpenAI Codex

OpenAI uses the Codex name for a family of agent products: an open-source command-line agent, an IDE extension, and a cloud agent that runs tasks in sandboxed containers and proposes changes as diffs or pull requests. (The name was used earlier for the 2021 code model behind the original Copilot.) Codex reads `AGENTS.md`: a global one in `~/.codex/`, then one per directory from the project root down to the working directory, concatenated so the closest file comes last and overrides, up to a 32 KiB cap by default. Configuration is TOML (`~/.codex/config.toml`, plus `.codex/config.toml` in trusted projects) with `approval_policy` (`on-request`, `never`, or a granular table) and `sandbox_mode` (`read-only`, `workspace-write`, `danger-full-access`); `workspace-write` blocks network access unless you opt in. The sandbox is Seatbelt on macOS and bubblewrap plus seccomp on Linux. `codex exec` runs a task non-interactively in a read-only sandbox by default and can stream JSON events; `@codex review` in a pull request comment requests a review; MCP servers are `[mcp_servers.<name>]` tables.

### GitHub Copilot

The tool that made inline completion mainstream, now spanning every category: completions and next-edit suggestions, chat, an agent mode in VS Code and other IDEs, a standalone `copilot` command-line agent, a **Copilot cloud agent** (renamed from "coding agent" in 2026) that you assign a GitHub issue to and that works in an ephemeral GitHub Actions environment before opening a draft pull request, and Copilot code review. Repository-wide instructions live in `.github/copilot-instructions.md`; path-specific ones in `.github/instructions/*.instructions.md` with an `applyTo` glob; `AGENTS.md` files are read with the nearest taking precedence, and a root `CLAUDE.md` or `GEMINI.md` is accepted instead. The cloud agent's environment is prepared by a `copilot-setup-steps.yml` workflow behind a firewall allowlist, with MCP servers configured in repository settings. It offers models from several vendors. Organisation controls include content exclusion (Business and Enterprise plans; VS Code's edit and agent modes do not honour it at the time of writing) and a setting that blocks suggestions matching public code.

### Cursor

An editor built on a fork of VS Code, designed around AI. It has a Tab model that predicts multi-line edits, an agent with Agent, Ask, Plan and Debug modes, cloud agents (formerly "background agents") on isolated virtual machines, and Bugbot for pull-request review. Project rules live under `.cursor/rules/` as `.mdc` files whose front matter (`description`, `globs`, `alwaysApply`) selects one of four behaviours: always apply, apply when the agent judges it relevant, apply to files matching the globs, or apply only when mentioned; the single `.cursorrules` file is legacy. It also reads nested `AGENTS.md` files (closest wins) and `CLAUDE.md`; rules apply to the agent, not to Tab. MCP servers go in `.cursor/mcp.json`. On search, be careful what you repeat: earlier versions built an embedding index of the codebase, and at the time of writing Cursor's documentation says it does not upload code or store embeddings for search and describes grep-based search instead. Embedding indexes remain a real mechanism in other tools; check current docs before attributing one to any product.

### Gemini CLI (Google)

An open-source terminal agent backed by Google's long-context Gemini models. It reads `GEMINI.md` context files hierarchically (a global one in `~/.gemini/`, workspace files, and on-demand discovery in directories a tool touches), supports an `@file` import syntax, and can be pointed at `AGENTS.md` instead via `context.fileName`. Settings are JSON (`~/.gemini/settings.json`, project `.gemini/settings.json`) with `mcpServers` entries that can restrict tools per server. It has an `--approval-mode` (`default`, `auto_edit`, `plan`, `yolo`), a sandbox under Docker, Podman or macOS `sandbox-exec`, checkpointing that snapshots files into a shadow git repository so an edit can be restored, hooks, custom commands, and a headless `-p` mode with JSON output.

| Tool | Primary surface | Instruction files | Permission model | Isolation | Extends via |
|---|---|---|---|---|---|
| Claude Code | Terminal, IDE, web, CI | `CLAUDE.md`, `.claude/rules/`, `AGENTS.md` alongside | Modes plus allow/ask/deny rules | Optional sandboxed Bash (Seatbelt, seccomp, network allowlist) | MCP, hooks, subagents, skills |
| OpenAI Codex | CLI, IDE extension, cloud | `AGENTS.md`, nested, 32 KiB cap | `approval_policy` | `sandbox_mode`: Seatbelt, bubblewrap+seccomp; cloud containers | MCP, hooks, rules |
| GitHub Copilot | IDE, GitHub.com, CLI | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `AGENTS.md` | Per-tool approvals and auto-approve settings | Cloud agent in GitHub Actions behind a firewall | MCP, custom agents, skills, hooks |
| Cursor | Its own editor, cloud agents | `.cursor/rules/*.mdc`, `AGENTS.md`, `CLAUDE.md` | Approval modes in the agent and CLI | Cloud agents on isolated VMs | MCP, hooks |
| Gemini CLI | Terminal | `GEMINI.md` (or `AGENTS.md` via `context.fileName`) | `--approval-mode` | Docker, Podman, `sandbox-exec` | MCP, hooks, extensions, custom commands |

Notice the convergence. Every tool now has an agent loop, an instruction file, MCP support, a permission model and hooks. `AGENTS.md` has become the neutral format: since December 2025 it is stewarded by the Agentic AI Foundation under the Linux Foundation, and most tools above read it or can be pointed at it. The differentiators that remain are model quality on your codebase, harness quality (search, error recovery, context management), where the agent can run, and the data terms your company signs.

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

- **By hand**, at about 5 minutes per file including a test run: roughly 5 hours of dull, error-prone work.
- **One big agent task** ("migrate all calls") takes perhaps 20 minutes of agent time and produces a 61-file diff. Reviewing 61 files of near-identical edits properly takes close to an hour, and reviewers skim identical-looking hunks, which is where the one call that passed `timeout_s=None` hides.
- **Ask the agent for a codemod.** A 60-line script using your language's AST tooling that rewrites the call pattern and prints every site it could not handle. You review 60 lines of deterministic code, run it, check the exceptions by hand, and spot-check the diff. Total: about 45 minutes, with the review effort on the part that deserves it.

The senior move is to turn a large nondeterministic edit into a small deterministic program. Agents are good at writing codemods, and a codemod is far easier to trust than 212 independent model decisions. At Netflix scale, where one library change touches hundreds of services, the same instinct produces a codemod plus an automated rollout rather than hundreds of agent-written pull requests.

## Choosing for a team

Evaluate on the criteria that will still matter next year:

1. **Data handling.** Where code and prompts go, retention, training use, processing region, and what your contract (not the marketing page) says. Consumer and enterprise terms often differ.
2. **Permission and sandbox model.** What can the agent do without asking? Is there an operating-system sandbox or only prompts and pattern rules? Can you block network egress?
3. **Context mechanism.** Agentic search is always fresh; an embedding index, where a tool uses one, finds concepts but can be stale. Can you shape it with instruction files?
4. **Integration.** Version control, CI, issue tracker, MCP servers for your internal systems, hooks for your own checks.
5. **Model choice and portability.** Can you switch models? Are your instructions in a format other tools read, such as `AGENTS.md`?
6. **Cost model.** Seats versus tokens. Agents consume far more tokens than completion, because every iteration resends the growing transcript; a runaway background agent is a line on an invoice.
7. **Administration.** Single sign-on, audit logs, usage reporting, policy controls such as disabling the bypass mode.

Then run a bake-off on your own work. Pick 10–20 closed tickets spanning a bug fix, a small feature, a refactor and some test writing. Replay each with each candidate and record: merged as-is, merged after edits, or discarded; reviewer minutes; defects found afterwards; cost. Do not measure lines generated or suggestions accepted: those rise when the tool is verbose, and a metric that rewards verbosity will get it.

## Failure modes every tool shares

Whatever you pick, expect these; they come from how models and harnesses work, not from a bug a vendor will fix next quarter.

| Symptom | Diagnosis | Fix |
|---|---|---|
| The code calls a function, flag or config key that looks right and does not exist, or existed two major versions ago | Invented API: the most probable name from training data, not your pinned version | A type checker and compile step in the loop; pin versions and point the agent at the installed package's source; treat unfamiliar names as unverified |
| The tests you gave it pass; the requirement you did not write down is missed | Solving a nearby problem: the spec left a decision to the model's defaults | Checkable acceptance criteria naming the edge case; ask for the decisions the spec did not cover ([Writing effective specs](/learn/ai-assisted-engineering/tools-and-workflows/writing-effective-specs)) |
| Green check; the diff shows a loosened assertion, a skipped test or a swallowed exception | Verification gaming: the agent optimised the only signal it had | Review the test diff first; freeze tests with a hook during implementation ([The agentic coding loop](/learn/ai-assisted-engineering/tools-and-workflows/agentic-coding-workflow)) |
| Files reformatted, adjacent code refactored, a dependency added, none of it asked for | Over-editing: no non-goals and no path restrictions | Concrete non-goals, permission rules on paths, `git diff --stat` before reading anything |
| Late in a session the agent re-reads files, contradicts earlier decisions and reintroduces a fixed bug | Context rot: stale reads, failed attempts and a diluted constraint in a long transcript | Reset with a handoff note; constraints in the instruction file; filter tool output ([Context management](/learn/ai-assisted-engineering/tools-and-workflows/context-management)) |
| A background agent's pull request fails CI on dependency installation before touching the task | The build was never reproducible from a clean checkout | One documented build-and-test command, a setup script, secrets provided only to that script |

The rest of this module is the workflow that contains them: [plan, implement, verify](/learn/ai-assisted-engineering/tools-and-workflows/agentic-coding-workflow), [specs](/learn/ai-assisted-engineering/tools-and-workflows/writing-effective-specs), [context](/learn/ai-assisted-engineering/tools-and-workflows/context-management), [integrations](/learn/ai-assisted-engineering/tools-and-workflows/mcp-and-integrations), [verification](/learn/ai-assisted-engineering/tools-and-workflows/verifying-ai-code) and [policy](/learn/ai-assisted-engineering/tools-and-workflows/ai-tool-security-and-policy).

## Interviewer follow-ups

**"In an agent loop, what does the model do and what does the harness do?"** Model answer: the model reads the transcript and emits prose or a structured tool call; the harness assembles the prompt, validates the call, applies permissions, executes the tool, appends the observation and decides when to stop; every enforcement point is on the harness side. Common wrong answer: "the model runs the tests", which confuses a request with an execution.

**"Why do inline completion tools not send the whole repository?"** Model answer: the budget is a few hundred milliseconds end to end and prefill cost is linear in prompt length, so the harness sends a few thousand tokens chosen by heuristics; agents send far more because their budget is seconds per step. Common wrong answer: "the context window is too small", which is not the binding constraint.

**"A team wants to adopt cloud agents. What breaks first?"** Model answer: the build; a cloud agent starts from a clean clone in a container and needs one documented command plus a setup script with secrets scoped to it, so the first week goes on making the repository reproducible, which is worth doing anyway. Common wrong answer: "the model is not good enough", which skips the harness constraint that dominates.

**"What is the difference between a deny rule for `Read(.env)` and a sandbox that hides the file?"** Model answer: the rule is string matching on the tool call and does not stop `cat .env` through the shell tool; a sandbox or a container without the file is enforced by the operating system whatever the model asks. Common wrong answer: treating the rule as sufficient because "the agent respects its settings".

**"How would you evaluate two tools for your org?"** Model answer: replay 10–20 closed tickets with each and record merged-as-is, merged-after-edits or discarded, reviewer minutes, later defects and cost; read the data terms and permission model first; never lines generated. Common wrong answer: a public benchmark score, which measures a different codebase and task mix.

## What mid-level engineers get wrong

- **Comparing tools by feature list.** The lists change monthly; the harness category and the permission model decide what a tool can safely do, and those are stable.
- **Believing the model executes.** They attribute a deleted file to "the AI" when the harness executed a call that a rule or sandbox should have stopped.
- **Accepting completions at typing speed.** Completion continues the pattern it sees, wrong ones included; review at typing speed is no review.
- **Assigning a background agent to a repository that only builds on one laptop.** The budget goes on dependencies and the pull request fails CI before the task begins.
- **Asking one agent to edit 61 files.** The reviewer skims near-identical hunks; a codemod makes the review 60 lines of deterministic code and a short exception list.
- **Repeating last year's facts about a tool.** Names, file formats and defaults move (a coding agent becomes a cloud agent; an embedding index becomes grep); check the current documentation before a team decision.

## Senior signals

- You describe tools by **harness category** (completion, interactive agent, background agent) and can place a new product in one within a minute.
- You can **trace one iteration** of the loop and say which step is the model, which is the harness, and where the permission check sits.
- You match **task to category**: completion for local intent, an interactive agent for tight run-fix loops, background agents for parallel, independent, reviewable units.
- You turn big mechanical edits into **codemods** so the thing you review is a small deterministic program.
- You evaluate tools by **replaying closed tickets**, measuring accepted diffs, review time and later defects, never lines generated.
- You know background agents need a **reproducible build from a clean checkout** and secrets scoped to setup.
- You read the **data terms, permission model and sandbox** before the benchmark results, and you know which layers the operating system enforces.

## Check yourself

```quiz
- q: >-
    Your repository needs three undocumented manual steps (a local certificate, a seeded database, a private package mirror) before tests pass. Which category of tool will struggle most?
  options: ["A cloud or background agent, since it starts from a fresh clone", "All three equally, since none of them can create a local certificate", "Inline completion, since it only sees the code around the cursor", "An interactive terminal agent, since it runs the tests itself"]
  answer: 0
  explanation: >-
    A background agent starts from a fresh clone in a remote sandbox and cannot ask you how to set up the environment, so it burns its budget failing to build. Completion never runs code, and an interactive agent does run the tests, but in your already-configured environment where the certificate, database and mirror exist.
- q: >-
    In the agent loop, the model emits a call to delete a directory. Which component decides whether the deletion happens?
  options: ["The model, which checks its own instructions before emitting the call", "The operating system, which refuses deletions requested by AI processes", "The MCP server, which validates every call against its schema first", "The harness, which applies permission rules or asks you before executing"]
  answer: 3
  explanation: >-
    The model only produces a structured request; the harness validates it, runs it through allow, ask and deny rules or a prompt to the human, and only then executes it, and a sandbox underneath can refuse regardless. The operating system has no notion of an AI process, and an MCP server only sees calls the harness has already decided to forward.
- q: >-
    Why do inline completion tools use small prompts and fast models rather than the largest model with the whole repository in context?
  options: ["Whole repositories exceed any model's context window, so they cannot be sent", "Large models cannot do fill-in-the-middle, only left-to-right generation", "The suggestion must arrive within hundreds of milliseconds to be useful", "Completion tools are not permitted to read files other than the open one"]
  answer: 2
  explanation: >-
    Completion competes with your typing speed. A better suggestion that arrives after you have typed the next word has no value, so the harness trades context size and model size for latency. Context limits are real but not the reason: completion deliberately sends a few thousand tokens even when far more would fit.
- q: >-
    You must migrate 212 call sites across 61 files to a new HTTP client. Which approach gives the most trustworthy result for the review effort?
  options: ["Inline completion file by file, so you review each edit as you accept it", "One agent task that edits all 61 files, then a careful review of the full diff", "Have the agent write a codemod, review the script, and hand-check the sites it skips", "61 background agent tasks, one per file, each reviewed as its own pull request"]
  answer: 2
  explanation: >-
    A codemod turns 212 independent model decisions into one small deterministic program you can read; you then run it and hand-check the sites it reports it could not handle. A 61-file diff of near-identical hunks invites skimming, and 61 separate PRs multiply review overhead without making any single edit easier to trust.
- q: >-
    A harness has the deny rule Read(.env). The agent then runs cat .env through its shell tool and the contents appear in the transcript. What went wrong?
  options: ["The model deliberately worked around the rule, which counts as a model bug", "Pattern rules match strings; only a sandbox or a missing file stops every read path", "Shell tools bypass permissions by design, so shell access should be removed", "The deny rule was written in the wrong settings file, so it never loaded"]
  answer: 1
  explanation: >-
    A rule on the Read tool says nothing about a shell command that reads the same file; pattern rules narrow the honest paths but do not close the others. Enforcement that holds under every path is the operating-system sandbox or an environment where the secret is not present. Shell tools are gated too, by their own rules; the gap is between rule scope and file access, not a bypass by design.
- q: >-
    Which bake-off metric is most likely to mislead you when comparing AI coding tools?
  options: ["Reviewer minutes per merged change", "Defects traced to AI changes the next month", "Lines of code generated per engineer", "Share of AI diffs merged without edits"]
  answer: 2
  explanation: >-
    Lines generated rewards verbosity: a tool that writes more code scores higher even if the code needs more review and causes more bugs. The other three measure accepted value, cost of review and downstream quality.
```
