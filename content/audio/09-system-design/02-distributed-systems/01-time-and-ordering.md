---
lesson: time-and-ordering
source: 7b0a1aa3f6f4bf34
fit: partial
desk:
  - "The NTP offset formula, worked from the four timestamps"
  - "The last-writer-wins loss table, by offset model and write gap"
  - "The Lamport and vector clock traces on three processes, and the replay code"
  - "The HLC trace and the TrueTime commit-wait timeline"
  - "Exercises: stamp a timeline with vector clocks, and compute HLC timestamps"
---
## Introduction

A user sets their display name to Anna through replica A, whose clock runs 80 milliseconds fast. Thirty milliseconds later they correct it to Ana, with one n, through replica B, whose clock is right. A stamps the first write at 80 milliseconds past the second. B stamps the correction at 30 milliseconds past. The store keeps the later timestamp, so Anna wins on both replicas.

No error, no log line. The only symptom is a user wondering why their correction did not stick.

Every distributed system needs to order events, and the obvious tool, the wall clock, is the wrong one. Clocks on different machines disagree by milliseconds on a good day and by seconds when something is wrong, and no protocol can tell you which clock is right.

Four ideas, then. How wrong physical clocks are. What that does to last-writer-wins, as a number. The logical clocks that order events without physical time at all. And the two designs, hybrid logical clocks and TrueTime, that use physical time safely because they know its error.

## What a clock actually gives you

A server's clock is a quartz oscillator counting ticks, and its frequency is off by a few to a few tens of parts per million. At 20 parts per million, an uncorrected clock drifts about 1.7 seconds a day. Two machines in the same rack drift apart from each other, not just from true time. Spanner's time daemons assume a worst case of 200 parts per million, ten times the typical figure, because a bound you rely on for correctness has to cover bad hardware too.

NTP corrects this by estimating your offset from a reference server, using the timestamps of one request and its reply. The catch is that it assumes the request and the reply took equal time on the network. When the path is asymmetric, the estimate is wrong, and the error can be as large as half the round trip. That is why accuracy tracks network delay: within a millisecond on a quiet local network, about 5 to 100 milliseconds over the internet, and worse on a congested route.

Then the daemon corrects the clock in one of two ways. It slews, running the clock slightly fast or slow until the offset is gone; ntpd removes 100 milliseconds this way in no less than 200 seconds. Or it steps, jumping the clock outright, which it does above 128 milliseconds. A step can move wall time backwards.

Leap seconds add another twist. Google and AWS smear the leap second across 24 hours by running their clocks slightly slow, so at the midpoint they disagree with unsmeared time by up to half a second. A fleet that mixes the two sources disagrees with itself by that much.

The practical rule falls out of this. Linux gives you two clocks. The wall clock can jump, forwards or backwards. The monotonic clock never goes backwards. Every timeout, latency measurement and lease duration goes on the monotonic clock. The classic bug: a deadline computed on the wall clock fires immediately when NTP steps the clock forward 40 seconds, or fires late when it steps back.

## What skew does to last-writer-wins

The opening story is not bad luck. It is a probability you can compute.

Take two replicas whose clock offsets are independent, and a user who writes twice, on different replicas, some gap apart. Last-writer-wins keeps the older write whenever the clock skew outweighs the gap. The lesson worked out the formula and checked it with a simulation of 200 thousand trials per case.

Before I give you the number: offsets up to 50 milliseconds either way, two writes 10 milliseconds apart. How often does the older write win?

[pause]

About 40 percent of the time. Close to a coin flip. With offsets up to 10 milliseconds, writes 10 milliseconds apart still lose one time in eight. Even on a good local network, with offsets around half a millisecond, writes a millisecond apart are misordered about 8 percent of the time.

Two conclusions. When writes are closer together than the skew, last-writer-wins is close to random. And no amount of NTP tuning makes the rate zero, only smaller, because the pairs that matter, a user correcting themselves or two services racing, are exactly the close ones.

## Happens-before and Lamport clocks

In 1978 Leslie Lamport saw that ordering does not need a clock. It needs causality. Event a happened before event b by three rules. They are in the same process and a came first. Or a is sending a message and b is receiving it. Or there is a chain: a before something, and that something before b.

If neither happened before the other, the events are concurrent: neither could have influenced the other. And here is the part people get wrong. Concurrent does not mean at the same time. Two writes an hour apart on replicas that have not talked to each other are concurrent, and that is precisely the situation that needs a conflict rule.

A Lamport clock gives every event an integer. Each process keeps a counter. Every event, sends and receives included, adds one. A message carries the sender's counter, and a receiver first jumps to the larger of its own counter and the message's, then adds one.

The guarantee: if a happened before b, a's number is smaller. Follow any causal chain across processes and the numbers strictly increase. But the reverse does not hold. In the lesson's trace, an event on process two gets 1, and an unrelated event on process one gets 3. They are concurrent, yet 1 is less than 3. A smaller Lamport value only rules out the reverse direction. It says nothing else.

