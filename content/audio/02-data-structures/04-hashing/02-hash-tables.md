---
lesson: hash-tables
source: 6b3f401423ca2703
fit: partial
desk:
  - "The five-insert linear-probing trace with real FNV-1a values, the peach miss and the tombstone lookup"
  - "The load-factor table: Knuth's probe counts for linear probing against chaining, by runtime"
  - "The resize table per runtime, and CPython's measured dict sizes"
  - "CPython's two-array layout and its perturbed probe sequence, traced on multiples of 8"
  - "The SwissTable probe step by step, and the collision-strategy comparison table"
  - "Exercises: an open-addressing table with tombstones, and counting linear-probing probes"
---
## Introduction

You need to look up a value by key in constant time, and the keys are not small integers you can use as array indices. That one requirement is behind every dict, HashMap, Go map, every cache you have deployed, and a large share of interview problems.

A hash table answers it by turning the key into an array index, and then dealing with what happens when two keys land on the same index. Everything follows from those two halves. Get either wrong, and the constant time quietly becomes linear.

Three ideas: the load factor, the one number that governs performance; what deletion does to an open-addressing table; and what real runtimes do differently from the textbook, and why it matters on your latency graph.

## The mechanism, and two families

Picture an array of m slots and a hash function. The slot for a key is its hash modulo m. Every runtime makes m a power of two, so that the modulo is a one-cycle bit-mask instead of a much slower division.

Collisions are guaranteed. With an 8-slot table and FNV-1a as the hash, "melon" and "lime" both land in slot 4. A naive table overwrites one with the other. Every real table is a strategy for not losing that data, and there are two families.

Separate chaining hangs a linked list off each slot. Colliding entries go into the list. Open addressing keeps everything in the array itself: on a collision, probe other slots until you find a free one. Chaining costs a node and a pointer per entry, and a cache miss per link. Open addressing stores entries inline and probes walk contiguous memory.

## Chaining and the load factor

The cost of a chained lookup is the length of the chain you walk. Spread n keys evenly over m slots, and each chain holds about n over m. That ratio is the load factor, and it is the single number that governs a hash table.

A successful lookup stops halfway down the chain on average: about 1 plus half the load factor comparisons. An unsuccessful lookup walks the whole chain: about the load factor itself. So with 1,000 slots and 2,500 entries, a miss costs about 2.5 comparisons. Keep the load factor bounded by a constant, and the average is constant. The worst case, everything in one chain, is linear.

Java's HashMap is the canonical chained table. Each entry is a node object of 32 bytes, plus its slot, about 37 bytes of overhead per entry before the key and value. Each node walked can be a cache miss, about 100 nanoseconds. And since Java 8, a chain longer than 8, in a table of at least 64 slots, is converted into a red-black tree, capping the worst case at log n. That is Java's defence against deliberate collisions.

## Open addressing: watch a cluster form

The simplest probe sequence is linear probing: try the home slot, then the next, then the next, wrapping around. Here is the lesson's example with real hash values, in an 8-slot table.

Melon goes home to slot 4. Lime also wants slot 4, finds melon, and takes 5. Fig wants 5, finds lime, takes 6. Pear wants 5, walks to 7. Mango wants 5, walks 5, 6, 7, wraps, and takes slot 0. Only two home slots were ever involved, 4 and 5, but the occupied run now covers five slots in a row. That is a primary cluster.

And clusters feed themselves. Any key whose home lands anywhere in the run must walk to its end, and then extends it. Look up peach, home slot 6, which collides with nothing: you check 6, 7 and 0, three key comparisons, before you hit an empty slot and learn it is absent. Four probes for a miss, more than a random table would predict at that load.

Now delete lime, in slot 5, by simply emptying the slot, and then look up pear. Before I tell you: what does the lookup report?

[pause]

Missing. Pear's home is 5, and probing stops at the first empty slot, so the lookup stops right there, although pear sits safely in slot 7. So open-addressing deletion writes a tombstone instead: "something was here, keep probing." Lookups skip it; inserts may reuse it. But tombstones are only cleared when the table is rebuilt, and meanwhile they lengthen every probe that crosses them. A table used as a queue, inserting new keys and deleting old ones, can grow slower for hours at a constant size. The alternative is backward-shift deletion: after emptying the slot, move later entries back into the hole when their home allows it.

## The numbers behind every resize threshold

