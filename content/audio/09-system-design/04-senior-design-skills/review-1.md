---
review: senior-design-skills
source: 9f2a95e1d5379348
---
## Introduction

Twelve questions from the senior-design-skills module. Answer out loud before the answer comes.

They run in the order of the lessons: articulating trade-offs, designing for failure, capacity planning and cost, migrations, and presenting a design. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A candidate says: I would use Cassandra because it is highly scalable and battle-tested. What is the most important thing missing?

A, the Cassandra version and the consistency level chosen. B, a diagram of the ring showing replication across nodes. C, a comparison with at least five other candidate databases. D, the requirement served, the cost, and when the choice flips.

[think]

The answer is D: the requirement served, the cost, and when the choice flips.

Scalable and battle-tested apply to every serious option, so they carry no information. A trade-off statement ties the choice to a requirement, names what it costs, and says the condition under which another option would be better. Listing more databases without that structure is still preference.

## Question 2

A one-week spike would cut the chance of choosing wrong from 30 percent to 10 percent. Reversing the decision later would cost about two engineer-weeks. Should you run the spike?

A, no: it saves about four tenths of a week for the one week spent. B, no: spikes rarely change the final decision. C, yes: it saves about eight weeks for the one spent. D, yes: any reduction in risk is worth a week.

[think]

The answer is A: no, it saves about four tenths of a week for the one week spent.

The expected saving is the drop in probability times the reversal cost: a fifth of two engineer-weeks, which is four tenths of a week, less than the week the spike costs. This is a two-way door, so decide now and name the trigger. The eight-week figure belongs to a decision that costs about 40 engineer-weeks to reverse, such as a partition key.

## Question 3

Two regions are each 99.9 percent available, but a tenth of each region's downtime comes from a global config push that takes both down together. What is the pair's availability?

A, about 99.8 percent, since the availabilities multiply. B, about 99.9999 percent, since the regions are redundant. C, about 99.9 percent, since one region is the limit. D, about 99.99 percent, set by the shared cause.

[think]

The answer is D: about 99.99 percent, set by the shared cause.

Model the config push as its own serial term: down a hundredth of a percent of the time. The independent part of each region is the rest of its downtime, and both failing independently at once adds almost nothing. So the total is about 99.99 percent. Six nines assumes an independence the shared cause breaks, and multiplying availabilities is the rule for serial dependencies, not redundant ones.

## Question 4

A bug writes corrupted values into a table that is replicated synchronously to three regions. Which defence recovers the data?

A, failing over to one of the other two regions. B, point-in-time recovery, or a delayed replica. C, raising the replication factor in each region. D, adding a fourth replica in a new region.

[think]

The answer is B: point-in-time recovery, or a delayed replica.

Replication copies the corruption everywhere within milliseconds, so failover and extra replicas hold the same bad data. Only a copy from before the corruption gets you back: point-in-time recovery, a replica applying changes an hour behind, or an immutable log you can replay.

## Question 5

An active-active service resolves conflicts by last-writer-wins. A downloads-remaining counter is decremented in two regions within the replication lag. What happens?

A, one decrement is silently lost. B, the later write is rejected as a conflict. C, both apply, since both were acknowledged. D, the regions stay permanently divergent.

[think]

The answer is A: one decrement is silently lost.

Each region writes a new absolute value. After replication, both regions keep the one with the later timestamp, so they converge on a value that reflects only one decrement. Nothing errors, and nothing stays divergent. Counters need a CRDT that merges per-region counts, or a home region that owns the writes.

## Question 6

One instance meets the 99th-percentile target up to 1,250 requests a second. Peak is 50 thousand requests a second across three availability zones, and the service must survive losing a zone at peak. What is the smallest fleet that serves peak within the target after a zone loss?

A, 120 instances. B, 87 instances. C, 40 instances. D, 60 instances.

[think]

The answer is D: 60 instances.

After losing a zone, the two remaining zones must carry 50 thousand requests a second at up to 1,250 each: 40 instances, so 20 per zone and 60 in total. 40 alone has no zone headroom. 87 stacks a separate 70 percent utilisation target on top of the zone headroom, so two buffers cover the same risk.

