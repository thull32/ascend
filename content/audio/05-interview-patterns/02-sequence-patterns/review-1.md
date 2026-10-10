---
review: sequence-patterns
source: ff5c729a8b53eaf8
---
## Introduction

Twelve questions from the sequence-patterns module. Answer out loud before the answer comes.

They run through the module in order: hash maps, fast and slow pointers, in-place linked lists, stacks, the monotonic stack, top k, two heaps, and the k-way merge. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

An interviewer says the array holds n plus 1 values, each in the range 1 to n. You must not modify it, and you may use only constant extra space. Find a duplicate. Which approach fits?

A, a hash set of the values seen, returning the first repeat. B, treating each index i as a node that points to the index stored at position i, and finding the cycle in that linked list. C, sorting the array, then comparing neighbouring values. D, counting the values and returning any count above 1.

[think]

The answer is B: read the array as a linked list and find its cycle.

The set and the counter both use linear space, and sorting modifies the input. Because every value is a valid index, following i to the value at i, starting from index 0, forms a linked list that must contain a cycle, and the cycle's entrance is the duplicate. Floyd's fast and slow pointers find it in linear time and constant space.

## Question 2

An interviewer asks for the node where two singly linked lists intersect, using constant extra space. Which approach fits?

A, fast and slow pointers on the first list, then on the second. B, a visited set of the first list's nodes, then a walk along the second. C, two pointers at the same speed, each of which switches to the other list's head when it reaches the end. D, linking the first list's tail to the second list, then running Floyd on the joined list.

[think]

The answer is C: two same-speed pointers that switch heads.

Switching heads makes both pointers travel the same total distance, so they arrive at the intersection together, or at the end together if there is none. Linking the tail and running Floyd also works, but it mutates the input, and you must undo it. The visited set uses linear space, and fast and slow pointers on one list answer a question about that list only.

## Question 3

An LRU cache of capacity 2 holds keys 1 and 3, and key 3 is the least recently used. The next call puts key 1 with the value 10. What should happen?

A, evict key 3, then store key 1 with value 10 at the front. B, update key 1 to 10 and move it to the front, evicting nothing. C, evict key 1, then insert a fresh node for key 1 with value 10. D, update key 1 in place and leave the recency order as it is.

[think]

The answer is B: update key 1, move it to the front, and evict nothing.

The key already exists, so the cache is not growing and nothing should be evicted. The update counts as a use, so key 1 moves to the front. Checking capacity before checking for the key evicts 3 for no reason, and updating without refreshing leaves key 1 as the next eviction victim.

## Question 4

A min stack keeps a second stack of minimums, and pushes onto it only when the new value is strictly less than the current minimum. You push 4, push 2, push 2 again, then pop once. What does get-min return?

A, 2, because one 2 is still on the main stack. B, 4, because the only record of 2 on the minimum stack was popped. C, an error, because the minimum stack is empty. D, 2, because the minimum stack stored both copies.

[think]

The answer is B: it returns 4, which is wrong.

With strictly less than, the second 2 is never pushed onto the minimum stack. Popping the top 2 matches the minimum stack's top and removes it, leaving 4 as the recorded minimum while a 2 is still on the main stack. Pushing on less than or equal records both copies and returns the correct answer, 2.

## Question 5

A monotonic-stack pass over n elements has a while loop inside a for loop. What is the tightest bound on the number of times the while condition is checked?

A, about n log n, because pops shrink the stack geometrically. B, at most 2n, because each check either pops or ends that iteration's loop. C, about n squared over 2, in the worst case of a descending input. D, at most n, because each element is compared exactly once.

[think]

The answer is B: at most 2n.

Every check either pops, which happens at most n times over the whole run because each index is pushed once, or fails and ends the loop, which happens once per element. A descending input never pops, so it does n failing checks, not a quadratic number. And a single element can be compared several times, so "exactly once per element" is wrong.

## Question 6

In the circular next-greater-element algorithm, you iterate i from 0 to 2n minus 1, reading the array at i modulo n. Why do you push indices only while i is less than n?

A, the maximum element must be popped before the second lap starts. B, pushing in the second lap would turn the stack from decreasing to increasing. C, otherwise the second lap reads values past the end of the array. D, pushing in the second lap would put each index on the stack twice.

[think]

The answer is D: every index would go on the stack twice.

The second lap exists so that waiting indices can see the elements before them, wrapping once. Pushing again adds a second copy of every index, and those copies would record answers from a third lap's point of view, or overwrite correct ones. The modulo already keeps reads in range, and the maximum correctly stays on the stack with no answer.

## Question 7

