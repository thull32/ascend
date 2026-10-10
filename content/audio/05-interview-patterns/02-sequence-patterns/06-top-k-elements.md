---
lesson: top-k-elements
source: 60d8cc6e8174e7d1
fit: partial
desk:
  - "The Python template, the comparable-items version, and the 35-line JavaScript MinHeap"
  - "Heap-array traces: Kth Largest, K Closest Points, Top K Frequent, Reorganize String, Last Stone Weight"
  - "The near-miss table, the variants table, and the entries and timing tables"
  - "How nlargest, Counter.most_common, heappushpop and the 3.14 max-heap functions work"
  - "Exercises: minimum cost to connect ropes, and top k frequent words with alphabetical ties"
---
## Introduction

You have a million request latencies and need the ten slowest. The obvious code sorts all of them, descending, and takes the first ten. It is correct, and it took about 137 milliseconds. The library call that keeps a small heap returned the same ten in about 5. The sort spent almost all its work ordering 999,990 values you then threw away.

The top-k pattern is the discipline of not doing that work. Keep the k best candidates so far in a heap whose root is the weakest of them. Each new element competes with that one root: it loses in one comparison, or it evicts the root in log k. On a random stream almost everything loses. Of those million latencies, 107 ever entered a heap of size 10.

The pattern has a second shape too: the heap as a greedy engine. Pop the best candidate, act on it, push back what is left of it.

Three ideas, then. The polarity, and why it is the opposite of what you expect. Why evicting the root never loses an answer, and what breaks that argument. And when quickselect, buckets or an ordered set beat the heap.

## The signal

Reach for a size-k heap when the statement says k largest, k smallest, k closest or k most frequent, with k much smaller than n. "Kth largest" is the same heap, and you return the root. A stream with a query after each arrival, like "add a value and return the kth largest so far", is a strong signal, because you cannot sort what has not arrived.

The second shape's signal is "repeatedly take the largest and act on it": Last Stone Weight, Reorganize String, Task Scheduler. Here the heap holds every candidate, and the loop is pop, act, push back.

The one-line test for the first shape: the answer is the best k of one pile, and the pile only grows. Anything else is a near-miss.

And there are many. "Kth largest" with everything in memory and k near half of n: quickselect, linear expected time. "Kth smallest in a binary search tree": the tree is already ordered, so an in-order walk that stops at k. "Top k, but scores change or items are deleted": not this template, because eviction stops being permanent. "K most frequent", where counts are bounded by n: buckets indexed by count, linear with no log. "Maximum of every window": a monotonic deque, because elements expire by position, not rank. "Median of a stream": two heaps, because the answer sits at a boundary, not at a top. And "k closest values to x in a sorted array": binary search, then two pointers.

## Polarity and the invariant

Here is the question that catches people. To keep the k largest, which heap do you want, a min-heap or a max-heap?

[pause]

A min-heap. The root must be the element you would evict, and for the k largest that is the smallest one you are keeping. "Largest, so max-heap" is the classic wrong answer. Push everything into a max-heap and pop when it exceeds k, and each pop removes the largest. You end up holding the k smallest. For the k smallest, flip it: a max-heap, whose root is the largest kept value.

Now the tiny example, k equal to 3. The values 7, 10 and 4 fill the heap, and the root is 4, the third largest so far. Then 3 arrives. It does not beat 4, so it is rejected in one comparison. Then 20 arrives. It beats 4, so it evicts the root, and the new root is 7. Run the rest of the lesson's input through and the root rises 4, 7, 10, 11, and 11 is the answer.

That rising root is the whole proof. The invariant, said out loud: after i elements, the heap holds a largest-k set of the first i, so once it is full, the root is the kth largest so far. And the reason an evicted value can be forgotten forever: the kth largest of a growing set never decreases. Every arrival leaves the threshold alone or raises it, so a value that fell below it stays below it.

Deletion breaks that. Remove a top-k value and the threshold falls, and the value that should come back was already thrown away. That is why "and scores can change" moves you to a different structure.

One guard matters in Python. The replace call pops the root and pushes the new value in a single sift. Called blindly, it evicts the root even when the new value is worse. So the test "is it bigger than the root" must come first. Skipping it gives output that looks plausible and is wrong.

## Complexity, honestly

Every element costs one comparison against the root. Every element that enters costs one sift of about log k levels. The worst case, where everything enters, is n log k.

