---
lesson: why-big-o
source: 99bef9ae1acb3146
fit: partial
desk:
  - "The operation ledger for the sum loop, and the pairs trace on a four-element list"
  - "The bytecode listing for one loop iteration, and the memory access table by cache level"
  - "The big-integer and string-hashing timing tables"
  - "The table of cost models and when to reach for each"
  - "Exercises: count the inner iterations of a nested loop, and detect a duplicate in linear time"
---
## Introduction

Two engineers each write a function that checks whether a list of user IDs contains a duplicate. One compares every pair. The other builds a set. On the ten-element list in the unit test, both return in microseconds, and the pair version is even competitive, because it allocates nothing.

On the production list of two million IDs, the pair version has not finished after an hour. The set version took 200 milliseconds. Nothing about the small test told you which one to ship.

You cannot benchmark every function at every input size, so you need to predict cost from the code itself. That is what a cost model is: a deliberately simplified machine on which you can count steps by reading the source. Big O is the notation for the answer. Three ideas, then: the model and how to count on it, why we throw the constants away, and the four places where the model is wrong enough to hurt you.

## A machine you can count on

The model almost everyone uses without naming it is the RAM model, the random-access machine. It makes three assumptions.

First, every primitive operation costs one unit. An addition, a comparison, reading one memory cell, following one pointer, calling a function: one step each.

Second, memory is one flat array with unit-cost access. Reading address 7 costs the same as reading address 7 billion, whether you read it once or a million times.

Third, a machine word is big enough to hold any value you care about, including an index into the input. So adding two indices is one step. Adding two thousand-digit numbers is not.

None of these is literally true of your laptop, and later we will price exactly how far off each one is. The point of the model is not accuracy. It is that under these rules, you can look at a loop and count.

## Counting, and dropping the constants

Take a function that sums a list. One assignment to start, then for each element a loop test, a read, an addition and a store, then one return. That is four steps per element plus two: four n plus two. Change the compiler and it might be three n plus two, or six n plus five. You cannot see the coefficient from the source. What you can see is that the cost is a straight line in n.

Now the pairs version of the duplicate check. For the first element it compares against everything after it, n minus 1 comparisons. For the second, n minus 2. Down to zero. Add that up and you get n times n minus 1, over 2. Check it on four elements: four times three over two is six pairs. If the duplicate sits near the front, it returns after two comparisons. If there is no duplicate at all, it compares all six. That second case is the worst case, and it is what complexity analysis reports by default, because it is the only one you can promise.

The set version makes one pass with two hash-table operations per element, each counted as a constant. So roughly two n.

Here is the comparison that matters. At ten elements, the pairs version does 45 comparisons and the set version 20 operations. Within a small factor. At two million elements, it is about 2 trillion against 4 million: half a million to one. No constant factor in any real implementation is anywhere near half a million. That is the entire argument for looking at growth rather than exact counts.

So why drop the constants? Two reasons. The coefficient depends on the machine: a compiler might keep the running sum in a register, or add eight elements per instruction, while Python's interpreter turns each unit step into dozens of real instructions. And the small terms stop mattering almost immediately: at n equal to 100, the plus two is half a percent of the total. Big O keeps the shape and discards the rest. Four n plus two is order n. Three n squared plus 500 n plus a million is still order n squared.

But "large enough n" is doing real work. A function that is ten n squared beats one that is a thousand n log n until n is about 1,000. Dropping constants is a statement about the limit, and you are responsible for knowing whether your inputs are anywhere near it.

## Reading cost off code

A few rules cover most code you will ever analyse.

Sequential statements add, and the larger term wins. An order n pass followed by an order n log n sort is order n log n.

Nested loops multiply. An outer loop of n, each doing m units of work, is order n times m. If the inner bound depends on the outer index, as in the pairs loop, sum the series; the triangular sum is still order n squared.

A loop that halves its range runs about log base 2 of n times. Binary search is this shape: ten elements, at most four probes; a million elements, at most twenty.

A function call costs whatever the callee costs, and if you cannot see the callee, you have to know it. Sorting a list is n log n. Asking whether x is in a list is order n. Asking whether x is in a set is constant on average. Inserting at the front of a list is order n, because everything shifts right.

Here is the single most common analysis mistake in interviews: calling something order n when it has an order n operation hiding inside its loop body.

[pause]

