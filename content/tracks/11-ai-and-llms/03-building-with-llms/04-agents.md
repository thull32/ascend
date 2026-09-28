---
slug: agents
title: "Agents: planning, memory, tools and when not to build one"
description: What an agent is mechanically, a loop traced call by call with its token growth and cost, how per-step reliability compounds into task success, planning versus reacting, stopping conditions, tool design, memory, MCP and guardrails, and when a plain workflow is the better design.
minutes: 20
difficulty: hard
tags: [llm, agents, tool-use, mcp, guardrails, ai]
---
Your team is asked to "add an AI agent" that resolves customer billing disputes. The demo agent reads the dispute, looks up the invoice, checks the payment provider, and issues a credit. It works on the six cases in the demo. In a pilot it loops for 40 steps re-reading the same invoice, issues one credit twice after a timeout, and in one case follows an instruction a customer wrote into the dispute text. Each failure has a boring engineering cause, and none of them is fixed by a better model.

"Agent" is one of the most overloaded words in the industry, so start from the mechanism. An agent is **a language model in a loop that chooses its own next action**: it reads the task and everything that has happened so far, either calls a tool or declares it is done, observes the tool's result, and repeats. The defining property is that the model, not your code, decides the control flow. That property is the source of both the power and every problem in this lesson.

## The loop, as code

The tool-use loop from [Structured outputs and tool use](/learn/ai-and-llms/building-with-llms/structured-outputs-and-tool-use) *is* the agent. What turns it into production code is everything around it: limits, error handling and accounting. This harness takes the model call as a function, so it runs as is against a scripted fake and unchanged against a real client:

```python
import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field


@dataclass
class Limits:
    max_steps: int = 12              # model calls per task
    max_billed_input: int = 150_000  # input tokens, cache writes x1.25 and reads x0.1
    max_repeats: int = 3             # identical (tool, arguments) calls allowed
    max_consecutive_errors: int = 2


@dataclass
class Outcome:
    status: str                      # "done", "step_limit", "budget", "loop", "errors", "needs_approval"
    steps: int
    billed_input: float
    answer: str = ""
    transcript: list = field(default_factory=list)


def billed(usage):
    return (usage["input_tokens"] + 1.25 * usage.get("cache_creation_input_tokens", 0)
            + 0.1 * usage.get("cache_read_input_tokens", 0))


def run_agent(call_model, tools, task, limits=Limits(), needs_approval=frozenset()):
    """call_model(messages) returns {"stop_reason", "content", "usage"} in the Messages API shape."""
    messages = [{"role": "user", "content": task}]
    seen, errors, spent = Counter(), 0, 0.0
    for step in range(1, limits.max_steps + 1):
        resp = call_model(messages)
        spent += billed(resp["usage"])
        messages.append({"role": "assistant", "content": resp["content"]})
        if resp["stop_reason"] != "tool_use":        # end_turn, max_tokens or refusal
            text = "".join(b["text"] for b in resp["content"] if b["type"] == "text")
            return Outcome("done", step, spent, text, messages)
        calls = [b for b in resp["content"] if b["type"] == "tool_use"]
        for c in calls:
            key = hashlib.sha256(f"{c['name']}:{json.dumps(c['input'], sort_keys=True)}".encode()).hexdigest()
            seen[key] += 1
            if seen[key] > limits.max_repeats:
                return Outcome("loop", step, spent, transcript=messages)
            if c["name"] in needs_approval:          # pause before any irreversible action
                return Outcome("needs_approval", step, spent, json.dumps(c["input"]), messages)
        results = []
        for c in calls:
            try:
                out = json.dumps(tools[c["name"]](**c["input"]))[:8_000]
                results.append({"type": "tool_result", "tool_use_id": c["id"], "content": out})
            except Exception as e:                   # errors are observations, not crashes
                results.append({"type": "tool_result", "tool_use_id": c["id"], "is_error": True,
                                "content": f"{type(e).__name__}: {e}"})
        errors = errors + 1 if all(r.get("is_error") for r in results) else 0
        messages.append({"role": "user", "content": results})
        if errors >= limits.max_consecutive_errors:
            return Outcome("errors", step, spent, transcript=messages)
        if spent > limits.max_billed_input:
            return Outcome("budget", step, spent, transcript=messages)
    return Outcome("step_limit", limits.max_steps, spent, transcript=messages)
```

