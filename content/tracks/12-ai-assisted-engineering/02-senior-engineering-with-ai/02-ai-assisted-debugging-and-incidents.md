---
slug: ai-assisted-debugging-and-incidents
title: "AI-assisted debugging and incident response"
description: Debugging as hypothesis testing with AI as the hypothesis generator, reducing logs to signatures before a model sees them (with a hand trace and an exercise), reproduce-first fixes and agent-driven bisects traced step by step, hard guardrails on production actions with runbook tools, AI's roles during and after an incident, and the questions an interviewer asks about all of it.
minutes: 30
difficulty: hard
tags: [ai-tools, debugging, incident-response, observability, guardrails, postmortems]
---
At 02:14 the pager fires: checkout p99 has gone from 300 ms to 3.1 s and the error rate is 4%. There are 400 MB of logs from the last hour, three deploys in the last day, and a dashboard with sixty panels. An AI can read more log lines in a minute than you can in an hour, and it will happily tell you what is wrong.

It may also tell you, fluently and with a plausible mechanism, the wrong thing. And if it has been given the permissions, it may act on the wrong thing at machine speed: restart the wrong deployment, or delete the "stuck" jobs that were your only record of which payments were in flight. AI makes the reading and the guessing faster. The senior skill is keeping the deciding and the acting under control, and this lesson is the set of mechanisms that do it: a reduction step that keeps the model's input small and honest, a hypothesis format the model cannot dodge, a deterministic search for regressions, and a tier system for what an agent may touch.

## Debugging is hypothesis testing

Every effective debugging session runs the same loop: observe, form hypotheses, predict what each hypothesis implies, run the experiment that distinguishes them, update. For a human, the expensive steps are observing at scale (reading) and generating hypotheses you had not thought of. For a model, those are cheap. What neither can do without evidence is know which hypothesis is true; only an experiment decides that.

So the division of labour is:

- **AI** widens the set of hypotheses, ranks them against the evidence you give it, and proposes discriminating experiments.
- **You** make sure each hypothesis carries a prediction that could refute it, run the experiments, and decide.

A hypothesis without a refutable prediction is a story. "It's connection pool exhaustion" becomes useful when it says: pool wait-time metrics will spike, errors will be timeouts acquiring a connection rather than query errors, and database CPU will be *low* because queries are not reaching it. A table with those three columns, hypothesis, prediction, observation, is the whole method, and it is what you ask the model to fill in.

## Reduce before you send

You cannot paste 400 MB of logs into a model (that is on the order of a hundred million tokens, five hundred times a 200,000-token window), and you should not paste even the first megabyte raw: it wastes the context window, buries the signal and ships customer identifiers to a third party. Reduce first. Group errors by *signature*, the message with its variable parts replaced by placeholders, and keep counts and first and last timestamps.

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

Trace `signature` on three lines by hand, rule by rule, to see why the order of the rules matters:

| Input line | After the UUID rule | After the hex rule | After the number rule |
|---|---|---|---|
| `timeout acquiring connection from pool "payments" after 5012ms` | unchanged | unchanged | `... after <n>ms` |
| `user 3f2504e0-4f89-11d3-9a0c-0305e82c3301 failed after 3 retries` | `user <uuid> failed after 3 retries` | unchanged | `user <uuid> failed after <n> retries` |
| `segfault at 0x7fff5fbff8a0 in worker 4` | unchanged | `segfault at <hex> in worker 4` | `segfault at <hex> in worker <n>` |

Run the number rule first and the second line becomes `user <n>f<n>e<n>-<n>f<n>-...`, a different signature for every user, and the whole point, collapsing millions of lines into a handful of patterns, is lost. Two million lines become a few kilobytes:

```text
  count  first     last      signature
 18,412  02:05:41  02:19:58  timeout acquiring connection from pool "payments" after <n>ms
  2,306  02:05:43  02:19:57  POST /v<n>/checkout failed: upstream payments timeout
    611  01:12:09  02:19:30  retrying idempotency lookup (attempt <n>)
     97  23:40:02  02:18:11  cache miss burst on key prefix sku:<n>

Changes: 23:10 web v88 deployed; 01:10 search v301 deployed;
         02:04 payments-api v412 deployed (DB pool max 50 -> 20 in config).
```

### The prompt, and the answer it earns

Now the prompt:

