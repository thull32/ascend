---
lesson: merkle-trees-and-ring-buffers
source: 1bafa846bfb40257
fit: partial
desk:
  - "The four-leaf tree diagram and the proof traced hash by hash with FNV-1a, including the two tampered cases"
  - "Domain separation, Bitcoin's duplicate-node bug, and Git's object formats"
  - "The ring-buffer indices traced through a wrap, and the table of full-versus-empty fixes"
  - "The single-producer, single-consumer queue in Rust with its memory orderings, and the false-sharing and cache-line visualisations"
  - "The io_uring, NIC ring and Disruptor details, and the failure-modes table"
  - "Exercises: implement a bounded ring buffer; compute a Merkle root; verify a Merkle inclusion proof"
---
## Introduction

Two replicas of a 500 gigabyte table have drifted apart: one missed a few writes during a network partition. Comparing them row by row means shipping 500 gigabytes to find what is probably a few kilobytes of difference. A single hash of the whole table tells you whether they differ, but not where. You need something in between.

A second problem, unrelated at first sight. A network driver receives packets on one core, and a parser consumes them on another, millions per second. A queue with a mutex costs a lock per packet, and a cache line bouncing between the cores. You need a queue where producer and consumer never contend.

Two small structures solve these, and both are everywhere. The Merkle tree sits under Git, Cassandra repair, Dynamo, Bitcoin and Certificate Transparency. The ring buffer sits under io uring, every network card driver, the kernel log and audio pipelines. Three ideas: how a tree of hashes localises a difference and proves membership, the security hole a careless tree opens, and how ownership turns a ring buffer into a queue with no locks at all.

## Merkle trees

A Merkle tree is a binary tree of hashes over a list of data blocks. Each leaf holds the hash of a block. Each internal node holds the hash of its two children's hashes joined together. The root is one hash that commits to every block and their order.

Three properties follow. First, any change anywhere changes the root: modify block 2, and its leaf hash, its parent and the root all change. Second, you can localise a difference in a logarithmic number of comparisons. Compare roots; if they differ, compare the two children, descend into the one that differs, and repeat. For a table of about a billion rows, that is 30 rounds, and the exchange carries hashes, not rows.

Third, membership proofs are small. Picture four blocks, zero to three. Leaf hashes h0, h1, h2, h3. Above them, h01 is the hash of h0 and h1, and h23 the hash of h2 and h3. The root is the hash of h01 and h23.

To prove block 2 is in the tree, send just two hashes: h3 and h01. The verifier hashes block 2 to get h2. Hashes h2 with h3 to get h23. Hashes h01 with h23 to get the root, and compares it with the root it trusts. One sibling per level. The block's index tells the verifier which side each sibling goes on: index 2 is even, so at the bottom it is the left child and h3 goes on the right; one level up the index is 1, odd, so h01 goes on the left.

Change anything, the block, a sibling, or the side a sibling sits on, and the result is not the root, so the proof is rejected. Two hashes for four leaves. Twenty for a million.

## The hole a careless tree opens

If leaves and internal nodes are hashed the same way, there is a hole. Before I say it: what if someone presents the two child hashes, joined together, as if they were a leaf?

[pause]

Then that fake leaf hashes to exactly the parent's value, so a different, smaller tree has the same root, and a forged inclusion proof verifies. That is a second-preimage attack. Certificate Transparency closes it by prefixing every leaf with a zero byte and every internal node with a one byte before hashing, so no leaf hash can ever equal a node hash.

Odd levels need a rule too, and both sides must use the same one. Certificate Transparency promotes the odd node unchanged. Bitcoin duplicates it, and it has no prefix bytes, so a block with transactions a, b, c and one with a, b, c, c have the same root. A 2012 vulnerability used exactly that to make nodes reject a valid block after seeing a malformed twin. The fix was to detect the duplicate pair, not change the tree, because by then the rule was consensus-critical.

Git is a Merkle graph rather than a strict tree. Every object is hashed with its type and length in front, which is Git's domain separation. A commit hashes its tree and its parents, so a commit ID commits to the entire history and every byte of every file. That is why a fetch can exchange a few object IDs to find what is missing, why a corrupted object is detected on read, and why rewriting one old commit changes every descendant's ID.

## Anti-entropy between replicas

Cassandra repair builds a Merkle tree per token range on each replica, with each leaf hashing the rows in a slice of the range. The replicas exchange trees and stream only the slices whose hashes differ. Dynamo described the same mechanism, and Riak inherited it. Gossip spreads that something changed; Merkle comparison finds what.

