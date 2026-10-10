---
lesson: agents
source: 004936c3bc4def66
fit: great
desk:
  - "The agent harness code, line by line"
  - "The six-call dispute trace with input and billed tokens per call"
  - "The reliability table, the workflow patterns, and the stopping-conditions and guardrails tables"
  - "Exercise: model an agent run's token cost with a budget stop"
---
## Introduction

Your team is asked to "add an AI agent" that resolves customer billing disputes. The demo agent reads the dispute, looks up the invoice, checks the payment provider and issues a credit. It works on the six demo cases. In a pilot, it loops for 40 steps re-reading the same invoice, issues one credit twice after a timeout, and in one case follows an instruction a customer wrote into the dispute text. Each failure has a boring engineering cause, and none of them is fixed by a better model.

Start from the mechanism. An agent is a language model in a loop that chooses its own next action. It reads the task and everything that has happened so far, either calls a tool or declares it is done, observes the result, and repeats. The defining property is that the model, not your code, decides the control flow. That property is the source of both the power and every problem.

Three ideas, then. Two pieces of arithmetic that explain most production failures. When a plain workflow beats an agent. And the stopping conditions and guardrails a production loop needs.

## The loop, call by call

The tool-use loop is the agent. What makes it production code is everything around it: limits, error handling and accounting. The lesson's harness returns a status for every exit, never a bare exception, so the caller can treat a loop differently from a blown budget. It counts identical tool calls by hashing the tool name with its sorted arguments. It checks for actions that need approval before anything in the turn runs. It truncates results before they enter the transcript. And it measures the budget in billed tokens, so cache reads and writes count at their price.

Now a real run: the customer says they were charged twice for one invoice. The system prompt and eight tool definitions are 4,200 tokens and the task is 300, so the first call sends 4,500. The model reads the dispute, then the invoice, then lists the customer's payments, then fetches two payments in parallel, then issues a 49 euro credit, which pauses for approval, and then gives its answer. Six calls.

Each call is a fresh, stateless request. The provider keeps no conversation, so the harness sends the system prompt, the tools and the whole transcript every time. The final transcript is about 11 thousand tokens, but the model processed 46,470 input tokens to get there. At illustrative prices, that is 27 cents without caching and 12 cents with it.

Three things to read off the trace. First, the payment listing returned 2,400 tokens of raw provider JSON, resent on each of the three later calls. Trimmed to the 400 tokens the model needed, the run sends 6 thousand fewer input tokens, 13 percent of the total. Second, the two parallel fetches cost one model call; in sequence they would have added a call carrying the whole 9 thousand token transcript. Third, nothing leaves the transcript. The input only grows, and the ways down are clearing old tool results, compaction, or handing a subtask to a fresh context.

That growth has a shape. With a 3 thousand token prefix and 1,500 tokens added per step, 20 calls send 345 thousand tokens. Each call resends everything before it, so the total is quadratic in the number of steps. Caching changes the price, to about a fifth, but not the shape. And caching only works because consecutive calls share a byte-identical prefix. Edit a past tool result, reorder the tools, or switch model mid-task, and the next call becomes a full cache write.

## Reliability compounds

The second piece of arithmetic. If each step is independently right with probability p, an n-step task succeeds with probability p to the power n. A step that is right 95 percent of the time looks excellent in a demo. What chance does a 20-step task have?

[pause]

36 percent. At 90 percent per step, a 20-step task succeeds 12 percent of the time; at 99 percent, 82 percent. And steps are not truly independent, because one misunderstanding poisons every later step, so treat these numbers as the best case, which is already bad.

Checkpoints change the base of the exponent. Suppose a check, a test run, a schema validation or a balance check, catches 80 percent of wrong steps, and a caught step is redone with the same 95 percent success. Each step now succeeds about 98.8 percent of the time, and the 20-step task succeeds 78.5 percent of the time instead of 36. That is why tests and validators matter more than a slightly better model.

The same arithmetic shapes how you evaluate agents. Judge outcomes, not transcripts: did the tests pass, was the right credit issued exactly once? And run each case several times. Pass at k, where at least one of k runs succeeds, measures what the agent can do. Its strict counterpart from the tau-bench paper, where all k runs succeed, measures what it reliably does, which is what production needs. An agent that solves a task 70 percent of the time succeeds at least once in three runs 97 percent of the time, but succeeds in all three only 34 percent of the time.

## Workflows first

Most tasks called agentic are better served by a workflow: a fixed control flow written in code, with model calls at some of the steps. Workflows are predictable, testable and cheaper, because the path is in the source. Anthropic's Building Effective Agents names the common patterns: chain prompts with checks between them, route an input to a specialised prompt, run independent calls in parallel and combine them, let a model split a task into subtasks that code dispatches, or loop a generator against an evaluator.

