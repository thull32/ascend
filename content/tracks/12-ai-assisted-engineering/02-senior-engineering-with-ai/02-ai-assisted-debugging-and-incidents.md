---
slug: ai-assisted-debugging-and-incidents
title: "AI-assisted debugging and incident response"
description: Debugging as hypothesis testing with AI as the hypothesis generator, reducing logs before a model sees them, reproduce-first fixes and agent-driven bisects, hard guardrails on production actions, and AI's roles during and after an incident.
minutes: 20
difficulty: hard
tags: [ai-tools, debugging, incident-response, observability, guardrails, postmortems]
---
At 02:14 the pager fires: checkout p99 has gone from 300 ms to 3.1 s and the error rate is 4%. There are 400 MB of logs from the last hour, three deploys in the last day, and a dashboard with sixty panels. An AI can read more log lines in a minute than you can in an hour, and it will happily tell you what is wrong.

It may also tell you, fluently and with a plausible mechanism, the wrong thing. And if it has been given the permissions, it may act on the wrong thing at machine speed: restart the wrong deployment, or delete the "stuck" jobs that were your only record of which payments were in flight. AI makes the reading and the guessing faster. The senior skill is keeping the deciding and the acting under control.

## Debugging is hypothesis testing

Every effective debugging session runs the same loop: observe, form hypotheses, predict what each hypothesis implies, run the experiment that distinguishes them, update. For a human, the expensive steps are observing at scale (reading) and generating hypotheses you had not thought of. For a model, those are cheap. What neither can do without evidence is know which hypothesis is true; only an experiment decides that.

So the division of labour is:

- **AI** widens the set of hypotheses, ranks them against the evidence you give it, and proposes discriminating experiments.
- **You** make sure each hypothesis carries a prediction that could refute it, run the experiments, and decide.

A hypothesis without a refutable prediction is a story. "It's connection pool exhaustion" becomes useful when it says: pool wait-time metrics will spike, errors will be timeouts acquiring a connection rather than query errors, and database CPU will be *low* because queries are not reaching it.

## Reduce before you send

You cannot paste 400 MB of logs into a model (that is on the order of a hundred million tokens), and you should not paste even the first megabyte raw: it wastes the context window, buries the signal and ships customer identifiers to a third party. Reduce first. Group errors by *signature*, the message with its variable parts replaced by placeholders, and keep counts and first and last timestamps.

```python
import re
from collections import Counter

# Order matters: replace UUIDs and hex before bare numbers,
# or the digits inside a UUID get replaced first and it no longer matches.
VARIABLE = [
    (re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"), "<uuid>"),
    (re.compile(r"0x[0-9a-f]+"), "<hex>"),
    (re.compile(r"\d+(?:\.\d+)?"), "<n>"),
]

def signature(message: str) -> str:
    for pattern, placeholder in VARIABLE:
        message = pattern.sub(placeholder, message)
    return message

def summarise(entries, top=10):
    """entries: time-ordered (timestamp, level, message) tuples."""
    counts, first, last = Counter(), {}, {}
    for ts, level, msg in entries:
        if level not in ("ERROR", "WARN"):
            continue
        sig = signature(msg)
        counts[sig] += 1
        first.setdefault(sig, ts)
        last[sig] = ts
    return [(n, first[s], last[s], s) for s, n in counts.most_common(top)]
```

Two million lines become a few kilobytes:

```text
  count  first     last      signature
 18,412  02:05:41  02:19:58  timeout acquiring connection from pool "payments" after <n>ms
  2,306  02:05:43  02:19:57  POST /v<n>/checkout failed: upstream payments timeout
    611  01:12:09  02:19:30  retrying idempotency lookup (attempt <n>)
     97  23:40:02  02:18:11  cache miss burst on key prefix sku:<n>

Changes: 23:10 web v88 deployed; 01:10 search v301 deployed;
         02:04 payments-api v412 deployed (DB pool max 50 -> 20 in config).
```

Now the prompt:

```text
Below are the top error signatures (count, first seen, last seen) and the
change timeline for the last 24 hours. List up to five hypotheses ranked by
fit. For each: the evidence for it, the evidence against it, and one query
or experiment that would distinguish it from the others. Do not propose a
remediation yet.
```

Asking for evidence *against* each hypothesis and for a discriminating experiment is what turns the model from a storyteller into a useful colleague. Here the top signature's first-seen time (02:05:41) sits 90 seconds after a deploy that cut the pool size from 50 to 20; that is strong but still circumstantial. The discriminating experiment is cheap: compare pool wait time and active connections before and after 02:04, and check whether the instances still on v411 show the same errors.

## Do not anchor on the first story

Models and people both anchor on the first plausible explanation. Protect against it deliberately:

- Ask "what would we expect to see if hypothesis 1 were false?" and look for it.
- Check that timing lines up. The 611 idempotency retries began at 01:12, an hour before the incident, and continue at the same rate: pre-existing noise, not the cause, however alarming the message sounds.
- Treat the AI's "root cause" as a hypothesis until one of its predictions has been confirmed by data you looked at yourself.

## Asking better debugging questions

The quality of an AI's debugging help tracks the quality of the question more closely than the model. Compare:

| Weak | Strong |
|---|---|
| "Why is checkout slow?" | "Checkout p99 went from 300 ms to 3.1 s at 02:05. Here are the top error signatures and the change timeline. What would distinguish pool exhaustion from a slow downstream?" |
| "Fix this error" plus a pasted stack trace | "This `KeyError: 'currency'` occurs only for orders created before 2024-03. Here is the trace and the serializer. What changed in the shape of old orders?" |
| "Is this code correct?" | "This passes single-threaded tests. Under 8 concurrent workers, which interleavings could violate the invariant that `used <= limit`?" |
| "What does this log mean?" | "Which of these signatures started within 5 minutes of the 02:04 deploy, and which were already present an hour earlier?" |

The strong versions share three features: a precise symptom with numbers and timestamps, the evidence already gathered, and a request for a distinction rather than a verdict. The last one matters most. "What would distinguish A from B?" produces an experiment you can run; "what is the cause?" produces a story you have to check anyway.

## Reproduce first, then fix

Outside the heat of an incident, the agentic workflow applies with one change: **reproduce before fixing**. Ask the agent for a failing test or script that demonstrates the bug, confirm it fails for the right reason, then ask for the fix. The reproduction proves the bug is understood and becomes the regression test.

Watch for the classic non-fix on intermittent failures: the agent adds `sleep(0.5)`, a retry decorator, or a longer timeout, and the test goes green. The race is still there; it is just rarer. Reject it and ask for the mechanism: "what interleaving of these two operations produces the failure?" A fix you can explain in terms of ordering or state is a fix; a fix that changes timing is a delay.

When a regression appeared somewhere in a range of commits, let git do the search and the agent do the typing:

```bash
git bisect start v412 v405          # bad, then good
git bisect run ./scripts/repro.sh   # exit 0 = good, 1 = bad, 125 = skip this commit
git bisect reset
```

The agent writes `repro.sh`; git performs a binary search. Seven commits take about 3 steps; 1,000 commits take about 10, because $\log_2 1000 \approx 10$. A deterministic search beats a model's guess about which commit "looks suspicious".

## Guardrails on production actions

Separate reading from acting. An agent with read-only access to metrics, logs and traces is a powerful assistant. An agent with write access to production acts at machine speed on hypotheses that may be wrong, and it does not get tired, hesitate or ask a colleague.

This is not hypothetical. In a widely reported 2025 case, an AI coding agent on a hosted development platform deleted a company's production database during an explicit code freeze, despite instructions not to make changes. The lesson is the one from the MCP lesson: **instructions are not guardrails; permissions are.** An agent that has no credential capable of dropping a table cannot drop a table, whatever it decides.

Grade actions by reversibility and blast radius:

| Tier | Examples | The agent may | Guardrail |
|---|---|---|---|
| 0: Observe | Query metrics, logs and traces; read config; describe resources | Act freely | Read-only credentials, rate limits, audit log |
| 1: Reversible, small blast radius | Scale up replicas, turn off a feature flag, drain one instance | Propose; a human approves the exact command | Runbook-backed tools with dry-run output shown |
| 2: Reversible, large blast radius | Roll back a deploy, fail over a region | Propose only; a human executes through the normal deploy system | Canary with automatic rollback, a second person |
| 3: Irreversible | Delete data, run migrations, change IAM, purge queues | Never | The credentials do not exist in the agent's environment |

Design principles that make the tiers real:

- **Runbook tools, not a shell.** `scale_service(name, replicas)` with bounds is auditable; `kubectl` with cluster-admin is not.
- **Dry-run by default**, with the diff shown to the approver.
- **Blast-radius limits built into the tool**: one instance, one percent, one region at a time.
- **Remediations take the normal path.** A hotfix goes out through the same canary as any release, so a wrong fix is rolled back automatically instead of making the incident worse.

```viz
{"type": "system", "scenario": "canary", "requests": 20, "title": "Remediation goes through the canary too", "caption": "An AI-suggested fix is a hypothesis in code form. Shipping it through the canary means a wrong fix is caught on a slice of traffic and rolled back automatically, instead of becoming a second incident."}
```

## During the incident: useful roles for AI