```text
Below are the top error signatures (count, first seen, last seen) and the
change timeline for the last 24 hours. List up to five hypotheses ranked by
fit. For each: the evidence for it, the evidence against it, and one query
or experiment that would distinguish it from the others. Do not propose a
remediation yet.
```

Asking for evidence *against* each hypothesis and for a discriminating experiment is what turns the model from a storyteller into a useful colleague. Here the top signature's first-seen time (02:05:41) sits 90 seconds after a deploy that cut the pool size from 50 to 20; that is strong but still circumstantial. The discriminating experiment is cheap: compare pool wait time and active connections before and after 02:04, and check whether the instances still on v411 show the same errors.

An illustrative response, in the format the prompt asked for:

| Hypothesis | For | Against | Discriminating check |
|---|---|---|---|
| Pool shrunk to 20 by v412 cannot serve peak concurrency | First-seen 90 s after deploy; error is a pool timeout, not a query error | Peak traffic at 02:00 is normal for this hour | Pool wait p99 and active connections, 01:55 vs 02:10; errors on v411 instances (should be none) |
| Slow database (lock contention or a bad plan) | Would also produce pool timeouts | Database CPU and query latency flat; no slow-query log entries | Database-side latency for the checkout queries around 02:05 |
| Payments provider slow upstream | 2,306 upstream-timeout lines | Those start after the pool errors and are the handler's own timeout | Provider status page and the provider's response-time histogram |
| Idempotency retries amplifying load | 611 retry lines | Started at 01:12, steady rate, unchanged at 02:05 | Retry rate before and after 02:04 (expected: flat) |

Two of the four are ruled out by facts already in the summary, one by a metric you can read in a minute. That is what a good reduction buys: the model's ranking is checkable against the same evidence it was given.

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

Watch for the classic non-fix on intermittent failures: the agent adds `sleep(0.5)`, a retry decorator, or a longer timeout, and the test goes green. The race is still there; it is rarer. Reject it and ask for the mechanism: "what interleaving of these two operations produces the failure?" A fix you can explain in terms of ordering or state is a fix; a fix that changes timing is a delay. [What to still do by hand](/learn/ai-assisted-engineering/senior-engineering-with-ai/what-to-still-do-by-hand) shows how to script the interleaving so the reproduction is deterministic.

### Bisect: let git do the search

When a regression appeared somewhere in a range of commits, let git do the search and the agent do the typing:

```bash
git bisect start v412 v405          # bad, then good
git bisect run ./scripts/repro.sh   # exit 0 = good, 1..127 (except 125) = bad, 125 = skip this commit
git bisect reset
```

The agent writes `repro.sh`; git performs a binary search over the commits between the two marks. Trace it on eight commits after the good tag, `c1` to `c8`, where `c8` is `v412` and the regression entered at `c5`:

| Step | Candidates remaining | Git checks out | `repro.sh` exit | Conclusion |
|---|---|---|---|---|
| 1 | c1 … c8 (8) | c4 | 0 (good) | bug is in c5 … c8 |
| 2 | c5 … c8 (4) | c6 | 1 (bad) | bug is in c5 … c6 |
| 3 | c5 … c6 (2) | c5 | 1 (bad) | **c5 is the first bad commit** |

Three runs for eight commits; about ten for a thousand, because $\log_2 1000 \approx 10$. Each step halves the range whatever the answer, so the cost is bounded before you start, which a model's guess about which commit "looks suspicious" is not. Two things make bisect run reliably: the script must be deterministic (a flaky reproduction sends the search down the wrong half, and bisect cannot notice), and a commit that cannot be built should return 125 so git skips it instead of misclassifying it.

### Under the hood: what bisect does with your answers

