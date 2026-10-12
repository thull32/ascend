---
lesson: crdts-and-collaboration
source: 880bac92be9defa1
---
## 1

Gossip in your system delivers each state message at least once, and sometimes twice. Which merge property makes the duplicates harmless?

A, idempotence. B, monotonic reads. C, commutativity. D, associativity.

[think]

The answer is A: idempotence.

Idempotence means merging a state with itself gives the same state, so applying it twice changes nothing. Commutativity handles reordering, and associativity handles relaying and batching; neither says anything about applying the same input twice. Monotonic reads is a session guarantee, not a merge property.

## 2

An operation-based observed-remove set replica receives the remove of milk, for tag a1, before it receives the add of milk with tag a1. With no tombstones kept, what happens?

A, milk is removed once the add arrives, as on the others. B, milk stays on this replica forever, while the others lack it. C, the replicas converge at the next anti-entropy round. D, the replica rejects the remove, and asks for a resend.

[think]

The answer is B: milk stays on this replica forever, while the others lack it.

The remove finds no tag to remove, and is dropped. When the add arrives, milk appears, and nothing will ever remove it, so this replica diverges permanently. Operation-based CRDTs need causal delivery: buffer an operation until its dependencies have arrived. These designs ship operations, not states, so there is no later state merge to repair it.

## 3

Bob reads Alice's new title and then changes it, but his clock is 500 milliseconds behind hers. Under a wall-clock last-writer-wins register, what is the final title?

A, both, kept as siblings for a person to resolve later. B, whichever replica's state reaches the other one last. C, Bob's, because his edit happened later in real time. D, Alice's, because Bob's later edit carries an older timestamp.

[think]

The answer is D: Alice's, because Bob's later edit carries an older timestamp.

Last-writer-wins compares timestamps, and Bob's clock stamped his causally later write lower than Alice's, so his edit is discarded without an error. A hybrid logical clock would advance Bob's clock past Alice's timestamp on receipt, and let his edit win. Siblings are the multi-value register's behaviour, not last-writer-wins.

## 4

In RGA, the document is A B. Alice inserts X after A, with the ID 3 alice, while Bob concurrently inserts Y after A, with the ID 3 bob. What do both replicas show?

A, either order, depending on which arrives first. B, A X Y B, because alice sorts before bob. C, A Y X B, because 3 bob is the greater ID. D, A X B Y, because later inserts go at the end.

[think]

The answer is C: A Y X B, because 3 bob is the greater ID.

Integration starts after the anchor, A, and skips elements with a greater ID. The counters tie at 3, so the replica name decides, and 3 bob is greater: on Alice's replica, Y stops before X, and on Bob's, X skips over Y. The result does not depend on arrival order, which is the point of the deterministic tie-break.

## 5

Why do practical operational transformation systems, such as Google Docs, route every operation through a central server?

A, because the server must store each document's CRDT metadata. B, because clients are too slow to compute transformations. C, because the operations are too large to send peer to peer. D, because one global order needs only the first transformation property, not the harder second one.

[think]

The answer is D: because one global order needs only the first transformation property, not the harder second one.

A single authority imposing a total order means each operation is transformed along one path, so only the first property is needed. Without it, transformations along different paths must agree, the second property, and several published algorithms were later shown to violate it. Operations are tiny, clients do transform, and there is no CRDT metadata in operational transformation.

## 6

A retailer replicates inventory across three regions with a counter CRDT that supports increments and decrements, so every region can sell without coordination. What goes wrong?

A, nothing, because the counter converges to the correct total. B, two regions sell the last unit, and stock goes negative. C, increments made during a partition are lost on merge. D, the counter cannot represent the decrements of sales.

[think]

The answer is B: two regions sell the last unit, and stock goes negative.

Convergence is not an invariant. Each region's decrement is valid locally, and the merge faithfully sums both, giving minus 1. Preventing oversell needs coordination: a home region per product, or escrow of stock between regions.
