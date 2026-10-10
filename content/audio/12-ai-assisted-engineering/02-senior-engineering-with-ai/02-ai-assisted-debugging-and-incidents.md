---
lesson: ai-assisted-debugging-and-incidents
source: 52a9acd48b03aac9
fit: great
desk:
  - "The signature function, and the hand trace of its three rules on three log lines"
  - "The reduced log summary and the four-hypothesis table"
  - "The bisect trace on eight commits, and the bisect log and replay commands"
  - "The autonomy-tier table and the bounded scale-service runbook tool"
  - "Exercise: reduce a log to its top error signatures"
---
## Introduction

At 2:14 in the morning the pager fires. Checkout's 99th percentile has gone from 300 milliseconds to 3.1 seconds, and the error rate is 4 percent. There are 400 megabytes of logs from the last hour, three deploys in the last day, and a dashboard with sixty panels. An AI can read more log lines in a minute than you can in an hour, and it will happily tell you what is wrong.

It may also tell you, fluently and with a plausible mechanism, the wrong thing. And if it has been given the permissions, it may act on the wrong thing at machine speed: restart the wrong deployment, or delete the "stuck" jobs that were your only record of which payments were in flight.

AI makes the reading and the guessing faster. The senior skill is keeping the deciding and the acting under control. Four mechanisms do it: a reduction step that keeps the model's input small and honest, a hypothesis format the model cannot dodge, a deterministic search for regressions, and a tier system for what an agent may touch.

## Debugging is hypothesis testing

Every effective debugging session runs the same loop. Observe, form hypotheses, predict what each one implies, run the experiment that distinguishes them, update. For a human, the expensive steps are reading at scale and thinking of hypotheses you had not considered. For a model, those are cheap. What neither can do without evidence is know which hypothesis is true. Only an experiment decides that.

So the AI widens the set of hypotheses, ranks them against the evidence, and proposes experiments. You make sure each hypothesis carries a prediction that could refute it, you run the experiments, and you decide.

A hypothesis without a refutable prediction is a story. "It's connection pool exhaustion" becomes useful when it says three things: pool wait time will spike, the errors will be timeouts acquiring a connection rather than query errors, and database CPU will be low, because queries are not reaching it. Hypothesis, prediction, observation. That table is the whole method, and it is what you ask the model to fill in.

## Reduce before you send

You cannot paste 400 megabytes of logs into a model. That is on the order of a hundred million tokens, five hundred times a 200 thousand token window. And you should not paste even the first megabyte raw: it wastes the context, buries the signal, and ships customer identifiers to a third party.

Reduce first. Group errors by signature: the message with its variable parts replaced by placeholders, with a count and the first and last time each was seen. User ids become a placeholder, hex addresses become a placeholder, numbers become a placeholder.

The order of those rules is the whole mechanism. Replace the ids first, then hex, then plain numbers. Run the number rule first, and the digits inside every user's id get replaced one by one, so each user produces a different signature, and the point of the exercise, collapsing millions of lines into a handful of patterns, is lost.

Done right, two million lines become a few kilobytes. In the lesson's incident: about 18 thousand pool timeouts, first seen at 2:05 and 41 seconds. About 2,300 upstream timeouts. 611 retries of an idempotency lookup, first seen at 1:12. And a change timeline showing that at 2:04 the payments service was deployed with its database pool cut from 50 connections to 20.

Then the prompt. List up to five hypotheses ranked by fit, and for each, the evidence for it, the evidence against it, and one query or experiment that would distinguish it from the others. Do not propose a remediation yet.

Asking for evidence against, and for a discriminating experiment, is what turns the model from a storyteller into a useful colleague. Here, the pool errors start 90 seconds after the pool was shrunk. Strong, but still circumstantial. The cheap check: compare pool wait time and active connections before and after 2:04, and look at instances still on the previous version, which should show no errors. Of the four hypotheses the model offers, two are ruled out by facts already in the summary and one by a metric you can read in a minute. That is what a good reduction buys: the model's ranking is checkable against the same evidence it was given.

## Do not anchor on the first story

Models and people both anchor on the first plausible explanation. Protect against it on purpose. Ask what you would expect to see if the leading hypothesis were false, and look for it. Check that the timing lines up.

Those 611 idempotency retries are the example. Before I say why, should they worry you?

[pause]

No. They began at 1:12, an hour before the incident, and continue at the same steady rate. Pre-existing noise, not the cause, however alarming the message sounds. Treat the AI's "root cause" as a hypothesis until one of its predictions has been confirmed by data you looked at yourself.

The quality of the help tracks the quality of the question more than the model. A strong question has a precise symptom with numbers and timestamps, the evidence already gathered, and a request for a distinction rather than a verdict. That last part matters most. "What would distinguish pool exhaustion from a slow downstream?" produces an experiment you can run. "What is the cause?" produces a story you have to check anyway.