Two honest costs. Building the tree means reading the whole range, so the saving is in the exchange, not the build, and full repair is expensive I/O. And leaf size is a trade. Coarse leaves make a small tree and a cheap exchange, but one differing row forces the whole slice to stream; that is called overstreaming. Fine leaves localise precisely but cost memory and build time. One more trap: if the two replicas hash rows in different orders, or treat tombstones differently, equal data gives unequal hashes and every leaf looks different.

## Ring buffers

A ring buffer is a fixed-size array with two indices: the head, where the next item is removed, and the tail, where the next one is added. Both advance around the array and wrap, so it is reused forever with no allocation. That fixed footprint is the whole appeal in kernels, drivers and audio code, where allocating on the hot path is forbidden or too slow.

Walk it with capacity 4. Push A, B and C into slots zero, one and two. Pop, and A comes out of slot zero. Push D into slot three, and the tail wraps to zero. Push E into slot zero. Now the buffer is full, and the head and tail both point at slot one. Pop four times, and they are equal again, at slot one, with the buffer empty.

That is the classic ambiguity: head equal to tail means empty, and also full. Three fixes. Keep a count, which is simple, but both sides write it, so it is shared state and bad for lock-free code. Leave one slot always empty, wasting a slot so each side writes only its own index. Or let both indices grow without bound, use a power-of-two capacity, and find the slot by masking. Size is tail minus head, and full is when that equals the capacity. That last one is the fastest, and the one kernels use; even integer wraparound is harmless, because the subtraction wraps too.

## A queue with no locks

Restrict it to one producer and one consumer, each on its own thread, and the ring becomes a queue with no lock and no compare-and-swap. The key idea is ownership. The producer is the only writer of the tail. The consumer is the only writer of the head. Each reads the other's index, but never modifies it, so there is no race to resolve. No loop, no retry: it is wait-free on both sides, which is why it appears wherever latency must be bounded.

What it does need is memory ordering. The producer writes the item into the slot, then advances the tail. On a weakly ordered CPU like ARM, the consumer could see the new tail before the item's bytes, and read garbage. So the tail is published with a release store, and the consumer reads it with an acquire load, which guarantees that everything the producer wrote before publishing is visible. The classic symptom of getting it wrong: occasional corrupted items on ARM, never on x86, because x86 is strongly ordered.

And then false sharing, the bug that halves your throughput. Put head and tail next to each other in a struct, and they land in the same 64-byte cache line. Every producer write invalidates that line in the consumer's core, and the reverse, so the line bounces between cores although the threads share no data. The lesson's failure table has a queue doing 5 million items a second on one core and 1.5 million across two. The fix is padding each index onto its own cache line, and having each side cache its copy of the other's index, re-reading it only when the queue looks full or empty.

Where it runs. io uring is two such rings shared between user space and the kernel: a submission ring the application produces into, and a completion ring the kernel produces into. Enqueueing needs no system call, which is the entire performance argument. Network cards hand the hardware a ring of descriptors, and a full receive ring is a dropped packet. The kernel log is a ring that overwrites the oldest entries rather than block.

That last point is a design decision. When the ring is full, do you block, drop the newest, or overwrite the oldest? Telemetry overwrites the oldest, because it must never stall the application. A work queue refuses or blocks, because losing items is not acceptable. And Kafka is not a ring buffer: it is an unbounded, durable log that each reader consumes at its own pace. When someone proposes a ring buffer for an event stream, ask what happens when the consumer falls behind by more than the capacity.

## In the interview

A follow-up the lesson expects. Why does a single-producer, single-consumer ring need no compare-and-swap, but still need atomics?

[pause]

Each index has exactly one writer, so there is no read-modify-write race. But the slot write and the index publish must be ordered, and that is what the release store and the acquire load provide: nearly free on x86, a real barrier on ARM. The tempting answer, "because both threads read head and tail", explains why they are atomic, not why ordering is required.

And a Merkle one. Two replicas differ in one row out of a billion: how much crosses the network to find it? About 30 rounds of two hashes each, a few kilobytes. With leaves covering slices of rows, the same rounds find the slice, and then the slice is streamed, so leaf size sets the tail cost.

## Recap

Four things to remember. A Merkle tree localises a difference in a logarithmic number of hash exchanges, and proves membership with one sibling per level, but building it reads everything. Separate leaf and node hashing, as Certificate Transparency does, or a forged tree can share your root. A ring buffer's head equal to tail is ambiguous; masked, ever-growing indices with a power-of-two capacity are the production fix. And one producer, one consumer, each owning one index, gives a wait-free queue that still needs release and acquire ordering, and padding against false sharing.

At your desk: the hash-by-hash proof trace, Git's and Bitcoin's formats, the ring wrap trace and the fixes table, the Rust queue with its orderings, the io uring and driver details, and three exercises: a bounded ring buffer, a Merkle root, and verifying an inclusion proof.