An agent is justified when three things hold. The path cannot be known in advance. The task is valuable enough to pay for many calls. And errors can be caught, by tests, a type checker, a reviewer or an undo. Fixing a failing test in a repository satisfies all three; summarising a ticket satisfies none. A good question for any design review: what would the workflow version look like, and what specifically can it not do? If the answer is "nothing important", build the workflow. An agent is also the wrong tool on a latency-sensitive path, where each step is a model call of one to several seconds, and where every decision must be explainable and repeatable.

If you do build one, choose between reacting and planning. A reactive agent, the ReAct pattern, decides one step at a time from the latest observation. Its failure is wandering: re-reading, forgetting sub-goals, stopping when one part works. A planning agent writes a plan first and then executes it. Its failure is following a wrong plan made before reading the evidence. For short tasks, under about ten calls like the dispute, reacting is enough and cheaper. For long ones, a written plan the agent keeps updated, in a scratch file or a todo tool, keeps sub-goals in context and lets a human see where it is. Either way the plan is a hypothesis, so make re-planning cheap rather than treating deviation as failure.

## Stopping and memory

An agent loop needs more than one way to end, and each ending needs its own response. The natural stop is a turn with no tool call: the model believes it is done. Around it sit a step cap, for wandering; a billed-token budget, so one task cannot eat a day's spend; a repeat detector, for the same call with the same arguments; a cap on consecutive tool errors, for when a dependency is down; a wall-clock deadline; and a pause for approval before any irreversible action, showing the exact action and arguments.

The natural stop deserves suspicion. A model that says "done" has only asserted it. Where the task has a checkable outcome, the harness checks it before reporting success: the ledger shows one credit, the balance reconciles. A failed check becomes one more observation for the loop, within the step cap.

Memory design is deciding what stays in the context window, the agent's only working memory: finite, expensive, and worse as it fills. Keep tool outputs small. Replace old results with a stub once they are used, accepting that each clearing rewrites the cached prefix. Compact older turns into a digest, which is lossy. Have the agent write notes and plans to files and read them back. Or delegate a subtask to a sub-agent with a fresh context, and take back only a summary.

## Tools and guardrails

A tool is called dozens of times per run, so its design costs or saves on every iteration. Use a few task-level verbs: one find-duplicate-captures tool does in one call what three calls did in the trace. Return compact results with stable ids. Write errors that say what to do next. And keep reads separate from writes, with writes narrow and idempotent: issue credit keyed on the dispute, with an amount ceiling enforced in code.

The Model Context Protocol, MCP, standardises how applications expose tools to models. A server advertises tools with schemas, and any client can discover and call them, so you write an integration once and use it everywhere. The risk is sharper for the same reason: a server's tool descriptions and results enter your model's context, and its tools act with whatever credentials you gave it. Vet servers like dependencies.

Several agents help with breadth, such as ten independent searches in parallel, and with specialisation, since a sub-agent with three tools makes fewer wrong choices than one agent with forty. They cost tokens: Anthropic reports its agents using about four times the tokens of a chat, and its multi-agent research system about fifteen times. Information is lost at every hand-off, and the step that went wrong sits in a transcript nobody was watching. Use several agents for wide, read-heavy work, and one agent for tightly coupled work.

Now map the pilot's failures to guardrails. The 40-step loop needed a step cap, a budget, and a repeat detector that stops after three identical calls. The double credit needed an idempotency key tied to the operation, the dispute and the action, not to the attempt, so a retry is a no-op. And the instruction in the dispute text is a security problem, not a prompting one: the agent read attacker-controlled text while holding a tool that moved money. Human confirmation on credits, least-privilege tools, and an audit log of every call contain it.

## In the interview

A follow-up the lesson expects: why does an agent's cost grow faster than its number of steps, and what does caching change?

[pause]

Each call resends the whole transcript, so the total input is the sum of a growing series, quadratic in steps. Caching bills the already-seen prefix at about a tenth and the new tail at 1.25 times, which cut the traced run from 27 cents to 12. But the shape stays quadratic, and the model still attends over all of it. The wrong answer is "each step costs the same; it is the output tokens that add up".

And a second: how does your agent know when to stop? Not "when the model says it is done". A turn with no tool call, verified against an outcome check where one exists, surrounded by a step cap, a budget, a repeat detector, an error cap, a deadline and approval pauses, each returning its own status the caller can act on.

## Recap

Four things to remember. An agent is a model choosing its own control flow in a loop; ask what the workflow version would lose before you build one. Input grows quadratically with steps, so trim tool results and keep the prefix append-only. Per-step reliability compounds as p to the power n, and checkpoints change the base; evaluate on outcomes and on every-run success, not on one transcript. And design stopping as a set, with idempotent side effects and confirmation before anything irreversible.

At your desk: the harness code, the six-call trace table, the reliability table, and the exercise that models a run's token cost with a budget stop.
