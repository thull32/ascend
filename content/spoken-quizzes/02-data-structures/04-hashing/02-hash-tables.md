---
lesson: hash-tables
source: f794d89b80d370c1
---
## 1

A chaining hash table has 1,000 slots and 2,500 entries. Assuming a uniform hash, what is the expected number of key comparisons for an unsuccessful lookup?

A, about 1,000, because the walk covers the table. B, about 1, because chains stay short on average. C, about 2.5, because the whole home chain is walked. D, about 1.25, because the walk stops halfway.

[think]

The answer is C: about 2.5, because the whole home chain is walked.

The load factor is 2.5, so the average chain has 2.5 entries, and an unsuccessful search compares against every one of them. Stopping halfway is the figure for a successful search. And about 1 is the answer only when the load factor is small.

## 2

In an open-addressing table, you delete a key by setting its slot back to empty. What goes wrong?

A, lookups of the deleted key still find its old value. B, later inserts fail, because the slot stays reserved. C, lookups for keys that probed past that slot now stop early. D, nothing, because probing skips over empty slots anyway.

[think]

The answer is C: lookups for keys that probed past that slot now stop early.

Probing stops at the first empty slot. Keys inserted after the deleted one may have probed past it, and the new empty slot ends their search too soon, reporting them missing. Tombstones say "keep probing", and backward-shift deletion repairs the chain instead.

## 3

Why can Rust's hashbrown run at a load factor of seven eighths, when Knuth's formula gives 32 probes for a miss at that load?

A, it compares 16 one-byte tags per step with one SIMD instruction. B, its probe sequence is random, so clusters cannot form. C, it rehashes in the background before the load gets that high. D, it stores keys sorted within each group, for binary search.

[think]

The answer is A: it compares 16 one-byte tags per step with one SIMD instruction.

A SwissTable probe examines a whole group of 16 control bytes at once, and compares a full key only on a 7-bit tag match, so 32 slots is two or three group loads. It still uses a deterministic probe sequence, and clusters still form; they are cheap to scan rather than prevented. Its rehashing is stop-the-world, not background.

## 4

A CPython dict grew to a million entries during a batch job, and the job then deleted all but a hundred. What happens to its memory?

A, it shrinks gradually, because each delete frees one entry. B, it stays at the peak until an insert exhausts the usable slots. C, it shrinks at once, because delete resizes when the load drops. D, it stays at the peak forever, because dicts never shrink.

[think]

The answer is B: it stays at the peak until an insert exhausts the usable slots.

Deletion writes a dummy marker and never resizes. A resize happens only when an insert finds no usable slot, and it is sized on the live count, so it would shrink then; but with a hundred live keys in a two-million-slot table, that insert never comes. Rebuild the dict after the batch to release the memory.

## 5

In a long-running service, the 99th percentile lookup time climbs over several hours, although the map's size stays constant. What is the most likely cause?

A, garbage collection is compacting the table more often. B, the load factor rises, because deleted keys are still counted. C, the hash seed rotates, so keys drift away from their slots. D, tombstones from steady insert-and-delete churn are lengthening probes.

[think]

The answer is D: tombstones from steady insert-and-delete churn are lengthening probes.

A table used like a queue accumulates tombstones, which are skipped but not counted as live, so every probe sequence grows until a rebuild clears them. The seed is fixed for the life of the process, and the live load is constant by assumption. The fix is a periodic rebuild, or a scheme whose deletes restore empty slots.

## 6

You need to look up counts for keys that are integers from 0 to 255, with millions of lookups per second. What is the best structure?

A, a balanced binary search tree keyed by the integer, for ordered access. B, a Bloom filter over the integers, for compact counts. C, a hash map keyed by the integer, for constant-time lookups. D, a plain array of 256 counters, indexed by the integer.

[think]

The answer is D: a plain array of 256 counters, indexed by the integer.

Small, dense integer keys make the array a perfect hash table: one memory access, no hashing, no probing, and 1 to 2 kibibytes that fit in the fastest cache. A hash map is also constant time, but does strictly more work for the same result, and a Bloom filter cannot count at all.
