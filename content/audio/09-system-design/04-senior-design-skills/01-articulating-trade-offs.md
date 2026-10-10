---
lesson: articulating-trade-offs
source: 6f548ff41a705210
fit: great
desk:
  - "The full decision matrix and the sensitivity table, as grids"
  - "The 243-combination reweighting script"
  - "The ADR example and the decision flowchart"
  - "Exercise: decision matrix with a flip check"
---
## Introduction

"I would put a Kafka topic between the upload service and the transcoder." The interviewer asks: why not SQS? "Kafka scales better." The interviewer writes one word on the scorecard: preference.

Nothing in that answer was wrong, and nothing in it was a trade-off. No requirement it served, no cost it incurred, no condition under which SQS would have been the better choice. The candidate may well have had good reasons. The panel cannot score reasons it cannot hear.

At the senior bar, the choice matters less than the reasoning around it. Two candidates who pick opposite databases can both earn a strong hire. A candidate who picks the right one without saying why usually does not.

Four ideas, then. The shape of a complete trade-off statement. A decision matrix worked to the point where you can say which weight change would flip it. The arithmetic of being wrong. And the discipline of saying what you would not build.

## The five-part statement

A complete trade-off statement has five parts. The options you actually considered, at least two, both plausible. The deciding requirement, tied to something already on the board. The cost of your choice, in a currency. Why that cost is acceptable here. And the trigger that would change your mind.

As a template: I choose X over Y because of R. X costs us C, which is acceptable because A. If T happens, I would switch to Y.

Here is the Kafka answer, rebuilt. For the upload-to-transcode hop, use SQS rather than Kafka. The requirement is that every upload gets transcoded, about 200 a second, and nobody needs to replay the stream or have several consumers read it. SQS costs us ordering and replay, and it charges per call. A send, a receive and a delete per message comes to about 1.5 billion calls a month, around 600 dollars at the list price of 40 cents per million, less with batching. That is acceptable because transcode jobs are independent and idempotent by upload ID. If analytics and moderation later want the same upload events, switch to Kafka, because a replayable log read by several consumer groups is exactly what SQS does not give you.

Every sentence carries something scorable: the requirement, a number, a price, the property that makes the cost safe, and a concrete future condition. And the 1.5 billion is arithmetic you can do aloud: 200 a second times 2.6 million seconds in a month is about 520 million messages, times three calls each. Quoting the unit price and the arithmetic, rather than a total from memory, is what makes the number checkable.

What is missing is adjectives. Scalable, robust, flexible, battle-tested: every option on the board is all of those at some scale. Replace each adjective with the number or property it was standing in for.

## The currencies

Every design decision moves cost from one column to another. Naming both columns is the trade-off. The columns are latency, availability, consistency, durability, throughput, money, operational load, delivery time and reversibility.

A few exchange rates worth carrying. Five serial dependencies at three nines each give you about 99.5 percent, roughly 3.6 hours of downtime a month. Managed memory costs around 500 times more per gigabyte-month than object storage: about 12 dollars against 2 cents. Light in fibre costs about a millisecond of round trip per 100 kilometres, so synchronous replication between continents adds 100 to 200 milliseconds to every write.

Candidates forget two columns. Operational load bites hardest in real organisations: a team of six that adopts a fourth datastore has signed up to be experts in it at 3 in the morning. And reversibility decides how much deliberation a choice deserves. It can be priced, and we will.

## The matrix and its pivot

Before comparing anything, separate hard constraints from preferences. A hard constraint is binary: must accept writes in three regions, account balances must be linearizable. Filter the options by the constraints, then rank the survivors. And ask the useful question early: is that constraint hard, or is it a preference someone stated firmly?

The worked example: where to store viewing history for a streaming service. Writes peak at 200 thousand a second, the data is append-mostly, the service runs active-active in three regions, and the owning team is six engineers who know Postgres well and have never run a wide-column store. Three options: sharded Postgres, Cassandra, and DynamoDB with global tables. Postgres fails the multi-region requirement and should be filtered out first. The lesson keeps it in the matrix on purpose, to show what goes wrong.

Set the weights first, each from a requirement, on a scale of one to three. Throughput gets three. Multi-region writes, three. Operational burden for this team, two. Cost, two. Query flexibility, one, because access patterns are fixed. Then score each option from one to five with a reason you could defend. The totals: Postgres 28, Cassandra 41, DynamoDB 43.

DynamoDB leads by two. What does two points mean? Nothing, until you know how fragile it is. Cassandra and DynamoDB score the same on throughput, multi-region and query flexibility. They differ only on ops, where DynamoDB is managed and scores five against Cassandra's two, and on cost, where Cassandra scores four against two. So which single one-point weight change makes Cassandra win?

[pause]

Lowering the ops weight from two to one. DynamoDB loses five points, Cassandra loses two, and the gap closes by three: Cassandra 39, DynamoDB 38. Raising the cost weight by one only ties them at 45; it takes two to flip it.

Then perturb every weight at once: each one up one, down one, or unchanged, 243 combinations. DynamoDB wins two thirds of them, Cassandra about a fifth, the rest tie, and Postgres wins none.

