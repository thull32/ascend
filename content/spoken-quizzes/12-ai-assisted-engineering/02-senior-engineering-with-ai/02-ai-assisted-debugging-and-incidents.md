---
lesson: ai-assisted-debugging-and-incidents
source: 10142166f49a2516
---
## 1

During an incident you have 400 megabytes of logs. What should you give the model?

A, error signatures with counts and first-seen times, plus recent deploys. B, as much of the raw log as fits in the context window, newest lines first. C, a random sample of raw lines, so the model sees a representative slice. D, the single most recent error line, since it best reflects the current state.

[think]

The answer is A: error signatures with counts and first-seen times, plus recent deploys.

Signatures with their variable parts normalised compress millions of lines into the patterns that matter. First-seen and last-seen times line up with the timeline of deploys and config changes, and normalisation keeps identifiers out of the prompt. Raw logs, whole or sampled, waste context, bury the signal and leak data, and one line lacks the pattern.

## 2

When building log signatures, why must the UUID replacement run before the number replacement?

A, the number rule would raise an error on the hexadecimal characters inside a UUID. B, otherwise the UUID's digits are replaced first, and every user gets a different signature. C, running UUIDs first is faster, because there are fewer of them in a typical log. D, UUIDs are longer, and regex engines always apply longer patterns first.

[think]

The answer is B: otherwise the UUID's digits are replaced first, and every user gets a different signature.

The rules are plain substitutions applied in sequence. If numbers go first, each run of digits inside a UUID becomes a placeholder, leaving a mix of placeholders and letters that differs for each user, so the lines no longer collapse into one signature. Order is the whole mechanism. Regex engines do not prioritise by length, and hex characters do not cause errors.

## 3

The AI states that the root cause is connection pool exhaustion after the deploy at 2:04. What should you do next?

A, ask the AI how confident it is, and act on it if it rates the cause as likely. B, check a prediction that could refute it, such as pool wait time around 2:04. C, roll back the 2:04 deploy at once, since the AI has identified the cause. D, restart the database to release the exhausted connections, and watch errors.

[think]

The answer is B: check a prediction that could refute it, such as pool wait time around 2:04.

A root cause is a hypothesis until a prediction is confirmed with data you looked at: here, pool wait time and active connections before and after 2:04, and errors on instances still on the old version. The check is quick and discriminating. A rollback may well be the right mitigation, but deciding it on an unverified story is how the second incident starts, and the model's confidence is not evidence.

## 4

An agent fixes an intermittently failing test by adding a half-second sleep before the assertion. The test now passes 100 times in a row. What is the right call?

A, accept it, since 100 passes in a row is strong evidence the race is gone. B, reject it, and ask for the interleaving that causes the failure. C, mark the test as flaky and skip it, since the code itself passes. D, raise the sleep to 2 seconds, so the margin covers slower CI machines.

[think]

The answer is B: reject it, and ask for the interleaving that causes the failure.

A timing change makes a race rarer, not absent, so a race fixed by a delay will return under different load or hardware, however many passes you see. The fix must remove the bad ordering, for example by waiting on the actual condition, or by synchronising the shared state.

## 5

Git bisect run reports an innocent commit as the first bad one. What is the most likely cause?

A, the range contained more than 1,000 commits, which exceeds what bisect can search. B, bisect always needs the bad commit to be given first, and the order was swapped. C, the regression is in a merge commit, which bisect cannot check out. D, the reproduction script was flaky, or classified an unbuildable commit as bad.

[think]

The answer is D: the reproduction script was flaky, or classified an unbuildable commit as bad.

Bisect halves the range on each answer, with no way to detect a wrong one. So a script that fails intermittently, or one that reports bad when the commit merely does not build, sends the search into the wrong half. Test the script repeatedly on the known-bad commit first, and return exit code 125 for commits to skip. Range size only adds steps, and merge commits are searchable.

## 6

An agent has been told in its instructions not to touch production during a code freeze, but its environment holds production database credentials with write access. What is the real control?

A, monitor its actions closely, and alert on any production writes. B, remove the write-capable credentials from the agent's environment. C, repeat the instruction in capital letters at the top of every prompt. D, require it to ask for confirmation before running each command.

[think]

The answer is B: remove the write-capable credentials from the agent's environment.

Instructions can be ignored or overridden by later context, and approvals suffer from fatigue. An agent without a credential that can write to production cannot write to production; bounded runbook tools, with a dry run and approval, cover the reversible actions it does need. Monitoring tells you after the fact.