The non-obvious lines: every exit returns a *status*, never a bare exception, so the caller can escalate a "loop" differently from a "budget"; the repeat key hashes the tool name with its arguments serialised with sorted keys, so `{"a":1,"b":2}` and `{"b":2,"a":1}` count as the same call; the approval check runs *before* any call in the turn executes, and returns the transcript with the pending call so that, once a person approves, the caller runs it, appends its result and resumes the loop; results are truncated before they enter the transcript, because every byte is resent on every later call; and the budget is in billed-equivalent tokens, so cache reads and writes count at their price. Fed a scripted model that re-reads invoice INV-2291 forever, it stops at step 4 with status `loop`.

## The loop, traced call by call

Now a real run: the dispute "customer says they were charged twice for INV-2291". The system prompt and eight tool definitions are 4,200 tokens and the task 300, so the first call sends 4,500. Each later call sends everything before it plus the model's previous output plus the new tool results. Billed-equivalent input assumes prompt caching: the part seen on the previous call is a cache read at 0.1× and the new part a cache write at 1.25×.

| Call | The model decides to | Input on this call | New since the last call | Billed-equivalent input |
|---|---|---|---|---|
| 1 | `get_dispute("D-881")` | 4,500 | 4,500 | 5,625 |
| 2 | `get_invoice("INV-2291")` | 5,350 | 850 | 1,512 |
| 3 | `list_payments("cus_42", since="2026-08-01")` | 6,450 | 1,100 | 1,910 |
| 4 | `get_payment` twice, in parallel | 9,070 | 2,620 | 3,920 |
| 5 | `issue_credit("D-881", 49.00 EUR)`: pauses for approval, then runs | 10,330 | 1,260 | 2,482 |
| 6 | Final answer, no tool call | 10,770 | 440 | 1,583 |
| | **Total** | **46,470** | | **17,032** |

The final transcript is about 11,000 tokens, but the model processed 46,470 input tokens to get there, plus 1,470 output tokens. At illustrative prices of $5 per million input and $25 per million output tokens that is $0.27 without caching and $0.12 with it. Three things to read off the table:

1. **Call 4 is expensive because of call 3's result.** `list_payments` returned 2,400 tokens of raw provider JSON, and it is resent on calls 4, 5 and 6. Trimmed to the 400 tokens the model needed (amount, date, id per payment), the run sends 6,000 fewer input tokens, 13% of the total.
2. **Parallel calls are cheaper as well as faster.** Two `get_payment` calls in one turn cost one model call; in sequence they would add a call carrying the whole 9,000-token transcript.
3. **Nothing leaves the transcript.** The input only grows; the ways down are clearing old tool results, compaction, or handing a subtask to a fresh context.

```viz
{"type": "ml", "algorithm": "agent-loop", "text": "How many open PRs are older than 7 days?",
 "title": "An agent is a model in a loop",
 "caption": "Each iteration resends the whole transcript. The final step lists the guards a production loop needs: an iteration cap, a token budget, tool timeouts and human confirmation for irreversible actions."}
```

## Under the hood: what each iteration sends