Picture a de-duplication function that keeps order: for each item, if it is not already in the output list, append it. It looks like one pass. But the membership test scans the output list every time, so it is order n squared. Keep a set for the membership test alongside the list for order, and it becomes order n. Same shape, one hidden cost removed.

And recursion is a loop you have to unroll. Call yourself once on half the input: log n levels. Twice on halves with linear work per level: n log n. Twice on n minus 1: two to the n.

## What one step really costs

The model says adding to a running sum is one step. In CPython 3.14, one iteration of that sum loop is six bytecodes, each a dispatch through the interpreter, and the addition allocates a brand new integer object, because integers are immutable. Measured on one machine, a fast desktop processor, that loop costs about 11 nanoseconds per element. The built-in sum function, a C loop over the same list, costs about 2.4. A compiled C loop over a contiguous array of 64-bit integers costs about 0.19, because the compiler adds several elements per instruction.

All three are order n. That is a 60 times spread inside one growth class, on one machine, for one line of code. That is what "we drop the constant" asks you to accept.

Memory is the other big lie. Summing an array in order costs about 0.2 nanoseconds per element no matter how big the array gets, because the hardware prefetcher sees the pattern and has the next cache line ready before you ask. Reading random but independent positions in a 512 megabyte array costs about 4 nanoseconds, because the processor keeps a few dozen cache misses in flight at once and overlaps them. But following a chain of pointers, where you cannot know the next address until the current read returns, costs about 100 nanoseconds per hop from main memory. Nothing overlaps. The model charges one unit for all three.

## Where the model lies

The first lie is flat memory. Between a sequential read and a dependent main-memory read there is a factor of about 500, and both are "one step". Two order n algorithms can differ by 10 to 50 times in wall-clock time based only on their access pattern. Summing a linked list of a million scattered nodes is routinely slower than summing an array of ten million.

The second lie is infinitely wide words. Python integers grow without bound. Adding two 100 thousand digit numbers takes about 6 microseconds, 50 times the cost of adding thousand-digit ones; multiplication grows faster still. So computing a large Fibonacci number with n additions is not order n: the numbers themselves grow, so it is order n squared digit operations. Strings have the same problem. Hashing a key reads every byte: about 10 nanoseconds for an 8-character string, about 160 for a kilobyte. A hash map keyed by long strings does order L lookups, where L is the key length. When keys are long, say "order n times L". That is the senior version of "order n".

The third lie is that constants never matter. Real sort routines switch to insertion sort, which is quadratic, for short inputs, below somewhere between 16 and 64 elements depending on the library, because its constant is so small. And be careful which folklore you repeat. "A linear scan beats a hash lookup below ten elements" is true in compiled code. In CPython, a set lookup already beats a list scan at three elements, because each list comparison is itself a dynamic dispatch costing about 10 nanoseconds. Where the crossover sits depends on your runtime. Measure at your n.

The fourth lie is that the worst case is the case you have. The pairs check returns early when duplicates are common. Quicksort is quadratic in the worst case, but with a random pivot its expected cost is n log n on every input. Hash tables are linear per operation in the worst case and constant on average. Say which case you are analysing.

A senior habit sits on top of all this. Use the RAM model to eliminate the wrong growth class. Switch to a model that counts block transfers when the data outgrows a cache or lives on disk. And measure before you ship.

## In the interview

Here is a follow-up the lesson expects. Your solution hashes each record as a key. Is the lookup really order 1?

[pause]

It is order L in the key length, because hashing reads every byte and a hit compares the whole key. That is still independent of n, but a 2 kilobyte key reads 256 times the bytes of an 8-byte one, and takes roughly 30 times as long to hash. If keys are large, hash once to a fixed-size digest and key by that. The wrong answer is "yes, hashing is constant time", which hides the key length entirely.

And a second: both candidates are order n log n. How do you pick? The class no longer decides, so look at constants: sequential access against pointer-chasing, allocation per element, whether the data fits in cache. Then benchmark both at the real n with representative data. The wrong answer is picking the cleverer algorithm.

## Recap

Four things to remember. The RAM model charges one unit per operation, flat memory and wide words, and under those rules you can count a loop. Growth classes differ by factors that grow with n, while constants are fixed, so the class decides first. Watch for hidden order n calls inside loops: a list membership test, an insert at the front. And know where the model lies: memory access patterns, long keys and big numbers, small n, and the worst case versus the case you have.

At your desk: the operation ledger and pairs trace, the bytecode and memory tables, the cost-model comparison, and the two exercises.