What a Lamport clock does give you is a total order that respects causality: sort by the counter, break ties by process id, and every process agrees on the order. That is enough for a replicated state machine, and it is the idea behind ZooKeeper's epoch and counter and Raft's term and index.

## Vector clocks: concurrency made visible

A vector clock keeps one counter per process instead of one in total. On any event, increment your own entry. A message carries the whole vector, and a receiver takes the entry-wise maximum, then increments its own entry.

To compare two events, compare every entry. If one vector is less than or equal to the other in every position, and they differ, the first happened before the second. If each is larger somewhere, they are concurrent. And unlike Lamport clocks, this is exact: happened-before holds if and only if the vectors compare that way.

The tiny example. Process one has done three things and heard from nobody, so its vector is 3, 0, 0. Another event has the vector 2, 3, 2. The first is larger in process one's entry; the second is larger in the other two. Neither dominates, so they are concurrent. Sums and single entries never decide order.

Real stores track versions of a key rather than events, and call these version vectors. Amazon's Dynamo paper attached one to every object. A read that found incomparable versions returned all of them as siblings, and the client merged them; a shopping cart took the union. Riak used the same model and hit a trap: keying entries by client grew without bound, and keying by server piled up false siblings. Its fix, dotted version vectors, names the exact write. Cassandra, and DynamoDB global tables in their default mode, by contrast, keep no vectors: the larger timestamp wins. Those are the stores where the 40 percent number applies directly.

## Hybrid logical clocks and TrueTime

Logical clocks carry no calendar meaning, and people want queries "as of 10:32". A hybrid logical clock is a pair: the largest physical time the node has seen, plus a counter for events since that value last changed. Think of it as a Lamport clock that stays close to wall time.

Picture the opening's clocks. A runs 80 milliseconds fast and sends B a message stamped 181. B receives it when its own clock reads 105. B takes 181 and bumps the counter. A moment later B writes something at physical time 110. Plain timestamps would order that write before A's message, violating causality. The hybrid clock stamps it 181 with counter 2, after. The stamps never go backwards, and the pair fits in 64 bits, so it replaces a timestamp column without a schema change.

CockroachDB uses these with a configured maximum clock offset of 500 milliseconds. A read at time 1,000 that finds a value written at 1,200 cannot tell whether that write really came first, since the writer's clock may have been up to 500 milliseconds ahead. So anything in that window forces an uncertainty restart, which is the latency cost of not having TrueTime. Correctness now rests on the bound, so each node checks its offset against its peers and shuts itself down if it is more than 80 percent of the maximum away from at least half of them.

Spanner replaces the guess with a guarantee. TrueTime returns an interval that contains true time, maintained by GPS receivers and atomic clocks in every data centre, with an uncertainty of roughly 1 to 7 milliseconds.

A transaction picks its commit timestamp as the latest edge of the interval, then waits until the earliest edge has passed it. With 4 milliseconds of uncertainty, a transaction at true time 1,000 takes timestamp 1,004 and waits until true time 1,008, about twice the uncertainty, mostly overlapped with replication. After that, any later transaction, on any correct clock, gets a larger timestamp. Timestamp order matches real-time order across the whole database. That is external consistency.

Drop the wait and it breaks: a later transaction on a more precise clock takes a smaller timestamp, and a snapshot read can see the later one without the earlier one. If the first removed Bob from an album's audience and the second posted a photo to it, Bob sees the photo.

## In the interview

Here is the follow-up the lesson expects. Two data centres update the same record within 50 milliseconds of each other. Which wins?

[pause]

Neither, by timestamp. Skew can exceed 50 milliseconds, and with offsets of about 25 milliseconds roughly 8 percent of such pairs would be ordered backwards. Either the record has a home region that serialises its writes, or both regions accept writes and a version vector detects the concurrency so a CRDT or an application merge resolves it. If the product accepts last-writer-wins, say out loud that it is lossy. The wrong answer is "the later timestamp, after we tune NTP," which lowers the loss rate but never removes it.

And: why can Spanner use physical time when nobody else can? Because TrueTime gives a bound, not just accuracy, and each commit waits out that bound, about twice the uncertainty, so later transactions always get larger timestamps. "Google's NTP is better" misses the point.

## Recap

Four things to remember. Physical clocks drift, NTP's error is bounded by half the round trip, and a step can move time backwards, so every duration goes on the monotonic clock. Last-writer-wins on wall clocks is a data-loss policy that fires at random: about 40 percent of writes 10 milliseconds apart with 50 milliseconds of skew. Lamport clocks give a total order consistent with causality but cannot see concurrency; vector clocks see it exactly, at one counter per writer. And hybrid clocks and TrueTime use physical time safely only because they bound its error and enforce that bound. Never let a wall-clock comparison between machines decide correctness.

At your desk: the NTP arithmetic, the loss table, the Lamport and vector clock traces with the replay code, the hybrid clock and commit-wait timelines, and the two clock exercises.