In an insert-only stream, a value evicted from a size-k min-heap is never needed again. What property makes that safe?

A, the replace call keeps a copy of every root it evicts. B, the heap keeps its values sorted, so the root is final. C, an evicted value is the smallest of all the values seen. D, the kth largest so far can only rise as values arrive.

[think]

The answer is D: the kth largest so far can only rise.

Adding values either raises the kth-largest threshold or leaves it alone, so a value that fell below it stays below it forever. The heap is not sorted, and the evicted root is only the smallest of the k plus 1 current candidates, not of everything seen. Deletions break exactly this monotonicity, which is why a leaderboard with falling scores needs a different structure.

## Question 8

Only 107 of a million random floats ever entered a size-10 min-heap. Which input order makes every element enter, and what does it cost?

A, ascending input: each value beats the root, about ten times slower. B, many duplicates: each tie evicts the root, about ten times slower. C, descending input: each value beats the root, about ten times slower. D, random input with k equal to 1: each value replaces the root, ten times slower.

[think]

The answer is A: ascending input, about ten times slower.

In ascending order every new value is the largest so far, so it beats the root and forces a sift: a million entries, and 132 milliseconds against 13 on random order. Descending input is the best case, because everything after the first k is rejected. A strict greater-than test rejects ties, and random input with k equal to 1 enters only about the natural log of n times.

## Question 9

A sliding-window median uses lazy deletion, and balances its two heaps using their physical lengths. What goes wrong?

A, nothing, because stale entries are always removed before balancing. B, balancing becomes linear, because measuring the length scans the heap for stale entries. C, stale entries inflate the lengths, so odd-sized windows report averages. D, the heaps overflow, because the length is only valid for arrays without gaps.

[think]

The answer is C: stale entries inflate the lengths, and odd windows report averages.

Removed values stay physically in the heaps until they surface at a root, so the length overcounts one side. On the lesson's trace, the length-based version returns 7.5 and 2.5 for windows whose true medians are 7 and 4. Live counts, updated on every add, remove and move, are the only correct basis. Reading the length itself is constant time.

## Question 10

Fifty shards each hold part of a dataset. What finds the exact global median without moving the data?

A, binary search on the value, asking each shard how many of its values are at or below the midpoint. B, averaging the fifty shard medians, weighted by each shard's element count. C, the median of the fifty shard medians, which is exact when the shards are equal in size. D, merging the fifty shards' two-heap structures into one pair of heaps.

[think]

The answer is A: binary search on the value, with per-shard counts.

Counts add across shards, so the global count at or below the midpoint is exact, and about 32 rounds of fifty small messages cover a 32-bit value range. Medians do not add, so neither a weighted average nor a median of medians is the global median, even for equal shards. Merging the heaps is exact, but it moves every element, which the question rules out.

## Question 11

A thousand sorted Python lists, a million integers in total, are already in memory, and you need them in one sorted list. Which is the better call, and why?

A, the library's heap merge, because its N log k beats any sort's N log N here. B, concatenating and calling the built-in sort, because Timsort merges the existing sorted runs in C. C, a hand-written heap loop, because the replace call does one sift per element. D, pairwise merging in Python, because it avoids a heap and its tuples.

[think]

The answer is B: concatenate and call the built-in sort.

Timsort detects each input list as a sorted run and merges the runs, so on this input it is N log k too, with the work done in C. At a thousand lists it measured 109 milliseconds, against 299 for a hand-written heap loop and 362 for the library merge. The heap is the right tool for streams, early stops and order k memory, and pure-Python pairwise merging was the slowest of all.

## Question 12

You merge 200 Kafka partitions, each ordered by timestamp, with a lazy heap merge. One partition stops receiving data. What happens?

A, the merge emits out of order, because the idle partition's head is now stale. B, nothing, because the heap drops a partition once it has no messages. C, output stalls, because the idle partition might still hold the minimum. D, memory grows by the partition's size, because its entries are copied.

[think]

The answer is C: output stalls.

The merge can emit the root only when every input has offered a head, because the idle partition's next record could be older than anything in the heap. Stream processors bound that wait with watermarks and idle-source timeouts, trading completeness for latency. The heap never drops a live input on its own, and it holds one entry per partition.

## Recap

Three ideas kept returning. First, each pattern rests on one invariant you should be able to say aloud: at most n pops, so 2n checks; a top-k threshold that only rises; order and balance across two heaps; one live head per input. Second, the invariant tells you exactly what breaks it: deletions break top k, physical lengths break lazy deletion, a silent stream stalls a merge. And third, the measured constant matters: ascending input costs a heap ten times more, and in memory a built-in sort beats a hand-written merge.
