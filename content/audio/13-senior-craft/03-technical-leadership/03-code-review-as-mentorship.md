---
lesson: code-review-as-mentorship
source: b5e08a77e131818f
fit: great
desk:
  - "The Argon2 semaphore diff, and the two reviews of it side by side, with the comment-by-comment table"
  - "The fixed verify function and the startup warm-up"
  - "The comment-label table and the tone rewrites"
  - "The Little's law simulation and its table of review waits"
  - "The review checklist by risk tier, and the pull request description template"
  - "Exercise: tier a diff by risk"
---
## Introduction

A 900-line pull request that adds a shared HTTP client receives 38 review comments. 35 are about naming, formatting and import order. Three are about logic. None of them notices that the new client retries every request that times out, including the one that charges a customer's card. So the next time the payment provider slows down, customers are charged twice. The author, six months into their first job, spends two days fixing nits and learns nothing about idempotency.

That review failed twice: as a quality gate, and as teaching. The scenario is illustrative.

Code review is the highest-frequency leadership activity a senior engineer has. You do it daily, it is where standards are actually set, and it is where most engineers learn most of what they know about a codebase. Three things are coming: a real change from this app's history, reviewed once badly and once well; what slow review costs a team, in numbers; and how to size a review to the risk of the change.

## What review is for, and in what order

In priority order. First, correctness and risk: bugs, security holes, data loss, concurrency, and whether the approach is right at all. Second, shared understanding: after review, at least two people understand the change. That is your bus factor and your on-call coverage. Third, maintainability. And last, consistency, which formatters and linters should enforce, not humans.

Google's public guide puts the standard well: approve a change once it definitely improves the overall health of the code, even if it is not perfect. Review is not for proving you are clever or rewriting the change the way you would have. Every comment spends the author's time. Spend it at the top of the list.

So review in passes, largest concerns first. Context: read the description and the linked issue, and if you cannot tell why the change exists, ask before reading code. Design: does this belong here, is there a much simpler way? Post design concerns first and alone, so the author does not polish lines that are about to be rewritten. Then correctness, with its edge cases: empty, huge, concurrent, retried, and the first call. Then tests: would they fail if the bug you fear were present? Then readability. Then nits, labelled, or better, left to tooling.

Size matters more than skill. A commonly cited guideline from one vendor's study of one team: review no more than 200 to 400 lines at a time, and no faster than about 500 lines an hour. Treat it as an order of magnitude, and ask for large changes to be split.

And label every comment. Blocking means must change before merge. Suggestion means the author decides. Question means a question you want answered, not disguised criticism. Nit means trivial, never blocks. And praise names a specific thing done well, which tells the author which habits to keep.

## A real diff, reviewed twice

In September 2026, one commit to this repository bounded the password-hashing work with a semaphore. Each Argon2 hash uses about 19 mebibytes, and an unbounded burst of logins could queue unlimited hashing and exhaust memory. So the commit let at most one hash per CPU run at a time. It touched 52 files and about 1,300 lines.

One piece of context matters. When someone logs in with an email that has no account, the code still checks the password against a dummy hash. That way "no such user" and "wrong password" take the same time, and nobody can learn which emails have accounts by timing the login. The dummy hash is a lazily computed value: the first time anything reads it, it runs a full Argon2 hash.

Review A was a nitpick storm. Rename the semaphore to something "more descriptive". Extract the minimum of two into a constant. Replace the code that quietly returns false if the semaphore is closed with a call that panics, because it is "cleaner". Trim the five-line comment. Looks good to me once these are fixed.

Review B had four comments. Praise: the comment says why, 19 mebibytes per call and unbounded queueing, and what bounds the waiters. That is the comment the next person needs. Then a blocking comment, and a question. Before I give you them: given what you just heard about the dummy hash, where does the timing defence break?

[pause]

The dummy hash was read before the permit was taken, on the async task. So the first unknown-email login after each boot did two hashes, one of them on an async worker thread and outside the semaphore. That login was roughly twice as slow as every other one, a one-off signal that the email has no account, and it stalled everything else scheduled on that worker for tens of milliseconds. The fix proposed: read the dummy hash inside the blocking work, after the permit, and force it once at startup so no request ever pays for it. Happy to pair.

The question: the comment claims the auth rate limiter bounds how many callers wait. Does that cover every caller? The same commit added account deletion, which checks the password from a route outside that limiter. What limits password guesses there, for someone holding a stolen session?

Last, a suggestion: a unit test that warms the dummy hash and then verifies an unknown email, but no timing assertion, because that would be flaky in CI.

## What each review taught

Score them. Review A's rename cost ten minutes at every call site and taught that reviews are about taste. The constant taught nothing. Trimming the comment would have deleted the most useful comment in the diff, and taught that why-comments are noise. And the "cleaner" panic was worse than the code: it would have crashed the login handler if the semaphore were ever closed. Review A has five comments and makes the code worse.