Each call is a fresh, stateless request. The provider keeps no conversation; the harness sends `system`, `tools` and the whole `messages` array every time, rendered in that order. Prompt caching works because consecutive calls share a byte-identical prefix: the tools and system prompt never change, and the messages array only appends. Put one breakpoint at the end of the static system prompt and let the conversation breakpoint move to the newest message ([LLM system design](/learn/ai-and-llms/building-with-llms/llm-system-design) traces the same layout in this app's coach). Anything that rewrites earlier content, such as editing a past tool result, reordering tools or switching model mid-task, breaks the prefix and turns the next call into a full cache write.

```viz
{"type": "ml", "algorithm": "kv-cache", "text": "The cat sat",
 "title": "What a cache read skips",
 "caption": "Prefill computes a key and value for every input token. A prompt-cache hit reuses those for the unchanged prefix, so each agent call pays full price only for what was appended since the last one."}
```

Output tokens include the model's reasoning when a thinking mode is on; on current Anthropic models they are billed as output whether or not the reasoning text is returned. An agent at high effort can spend more on thinking per call than on the visible tool call, so effort is a cost setting as much as a quality one ([Context management](/learn/ai-assisted-engineering/tools-and-workflows/context-management) shows the same budget from the coding-agent side).

## Cost and failure compounding

Two pieces of arithmetic explain most agent failures in production.

**Cost grows faster than the step count.** With a 3,000-token prefix and 1,500 tokens added per step, call $i$ sends $3{,}000 + 1{,}500(i-1)$ tokens, so 20 calls send

$$20 \times 3{,}000 + 1{,}500 \times (0 + 1 + \dots + 19) = 60{,}000 + 285{,}000 = 345{,}000 \text{ tokens},$$

quadratic in the number of steps. Caching changes the price, not the shape: the same run bills 31,500 tokens of cache writes at 1.25× and 313,500 of reads at 0.1×, 70,725 billed-equivalent tokens, about a fifth. The exercise builds this model.

**Reliability compounds.** If each step is independently right with probability $p$, an $n$-step task succeeds with probability $p^n$:

| Per-step success | 5 steps | 10 steps | 20 steps | 50 steps |
|---|---|---|---|---|
| 0.90 | 0.590 | 0.349 | 0.122 | 0.005 |
| 0.95 | 0.774 | 0.599 | 0.358 | 0.077 |
| 0.99 | 0.951 | 0.904 | 0.818 | 0.605 |
| 0.999 | 0.995 | 0.990 | 0.980 | 0.951 |

A 95%-reliable step, which looks excellent in a demo, gives a 20-step task a 36% chance. Checkpoints change the base of the exponent. If a check (a test run, a schema validation, a balance check) catches 80% of wrong steps and the step is redone with the same 95% success, each step succeeds with probability $0.95 + 0.05 \times 0.8 \times 0.95 = 0.988$, and 20 steps succeed 78.5% of the time instead of 35.8%. Steps are not truly independent (one misunderstanding poisons every later step), so treat the table as optimistic: it is the best case, which is already bad.

## Workflows first

Most tasks called "agentic" are better served by a **workflow**: a fixed control flow written in code, with LLM calls at some of the steps. Workflows are predictable, testable and cheaper, because the path is in the source. A widely used taxonomy of patterns:

| Pattern | Shape | Example |
|---|---|---|
| Prompt chaining | Step A's output feeds step B, with checks in between | Draft a release note, then check it against the changelog |
| Routing | Classify the input, send it to a specialised prompt or model | Billing questions to one prompt, technical ones to another |
| Parallelisation | Independent calls at once, then combine (split the work, or vote) | Review a diff for security, performance and style in parallel |
| Orchestrator and workers | A model splits a task into subtasks that code dispatches | Research question fanned out to several searches |
| Evaluator and optimiser | One call generates, another critiques, loop until it passes | Translation refined against a rubric |

An agent is justified when **the path cannot be known in advance** (which files must change, which queries to run), **the task is valuable enough** to pay for many calls, and **errors can be caught**: tests, a type checker, a reviewer, an undo. Fixing a failing test in a repository satisfies all three; "summarise this ticket" satisfies none.

## Planning versus reacting

A **reactive** agent (the ReAct pattern: reason, act, observe, repeat) decides one step at a time from the latest observation. A **planning** agent first writes an explicit plan, then executes it, revising when an observation contradicts it. The same dispute, both ways:

| | Reactive | Plan, then execute |
|---|---|---|
| First call | Calls `get_dispute` | Writes: "1. read dispute; 2. read invoice; 3. list payments since the invoice date; 4. if two captures of the same amount, credit one; 5. otherwise escalate" |
| When `list_payments` shows one capture and one pending authorisation | Notices on the next call, may re-read the invoice to be sure | Step 4's condition is false; it follows step 5 and escalates |
| After 30 calls in a long task | The original sub-goals are 30 observations back in the transcript | The plan, kept updated in a scratch file or todo tool, is re-read each step |
| Extra cost | None up front | One planning call, plus plan updates |
| Failure | Wanders: re-reads, forgets sub-goals, stops when one part works | Follows a wrong plan made before reading the evidence |

Current models with built-in reasoning interleave a little planning into every call, so the practical question is whether the plan is an **external artefact**. For short tasks (under about ten calls, like the dispute) reacting is enough and cheaper. For long ones, a written plan that the agent updates is what keeps sub-goals in context and lets a human see where it is. Either way, a plan made before reading the evidence is a hypothesis: the harness should make re-planning cheap (the plan is one file the agent rewrites) rather than treat deviation as failure.

## Stopping conditions

An agent loop needs more than one way to end, and each ending needs its own response.

| Condition | Detects | What the harness returns |
|---|---|---|
| No tool call (`end_turn`) | The model believes it is done | The answer, after an outcome check where one exists (tests pass, balance reconciles) |
| Step cap | Wandering or slow progress | A partial result and an escalation, not an error page |
| Billed-token or cost budget | One task consuming a day's spend | Stop, record, escalate; alert if the budget trips often |
| Repeat detector | The same call with the same arguments | Stop, or inject one nudge ("you already have this result") and stop on the next repeat |
| Consecutive tool errors | A dependency is down or the model cannot form valid arguments | Stop and report the error class; do not burn steps retrying |
| Wall-clock deadline | Slow tools or long thinking | Stop at the deadline the caller can tolerate |
| Approval required | An irreversible or external action | Pause with the exact action and arguments; resume on approval |

The `end_turn` case deserves suspicion: a model that says "done" has only asserted it. Where the task has a checkable outcome, the harness checks it before reporting success, and a failed check becomes one more observation for the loop, within the step cap.

## Memory

The context window is the agent's only working memory, and it is finite, expensive and degrades as it fills. Memory design is deciding what stays in the window.

| Strategy | Mechanism | Trade-off |
|---|---|---|
| Keep tool outputs small | Tools return summaries, ids and pages, not raw dumps | Needs deliberate tool design |
| Clear stale tool results | Replace old results with a stub once used | The model must call again to re-read; each clearing rewrites the cached prefix |
| Compaction | Summarise older turns into a short digest | Lossy; a detail dropped from the summary is gone |
| External memory | The agent writes notes, plans and findings to files or a store and reads them back | Needs tools and discipline; retrieval can miss |
| Sub-agents | Delegate a subtask to a fresh context; get back only a summary | Extra calls; the parent sees conclusions, not evidence |

Long-term memory across sessions (user preferences, facts learned last week) is a retrieval problem: store notes, retrieve the relevant ones into the next session, and apply the same freshness and access-control rules as any RAG index ([Retrieval-augmented generation](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation)).

## Designing tools for agents

A tool is called dozens of times per run, so its design costs or saves on every iteration.

- **Task-level verbs, few of them.** Each extra tool is another choice the model can get wrong, and its definition is resent on every call. `find_duplicate_captures(invoice_id)` does in one call what `list_payments` plus two `get_payment` calls did in the trace.
- **Compact, model-shaped results.** Return the fields the next decision needs, with stable ids; paginate lists. The 2,400-token result in the trace cost 6,000 tokens over the rest of the run.
- **Errors that say what to do next.** "No payments since 2026-08-01; try the invoice date 2026-07-28" produces a recovery; a stack trace produces a retry.
- **Reads separate from writes**, writes narrow and idempotent: `issue_credit(dispute_id, amount)` keyed on the dispute, with an amount ceiling enforced in code.

The **Model Context Protocol** (MCP) standardises how applications expose tools and data to models: an MCP server wraps a system and advertises tools (with JSON-schema inputs), resources and prompts; an MCP client inside the agent discovers them with `tools/list` and invokes them with `tools/call`, over stdio for local servers or HTTP for remote ones. Write the integration once and use it from any client. The risk is sharper for the same reason: a server's tool descriptions and results enter your model's context, and its tools act with whatever credentials you gave it. Vet servers like dependencies and scope their credentials ([MCP and integrations](/learn/ai-assisted-engineering/tools-and-workflows/mcp-and-integrations) traces an attack through one; [LLM security](/learn/ai-and-llms/building-with-llms/llm-security) covers the defences).

## Multi-agent systems

An orchestrator that delegates to sub-agents with their own contexts helps with **breadth** (ten independent searches finish sooner in parallel, and the orchestrator reads ten short summaries instead of ten transcripts) and **specialisation** (a sub-agent with three tools makes fewer wrong choices than one agent with forty).

It costs in three ways. **Tokens multiply**: every sub-agent pays for its own system prompt, tools and reading, so a multi-agent run commonly uses several times the tokens of a single agent on the same job, and parallel sub-agents cannot read a cache entry the others are still writing. **Information is lost at every hand-off**: the orchestrator acts on summaries, and siblings cannot see each other's findings unless you pass them along. And **debugging gets harder**, because the step that went wrong is in a transcript nobody was watching. Use several agents for wide, parallelisable, read-heavy work, and one agent for tightly coupled work where each step depends on the last.

## Guardrails a production agent needs

Every failure in the billing-dispute pilot maps to a missing guardrail.

| Guardrail | What it prevents | Implementation |
|---|---|---|
| Step cap and budget | Infinite loops; runaway spend on one task | `max_steps`; sum billed usage per call; stop and escalate |
| Loop detection | The same call with the same arguments, again and again | Hash (tool, sorted arguments); stop after three repeats |
| Tool timeouts and output caps | One slow dependency stalling the run; a huge result flooding context | Per-tool deadlines; truncate or paginate results |
| Idempotency keys | The double credit after a timeout and retry | Key each side effect on the operation (dispute id and action), not the attempt ([Idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries)) |
| Least-privilege tools | Damage from confusion or injection | Read-only by default; credentials scoped to the user; arguments allowlisted |
| Human confirmation | Irreversible or external actions taken on bad reasoning | Pause and show the exact action and arguments |
| Audit log | Not knowing what happened | Every call, argument, result and decision, with the trace id |

The injected instruction in the dispute text is a security problem, not a prompting problem: the agent read attacker-controlled text and held a tool that moved money. Confirmation on credits, and limits on what the credit tool can do without it, contain it.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Runs hit the step cap on tasks that should take five calls | The trace shows the same read repeated with identical arguments, or a plan abandoned after one contradicting observation | Repeat detector with one nudge; results that answer the question the model keeps asking; an explicit plan for long tasks |
| Cost per task is several times the estimate | One tool returns raw payloads that are resent on every later call, or the cache prefix breaks each call (tool list reordered, earlier results edited) | Trim results; check `cache_read_input_tokens` against total input per call; keep the prefix append-only |
| A side effect happened twice | The harness retried after a timeout, or the model issued the call again on a later step | Idempotency key on the operation; the tool returns "already done" on a repeat |
| The agent reports success, the ticket reopens | `end_turn` was trusted; nothing checked the outcome | An outcome check before reporting success; failing checks go back into the loop |
| Success rate falls as tasks get longer, though each step looks fine in review | Compounding: 0.95 per step is 36% over 20 steps | Fewer, bigger tool steps; checkpoints that catch errors; split the task into shorter runs with verified hand-offs |
| The agent follows instructions found in a document | Untrusted content in the same context as privileged tools | Confirmation for side effects; least-privilege credentials; separate the reading context from the acting one |

## Choosing an architecture

| Design | Control flow | Cost per task | Debuggability | Latency | Fits |
|---|---|---|---|---|---|
| Single call or workflow | Fixed, in code | One or a few calls | Read the source | Lowest | Known paths: extraction, classification, routing |
| Reactive single agent | Model, step by step | Grows quadratically with steps | One transcript | A model call per step | Short open-ended tasks with checkable outcomes |
| Plan-and-execute agent | Model plans; harness and model execute | One extra planning call | Plan plus transcript | Similar, plus planning | Long tasks where sub-goals get lost |
| Orchestrator and sub-agents | Model delegates | Several times a single agent | Many transcripts | Lower wall-clock for parallel work | Broad, read-heavy, parallelisable research |

## When an agent is the wrong tool

- **The path is known.** Classifying a million tickets or extracting fields from invoices: one structured-output call per item, in batch.
- **Latency matters.** Each step is a model call of one to several seconds; a five-step agent on the hot path of a checkout page is a latency incident.
- **Every decision must be explainable and repeatable**, as in regulated approvals. A deterministic workflow with an LLM at one well-evaluated step is far easier to defend.
- **Errors cannot be detected or undone.** Then compounding error rates are a liability, not a detail.

A good test in a design review: "What would the workflow version of this look like, and what specifically can it not do?" If the answer is "nothing important", build the workflow.

## Evaluating agents

Agent evals judge outcomes, not transcripts: did the tests pass, is the database in the expected state, was the right credit issued exactly once? Check the trajectory too: steps, forbidden tool calls, cost per task. Because agents are non-deterministic, run each case several times. **pass@k** (at least one of k runs succeeds) measures what the agent *can* do; **pass^k** (all k succeed) measures what it *reliably* does, which is what production needs. An agent that solves a task 70% of the time has pass@3 of 97.3% and pass^3 of 34.3%; at 90% per run, pass^3 is still only 72.9% ([Evals and observability](/learn/ai-and-llms/building-with-llms/evals-and-observability)).

## Exercise

```exercise
id: agent-cost-model
title: Model an agent run's token cost with a budget stop
prompt: |
  Implement `agent_cost(prefix, adds, budget)` for an agent loop that resends
  its whole transcript on every model call.

  - There are `len(adds) + 1` planned calls. Call 0 sends `prefix` input
    tokens. Call `i` (for `i >= 1`) sends the previous call's input plus
    `adds[i - 1]`: the model's output and the tool results appended between
    the two calls.
  - Before each call, if the input tokens already sent plus this call's input
    would exceed `budget`, stop without making it (a call that lands exactly
    on the budget is allowed).
  - Prompt caching: the first call made is a cache write of its whole input.
    Every later call reads the previous call's input from the cache and
    writes only the difference.

  Return `{"calls", "total_input", "cache_write", "cache_read"}` over the calls
  actually made. (Billed-equivalent input is then
  `cache_write * 1.25 + cache_read * 0.1`; you do not need to return it.)
languages: [python, javascript]
entry: agent_cost
starter:
  python: |
    def agent_cost(prefix, adds, budget):
        calls = total = write = read = 0
        # your code here
        return {"calls": calls, "total_input": total, "cache_write": write, "cache_read": read}
  javascript: |
    function agent_cost(prefix, adds, budget) {
      let calls = 0, total = 0, write = 0, read = 0;
      // your code here
      return { calls, total_input: total, cache_write: write, cache_read: read };
    }
tests:
  - args: [3000, [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500], 1000000000]
    expected: {"calls": 20, "total_input": 345000, "cache_write": 31500, "cache_read": 313500}
    label: the lesson's 20-call arithmetic
  - args: [4500, [850, 1100, 2620, 1260, 440], 1000000000]
    expected: {"calls": 6, "total_input": 46470, "cache_write": 10770, "cache_read": 35700}
    label: the traced dispute
  - args: [2000, [], 5000]
    expected: {"calls": 1, "total_input": 2000, "cache_write": 2000, "cache_read": 0}
    label: a single call
  - args: [6000, [100], 5000]
    expected: {"calls": 0, "total_input": 0, "cache_write": 0, "cache_read": 0}
    label: the first call alone exceeds the budget
  - args: [3000, [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500], 100000]
    expected: {"calls": 10, "total_input": 97500, "cache_write": 16500, "cache_read": 81000}
    hidden: true
    label: budget stops the run
  - args: [1000, [200, 200], 2200]
    expected: {"calls": 2, "total_input": 2200, "cache_write": 1200, "cache_read": 1000}
    hidden: true
    label: landing exactly on the budget is allowed
  - args: [1000, [0, 0, 500], 1000000]
    expected: {"calls": 4, "total_input": 4500, "cache_write": 1500, "cache_read": 3000}
    hidden: true
    label: steps that add nothing still resend the transcript
hints:
  - "Keep the previous call's input in a variable; the next input is that plus adds[i - 1]."
  - "Check the budget before counting a call: if total + this_input > budget, stop."
  - "The first call made writes everything; each later call reads the previous input and writes this input minus the previous one."
```

## Interviewer follow-ups

**"Why does an agent's cost grow faster than its number of steps, and what does caching change?"** Model answer: each call resends the whole transcript, so total input is the sum of a growing series, quadratic in steps; caching bills the already-seen prefix at about a tenth and the new tail at 1.25×, which cut the traced run from $0.27 to $0.12, but the shape stays quadratic and the model still attends over all of it. Common wrong answer: "each step costs the same; it is output tokens that add up".

**"Each step of your agent is 95% reliable. Is a 20-step task viable?"** Model answer: independently that is $0.95^{20} \approx 36\%$, and dependence between steps makes it worse; it becomes viable with checkpoints that catch errors (a check catching 80% of bad steps lifts per-step success to 0.988 and the task to about 78%), fewer and bigger steps, or shorter runs with verified hand-offs. Common wrong answer: "95% is high; it will be fine".

**"How does your agent know when to stop?"** Model answer: the natural stop is a turn with no tool call, which the harness verifies against an outcome check where one exists; around it sit a step cap, a billed-token budget, a repeat detector, a consecutive-error cap, a deadline and approval pauses, each returning a distinct status the caller can act on. Common wrong answer: "when the model says it is done".

**"When would you choose a planning agent over a reactive one?"** Model answer: when the task is long enough that early sub-goals scroll out of attention, or when a human needs to see and approve the approach; the plan must be a revisable artefact, because it was made before reading the evidence. For short tasks the planning call is overhead. Common wrong answer: "always plan first; planning is what makes it an agent".

**"Would you split this agent into several agents?"** Model answer: only for broad, parallel, read-heavy work where each sub-agent needs a narrow toolset; it multiplies tokens, loses information at every hand-off and scatters the evidence across transcripts, so tightly coupled tasks stay in one agent. Common wrong answer: "more agents means more intelligence".

## What mid-level engineers get wrong

- **Building an agent for a known path.** A batch workflow would be cheaper, faster, testable and deterministic; the agent adds only variance.
- **Trusting `end_turn`.** "Done" is a claim; without an outcome check, a confident wrong result is reported as success.
- **Returning raw API payloads from tools.** A 2,400-token result costs 6,000 tokens over the rest of a six-call run, and far more over a 30-call one.
- **One stop condition.** A step cap alone lets a single task spend a day's budget; a budget alone lets a loop run to it.
- **Retrying side effects without idempotency.** A timeout plus a retry is a double credit.
- **Editing history in place.** Rewriting an earlier tool result to "clean up" the transcript breaks the cache prefix on every later call.
- **Judging from one impressive transcript.** pass@1 on a demo says nothing about pass^3 in production.

## Senior signals

- You define an agent by mechanism, **a model choosing its own control flow in a loop**, and ask what the workflow version would lose before agreeing to build one.
- You can **trace a run call by call**: input per call, what is new, billed-equivalent tokens with caching, and which tool result is driving the cost.
- You quote the arithmetic: **per-step reliability compounds** ($p^n$), **input grows quadratically** with steps, and **checkpoints change the base** of the exponent.
- You design **stopping conditions** as a set, each with its own status and escalation, and you verify `end_turn` against an outcome.
- You choose **planning or reacting** by task length and oversight needs, and keep plans revisable.
- You design **tools and memory as context management**, treat **MCP servers as dependencies**, and list the **guardrails** unprompted.
- You evaluate agents on **outcomes and pass^k**, not on one transcript.

## Check yourself

```quiz
- q: >-
    An agent task takes 15 steps, and each step is correct 97% of the time independently. Roughly how often does the whole task succeed?
  options: ["About 85%", "About 45%", "About 63%", "About 97%"]
  answer: 2
  explanation: >-
    0.97 to the 15th power is about 0.63. Per-step reliability that looks excellent in isolation compounds into a task that fails more than a third of the time, which is why long runs need checkpoints such as tests or validators.
- q: >-
    A check catches 80% of wrong steps, and a caught step is redone with the same 95% success. What happens to a 20-step task's success rate?
  options: ["It rises to about 45%, since only a single retry is allowed for each step", "It rises to about 78%, since each step now succeeds 98.8% of the time", "It rises to 100%, since every wrong step is eventually caught and corrected", "It stays near 36%, since a check cannot change the per-step success rate"]
  answer: 1
  explanation: >-
    Per-step success becomes 0.95 + 0.05 x 0.8 x 0.95, about 0.988, and 0.988 to the 20th power is about 0.785, against 0.358 without the check. Checkpoints change the base of the exponent, which is why tests and validators matter more than a slightly better model. The 20% of errors the check misses keep it below 100%.
- q: >-
    Why does an agent's input-token cost grow roughly quadratically with the number of steps?
  options: ["Providers charge a higher rate per token for later calls in a long conversation", "Each call resends the whole transcript, which itself grows with every step", "Attention cost is quadratic in length, and providers bill for that compute", "The system prompt and tool list are duplicated again on every step"]
  answer: 1
  explanation: >-
    Call i sends everything from the calls before it, so total input is the sum of a growing series. Billing is per token at a flat rate; the quadratic comes from resending, not from attention compute. Caching lowers the price of the repeated prefix, but the tokens are still processed on every call.
- q: >-
    In a traced run, one tool returns 2,400 tokens of raw JSON on call 3 of 6. What does trimming it to 400 tokens save?
  options: ["About 6,000 input tokens, since the result is resent on the three later calls", "Nothing, because prompt caching makes all previously seen tokens free to resend", "2,000 input tokens once, because the result is sent to the model only a single time", "About 12,000 input tokens, because both the call and its result are resent twice"]
  answer: 0
  explanation: >-
    The result joins the transcript and is resent on calls 4, 5 and 6, so each of those sends 2,000 fewer tokens: 6,000 in total, 13% of the run's input. Caching bills those resent tokens at about a tenth, which is cheaper but not free, and they still occupy the context the model attends over.
- q: >-
    An agent retried a payment tool call after a timeout and the customer was credited twice. Which guardrail addresses the root cause?
  options: ["A step cap, so the agent cannot keep calling the payment tool again in a loop", "A lower temperature, so the model is less likely to repeat the same tool call", "An idempotency key tied to the operation being paid, not to the attempt", "A longer tool timeout, so slow payment calls are not mistaken for failed ones"]
  answer: 2
  explanation: >-
    Retries are unavoidable in distributed systems; side effects must be safe to repeat. An idempotency key tied to the operation (the dispute being credited) makes the second call a no-op, whether the harness retried it or the model issued it again. A step cap limits loops but does not stop one duplicated call, and a longer timeout only makes the retry rarer.
- q: >-
    The model ends its turn saying the dispute is resolved. What should the harness do before reporting success?
  options: ["Report success, since end_turn means the model finished the task", "Check the outcome itself, such as the ledger showing one credit, first", "Run a second model on the transcript to judge whether it looks resolved", "Ask the model to confirm it is sure, then report its second answer"]
  answer: 1
  explanation: >-
    end_turn is the model's claim that it is done. Where the task has a checkable outcome, the harness verifies it (one credit issued, the balance reconciles) and feeds a failed check back into the loop within the step cap. Asking the same model again, or a judge reading the transcript, checks the story rather than the state of the world.
```
