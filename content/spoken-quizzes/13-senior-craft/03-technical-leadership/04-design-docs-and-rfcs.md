---
lesson: design-docs-and-rfcs
source: 158c47877fcc4451
---
## 1

Reviewers keep criticising your design for not supporting multi-region failover, which you never intended to build this quarter. What was most likely missing from the doc?

A, a clearer architecture diagram. B, a longer executive summary. C, more alternatives considered. D, an explicit non-goals section.

[think]

The answer is D: an explicit non-goals section.

Non-goals tell readers what is deliberately out of scope, which keeps the review on the problem being solved. Without them, reviewers fill the gap with their own assumptions, and no diagram, summary or extra alternative says that the omission was deliberate.

## 2

Two layers of services each make up to three attempts, and the dependency behind them fails every call. How many calls does it receive per user request, and what does a 10 percent retry budget per layer change that to?

A, 9, reduced to about 1.21. B, 9, reduced to about 3. C, 3, reduced to about 1.1. D, 6, reduced to about 1.1.

[think]

The answer is A: 9, reduced to about 1.21.

Retries multiply across layers: 3 attempts at the outer layer each cause 3 at the inner one, 9 in all. A budget caps retries at 10 percent of requests per layer, so each layer adds at most 1.1 times its load, and two layers give 1.1 squared, about 1.21. Adding the layers instead of multiplying them is the error behind 6.

## 3

In the RFC's review meeting, a reviewer shows that retrying a timed-out POST can charge a customer twice. What is the best way to close the comment?

A, defend the draft, since timeouts are uncommon. B, accept it, and remove retries for every method. C, defer it to a follow-up RFC after acceptance. D, concede, fix the rule, and log it with an owner.

[think]

The answer is D: concede, fix the rule, and log it with an owner.

The objection is a fact with a mechanism, so the author concedes it, and the fix, retrying a POST only when it carries an idempotency key, goes into the decision log with an owner and a date. Defending the draft or deferring leaves a known double-charge bug. Removing all retries overcorrects, since idempotent reads are safe to retry.

## 4

An RFC for a cross-team logging standard has been open for comments for four months. What process element is most likely missing?

A, a final comment period with a fixed end. B, a working prototype that settles the debate. C, a wider list of reviewers from every team. D, a longer motivation section with evidence.

[think]

The answer is A: a final comment period with a fixed end.

Without a closing window, there is no moment at which the proposal is accepted or rejected, so it drifts. A final comment period converts discussion into a decision. More evidence, reviewers or prototypes only feed a discussion that has no end.

## 5

In Ascend's design for persisting coach replies, the doc said graceful shutdown must wait for in-flight tasks. Yet the first implementation used a bare tokio spawn. What does that show?

A, spawned tasks cannot be awaited, so the design was flawed. B, a "must" in a doc needs a test or a checklist item. C, graceful shutdown in Axum already waits for spawned tasks. D, the durable queue option should have been chosen instead.

[think]

The answer is B: a "must" in a doc needs a test or a checklist item.

The consequence was understood and written down, and still missed in code: nothing waited for untracked tasks when main returned. The fix tracked them on a task tracker, and bounded the wait at 30 seconds. Axum's graceful shutdown waits for connections, not detached tasks, and the queue solved a problem the doc had fenced off as a non-goal.

## 6

A design doc was approved a year ago, but the system was built differently after problems at launch. What keeps the doc from misleading the next engineer?

A, leaving it as it is, since approval is final. B, an as-built section, and a superseded banner. C, deleting it once the system has shipped. D, rewriting its design to match what exists.

[think]

The answer is B: an as-built section, and a superseded banner.

An as-built section records where reality diverged, and a superseded banner linking to the replacement keeps the history honest. Deleting or rewriting the original erases the reasoning future engineers need, and leaving it untouched lets readers trust a design that no longer exists.