Review B has four and finds both real gaps, because it read for risk, a timing defence plus a lazy value plus an async boundary, before reading for style. Formatting appears in neither review, because the formatter and linter run in this repository's CI.

What happened: both gaps shipped in that commit, and both were closed within the hour by two later commits. One added a per-account limit of 10 password attempts a minute, covering login and account deletion. The other, whose message credits a review, is the blocking comment almost word for word, plus a warm-up the server awaits before it starts listening.

On tone, comment on the code, not the person. Say why, make severity explicit, ask questions you want answered, offer help. Not "this is wrong", but "blocking: I think this panics on an empty list; could we return early?"

And calibrate. With a junior engineer on a non-urgent point, a leading question teaches more than an answer: what happens if two workers pick up the same job at once? On anything urgent or security-related, give the answer and explain it, as Review B did. A Socratic dialogue about an open vulnerability is self-indulgent. The second time you write the same comment, it belongs in a linter or the team's guide. After three replies each way, talk for ten minutes, then post a summary. And mentoring through review is working if a mentee's pull requests need fewer and less fundamental comments each month.

## What slow review costs

Little's law: in any stable system, average work in progress equals throughput times average time in the system. It makes no assumptions about distributions, so it applies to pull requests as well as packets.

Take an illustrative team of 8 engineers. Writing a pull request takes a day, and addressing comments another quarter of a day. If nobody ever waited, the team could merge 6.4 a day. Each engineer keeps at most two in flight, so work in progress is capped at 16. Turn the law around and the most the team can merge is 16 divided by the time each pull request spends in the system, and that time includes the wait for review.

With a three-day review wait, 24 working hours, a pull request spends over four days in the system, and the team merges 3.8 a day. That is 41 percent below what its engineers could write. With a 16-hour wait, 4.9. Around ten working hours is the crossover: 6.4, the team's full capacity.

Here is the number to remember: above about ten working hours, review latency sets the team's output. Below it, faster review stops raising throughput and instead shrinks work in progress. At a one-hour wait the team carries about 9 open pull requests instead of 16: fewer stale branches, fewer conflicts, less context held in heads. Google's guide sets one business day as the maximum time to respond, and this arithmetic is one reason why.

And the wait grows sharply with reviewer load. Model the reviewer as a single-server queue, and the mean wait is utilisation divided by one minus utilisation, times the review time. With 30-minute reviews, a reviewer at 50 percent busy adds a 30-minute wait. At 80 percent, two hours. At 90 percent, four and a half. A senior who does 60 percent of a team's reviews is running near that steep end.

## Review depth by risk

Spend review depth in proportion to what the change can break. Low risk: docs, tests only, lockfile-only dependency bumps. One reviewer, a skim. Medium: ordinary feature code, one reviewer who knows the module, the passes above. High risk has its own rows and its own owners. Auth and secrets: identical errors and timing on every failure path, including the first call. Data: migrations additive and compatible with the running version, lock time on large tables, a rollback path. Concurrency and async: no CPU or blocking work on async workers, bounded queues, cancellation safety. And delivery: CI, deploy config, flags, blast radius and rollback.

The diff above was high-risk on two rows at once, auth and async, buried in a 52-file commit. That is exactly where a checklist earns its place. The auth row says "including the first call". The async row says "no CPU work on async workers". Those are the two lines Review B found.

Underneath, platforms enforce review with branch protection: required approvals, CI that must pass, and approvals dismissed when new commits change the diff, so an approval covers the code that merges. Ownership files route changes to owners automatically. And a study of review at Google, covering about 9 million changes, found most changes are small, fewer than a quarter have more than one reviewer, and the median review finishes in under four hours. It also listed education as one of the four things developers expect from review.

## In the interview

Here is a follow-up the lesson expects. Your team's pull requests wait two days for review. What do you do?

[pause]

Measure time to first review, and who reviews what. By Little's law, a two-day wait caps throughput well below what the team can write. Then set a response target, spread ownership, cut pull request size, and review daily in a fixed slot. The wrong answer is "ask people to review faster", which changes nothing while one reviewer is saturated.

And: how do you review a 2,000-line pull request? Read the description and design first. If the design is right, ask for it to be split and offer to help slice it. If it must go in whole, review by risk, auth, data and concurrency first, and say which files you skimmed. The wrong answer is "carefully, line by line", which is how the important line gets missed.

## Recap

Four things to remember. Review in passes, context and design first, and read for risk before style. Label every comment, and reason through your suggestions, because an unreasoned one can add a bug, like the panic on the login path. Ask on non-urgent points, tell on urgent or security ones, and turn repeated comments into automation. And review latency above about ten working hours caps the team's output, while a reviewer near 90 percent busy makes everyone wait.

At your desk: the semaphore diff and both reviews, the fixed verify function, the Little's law table, the risk-tier checklist, and the risk-tiering exercise.
