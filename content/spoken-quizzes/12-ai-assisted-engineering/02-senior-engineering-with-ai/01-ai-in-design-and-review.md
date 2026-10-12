---
lesson: ai-in-design-and-review
source: 8b41281182365100
---
## 1

Which way of using AI in writing a design document preserves the document's value?

A, write the problem yourself, use AI to diverge and red-team, then decide yourself. B, write the constraints, then let the AI pick the option that has the most advantages. C, write it all yourself, and use AI only to check spelling, grammar and tone. D, generate the whole document from the ticket, then edit it before review.

[think]

The answer is A: write the problem yourself, use AI to diverge and red-team, then decide yourself.

The value is in the thinking, the decision and the alignment. Write the problem and constraints yourself, use AI to generate divergent options and red-team them, then decide and write the rationale yourself. AI is strong at widening options and finding holes, but it does not know your constraints, and it cannot own the decision, so letting it pick is the tempting mistake. Restricting it to spelling wastes its real strengths.

## 2

A generated design says a Kafka-based webhook pipeline gives exactly-once refunds, because Kafka supports exactly-once semantics. What is wrong?

A, Kafka has no transactions, so it cannot offer exactly-once in any form. B, nothing, since Kafka's exactly-once semantics extend to consumer side effects. C, exactly-once only holds with a single partition, which cannot carry this load. D, Kafka's guarantee stops at Kafka, and the refund side effect needs idempotency.

[think]

The answer is D: Kafka's guarantee stops at Kafka, and the refund side effect needs idempotency.

Kafka's exactly-once covers read, process and write within Kafka, using transactions. A refund applied to a database or an external API is a side effect outside that transaction: a consumer can apply it, crash before committing its offset, and then process the event again. Idempotency keyed on the event id, at the point of the side effect, is what prevents a double refund.

## 3

An AI estimate reads: 2,000 events a second at about 1 kilobyte each is roughly 2 gigabytes a second. What is the correct figure, and what does the correction change?

A, 2 megabytes a second, which fits one Postgres primary and removes the case for streaming. B, 2 gigabytes a second, so the estimate was right and the design needs Kafka. C, 20 kilobytes a second, which means the load is negligible and no design work is needed. D, 200 megabytes a second, which confirms that a streaming platform is required at peak.

[think]

The answer is A: 2 megabytes a second, which fits one Postgres primary and removes the case for streaming.

2,000 times 1 kilobyte is 2,000 kilobytes, about 2 megabytes a second: a thousand-fold slip. At 2 megabytes a second and 2,000 small inserts a second, the load sits inside what one well-provisioned primary handles, so the generated number would have argued for infrastructure the corrected one does not need. Every generated number gets recomputed by hand for this reason.

## 4

Your team has started ignoring the AI review bot's comments. What is the most likely cause, and the fix?

A, engineers distrust automation, so require a reply to every bot comment. B, the bot's model is too small, so switch to a larger one to improve its accuracy. C, the bot is too slow, so move it to run after merge, where it never blocks work. D, too many comments need no action, so tune for precision and track the acted-on rate.

[think]

The answer is D: too many comments need no action, so tune for precision and track the acted-on rate.

When most comments need no action, skimming becomes the rational default, and correct comments get skimmed too. Precision matters more than recall for a stream humans read, so restrict the bot to changed lines and higher severity, drop style comments, and track weekly the share of comments that lead to changes. Mandating replies to noise adds cost without restoring trust, and a bigger model does not fix a noisy configuration.

## 5

Why can a pull request review bot miss a caller in another file that the change silently broke?

A, review bots are only permitted to read test files, never production code. B, it sees chunked diff hunks with little context, and can only comment on diff lines. C, bots review only the pull request description, not the code, so callers are invisible. D, the code host strips file names from the diff before the bot receives it.

[think]

The answer is B: it sees chunked diff hunks with little context, and can only comment on diff lines.

The bot works from changed hunks with a few lines of context, and large pull requests are split into chunks reviewed mostly in isolation. The review API only allows inline comments on lines in the diff, so an unchanged broken caller can at best be mentioned in a summary. A compiler or type checker in CI catches it deterministically, and small pull requests keep the whole change in one chunk.

## 6

After adopting coding agents, pull requests per engineer rise from 4 to 10 a week, and review comments per pull request are falling. What is the best interpretation and response?

A, reviews are getting shallower, so cap pull request size and move mechanical checks to CI. B, agents are producing bad code, so stop using them until quality recovers. C, code quality has improved, so fewer review comments are needed; celebrate it. D, review capacity is short, so hire more reviewers and keep the process as is.

[think]

The answer is A: reviews are getting shallower, so cap pull request size and move mechanical checks to CI.

Falling comments with rising volume usually means rubber-stamping, not better code. The fix is to make each review smaller and more focused, move mechanical checking to machines, prefer codemods for mass edits, and hold authors to explaining every line. Banning agents throws away the gains, and hiring alone does not fix the process.
