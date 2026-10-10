---
lesson: amortized-analysis
source: 6e16a526fd67fb4a
fit: partial
desk:
  - "The nine-push table with credit and potential columns, read three ways"
  - "The potential-method algebra for a resizing push"
  - "The growth-rule table by runtime, and the golden-ratio reuse argument"
  - "The dict resize pause measurements"
  - "Exercises: count the copies a doubling array makes, and a queue from two stacks"
---
## Introduction

Appending to a Python list, a JavaScript array, a Go slice or a Rust vector is "order 1". Yet these structures live in one contiguous block with a fixed capacity, and when it fills up, the runtime allocates a bigger block and copies every element across. So the push that finds a list of 1,024 full costs about a thousand element moves. Calling that order 1 looks like a lie.

It is not a lie, but it is a different kind of claim, with a precise meaning you need to be able to state and defend. And it has a practical shadow: the expensive operation really does happen, at a moment you did not choose, and on a hash table with a million entries it is a pause you can measure in tens of milliseconds.

Four ideas: what amortised means, the three ways to prove it, why the growth must be a multiple and not a fixed amount, and what amortisation hides from your latency graphs.

## The claim, precisely

Amortised cost is a worst-case bound on the total cost of a sequence of operations, divided by the number of operations. If any sequence of m operations costs at most m times c in total, each operation has amortised cost c, even if some individual operations cost far more.

Three things it is not. It is not average case. Average case is an expectation over a probability distribution of inputs; amortised analysis has no probability in it at all. It is a worst-case guarantee over any sequence.

It is not worst case per operation. The worst single append really is order n. Amortised order 1 means the expensive ones are rare enough, provably, that they cannot dominate.

And it is not a promise about latency. If one request triggers the copy, that request is slow, and amortisation does nothing for that user.

## Three proofs of the same thing

Picture an array that doubles when full. The first push allocates room for 1. After that, a push into a full array of capacity k allocates 2 k and copies k elements.

The first proof is aggregate: add it all up and divide. The copies happen when the array is full at sizes 1, 2, 4, 8 and so on, and each copies that many elements. For a thousand pushes, that is 1 plus 2 plus 4, up to 512: 1,023 copies, less than 2 n. In general the copies form a geometric series that sums to less than twice n. Add the n writes themselves, and n pushes cost less than 3 n. Divide by n: under 3 per push. That is the whole argument, and it is the one most interviewers expect.

The second proof is accounting: charge each cheap operation extra. Charge every push 3 coins. One pays for writing the element. The other two are saved as credit. When an array of size k fills, you need k coins to move k elements. Where do they come from? Since the last resize, k over 2 new elements arrived, each with 2 spare coins. That is exactly k. The savings never go negative, so the total charged always covers the real work. The accounting method turns "why is it cheap" into "who paid for it": every element pays for its own first copy and for one older element's copy.

The third proof is the potential method, and it is the most general. You define a function on the structure's state, a stored-up debt that is high when expensive work is imminent and drops when that work is done. Each operation's amortised cost is its real cost plus the change in that potential. For the array, the potential is low right after a resize and climbs as it fills, so a cheap push pays a little extra into it, and the expensive push is paid for by its drop. Every push comes out at 3. You reach for this method when the structure is complicated: splay trees, union-find, Fibonacci heaps.

## Why multiply, and by how much

What if you grow by a fixed amount instead, say 100 slots each time it fills?

[pause]

Then a copy happens every 100 pushes and copies everything so far: 100, then 200, then 300, all the way up to n. That is an arithmetic series, and it sums to order n squared. Constant additive growth does not amortise. Only multiplicative growth does. This is a real bug people write in hand-rolled buffers: one that adds 4 kilobytes whenever it is full is quadratic, and 10 times the message size takes 100 times as long.

Any factor above 1 gives amortised order 1. So why do runtimes disagree? Rust and dot NET double. Java's array list and the V8 JavaScript engine grow by about 1.5. CPython grows lists by only about an eighth each time.

The argument for a factor below 2 is about reusing freed memory. With doubling, the blocks you have freed so far sum to exactly one less than the next block you need, so the allocator can never fit the new block into the old space. With a factor below the golden ratio, about 1.618, the freed blocks eventually add up to more than the next request. Doubling buys fewer copies; 1.5 buys memory reuse. Neither is wrong. They sit at different points on the same dial.

## What a resize really costs

The model says "allocate a new block and copy n elements". Measured on CPython 3.14 on Linux, reality diverges in both directions.