Bisect keeps two sets of marks, good and bad. Its candidates are the commits that are ancestors of the bad mark and not of any good mark, and at each step it checks out one that splits them and prints the budget before you spend it; the [git documentation](https://git-scm.com/docs/git-bisect)'s own example reads `Bisecting: 675 revisions left to test after this (roughly 10 steps)`. Every answer removes about half the candidates for good, which is exactly why a wrong answer is so expensive: the true culprit may now sit in the half that was thrown away, and every later step narrows the wrong range with complete confidence.

`git bisect run` reads your script's exit code: 0 marks the commit good, 1 to 127 except 125 marks it bad, 125 skips it, and any other code aborts the run. That last rule matters when an agent writes the script: if its final command dies from a signal, the shell reports 128 plus the signal number and the search stops rather than recording a crash as the bug.

Three commands cover the ways a run goes wrong. `git bisect log` prints every mark so far; when you find one that a flaky run got wrong, save the log, delete that line and `git bisect replay` the file to resume from the corrected state instead of starting over. `git bisect skip` handles untestable commits, at a cost the documentation spells out: skip the commit next to the culprit and git can only name a range. And `git bisect start --first-parent` follows only the first parent at each merge, so a merged branch full of broken intermediate commits is judged by its merge commit alone.

## Guardrails on production actions

Separate reading from acting. An agent with read-only access to metrics, logs and traces is a powerful assistant. An agent with write access to production acts at machine speed on hypotheses that may be wrong, and it does not get tired, hesitate or ask a colleague.

This is not hypothetical. In July 2025, in a widely reported case, an AI coding agent running on a hosted development platform deleted a company's production database during an explicit code freeze, despite instructions not to make changes; the platform's chief executive apologised publicly, and the platform subsequently separated development from production databases by default. The lesson is the one from the MCP lesson: **instructions are not guardrails; permissions are.** An agent that has no credential capable of dropping a table cannot drop a table, whatever it decides.

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

### A bounded runbook tool

A tier-1 tool, as an MCP tool in the shape from [MCP and integrations](/learn/ai-assisted-engineering/tools-and-workflows/mcp-and-integrations), looks like this. The bounds live in the tool, not in the prompt, so an injected or mistaken request cannot exceed them:

```python
import os, re, httpx
from mcp.server import MCPServer

mcp = MCPServer("ops")
API = os.environ["DEPLOY_API_URL"]
TOKEN = os.environ["OPS_SCALE_TOKEN"]          # scoped: scale only, no delete, no IAM
SERVICE = re.compile(r"^[a-z][a-z0-9-]{1,40}$")
MAX_STEP = 2                                    # at most +2 replicas per call
MAX_REPLICAS = 40

@mcp.tool()
def scale_service(service: str, replicas: int, dry_run: bool = True) -> str:
    """Scale one service up or down by at most 2 replicas, capped at 40. Dry-run by default."""
    if not SERVICE.fullmatch(service):
        raise ValueError("service must be a lowercase service name")
    current = httpx.get(f"{API}/v1/services/{service}", headers={"Authorization": f"Bearer {TOKEN}"}, timeout=5.0).json()["replicas"]
    if abs(replicas - current) > MAX_STEP or not 1 <= replicas <= MAX_REPLICAS:
        raise ValueError(f"refusing: {current} -> {replicas} exceeds the per-call bound")
    if dry_run:
        return f"DRY RUN {service}: {current} -> {replicas} replicas (call again with dry_run=false to apply)"
    httpx.post(f"{API}/v1/services/{service}/scale", json={"replicas": replicas},
               headers={"Authorization": f"Bearer {TOKEN}"}, timeout=5.0).raise_for_status()
    return f"{service}: {current} -> {replicas} replicas"
```

Pair it with a client rule that requires approval for the non-dry-run call (in Claude Code, at the time of writing, `mcp__ops__scale_service` in the `ask` list of `permissions`) and the human sees the exact command before it runs. The token behind the tool cannot delete anything, so the worst outcome of a wrong approval is two extra replicas.

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

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| The dashboard query the model drafted shows p99 "recovering" while users still time out | The query averages per-instance p99s, or its label filter matches nothing and draws a flat line | Read every generated query before trusting its graph; aggregate histograms, never percentiles of percentiles; confirm the series has samples |
| The model's confident "root cause" is rolled back and the incident continues | Anchoring on the first story; the deploy was correlated in time but not causal | Require one confirmed prediction per hypothesis before acting; check evidence against, and timing |
| A flaky test is "fixed" and returns a month later on faster CI machines | A timing change (sleep, retry, longer timeout) made the race rarer | Reject fixes that cannot be stated as an ordering or state change; script the interleaving |
| Bisect names an innocent commit | The reproduction script was flaky or a build failure was classified as bad | Run the script five times on the known-bad commit first; return 125 for unbuildable commits; correct a wrong mark with `git bisect log` and `git bisect replay` |
| An agent restarted the wrong deployment at 02:20 | It held a credential for a tier-2 action and acted on an unverified hypothesis | Remove write credentials; put actions behind runbook tools with dry-run and human approval; route remediations through the canary |
| The postmortem's action items are "improve monitoring" and "add tests" | Generated items with no owner, date or threshold | Rewrite each item with a metric, a threshold, an owner and a date, or delete it |

## Interviewer follow-ups

**"You have 400 MB of logs and a model with a 200,000-token window. What do you send it?"** Model answer: nothing raw; error signatures with variable parts normalised, counts, first and last seen, plus the change timeline, on the order of a few kilobytes; the normalisation also keeps identifiers out of the prompt. Common wrong answer: "the most recent chunk that fits", which loses the pattern and leaks data.

**"The model says the 02:04 deploy caused the outage. What do you do in the next two minutes?"** Model answer: check the prediction that would refute it (pool wait time before and after 02:04; errors on instances still on the old version), then decide on the rollback with that evidence. Common wrong answer: roll back immediately because the timing fits; rollbacks are often right, but deciding on an unverified story is how the second incident starts.

**"How many runs does bisect need for 1,000 commits, and what makes it unreliable?"** Model answer: about ten, halving each time; a flaky reproduction or a build failure classified as bad sends it down the wrong half, so test the script on the known-bad commit repeatedly first and return 125 for unbuildable commits. Common wrong answer: "it depends on where the bug is", which describes linear search.

**"What is the difference between telling an agent not to touch production and preventing it?"** Model answer: an instruction is text in a context window that later text can override; prevention is the absence of a credential or the presence of a bounded runbook tool with approval; only the second holds when the model is wrong. Common wrong answer: "put the instruction in the system prompt so it has higher priority".

**"Why should an AI-suggested hotfix go through the canary rather than straight to all instances during an incident?"** Model answer: the fix is a hypothesis in code; the canary compares it against the current version on a slice of traffic and rolls back automatically if error rate or latency diverge, so a wrong fix costs one analysis window instead of a second incident. Common wrong answer: "during an incident speed matters more, skip the canary".

## What mid-level engineers get wrong

- **Pasting raw logs into the model.** Context is wasted, the signal is buried under repeated lines, and customer identifiers leave the building; signatures with counts carry the same information in a thousandth of the tokens.
- **Accepting a root cause because the mechanism sounds right.** Fluent mechanisms are cheap; a confirmed prediction is the only evidence, and the timing check ("was it already happening an hour earlier?") is the fastest one.
- **Asking for a verdict instead of a distinction.** "What is wrong?" returns a story; "what would distinguish A from B?" returns an experiment.
- **Fixing intermittent failures with sleeps and retries.** The race is rarer, not gone; it returns on different hardware, now harder to reproduce.
- **Guessing at the regressing commit.** Bisect is a bounded binary search; a guess is not, and the agent is good at writing the reproduction script that bisect needs.
- **Giving the incident agent the on-call engineer's credentials.** It acts at machine speed on unverified hypotheses; give it read-only access and bounded runbook tools instead.
- **Letting generated action items stand.** "Improve monitoring" with no metric, owner or date is a postmortem that changes nothing.

## Exercise

```exercise
id: top-signatures
title: Reduce a log to its top error signatures
prompt: |
  Write `top_signatures(entries, top)`, the reduction step you run before a
  model sees any log. `entries` is a time-ordered list of
  `[timestamp, level, message]` triples (timestamps are strings that sort
  correctly). Only `ERROR` and `WARN` entries count.

  Build each message's signature by applying these replacements **in this
  order** to the whole message: lower-case UUIDs (8-4-4-4-12 hex digits)
  become `<uuid>`; `0x` followed by one or more lower-case hex digits becomes
  `<hex>`; every remaining number (digits, optionally a dot and more digits)
  becomes `<n>`.

  Return a list of `[count, first_seen, last_seen, signature]` for the `top`
  most frequent signatures, sorted by count descending, then by first-seen
  ascending, then by signature ascending. `first_seen` and `last_seen` are
  the timestamps of the earliest and latest counted entries with that
  signature. Return an empty list when nothing counts.
languages: [python, javascript]
entry: top_signatures
starter:
  python: |
    import re

    def top_signatures(entries, top):
        # Apply the three replacements in order, count per signature,
        # remember first and last seen, sort, and slice.
        return []
  javascript: |
    function top_signatures(entries, top) {
      // Apply the three replacements in order, count per signature,
      // remember first and last seen, sort, and slice.
      return [];
    }
tests:
  - args: [[["02:05:41", "ERROR", "timeout acquiring connection from pool after 5000ms"], ["02:05:43", "ERROR", "timeout acquiring connection from pool after 5012ms"], ["02:05:44", "INFO", "request ok in 12ms"], ["02:06:01", "WARN", "retrying idempotency lookup (attempt 2)"]], 10]
    expected: [[2, "02:05:41", "02:05:43", "timeout acquiring connection from pool after <n>ms"], [1, "02:06:01", "02:06:01", "retrying idempotency lookup (attempt <n>)"]]
    label: numbers normalised, INFO ignored
  - args: [[["01:00:00", "ERROR", "user 3f2504e0-4f89-11d3-9a0c-0305e82c3301 failed after 3 retries"], ["01:00:05", "ERROR", "user 7c9e6679-7425-40de-944b-e07fc1f90ae7 failed after 12 retries"]], 5]
    expected: [[2, "01:00:00", "01:00:05", "user <uuid> failed after <n> retries"]]
    label: uuid before number
  - args: [[["03:10:00", "WARN", "segfault at 0x7fff5fbff8a0 in worker 4"]], 5]
    expected: [[1, "03:10:00", "03:10:00", "segfault at <hex> in worker <n>"]]
    label: hex address
  - args: [[["04:00:00", "ERROR", "latency 12.5ms exceeded budget 10ms"], ["04:00:01", "ERROR", "latency 130.25ms exceeded budget 10ms"]], 5]
    expected: [[2, "04:00:00", "04:00:01", "latency <n>ms exceeded budget <n>ms"]]
    label: decimals are one number
  - args: [[], 5]
    expected: []
    label: empty log
  - args: [[["05:00:00", "ERROR", "cache miss burst on key prefix sku:9"], ["05:00:01", "ERROR", "disk full on /dev/sda1"], ["05:00:02", "ERROR", "disk full on /dev/sda2"], ["05:00:03", "ERROR", "cache miss burst on key prefix sku:12"]], 1]
    expected: [[2, "05:00:00", "05:00:03", "cache miss burst on key prefix sku:<n>"]]
    hidden: true
    label: tie broken by first seen
  - args: [[["06:00:00", "ERROR", "POST /v2/checkout failed: upstream timeout"], ["06:30:00", "INFO", "POST /v2/checkout failed: upstream timeout"], ["07:00:00", "ERROR", "POST /v3/checkout failed: upstream timeout"]], 5]
    expected: [[2, "06:00:00", "07:00:00", "POST /v<n>/checkout failed: upstream timeout"]]
    hidden: true
    label: first and last seen use only counted levels
  - args: [[["08:00:00", "WARN", "a 1"], ["08:00:01", "WARN", "b 2"], ["08:00:02", "WARN", "b 3"], ["08:00:03", "WARN", "c 4"], ["08:00:04", "WARN", "c 5"], ["08:00:05", "WARN", "c 6"]], 2]
    expected: [[3, "08:00:03", "08:00:05", "c <n>"], [2, "08:00:01", "08:00:02", "b <n>"]]
    hidden: true
    label: top-k by count
hints:
  - "Three regular expressions applied in order: the UUID pattern, then 0x[0-9a-f]+, then \\d+(?:\\.\\d+)? (in JavaScript use the g flag or replaceAll)."
  - "Keep three maps keyed by signature: count, first seen (set only if absent) and last seen (always overwritten). Entries are time-ordered, so no comparison of timestamps is needed."
  - "Sort with a compound key: count descending, then first seen ascending, then signature ascending; in JavaScript compare strings with < and > rather than subtracting."
```

## Senior signals

- You run debugging as **hypothesis testing**: AI generates and ranks hypotheses, each with a refutable prediction and evidence against, and experiments decide.
- You **reduce logs to signatures** with counts and first-seen times before any model sees them, for context, signal and privacy, and you know why the normalisation rules are ordered.
- You guard against **anchoring** by asking for disconfirming evidence and checking that timing lines up.
- You insist on **reproduce-first** fixes, reject timing-based non-fixes for races, and let `git bisect run` do deterministic searches with a reproduction you have checked for flakiness.
- You grade production actions into **autonomy tiers** and enforce them with credentials and bounded runbook tools, because instructions are not guardrails.
- You keep **humans in command** of incidents and use AI as scribe, summariser and query drafter, reading every generated query before trusting its graph.

## Check yourself

```quiz
- q: >-
    During an incident you have 400 MB of logs. What should you give the model?
  options: ["Error signatures with counts and first-seen times, plus recent deploys", "As much of the raw log as fits in the context window, newest lines first", "A random sample of raw lines, so the model sees a representative slice", "The single most recent error line, since it best reflects the current state"]
  answer: 0
  explanation: >-
    Signatures with variable parts normalised compress millions of lines into the patterns that matter, first- and last-seen times line up with the change timeline of deploys and config changes, and normalisation keeps identifiers out of the prompt. Raw logs, whole or sampled, waste context, bury the signal and leak data; one line lacks the pattern.
- q: >-
    Why must the UUID replacement run before the number replacement when building log signatures?
  options: ["The number rule would raise an error on hexadecimal characters inside a UUID", "Otherwise UUID digits are replaced first and every user gets a different signature", "Running UUIDs first is faster because there are fewer of them in a typical log", "UUIDs are longer, and longer patterns are always applied first by regex engines"]
  answer: 1
  explanation: >-
    The rules are plain sequential substitutions. If numbers go first, a UUID like 3f2504e0-4f89-... becomes <n>f<n>e<n>-<n>f<n>-..., a different string for each user, and the lines no longer collapse into one signature. Order is the whole mechanism; regex engines do not prioritise by length, and hex characters do not cause errors.
- q: >-
    The AI states that the root cause is connection pool exhaustion after the 02:04 deploy. What should you do next?
  options: ["Ask the AI how confident it is, and act on it if it rates the cause as likely", "Check a prediction that could refute it, such as pool wait time around 02:04", "Roll back the 02:04 deploy at once, since the AI has identified the cause", "Restart the database to release the exhausted connections and watch errors"]
  answer: 1
  explanation: >-
    A root cause is a hypothesis until a prediction is confirmed with data you looked at: here, pool wait time and active connections before and after 02:04, and errors on instances still on the old version. The check is quick and discriminating. A rollback may well be the right mitigation, but deciding it on an unverified story is how the second incident starts, and the model's confidence is not evidence.
- q: >-
    An agent fixes an intermittently failing test by adding sleep(0.5) before the assertion. The test now passes 100 times in a row. What is the right call?
  options: ["Accept it, since 100 passes in a row is strong evidence the race is gone", "Reject it and ask for the interleaving that causes the failure", "Mark the test as flaky and skip it, since the code itself passes", "Raise the sleep to 2 seconds, so the margin covers slower CI machines"]
  answer: 1
  explanation: >-
    A timing change makes a race rarer, not absent, so a race fixed by delay will return under different load or hardware however many passes you see. The fix must remove the bad ordering, for example by waiting on the actual condition or synchronising the shared state.
- q: >-
    git bisect run reports an innocent commit as the first bad one. What is the most likely cause?
  options: ["The range contained more than 1,000 commits, which exceeds what bisect can search", "Bisect always needs the bad commit to be given first, and the order was swapped", "The regression is in a merge commit, which bisect cannot check out", "The reproduction script was flaky or classified an unbuildable commit as bad"]
  answer: 3
  explanation: >-
    Bisect halves the range on each answer with no way to detect a wrong one, so a script that fails intermittently, or one that returns a bad exit code when the commit merely does not build, sends the search into the wrong half. Test the script repeatedly on the known-bad commit first and return 125 for commits to skip. Range size only adds steps, and merge commits are searchable.
- q: >-
    An agent has been told in its instructions not to touch production during a code freeze, but its environment holds production database credentials with write access. What is the real control?
  options: ["Monitor its actions closely and alert on any production writes", "Remove the write-capable credentials from the agent's environment", "Repeat the instruction in capital letters at the top of every prompt", "Require it to ask for confirmation before running each command"]
  answer: 1
  explanation: >-
    Instructions can be ignored or overridden by later context, and approvals suffer fatigue. An agent without a credential that can write to production cannot write to production; bounded runbook tools with dry-run and approval cover the reversible actions it does need. Monitoring tells you after the fact.
```
