---
lesson: merkle-trees-and-ring-buffers
source: b8399f724bade84c
---
## 1

Two replicas each hold 2 to the 24 rows, and differ in exactly one row. Using a Merkle tree with one row per leaf, roughly how many hash values must be exchanged to find that row?

A, one: the roots differ, so the whole range is streamed. B, about 2 to the 24: one hash per row, compared leaf by leaf. C, about 48: two child hashes at each of 24 levels. D, about 2 to the 12: one hash per slice of 4,096 rows.

[think]

The answer is C: about 48, two child hashes at each of 24 levels.

Each round compares a node's two children and descends into the one that differs, and 24 levels reach the leaf, so about 24 rounds of two hashes. In practice, leaves cover slices of rows, so the exchange finds a slice and streams it, but the number of rounds is still logarithmic. Exchanging a hash per row, or per slice, ignores the tree entirely.

## 2

Why does a Merkle inclusion proof for one leaf need only about log n hashes, rather than the whole tree?

A, the leaves are sorted, so a binary search finds the leaf in log n steps. B, the root hash embeds every leaf hash, so only the root is needed. C, the verifier rehashes up to the root, using one sibling per level. D, only the leaf's own subtree is sent, and it has log n nodes.

[think]

The answer is C: the verifier rehashes up to the root, using one sibling per level.

Given the leaf and the sibling at each level, the verifier hashes upwards, and compares the result with the trusted root. Everything off the path is summarised by those siblings, so the proof's size is the tree's height. Sorting plays no part: a Merkle tree commits to an order, but it is not searched.

## 3

A Merkle tree hashes leaves and internal nodes with the same function, and no prefix byte. What does that allow?

A, a two-leaf tree whose leaves are the child hashes gives the same root as the original. B, the root changes whenever leaves are reordered, so proofs cannot be verified. C, proofs become twice as long, because the verifier cannot tell the levels apart. D, odd levels can no longer be paired, so the tree must be a power of two in size.

[think]

The answer is A: a forged tree, whose leaves are the child hashes, gives the same root.

Without domain separation, presenting the two sibling hashes, joined together, as a leaf reproduces their parent's hash, so a different data set has the same root, and a forged inclusion proof verifies. The certificate transparency standard prefixes leaves with a zero byte and internal nodes with a one byte to close this. Order sensitivity is a feature, and proof length is unchanged.

## 4

A single-producer, single-consumer ring buffer stores the item in its slot, then increments tail with a plain, relaxed store. What can go wrong on a weakly ordered CPU?

A, the consumer can read a torn tail value that is half updated. B, nothing, because each index has exactly one writer and needs no compare-and-swap. C, the consumer can see the new tail before the item, and read garbage. D, the producer can overwrite a slot the consumer has not read yet.

[think]

The answer is C: the consumer can see the new tail before the item, and read garbage.

Single ownership removes the need for compare-and-swap, but not for ordering. Without a release store on tail, and an acquire load in the consumer, the two writes can become visible out of order. Overwriting is prevented by the fullness check, and even a relaxed atomic store is never torn.

## 5

Your single-producer, single-consumer queue moves 5 million items a second in a benchmark, but only 1.5 million when the producer and consumer run on different cores. What is the most likely cause?

A, the modulo on every index costs a slow division on each operation. B, the buffer is too small, so the producer keeps finding it full. C, the consumer needs a mutex to read tail safely across cores. D, head and tail share a cache line, which bounces between the cores.

[think]

The answer is D: head and tail share a cache line that bounces between the cores.

Fast on one core and slow across two is the signature of false sharing. Padding head and tail onto separate 64-byte lines is the fix. The modulo, a mutex, or the capacity would not cause a slowdown that appears only when the cores are separate.

## 6

A telemetry library writes events into a fixed ring, and the consumer is temporarily slow. Which behaviour is right for telemetry, and what does it cost?

A, overwrite the oldest unread events; the cost is silently lost old events. B, grow the ring on demand; the cost is allocation on the hot path. C, drop the newest events; the cost is losing the most recent data. D, block the producer until space frees up; the cost is stalled application threads.

[think]

The answer is A: overwrite the oldest unread events, silently losing them.

Telemetry must never stall the application, so the ring overwrites the oldest entries, and the consumer sees a gap. That is the right trade for logs and traces. A work queue would refuse or block instead, because losing items is not acceptable there.
