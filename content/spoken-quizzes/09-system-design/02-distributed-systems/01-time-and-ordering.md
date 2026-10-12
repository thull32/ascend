---
lesson: time-and-ordering
source: 8774c15fad3061fe
---
## 1

In a timeline of three processes, event b on process 2 has a Lamport value of 1, and event d on process 1 has a Lamport value of 3. What can you conclude?

A, b happened before d, because 1 is less than 3. B, b and d are causally related, direction unknown. C, b and d are concurrent, because their Lamport values differ. D, d did not happen before b, and they may be concurrent.

[think]

The answer is D: d did not happen before b, and they may be concurrent.

Lamport clocks are consistent with happens-before, so causal order implies increasing values, but they do not characterise it, and a smaller value only rules out the reverse direction. Here the vector clocks are incomparable, so b and d are in fact concurrent. In other histories, the same values could belong to causally related events.

## 2

Two events have vector clocks of 3, 0, 0, and 2, 3, 2. What is their relation?

A, the second happened before the first, having the larger sum. B, the first happened before the second, as process 1 moved first. C, concurrent, since each is larger in some entry. D, equal, because both have seen at least two events on process 1.

[think]

The answer is C: concurrent, since each is larger in some entry.

Neither vector is less than or equal to the other in every entry: the first is larger in process 1's entry, the second in process 2's and process 3's. So no causal path connects them. Sums and single entries never decide order; only the entry-by-entry comparison does.

## 3

An NTP exchange: the client sends at time 0 by its clock, the server receives at 30 and replies at 31 by its clock, and the client receives the reply at 12 by its own clock. All times are in milliseconds. What offset does NTP estimate, and how far off can that estimate be?

A, 24.5 milliseconds, off by at most 1. B, 24.5 milliseconds, off by at most 5.5. C, 30 milliseconds, off by at most 12. D, 19 milliseconds, off by at most 11.

[think]

The answer is B: 24.5 milliseconds, off by at most 5.5.

The offset is the average of the two one-way differences, 30 and 19, which is 24.5 milliseconds, and the round-trip delay is 12 minus the server's 1 millisecond, which is 11. NTP assumes equal one-way delays, so an asymmetric path can make the estimate wrong by up to half the delay, 5.5 milliseconds. The 1 millisecond of server processing is not the error bound.

## 4

Replica clocks have independent offsets of up to 50 milliseconds either way. A user's two writes land on different replicas, 10 milliseconds apart. Roughly how often does last-writer-wins keep the older write?

A, never, since NTP keeps the clocks within 50 milliseconds. B, always, since the older write carries more skew. C, about 40 percent of the time, close to a coin flip. D, about 1 percent of the time, only in rare clock steps.

[think]

The answer is C: about 40 percent of the time, close to a coin flip.

With uniform offsets, the probability of keeping the wrong write works out to about 0.40, which the simulation reproduced. When writes are closer together than the skew, their timestamp order is mostly noise. A tighter clock bound lowers the rate, but never reaches zero for close writes.

## 5

Node A's clock is 80 milliseconds fast. Node B receives a message stamped with the hybrid logical clock value 181, counter 0, when its own physical clock reads 105, and its last stamp was 103, counter 0. What does B stamp the receive with?

A, 182, counter 0, one millisecond past the sender. B, 103, counter 1, since B's own value is unchanged. C, 181, counter 1, taking the message's value and its counter plus 1. D, 105, counter 0, since B trusts its own physical clock.

[think]

The answer is C: 181, counter 1, taking the message's value and its counter plus 1.

The new value is the largest of 103, 181 and 105, which is 181. That equals only the message's value, so the counter becomes the message's counter plus 1. Stamping 105 would order B's receive before A's send, and violate causality; the hybrid clock never invents physical time it has not seen.

## 6

With a TrueTime uncertainty of 4 milliseconds, a Spanner transaction takes its timestamp as the latest bound of the current time, at a true time of 1000. When may it release its locks, and why wait?

A, at once, since Paxos replication already orders the writes. B, after 30 seconds, when the time daemons next poll the masters. C, after about 8 milliseconds, once the timestamp is past on every correct clock. D, after 4 milliseconds, when the timestamp equals true time on the coordinator.

[think]

The answer is C: after about 8 milliseconds, once the timestamp is past on every correct clock.

The timestamp is 1004. The transaction waits until the earliest bound of the current time exceeds 1004, at true time 1008, about twice the uncertainty. After that, any transaction that starts later gets a latest bound above 1004, so timestamp order matches real-time order. Releasing at once lets a later transaction on a precise clock take a smaller timestamp, and a snapshot read could see it without the earlier one.
