---
review: senior-engineering-with-ai
source: bb5506bcf3e92fc4
---
## Introduction

Twelve questions from the senior-engineering-with-ai module. Answer out loud before the answer comes.

They follow the lessons in order: AI in design docs and code review, AI-assisted debugging and incidents, learning without atrophy, the AI-native interview, and what to still do by hand. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A generated design says a Kafka-based webhook pipeline gives exactly-once refunds, because Kafka supports exactly-once semantics. What is wrong?

A, Kafka has no transactions, so it cannot offer exactly-once in any form. B, nothing, since Kafka's exactly-once semantics extend to the consumer's side effects. C, exactly-once only holds with a single partition, which cannot carry this load. D, Kafka's guarantee stops at Kafka; the refund side effect still needs idempotency.

[think]

The answer is D: Kafka's guarantee stops at Kafka, and the refund needs idempotency.

Kafka's exactly-once covers reading, processing and writing within Kafka, using transactions. A refund applied to a database or an external API is a side effect outside that transaction. A consumer can apply it and crash before committing its offset, then process the event again. Idempotency keyed on the event id, at the point of the side effect, is what prevents a double refund.

## Question 2

Your team has started ignoring the AI review bot's comments. What is the most likely cause, and the fix?

A, engineers distrust automation, so require a reply to every bot comment. B, the bot's model is too small, so switch to a larger one to improve its accuracy. C, the bot is too slow, so run it after merge so it never blocks work. D, too many of its comments need no action, so tune it for precision and track the acted-on rate.

[think]

The answer is D: too many comments need no action; tune for precision and track the acted-on rate.

When most comments need no action, skimming becomes the rational default, and the correct comments get skimmed too. For a stream humans read, precision matters more than recall: restrict the bot to changed lines and higher severity, drop style comments, and track weekly the share of comments that lead to a change. Mandating replies to noise adds cost without restoring trust, and a bigger model does not fix a noisy configuration.

## Question 3

Why can a pull request review bot miss a caller in another file that the change silently broke?

A, review bots are only permitted to read test files, never production code. B, it sees chunked diff hunks with little context, and can only comment on lines in the diff. C, bots review only the pull request description, not the code, so callers are invisible. D, the code host strips file names from the diff before the bot receives it.

[think]

The answer is B: it sees chunked diff hunks with little context, and can only comment on diff lines.

The bot works from changed hunks with a few lines of context, and large pull requests are split into chunks reviewed mostly in isolation. The review API only allows inline comments on lines in the diff, so an unchanged broken caller can at best be mentioned in a summary. A compiler or type checker in CI catches it deterministically, and small pull requests keep the whole change in one chunk.

## Question 4

During an incident you have 400 megabytes of logs. What should you give the model?

A, error signatures with counts and first-seen times, plus recent deploys. B, as much of the raw log as fits in the context window, newest lines first. C, a random sample of raw lines, so the model sees a representative slice. D, the single most recent error line, since it best reflects the current state.

[think]

The answer is A: error signatures with counts and first-seen times, plus recent deploys.

Signatures, with the variable parts normalised, compress millions of lines into the patterns that matter. First and last seen times line up against the timeline of deploys and config changes, and normalising keeps identifiers out of the prompt. Raw logs, whole or sampled, waste context, bury the signal and leak data, and a single line has no pattern at all.

## Question 5

Git bisect run reports an innocent commit as the first bad one. What is the most likely cause?

A, the range contained more than a thousand commits, which exceeds what bisect can search. B, bisect always needs the bad commit given first, and the order was swapped. C, the regression is in a merge commit, which bisect cannot check out. D, the reproduction script was flaky, or it classified an unbuildable commit as bad.

[think]

The answer is D: the reproduction script was flaky, or it marked an unbuildable commit as bad.

Bisect halves the range on each answer, with no way to detect a wrong one. So a script that fails intermittently, or returns a bad exit code when a commit merely does not build, sends the search into the wrong half. Test the script repeatedly on the known-bad commit first, and return 125 for commits to skip. A big range only adds steps, and merge commits are searchable.

## Question 6

An agent has been told in its instructions not to touch production during a code freeze, but its environment holds production database credentials with write access. What is the real control?

A, monitor its actions closely and alert on any production writes. B, remove the write-capable credentials from the agent's environment. C, repeat the instruction in capital letters at the top of every prompt. D, require it to ask for confirmation before running each command.

[think]

The answer is B: remove the write-capable credentials from the agent's environment.

Instructions can be ignored or overridden by later context, and approvals suffer from fatigue. An agent without a credential that can write to production cannot write to production. Bounded runbook tools with a dry run and human approval cover the reversible actions it does need. Monitoring only tells you after the fact.

