---
lesson: the-design-interview-method
source: 8179482472561951
---
## 1

Twelve minutes into a 45-minute interview, you are still adding boxes to the high-level diagram. What is the best move?

A, ask the interviewer to choose which component to draw next. B, keep going, since the diagram must be complete before any deep dive. C, announce the move to deep dives, and pick the two hardest parts. D, restart with a simpler diagram, so the remaining time is enough.

[think]

The answer is C: announce the move to deep dives, and pick the two hardest parts.

The deep dive is where the senior signal lives, and it needs about a third of the time. Saying "that is the high level" and choosing the deep-dive targets yourself demonstrates driving; asking the interviewer to choose is acceptable, but weaker. A complete diagram with no depth is the most common failing pattern, and restarting spends the time you need for depth.

## 2

Your estimate comes out at 120 writes a second and 20,000 reads a second at peak, with 3 terabytes of data after five years. Which design does the arithmetic justify?

A, an in-memory store with periodic snapshots to object storage. B, multi-region active-active databases with a global router. C, a single replicated Postgres with a cache in front of it. D, a sharded Cassandra cluster with a Kafka ingestion pipeline.

[think]

The answer is C: a single replicated Postgres with a cache in front of it.

One primary handles these write rates with room to spare, the cache and a replica absorb the reads, and 3 terabytes fits on one node. Sharding or a queue invites the question "what is that for?", with no numeric answer. Multi-region is driven by the availability requirement, not by this throughput.

## 3

The interviewer interrupts your deep dive with: what happens when the cache node dies? What is the strongest response?

A, say a replica would take over, then return to your planned topic. B, say cache failure is out of scope, and keep to the agreed plan. C, make it the deep dive: the load on the database, what fails, and the fix. D, note it for the wrap-up, so the current deep dive is not derailed.

[think]

The answer is C: make it the deep dive: the load on the database, what fails, and the fix.

Interviewer questions are the rubric leaking, and failure under load is exactly what the round scores. Quantify the load that lands on the database, say what fails first, often connections rather than CPU, and describe the mitigation. A one-line "add a replica", or deferring it, signals that you do not think about failure.

## 4

Which choice of redirect status code is a genuine trade-off worth naming in the API phase of a URL shortener design?

A, 302 against 307, because 307 prevents open-redirect attacks on links. B, 200 against 302, because a 200 with a meta refresh saves a round trip. C, 301 against 302, because browsers cache a 301 and skip your servers. D, none, because browsers treat 301 and 302 identically for a GET.

[think]

The answer is C: 301 against 302, because browsers cache a 301 and skip your servers.

A permanent redirect is cacheable by default, so later clicks never reach your servers: lower load, but no click events, no destination changes, and slow takedowns of malicious links. 302 and 307 both route every click through you. Their difference, whether the method is preserved, does not matter for a GET shortener, and has nothing to do with open redirects.

## 5

Two app servers generate the same random short key at the same moment. With a primary-key constraint on the short key column in Postgres, what happens?

A, the database silently appends a suffix, so both keys are unique. B, both inserts succeed, and the later row overwrites the earlier one. C, both inserts fail, because the unique index detects the conflict. D, the second insert waits for the first to commit, then fails.

[think]

The answer is D: the second insert waits for the first to commit, then fails.

The unique index makes the second insert wait on the first transaction. When that commits, the second fails with a unique violation, or returns no row if it was written to do nothing on conflict, and the application generates a new key. Checking with a select before the insert would not prevent this, because both selects can run before either insert.

## 6

In the wrap-up, you realise the design as drawn does not meet the stated 99.99 percent availability target. What should you do?

A, leave it out, since raising a gap unprompted costs more than it earns. B, argue that 99.9 percent is good enough for this product, and move on. C, add a second region to the diagram, and move on without comment. D, say so, give the cause, and outline what closing it would cost.

[think]

The answer is D: say so, give the cause, and outline what closing it would cost.

The written feedback records what you said, and naming a gap with its cause, such as a single-region primary, and the cost of closing it is evidence of senior judgement. Silently adding a box, or hoping it goes unnoticed, reads as either not understanding the requirement or not being candid.
