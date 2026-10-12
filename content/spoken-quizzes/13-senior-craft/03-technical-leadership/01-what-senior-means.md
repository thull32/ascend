---
lesson: what-senior-means
source: e1d04f25e915b2f4
---
## 1

Which goal statement reflects senior-level scope for the login rate-limiting work?

A, cut takeover attempts that reach password checks by 90 percent, with the login 99th percentile under 300 milliseconds. B, add a rate-limiting library to the API crate, and enable it for the login route. C, implement a token bucket per IP address, allowing 5 login attempts a minute. D, rate-limit every endpoint to 100 requests a minute per client by the end of the quarter.

[think]

The answer is A: cut takeover attempts that reach password checks by 90 percent, with the login 99th percentile under 300 milliseconds.

A senior goal names the outcome and the constraint, and leaves the solution open. The other statements are solutions, however specific their numbers. And the per-IP bucket would have shipped correctly while stopping almost nothing: an attack spread over 12,000 addresses, at under 2 attempts a minute each, never trips a limit of 5 a minute.

## 2

In the lesson's search example, the mid-level engineer added a cache and cut cached query time from 180 milliseconds to 60, yet the complaints continued. What was the root mistake?

A, not asking the Android team to review the cache before building it. B, choosing Redis rather than an in-process cache for the search results. C, caching before the server's 99th percentile was known, since the median hides the tail. D, optimising the existing metric, rather than measuring the complaints.

[think]

The answer is D: optimising the existing metric, rather than measuring the complaints.

The complaint was about the time from keystroke to results on mobile, which no existing dashboard measured. The server was already at 220 milliseconds at the 95th percentile. Any server-side change, whichever cache or percentile was chosen, optimised a number the users were not experiencing. The senior move was to instrument the complaint first.

## 3

You spend 20 percent of your time on reviews and tooling that make each of five teammates 10 percent more effective. Your own output alone would be 1. What is your total contribution, and what is it if the reviews change nothing?

A, 1.5, falling to 1 if the reviews change nothing. B, 1.3, staying at 1.3, since review time is still work. C, 1.3, falling to 0.8 if the reviews change nothing. D, 1, since leverage cannot be counted as output.

[think]

The answer is C: 1.3, falling to 0.8 if the reviews change nothing.

0.8 of your own output, plus five teammates times 0.1, gives 1.3. Leverage is measured at the receiving end: if the reviews teach nothing and catch nothing, the teammates gain nothing, and you have traded 0.2 of your own output for zero.

## 4

A promotion packet says: worked on login security, implemented rate limiting, collaborated with security and support, received positive feedback. Why does a committee reader discount it?

A, it names other teams, which dilutes the candidate's own credit. B, it has no outcome, no attribution, and nothing a reader could verify. C, security work is weighted below product work in most rubrics. D, it is too short; packets should describe every ticket in detail.

[think]

The answer is B: it has no outcome, no attribution, and nothing a reader could verify.

Readers look for next-level scope, actions they can attribute, and a measured result with links. This paragraph has a task, a plural subject and praise nobody can check. Length and naming partner teams are not the problem, and security work is valued when it shows an outcome.

## 5

In the exercise's model, an engineer has level 6 impact evidence in one quarter, and level 4 impact evidence in another. What level does the impact axis demonstrate, and why?

A, 5, because the average of the two items rounds to five. B, 6, because the highest single piece of evidence sets the level. C, 4, because level 5 or above appears in only one quarter. D, zero, because the two items disagree with each other.

[think]

The answer is C: 4, because level 5 or above appears in only one quarter.

Sustained evidence means the level recurs across quarters. Only one quarter shows level 5 or above, so the axis settles at 4, which two quarters support. This mirrors why one heroic month rarely carries a promotion case on its own.

## 6

An engineer is the only person who can debug the payments service, and fixes every incident personally. Why can this stall their promotion?

A, fixing incidents is reactive, and promotions reward only new features. B, they are a single point of failure, and seniors spread the knowledge. C, incident work does not count as engineering output in most rubrics. D, payments is a maintenance area, so its work rarely shows senior scope.

[think]

The answer is B: they are a single point of failure, and seniors spread the knowledge.

Heroics are visible, but they create risk and cap leverage: the organisation cannot move someone it cannot do without. Seniors turn the same expertise into runbooks, pairing and a shared rotation. Incident work itself is valued; hoarding it is the problem.