- **Scribe.** Maintain the timeline from the incident channel, alerts and deploy history.
- **Summariser.** Draft stakeholder updates every 30 minutes; the incident commander edits and approves, and customer-facing text always gets a human read.
- **Query writer.** Draft PromQL, SQL and log queries, which you read before trusting the graph. A classic generated mistake is averaging per-instance p99s, a number with no meaning (see [Observability](/learn/system-design/building-blocks/observability)); another is a label filter that matches nothing, which draws a flat line that looks like recovery.
- **Runbook navigator.** Find the relevant section and the exact commands, for a human to run.

Not on the list: incident commander, or the one who decides to fail over. Those roles need accountability and judgement about business risk that the model does not have.

## After: postmortems

AI saves hours in the postmortem by drafting the timeline from chat logs, alerts and deploy history. Humans own the causal analysis, which in complex systems is a set of contributing factors rather than one root cause, and the action items. Generated action items tend to be generic ("improve monitoring"); each one should be specific, owned and dated ("alert when payments pool wait p99 exceeds 100 ms for 5 minutes; owner: Priya; by 2026-10-10"). See [Incidents and postmortems](/learn/senior-craft/technical-leadership/incidents-and-postmortems).

Blameless analysis applies when an agent caused the incident too. "The AI made a mistake" is not a finding. The finding is what allowed the mistake to reach production: which credential it held, which approval was missing, which check did not exist.

## Senior signals

- You run debugging as **hypothesis testing**: AI generates and ranks hypotheses, each with a refutable prediction, and experiments decide.
- You **reduce logs to signatures** with counts and first-seen times before any model sees them, for context, signal and privacy.
- You guard against **anchoring** by asking for disconfirming evidence and checking that timing lines up.
- You insist on **reproduce-first** fixes, reject timing-based non-fixes for races, and let `git bisect run` do deterministic searches.
- You grade production actions into **autonomy tiers** and enforce them with credentials and runbook tools, because instructions are not guardrails.
- You keep **humans in command** of incidents and use AI as scribe, summariser and query drafter.

## Check yourself

```quiz
- q: >-
    During an incident you have 400 MB of logs. What should you give the model?
  options: ["The single most recent error line, since it best reflects the current state", "Normalised error signatures with counts and first-seen times, plus recent changes", "As much of the raw log as fits in the context window, newest lines first", "A random sample of raw lines, so the model sees a representative slice"]
  answer: 1
  explanation: >-
    Signatures with variable parts normalised compress millions of lines into the patterns that matter, first- and last-seen times line up with the change timeline of deploys and config changes, and normalisation keeps identifiers out of the prompt. Raw logs, whole or sampled, waste context, bury the signal and leak data; one line lacks the pattern.
- q: >-
    The AI states that the root cause is connection pool exhaustion after the 02:04 deploy. What should you do next?
  options: ["Roll back the 02:04 deploy at once, since the AI has identified the cause", "Check a prediction that could refute it, such as pool wait time around 02:04", "Restart the database to release the exhausted connections and watch errors", "Ask the AI how confident it is, and act on it if it rates the cause as likely"]
  answer: 1
  explanation: >-
    A root cause is a hypothesis until a prediction is confirmed with data you looked at: here, pool wait time and active connections before and after 02:04, and errors on instances still on the old version. The check is quick and discriminating. A rollback may well be the right mitigation, but deciding it on an unverified story is how the second incident starts, and the model's confidence is not evidence.
- q: >-
    An agent fixes an intermittently failing test by adding sleep(0.5) before the assertion. The test now passes 100 times in a row. What is the right call?
  options: ["Accept it, since 100 passes in a row is strong evidence the race is gone", "Mark the test as flaky and skip it, since the code itself passes", "Reject it and ask for the interleaving that causes the failure", "Raise the sleep to 2 seconds, so the margin covers slower CI machines"]
  answer: 2
  explanation: >-
    A timing change makes a race rarer, not absent, so a race fixed by delay will return under different load or hardware however many passes you see. The fix must remove the bad ordering, for example by waiting on the actual condition or synchronising the shared state.
- q: >-
    A regression appeared somewhere in the last 1,000 commits and the agent has written a reliable reproduction script. About how many test runs will git bisect run need?
  options: ["About 500", "About 10", "About 100", "About 1,000"]
  answer: 1
  explanation: >-
    Bisect halves the range each step, so it needs about log2(1000), roughly 10 runs. That is why a deterministic binary search beats asking a model which commit looks suspicious.
- q: >-
    An agent has been told in its instructions not to touch production during a code freeze, but its environment holds production database credentials with write access. What is the real control?
  options: ["Repeat the instruction in capital letters at the top of every prompt", "Remove the write-capable credentials from the agent's environment", "Require it to ask for confirmation before running each command", "Monitor its actions closely and alert on any production writes"]
  answer: 1
  explanation: >-
    Instructions can be ignored or overridden by later context, and approvals suffer fatigue. An agent without a credential that can write to production cannot write to production. Monitoring tells you after the fact.
```