List appends do not spike. Timing each of 10 million appends, none took longer than 120 microseconds, and the slow ones were scattered rather than at the resize points. The reason is the allocator: for large blocks, growing a list asks the kernel to remap pages, which moves page-table entries rather than bytes. An 80 megabyte "copy" costs a few thousand page-table updates.

Dictionaries do spike, and the spikes double. A dictionary has to rehash every entry into its new table. Inserting 5 million integer keys, the slow inserts were exactly the resizes, at about 2,700, 5,500, 11 thousand, and so on, each pause twice the last. The largest, at about 1.4 million entries, was 59 milliseconds. A CPython dictionary resizes when it is two thirds full. Amortised over 1.4 million inserts, 59 milliseconds is nothing. For the one request that triggered it, it is a 59 millisecond stall. Hold that picture whenever someone says "amortised order 1".

And one measured surprise: pre-sizing a list does not pay in CPython. Ten million appends took 0.27 seconds; filling a pre-allocated list by index took 0.44, because append has a specialised fast path and its copies were already nearly free. Pre-sizing pays where the copy is real: Rust, Go and Java, and hash maps wherever the API exists.

## Shrinking, and the thrashing trap

If you also shrink when the array gets sparse, the naive rule is wrong. Halve the capacity whenever the size drops to half.

Picture a full array of 8. Push one, and it doubles to 16, copying 8. Pop one, and it is back to 8 of 16, exactly half, so it halves, copying 8 again. Push, double. Pop, halve. Every operation copies the whole array, and the amortised cost is order n.

The fix is hysteresis: grow when full, but shrink only when the size falls to a quarter of the capacity. Then at least a quarter of n operations must happen between resizes. The lesson generalises beyond arrays: whenever a threshold triggers expensive work in both directions, put a gap between the two thresholds.

## Other structures, and removing the spike

The same argument appears everywhere. A queue built from two stacks pushes onto an input stack and pops from an output stack, refilling the output stack from the input only when it is empty. One refill can move n elements, but each element crosses over at most once in its life, so the amortised cost is constant. A binary counter can flip every bit on one increment, but bit i flips only once every two to the i increments, so n increments flip fewer than 2 n bits. Union-find with path compression is amortised nearly constant, which means a single find can still walk a long chain.

A hash table stacks two different kinds of "on average". Expected order 1 for the probe sequence, which assumes a good hash and can be broken by adversarial keys. And amortised order 1 for the resize, which holds for every sequence, but not for the single insert that triggers the rehash. Say both out loud.

When the pause is unacceptable, you de-amortise: spread the expensive work across the cheap operations. For an array, allocate the bigger block when the old one fills, but copy two old elements on each later push, so the migration finishes before the new block is full. Every push is now at most three moves, worst case. Redis does this for its hash tables: it keeps two tables during a resize and migrates a bucket per operation. Go's maps before version 1.24 grew the same way; since then they split the map into small independent tables, so one insert grows at most one small table. The cost is a more complex read path and extra memory during the migration. The gain is that the worst case looks like the average.

## What amortisation hides

Three things a senior engineer keeps in mind. Latency spikes: pauses that get rarer and taller, each twice the last, with the biggest at the moment the structure is biggest. Memory doubling at the worst moment: during a copy, the old and new blocks are both live, so a 4 gigabyte array needs 12 gigabytes for an instant, and processes get killed for it at two thirds of their limit. And locks: under a shared lock, every other thread's cheap operation waits behind the one that is mid-resize.

## In the interview

A follow-up the lesson expects: append is amortised order 1. What is the worst single append, and how would you get rid of it?

[pause]

The worst append copies all n elements, order n, and for a hash table it rehashes them, which at a million entries is tens of milliseconds. To remove it, pre-size when the maximum is known, or de-amortise: allocate the new block early and migrate a constant number of elements per operation, the way Redis rehashes incrementally. The wrong answer is "there is no worst case, it's order 1", which confuses amortised with per-operation cost.

## Recap

Four things to remember. Amortised is a worst-case bound over any sequence, with no probability in it, and it says nothing about the latency of one operation. Doubling costs under three per push by a geometric series, and the three proofs, aggregate, accounting and potential, are three readings of the same bookkeeping. Only multiplicative growth amortises; a fixed increment is quadratic. And shrinking needs hysteresis, a quarter not a half, while the spikes you hide show up as p99 pauses and transient memory doubling.

At your desk: the nine-push table and the potential algebra, the growth-rule table, the dictionary pause measurements, and the two exercises.
