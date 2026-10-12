---
lesson: articulating-trade-offs
source: 33ee82d74134a82f
---
## 1

A candidate says: "I would use Cassandra, because it is highly scalable and battle-tested." What is the most important thing missing?

A, the Cassandra version, and the consistency level chosen. B, a diagram of the ring, showing replication across nodes. C, a comparison with at least five other candidate databases. D, the requirement served, the cost, and when the choice flips.

[think]

The answer is D: the requirement served, the cost, and when the choice flips.

"Scalable" and "battle-tested" apply to every serious option, so they carry no information. A trade-off statement ties the choice to a requirement, names what it costs, and says the condition under which another option would be better. Listing more databases without that structure is still preference.

## 2

In a weighted decision matrix, DynamoDB leads Cassandra 43 to 41. They differ only on operations burden, scored 5 against 2 with a weight of 2, and on cost, scored 2 against 4 with a weight of 2. Which single one-point weight change makes Cassandra strictly win?

A, raising the cost weight from 2 to 3. B, raising the throughput weight from 3 to 4. C, lowering the operations weight from 2 to 1. D, lowering the query weight from 1 to 0.

[think]

The answer is C: lowering the operations weight from 2 to 1.

Lowering the operations weight by one removes 5 points from DynamoDB and 2 from Cassandra, closing the gap by 3: Cassandra 39, DynamoDB 38. Raising the cost weight by one closes the gap by only 2, which ties them at 45. The two score the same on throughput and queries, so those weights cannot change their order.

## 3

A one-week spike would cut the chance of choosing wrong from 30 percent to 10 percent. Reversing the decision later would cost about 2 engineer-weeks. Should you run the spike?

A, no, because it saves about 0.4 weeks for 1 spent. B, no, because spikes rarely change the final decision. C, yes, because it saves about 8 weeks for 1 spent. D, yes, because any reduction in risk is worth a week.

[think]

The answer is A: no, because it saves about 0.4 weeks for 1 spent.

The expected saving is the drop in probability times the reversal cost: 0.2 times 2 is 0.4 engineer-weeks, less than the week the spike costs. This is a two-way door: decide now, and name the trigger. The 8-week figure applies to a decision that costs about 40 engineer-weeks to reverse, such as a partition key.

## 4

Sharding now costs 36 engineer-weeks over two years. Waiting costs 46 engineer-weeks, but only if growth forces it. Above roughly what probability of needing it should you shard now?

A, about 78 percent. B, about 95 percent. C, about 22 percent. D, about 50 percent.

[think]

The answer is A: about 78 percent.

Waiting costs 46 times the probability in expectation, and sharding now costs 36 for certain, so sharding now wins only above 36 out of 46, about 78 percent. Waiting is more expensive per event; it wins because you pay only when it happens. 50 and 22 percent shard far too early, and 95 percent waits past the point where the expected costs cross.

## 5

You scored options by min-max normalising their raw cost and latency. Adding a third option that nobody would choose changed which of the other two wins. Why?

A, the winner was already inside rounding noise. B, the third option split the stronger option's votes. C, normalisation rescaled the other options' scores. D, the weights are re-derived whenever the options change.

[think]

The answer is C: normalisation rescaled the other options' scores.

Min-max scores depend on the range of the options present. An expensive newcomer stretched the cost range, so the pricier of the original two now looked closer to the best, and overtook the other. Anchoring scores to requirement thresholds makes each score independent of the other options.

## 6

Why should hard constraints filter options before a weighted matrix, rather than being included as heavily weighted criteria?

A, hard constraints get the top weight, so they dominate anyway. B, filtering first makes the arithmetic quicker to do aloud. C, a matrix cannot represent a yes-or-no criterion at all. D, a weighted sum lets high scores buy back a failed must-have.

[think]

The answer is D: a weighted sum lets high scores buy back a failed must-have.

A weighted sum is compensatory: in the lesson, sharded Postgres fails multi-region writes, yet wins if the query-flexibility weight rises to 7. A must-have cannot be traded, so it belongs in a filter. A matrix can hold a yes-or-no criterion, but a heavy weight only makes failure expensive, not disqualifying.