Knuth worked out the expected probes for linear probing in 1963, and the numbers explain every runtime's resize threshold. The key reading: misses are the expensive case, because a miss walks to the end of a cluster.

At a load factor of two thirds, a miss costs about 5 probes, a hit about 2. That is where CPython's dict resizes. At three quarters, a miss is 8.5. At seven eighths, it is 32.5. At 95 percent, about 200. Chaining barely moves across that range, which is why Java's chained HashMap is comfortable at three quarters.

So how can Rust and Go run open addressing at seven eighths? Because their "probe" is not one slot. They examine a group of 16 slots in Rust, or 8 in Go, with a single SIMD comparison, so 32 slots is two to four group loads.

That design is SwissTable. In front of the slots sits one control byte per slot: empty, deleted, or seven bits of the key's hash, called the tag. A lookup broadcasts its own tag, compares all 16 control bytes at once, and gets a mask of candidates. A wrong tag matches only one time in 128, so a hit costs about one full key comparison. If the group contains an empty byte, the key is absent and you stop. Looking up peach this way finds no tag match and an empty byte in the same group: absent, after zero key comparisons, where plain linear probing needed three.

## Resizing, and your 99th percentile

When the load factor crosses the threshold, allocate a bigger array and re-insert every entry, because the modulo changed. That is linear work once per growth step, and growth is geometric, so inserts are amortised constant, the same argument as the dynamic array.

But amortised is not the latency a single request sees. Growing a million-entry table copies every entry, roughly 24 to 40 megabytes of memory traffic, a few milliseconds on one core, and that lands on whichever request did the unlucky insert. Your map's resize is on your 99th percentile graph. If you know n, pre-size. Or use an incrementally rehashing table, like Redis, which keeps both tables alive and migrates one bucket per operation. Go 1.24 splits its map into a directory of small tables of 1,024 slots, so a resize never touches the whole map.

And tables rarely shrink on delete. CPython's dict never resizes on deletion. A dict that once held a million keys and now holds ten keeps its 42 megabytes until an insert exhausts the usable slots, which for ten keys never happens. Rebuild it after the batch.

## Under the hood: CPython's dict

Since 3.6, a CPython dict is two arrays. A small indices array, the actual hash table, holding positions into an entries array. And the entries array itself, appended in insertion order: hash, key and value, 24 bytes, or 16 when every key is a string, because a string caches its own hash. Iteration walks the entries array, which is why dicts are insertion-ordered. Order fell out of the compact layout, and 3.7 promised it.

Its probe sequence is not linear. It mixes the hash's high bits into the early probes, so keys with identical low bits, like multiples of 8, scatter as soon as their high bits differ. All in, budget about 80 to 100 bytes per entry for small string keys.

One more runtime trap. In V8, a plain object is not a hash table while its shape is stable. But deleting a property, or adding many dynamically, drops it into dictionary mode, and every property access becomes a hash lookup. A hot path gets several times slower with no change to the loop.

## In the interview

The lesson's senior signal. Lookup 99th percentile regressed after a deploy. Where do you look, in order?

[pause]

Load factor and resize timing first: did the working set grow? Then tombstone churn: did the access pattern become delete-heavy? Then a hash function or key type change: did anyone touch the hash, equals, or the key struct? A key with a slow equality, or a hash recomputed on every call, can triple the 99th percentile. And only then the hardware: is the table now bigger than the cache, so every probe is a trip to main memory?

And another follow-up. You have 10 million small-integer keys in the range zero to 20 million. Hash map or array? Array. 20 million slots is 160 megabytes of pointers, or 80 of 64-bit integers, with one memory access per lookup and no hashing. It beats every hash map. Only when keys are sparse across a huge range does the map come back. In general, below a few dozen keys a linear scan usually wins, and small dense integer keys make a plain array the perfect hash table.

## Recap

Four things to remember. The load factor governs everything: chaining degrades gently, linear probing explodes on misses, which is why CPython resizes at two thirds, Java at three quarters, and SwissTable can run at seven eighths by scanning 16 tags at once. Open-addressing deletion needs tombstones or backward shift, and tombstones slow a long-running table until it is rebuilt. Resizes are amortised constant but land on one request's latency, so pre-size, and remember most tables never shrink on delete. And name the memory cost: 20 to 100 bytes per entry depending on the runtime.

At your desk: the probe cluster trace, Knuth's load-factor table, the per-runtime resize table, the CPython and SwissTable internals, and the two exercises.