## Question 7

In the 2025 field experiment with high-school maths students, what distinguished the version of the assistant that did not harm exam performance?

A, it limited students to a fixed number of questions per session. B, it was available only during lessons, never during homework. C, it was instructed to give hints and withhold final answers. D, it used a larger model that made fewer mistakes on the practice problems.

[think]

The answer is C: it was instructed to give hints and withhold final answers.

The tutor-style condition used the same underlying model, with instructions to guide rather than answer. Students using it did better on practice and showed no significant harm on the exam, while unrestricted access improved practice and lowered exam scores. The mode was set by the instructions, which is why a skill file or system prompt is the right tool for making tutor mode reliable.

## Question 8

Your prediction ledger shows you were right in 18 of your last 20 predictions. What does that most likely mean?

A, your predictions are too vague to be wrong, and should be made more specific. B, the ledger is working, and you should keep the same material for another month. C, you have mastered the area, and should move on to harder material. D, you are not learning much, because you are practising what you already know.

[think]

The answer is D: you are not learning much, because you are practising what you already know.

A very high hit rate means the material sits inside your current understanding, which feels good and teaches little. Deliberate practice lives where your predictions fail about half the time. Vague predictions are a separate problem worth checking, but the direct reading of a 90 percent hit rate is that the difficulty is too low, so move on to harder material.

## Question 9

In this app's assisted mock interview, what can the interviewer see during the session?

A, only your messages; your code reaches it only at the end. B, everything, including your assistant chat, streamed to it in real time. C, your messages and current editor code, but not your assistant chat. D, your code, plus a summary of your assistant chat added after each turn.

[think]

The answer is C: your messages and current editor code, but not your assistant chat.

Each turn sends your current editor code as a labelled block of data, and the interviewer's history is built only from interviewer and candidate turns. The assistant exchanges are stored in the transcript and read by the grader afterwards. So during the session, the interviewer knows what you asked the assistant only if you say so. Narrate what you asked and what you checked.

## Question 10

Why is the interview transcript sent to the grader as JSON lines with platform-assigned roles, rather than as flattened text?

A, JSON is shorter than text, so the transcript fits within the grader's limit. B, so the interviewer's replies can be cached between grading runs. C, because the grading model can only read structured input formats. D, so a candidate cannot forge an interviewer line or a grading line by typing one.

[think]

The answer is D: so a candidate cannot forge an interviewer or grading line by typing one.

Flattened text let a candidate type a line that looked like an interviewer turn, and the grader could not tell it from the real thing. With one record per message, the role comes from the platform, the candidate's text is escaped inside a string, and the grader is told the roles are authoritative. The general rule: carry structure in a format the judged party cannot forge.

## Question 11

CPython has a global interpreter lock. Why does a single line that sets a dictionary entry to its current value plus one still race between two threads?

A, the lock makes single bytecode instructions atomic, and the read, the add and the store are separate instructions. B, the lock is released whenever a dictionary is modified, so writes always interleave. C, the lock only applies to the main thread, so worker threads run without it. D, the lock only protects built-in types written in C, and the dictionary is implemented in Python.

[think]

The answer is A: the lock makes single bytecodes atomic, and the read, add and store are separate bytecodes.

The line compiles to a read, an addition and a store as separate instructions, and the interpreter can switch threads between any two of them, by default after holding the lock for 5 milliseconds, or immediately at any blocking call. The dictionary itself stays consistent; the invariant across the three steps does not. The lock applies to every thread, and the dictionary is implemented in C.

## Question 12

Which heuristic best decides whether to delegate a task or do it yourself?

A, delegate whatever the AI reports it can complete with high confidence. B, never delegate production code; use agents only for tests and scripts. C, if the AI got this wrong, would I be able to tell? If not, do it myself. D, delegate anything that would take you more than ten minutes to write by hand.

[think]

The answer is C: if the AI got this wrong, would I be able to tell? If not, do it myself.

Safe delegation depends on your ability to verify. If you could not tell, do it yourself, or learn enough first that you could. Time-based rules ignore risk, blanket bans throw away real gains, and the tool's confidence is not a measure of its correctness.

## Recap

Three ideas kept coming back. Confident output is a hypothesis: a guarantee stretched past its boundary, a root cause, a green test, all need a check you run yourself. Real controls are mechanisms, not instructions: credentials the agent does not hold, locks enforced on the server, roles the candidate cannot forge. And measure, do not trust the feeling: the bot's acted-on rate, your prediction hit rate, and your performance with no assistant at all.