## Reproduce first, and let bisect search

Outside an incident, the agentic workflow applies with one change: reproduce before fixing. Ask the agent for a failing test that demonstrates the bug, confirm it fails for the right reason, then ask for the fix. The reproduction proves the bug is understood and becomes the regression test.

Watch for the classic non-fix on intermittent failures. The agent adds a half-second sleep, a retry, or a longer timeout, and the test goes green. The race is still there; it is just rarer. Reject it and ask for the mechanism: what interleaving of these two operations produces the failure? A fix you can explain in terms of ordering or state is a fix. A fix that changes timing is a delay.

When a regression appeared somewhere in a range of commits, let git do the search and the agent do the typing. The agent writes a reproduction script; git bisect runs it on a commit, and the exit code marks that commit good or bad. Each answer halves the range. Eight commits take three runs. A thousand take about ten. The cost is bounded before you start, which a model's guess about which commit looks suspicious is not.

Two things make it reliable. The script must be deterministic, because bisect throws away half the candidates on every answer and cannot notice a wrong one. A flaky run sends the search into the wrong half, and every later step narrows the wrong range with complete confidence. And a commit that cannot be built should exit with 125, which tells git to skip it, instead of being misclassified as bad. So run the script several times on the known-bad commit before you trust it.

## Permissions, not instructions

Separate reading from acting. An agent with read-only access to metrics, logs and traces is a powerful assistant. An agent with write access to production acts at machine speed on hypotheses that may be wrong, and it does not get tired, hesitate, or ask a colleague.

This is not hypothetical. In July 2025, in a widely reported case, an AI coding agent on a hosted development platform deleted a company's production database during an explicit code freeze, despite instructions not to make changes. The platform afterwards separated development from production databases by default. Here is the line to remember: instructions are not guardrails; permissions are. An agent with no credential capable of dropping a table cannot drop a table, whatever it decides.

So grade actions by reversibility and blast radius. Tier zero, observing: querying metrics and logs, reading config. The agent acts freely, with read-only credentials and an audit log. Tier one, reversible with a small blast radius: scaling up replicas, turning off a feature flag. The agent proposes, and a human approves the exact command. Tier two, reversible but large: rolling back a deploy, failing over a region. The agent proposes only, and a human executes through the normal deploy system. Tier three, irreversible: deleting data, running migrations, changing access control, purging queues. Never. The credentials do not exist in the agent's environment.

The tiers become real through runbook tools rather than a shell. The lesson's example is a scale tool that is dry-run by default, refuses to move more than 2 replicas per call or past 40, and holds a token that can only scale. The bounds live in the tool, not the prompt, so a mistaken or injected request cannot exceed them, and the worst outcome of a wrong approval is two extra replicas. And remediations take the normal path: an AI-suggested hotfix is a hypothesis in code form, so it goes through the canary, where a wrong fix is caught on a slice of traffic and rolled back automatically, instead of becoming a second incident.

During the incident, AI is useful as scribe, keeping the timeline; as summariser, drafting stakeholder updates the incident commander approves; as query writer, though you read every query before trusting its graph, because averaging per-instance 99th percentiles gives a number with no meaning, and a label filter that matches nothing draws a flat line that looks like recovery; and as runbook navigator. Not on the list: incident commander. Afterwards, it drafts the postmortem timeline, and humans own the contributing factors and the action items. "Improve monitoring" becomes an alert with a metric, a threshold, an owner and a date. And if an agent caused the incident, "the AI made a mistake" is not a finding. The finding is what let the mistake reach production.

## In the interview

A follow-up the lesson expects: the model says the 2:04 deploy caused the outage. What do you do in the next two minutes?

[pause]

Check the prediction that would refute it: pool wait time before and after 2:04, and errors on instances still on the old version. Then decide on the rollback with that evidence. The wrong answer is rolling back immediately because the timing fits. Rollbacks are often right, but deciding on an unverified story is how the second incident starts.

And another: what is the difference between telling an agent not to touch production and preventing it? An instruction is text in a context window that later text can override. Prevention is the absence of a credential, or a bounded runbook tool with approval. Only the second holds when the model is wrong. The wrong answer is "put it in the system prompt so it has higher priority".

## Recap

Four things to remember. Run debugging as hypothesis testing: every hypothesis needs a prediction that could refute it and evidence against, and an experiment decides. Reduce logs to signatures with counts and first-seen times before a model sees them, with the id rule before the number rule. Reproduce first, reject sleeps and retries as fixes for races, and let bisect search with a reproduction you have checked for flakiness. And grade production actions into tiers enforced by credentials and bounded tools, because instructions are not guardrails.

At your desk: the signature function and its hand trace, the hypothesis table, the bisect trace and its recovery commands, the tier table and the runbook tool, and the log-reduction exercise.