## Question 7

A service's bill is dominated by log ingestion and cross-zone data transfer rather than compute. What is the most effective first step?

A, move to larger instances to cut per-request overhead. B, add cache nodes to reduce the load on the database. C, sample success logs and keep traffic within each zone. D, rewrite the hot paths of the service in a faster language.

[think]

The answer is C: sample success logs and keep traffic within each zone.

The dominant costs scale with bytes moved, not CPU. Sampling success logs, and routing to caches and replicas in the same zone, attack the largest line items directly. Faster code and bigger instances shrink a line that was a small share of the bill; in the lesson, compute was 11 percent.

## Question 8

During a migration, the application writes each update to the old store and then to the new store. Two concurrent updates to the same row both succeed everywhere, with no errors. What can still go wrong?

A, the old store deadlocks on the two concurrent updates. B, the new store rejects the second write as a conflict. C, the two stores may apply the updates in different orders. D, nothing; both stores received both writes successfully.

[think]

The answer is C: the two stores may apply the updates in different orders.

Without a shared order, the stores can apply the same two writes in different sequences and end with different final values, permanently and silently. Receiving both writes is not enough; order matters. Feeding the new store from the old store's commit log fixes the order.

## Question 9

Change data capture applies a delete of row R at version 7. Then the backfill delivers its copy of R, read earlier at version 5. With version-checked writes, what must the new store have kept so that R does not reappear?

A, a lock on R until the backfill ends. B, a copy of R's last value at version 5. C, nothing, because R is already deleted. D, a tombstone for R, recording version 7.

[think]

The answer is D: a tombstone for R, recording version 7.

The version check compares against the stored version. If the delete removed R entirely, the store has nothing to compare with, and the version-5 copy is applied as a new row. A tombstone remembers version 7, so the stale copy is rejected. A lock would stall live writes and still not tell the store the copy is stale.

## Question 10

Shadow reads have compared 30 thousand responses from the old and new stores with zero mismatches. What can you claim?

A, the new store is identical to the old store for every key. B, the mismatch rate is below about a hundredth of a percent, at 95 percent confidence. C, the mismatch rate is below about three thousandths of a percent, with certainty. D, nothing, until at least a million reads have been compared.

[think]

The answer is B: the mismatch rate is below about a hundredth of a percent, at 95 percent confidence.

With zero failures in n trials, the 95 percent upper bound on the rate is about three over n, the rule of three: three over 30 thousand is a hundredth of a percent. A sample cannot prove every key identical, and one over n is the observed-rate intuition, without confidence. Volume is rarely the limit; covering a full weekly cycle of traffic patterns is.

## Question 11

It is minute 25 of a 45-minute design interview, and you are still refining the high-level diagram. What is the best move?

A, finish the diagram; a complete diagram is what gets scored. B, start the wrap-up early, so that you finish on time. C, announce the move, and go deep where the estimates point. D, ask the interviewer for ten more minutes to cover depth.

[think]

The answer is C: announce the move, and go deep where the estimates point.

The deep dive is where senior is decided, and running out of time before it is the most common failure. An announced cut to the deep dive the estimates point to shows prioritisation. A polished diagram with no depth scores as mid-level.

## Question 12

The interviewer says: I don't think last-writer-wins works here. Which response scores best?

A, ask where it fails, then answer from the data. B, agree at once, and switch to a consensus-based store. C, offer three other conflict strategies to choose from. D, explain that last-writer-wins is Cassandra's default.

[think]

The answer is A: ask where it fails, then answer from the data.

Locating the disagreement first shows you treat pushback as a probe. Then the answer comes from the data: positions should take the latest action, so last-writer-wins by server time is right, while a counter would need a CRDT or a home region. Folding looks like there were no reasons; citing the default is not a reason; and a menu of options hands the decision back.

## Recap

Three ideas kept coming back. Shared causes and hidden costs set the real number: a global config push turns six nines into four, bytes moved outweigh compute, and naive dual writes diverge with no error. Every choice needs its reason, its cost and its trigger, whether it is a database, a spike or a buffer. And the plan is a budget you enforce, from the clock in the interview room to the backfill throttle and the single flip of the source of truth.
