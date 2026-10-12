---
lesson: code-review-as-mentorship
source: def234f2e7aca7c9
---
## 1

In the lesson's Ascend diff, a login with an unknown email is checked against a dummy password hash, so it takes as long as a real one. Why did the first unknown-email login after each boot still leak information?

A, the lazy dummy hash was computed on its first use, slowing that login. B, the permit was held across the database query, adding a lookup delay. C, the semaphore rejected the first caller, so it returned an error body. D, spawn blocking started a new thread for the first call, adding latency.

[think]

The answer is A: the lazy dummy hash was computed on its first use, slowing that login.

The dummy hash is lazily initialised, so its first read runs a full Argon2 hash. That read happened before the permit, on the async task, so that one login did two hashes and was roughly twice as slow: a one-off signal that the email had no account. The semaphore does not reject callers, and the permit is not held across the query.

## 2

The code takes a semaphore permit with a let-else that returns false if the semaphore is closed. A reviewer suggests replacing that with expect. What is wrong with the suggestion?

A, expect is slower than a let-else, because it formats a message. B, it changes nothing, so it is harmless style that should be a nit. C, it would hold the permit for longer than the verification needs. D, it would panic the handler if the semaphore were ever closed.

[think]

The answer is D: it would panic the handler if the semaphore were ever closed.

The let-else fails closed: verification returns false. Expect turns the same condition into a panic in a request handler. The lesson's point is that unreasoned style suggestions can make code worse; a suggestion must be thought through as carefully as the code it replaces.

## 3

Eight engineers can each keep two pull requests in flight. A pull request spends one day in coding and a quarter of a day in rework. Review wait rises from 4 working hours to 16. Under Little's law, what happens to throughput?

A, it falls by three quarters, in proportion to the wait. B, it falls from about 6.4 to about 4.9 merged a day. C, it rises, because larger batches merge more at once. D, it stays at 6.4, because engineers start other work.

[think]

The answer is B: it falls from about 6.4 to about 4.9 merged a day.

With 16 pull requests in progress, throughput is at most 16 divided by the time each spends in the system. At a 4 hour wait, that bound is 9.1, above the 6.4 the engineers can write, so engineering time limits the team. At 16 hours, the time in the system is three and a quarter days and the bound is 4.9, so the review wait now sets output. The fall is not proportional, because coding time is also in the denominator.

## 4

Why does a reviewer at 90 percent utilisation create long waits, even though they have spare capacity?

A, a reviewer at 90 percent has no spare capacity, so the queue grows forever. B, context switching makes each review take nine times longer at that load. C, they batch reviews at the end of the day, so every review waits a day. D, queue wait grows as utilisation over one minus utilisation: 9 review times at 90 percent.

[think]

The answer is D: queue wait grows as utilisation over one minus utilisation, which is 9 review times at 90 percent.

In a single-server queue model, the mean wait is utilisation over one minus utilisation, times the service time: about 1 at 50 percent, but 9 at 90 percent, because arrivals are bursty and the idle 10 percent cannot absorb the bursts. The queue is still stable below 100 percent; it is merely long. Batching and context switching can make it worse, but they are not the mechanism.

## 5

A mid-level engineer's pull request has a subtle race condition in a background job that is not urgent. Which comment teaches best?

A, approve now, and quietly fix the race yourself in a later pull request. B, a blocking comment: this is racy; add a lock around the job pickup before merging. C, push a fix to their branch yourself, so the race never reaches main. D, a question: what happens if two workers pick up the same job at once?

[think]

The answer is D: a question about what happens if two workers pick up the same job at once.

For an issue that is not urgent, a leading question lets the author find the race, and remember it. Stating the fix is right for urgent or security problems. Pushing a fix, or quietly fixing it later, removes both the learning and the author's ownership.

## 6

A change touches a migration, an auth module, and 300 lines of ordinary code. How should its review be staffed?

A, two reviewers who each read the whole diff, top to bottom, to be safe. B, one reviewer who knows the module, since the total is under 400 lines. C, owners of the data and auth paths review those parts, with the risk checklist. D, an AI first pass, then a human approves anything the tool did not flag.

[think]

The answer is C: owners of the data and auth paths review those parts, with the risk checklist.

Review depth follows risk, not size. Migrations and authentication are high-risk areas with their own checklists and owners. A single generalist reviewer, or two reading top to bottom, tends to find the typos rather than the timing leak or the table lock. An AI pass is a filter before human review, not a replacement for the owner's judgement.