But entries are usually rare. On random order, the i-th element enters only if it is among the k largest so far, which has probability k over i. Over a million random values, 107 entered a heap of size 10, and about a thousand entered a heap of size 100. So on random input, the cost is mostly the n root comparisons.

The adversarial case is ascending input, where every element beats the root. The same million values sorted ascending were ten times slower. That is the "top 100 newest records over a time-ordered log" job, ten times slower than its twin over a shuffled field. It is still correct, and if you know the input is sorted, just take the last k.

And when k approaches n, the heap degrades to n log n. At k equal to half a million out of a million, the hand-written heap took 234 milliseconds, a pure-Python quickselect 107, and a plain sort 141. "Still n log k, so still best" is the wrong answer. Use quickselect for the kth value, or flip the problem: the k largest are everything except the n minus k smallest.

Space is order k, not order one. Pushing all n and popping k uses order n memory, and on a stream that is an out-of-memory incident. Cap the heap at k on every arrival.

## The greedy engine

The second shape: put every candidate in a max-heap, pop the one with the most left, use one unit, and push it back if any remain. Build the heap with heapify, which is linear, not with n separate pushes.

Real problems add a rule between pop and push. Reorganize String asks you to rearrange letters so no two neighbours are equal. Always place the letter with the most copies left, except the one you placed last: hold that one out of the heap for one turn. The correctness check is the output length. On a, a, a, b, the loop emits a, b, a and stops with an a still held back, so the lengths differ and you return the empty string. The greedy fails only when one letter has more than half the copies, rounded up.

Task Scheduler is the same engine with a longer cooldown: popped tasks wait in a queue with a release time, then re-enter the heap. And Last Stone Weight has no hold-back at all: pop the two heaviest, push back the difference if it is not zero.

With an alphabet of 26 letters, the heap never holds more than 26 entries, so each operation is a handful of levels and the loop is linear in the length of the string.

## Ties and the language traps

Python's heap compares whole entries, and tuples compare field by field. If two keys tie and the next field is a dict or a list node, Python raises a type error. It passes the samples and crashes on the hidden test with two equal distances. The fix is a unique integer between the key and the payload. And the tiebreak also decides which tied item gets evicted, which matters when the statement fixes the tie order, as in "k most frequent words, ties alphabetical".

Negation is the other Python trap: negate only the numeric field, never the whole tuple, and never compare a raw value against a negated root. Python 3.14 adds public max-heap functions, but an interview environment may run something older, so check before you rely on them.

Counter's most common method, with an argument, is the heap version in one call. Offer it, then be ready to write the loop.

JavaScript has no heap in its standard library. Say so, and write a binary heap with a comparator; it is about 35 lines. Do not keep an array sorted by calling sort after every insert. In the lesson's measurement, 20 thousand inserts with a sort after each took over 2 seconds. 20 thousand heap pushes took under a millisecond.

## In the interview

Here is a follow-up the lesson expects. The data is spread over 50 shards. How do you get the global top k?

[pause]

For a per-item score, each shard returns its own top k, and the coordinator runs the size-k heap over those 50 times k candidates. A global winner is always a local winner. For frequencies, that argument fails, because one item's counts add up across shards. The fixes are full count tables, a mergeable sketch, or a second round. The common wrong answer is "merge each shard's top k by count".

And another: scores can decrease, or items can be deleted. The size-k heap is now wrong, because the threshold can fall and the item that should re-enter was evicted. Keep all n in an ordered structure, a sorted container, a balanced tree, or a Redis sorted set, the usual backing store for a leaderboard. "Remove it from the heap" is the wrong answer: linear to find, and it still loses the eleventh item.

One more, briefly. The stream is infinite, and you want the top k most frequent. Exact counts need one counter per distinct item. Bound the memory with a heavy-hitters sketch and state its error bound. A size-k heap of counts cannot increment an item it has already evicted.

## Recap

Four things to remember. For the k largest, keep a min-heap of size k: the root is the one you would evict. The proof is that the kth largest of a growing pile never falls, so deletions and updates break the pattern. Cost is n root comparisons plus rare entries on random input, ten times worse on ascending input, and quickselect or a sort wins when k nears n. And the greedy engine is pop, act, push back, with a hold-back rule for cooldowns and a length check for impossibility.

At your desk: the templates and the JavaScript heap, the five heap-array traces, the comparison tables, the library internals, and the connect-ropes and frequent-words exercises.