Read that the way a reviewer would. Eliminating Postgres is robust. The choice between the top two is not, and the matrix has reduced a five-criterion argument to one question: do we run Cassandra ourselves, or pay a provider a premium to run it for us? That is a question about the team, not the technology. Netflix runs Cassandra with its own tooling; an organisation like that scores ops four or five, and Cassandra wins. Say the pivot out loud, then decide it on the fact that settles it: can this team hire or borrow Cassandra operators within the quarter?

## How a weighted sum misleads

A weighted matrix is a linear model, and that linearity is the source of four ways it misleads.

It is compensatory: high scores buy back low ones. Postgres scores one on multi-region writes, a platform requirement, yet if you raise the query-flexibility weight to seven, Postgres wins, 58 to 55. A weighted sum cannot express "must". That is why hard constraints filter before the matrix, never inside it.

It treats ordinal scores as ratios. A four is not twice as good as a two. Anchor each score to a threshold: five means it meets the requirement with double margin, three means it meets it, one means it fails.

It double-counts correlated criteria. Throughput and cost are both driven by the write rate. Weight both fully and you count the write rate twice.

And normalised scores can reverse rank when you add an option. Option A costs 10 thousand a month with 30 milliseconds of tail latency; B costs 20 thousand with 10. A wins. Now add C, at 40 thousand a month, which nobody would choose. It stretches the cost range, so B's cost suddenly looks close to the best, and B wins. Nothing about A or B changed. Scores anchored to requirement thresholds cannot do this, because no option's score depends on the others.

## Doors, priced

Amazon popularised the distinction. A two-way door is cheap to walk back: a cache client, an instance type, a queue for one consumer. A one-way door is expensive to undo: a partition key, a public API contract, an event schema other teams consume. The test is: what would it cost to change this in a year?

And you can turn that answer into an expected cost. Deliberation is worth it when it reduces expected regret by more than it costs. Suppose a one-week spike would cut your chance of choosing wrong from 30 percent to 10. For a partition key that would cost about 40 engineer-weeks to reverse, the spike saves 20 percent of 40, eight engineer-weeks, for one spent. Spend the week. For a single-consumer queue that costs two engineer-weeks to reverse, it saves less than half a week. Decide now, and revisit on the trigger. Here the break-even is a reversal cost of five engineer-weeks.

Asymmetric regret decides "now or later" questions. Should you shard a 3 terabyte Postgres database today? Sharding now costs about 36 engineer-weeks over two years, for certain. Waiting and sharding only if growth demands it costs about 46, because resharding a live, larger database is harder, but only with some probability. Waiting wins whenever that probability is below 36 over 46, about 78 percent. Doing it later is more expensive per event; you win by paying only when it happens. Then name the trigger: when the primary passes 60 percent CPU at peak, or storage passes 10 terabytes, start resharding.

Many apparent binaries are dials. Synchronous or asynchronous replication? Synchronous to one replica in the same region and asynchronous across regions gives zero loss on a single-node failure for about a millisecond more per write. Strong or eventual consistency is chosen per operation, not per system.

## Saying what you would not build

Rejections carry as much signal as choices. For the viewing-history service, a senior would say three things in the last minutes.

No cache in front of the history store: the read is one partition at a few thousand a second, served in single-digit milliseconds, and a cache would add a stale copy for the one feature users complain about. Add one if the read's 99th percentile passed 20 milliseconds at peak. No cross-region strong consistency: last-writer-wins by server timestamp loses at most a few seconds of position. And no two-phase commit with the recommendations store, because a failed coordinator blocks participants; recommendations consume history through change data capture instead.

Each rejection has a number, a reason, and a trigger or an alternative. Separate "not now", which comes with a trigger, from "never", which comes with a principle: we never let two services write the same table. In a design document the same structure holds, and the line that matters most is "revisit when". It stops the decision being relitigated every quarter: anyone who wants to reopen it has to show the trigger fired.

## In the interview

A classic follow-up: how sensitive is your choice to your weights?

[pause]

The lesson's answer: DynamoDB leads by two; the only criteria that separate it from Cassandra are ops burden and cost, and lowering the ops weight by one point flips it. So the decision reduces to whether this team can operate Cassandra, and you settle that fact rather than argue weights. Postgres is eliminated under every one-point reweighting. The wrong answer is "I am confident in the weights", which turns a close call into false precision.

And: what is the weakest part of your design? Name it before they do, with the reason you accepted it. For example, a single-region primary for billing: a regional outage stops new subscriptions, accepted because billing writes are a small fraction of traffic, can queue on the client for minutes, and multi-region writes for money are a one-way door. Never say "nothing, it is solid", and never offer a fake weakness like "I would add more monitoring".

In a live round you will not draw the grid. Run it in four sentences: the filter, Postgres out on the two heaviest requirements; the tie, Cassandra and DynamoDB equal on both; the pivot, ops burden against cost; and the flip condition, if we already had a Cassandra team, or cost became the top constraint, I would switch.

## Recap

Five things to remember. State every choice in five parts: options, deciding requirement, cost in a currency, why it is acceptable, and the trigger. Replace adjectives with numbers. Filter hard constraints before the matrix, set weights before scores, and find the pivot: here, one point on the ops weight. A weighted sum misleads through compensation, ordinal scores, double counting and normalisation. And price reversibility: a spike is worth a week only when the reversal costs more than about five, and waiting wins while the chance you will need it is below the cost ratio.

At your desk: the matrix and sensitivity tables, the reweighting script, the decision record, and the flip-check exercise.
