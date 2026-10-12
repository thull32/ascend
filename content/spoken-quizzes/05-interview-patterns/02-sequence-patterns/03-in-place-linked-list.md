---
lesson: in-place-linked-list
source: 31f89ad94a5f0bad
---
## 1

In the reversal loop, you set the current node's next to prev, and then advance by setting current to current's next. What happens on the list 1, 2, 3?

A, the list reverses correctly, one iteration later than planned. B, the list turns into a cycle that the loop never leaves. C, a null dereference is raised on the first iteration. D, current steps back onto prev, and nodes 2 and 3 are lost.

[think]

The answer is D: current steps back onto prev, and nodes 2 and 3 are lost.

After the rewire, current's next is prev, so advancing steps back onto the reversed part, and nothing references node 2 any more. No exception is raised; the function returns a short list. The fix is to save the next node before the rewire.

## 2

In Python, you write the reversal step as one tuple assignment, with targets prev, current, and current's next, and values current, current's next, and prev. Why does it fail?

A, the right side is evaluated lazily, so current's next reads a stale value. B, Python forbids attribute targets inside a tuple assignment. C, targets are assigned left to right, so the write to current's next lands on the new current. D, tuple assignment copies the nodes, so the rewiring is lost.

[think]

The answer is C: targets are assigned left to right, so the write lands on the new current.

The right side is evaluated first, then the targets are bound left to right. Current is rebound before current's next is assigned, so the write lands on the next node, cutting the list and raising an AttributeError one iteration later. Putting current's next first among the targets works, but four explicit lines are clearer.

## 3

In the constant-space copy of a list with random pointers, why can the random pointers not be set during the weave pass?

A, setting randoms first would break the original next links. B, the copies would be allocated in a different order. C, a random may point forward to a node not yet copied. D, random pointers can only be set after the unweave.

[think]

The answer is C: a random may point forward to a node not yet copied.

During the weave, if A's random is C and C has not been copied yet, then the node after C is still C's original successor, so A's copy would point at an original node. Once every copy sits right after its original, the node after any random target is exactly that target's copy. Randoms must be set before the unweave, not after, because the unweave destroys that adjacency.

## 4

An LRU cache of capacity 2 holds keys 1 and 3, and key 3 is the least recently used. The next call puts key 1 with the value 10. What should happen?

A, evict key 3, then store key 1 with value 10 at the front. B, update key 1 to 10 and move it to the front, evicting nothing. C, evict key 1, then insert a fresh node for key 1 with value 10. D, update key 1 in place and leave the recency order as it is.

[think]

The answer is B: update key 1, move it to the front, and evict nothing.

The key already exists, so the cache is not growing and nothing should be evicted. The update counts as a use, so key 1 moves to the front. Checking capacity before checking for the key evicts 3 for no reason, and updating without refreshing leaves key 1 as the next eviction victim.

## 5

Sorting a 200 thousand node linked list in CPython, the lesson measured top-down merge sort on the nodes at 192 milliseconds. Collecting the nodes into a Python list, sorting it, and relinking took 61 milliseconds. What is the right conclusion?

A, relinking is constant time, so the fallback does less total work. B, merge sort is asymptotically worse on linked lists than Timsort. C, in place is a space requirement, and the fallback is faster here. D, the measurement is noise, since both are n log n algorithms.

[think]

The answer is C: in place is a space requirement, and the fallback is faster here.

Both are n log n. The fallback wins on constants, because the list sort runs in C while the merge loop runs in the interpreter, at the cost of a linear number of extra pointers. When memory is free, the fallback is the better engineering answer. When the interviewer requires constant space, you write the in-place version, and do not claim it is faster.

## 6

A JavaScript LRU uses a Map's insertion order: delete and set again to refresh a key, and take the first key from a fresh keys iterator to find the eviction victim. In Node 24 it measured about ten times slower than an explicit doubly linked list. Why?

A, every set call rehashes the entire table to keep insertion order. B, deleted entries stay as holes, and a new iterator skips them all. C, Map lookups are order log n, because V8 keeps the keys in a tree. D, iterators copy the Map's keys into an array before returning.

[think]

The answer is B: deleted entries stay as holes, and a new iterator skips them all.

V8's ordered hash table marks deleted entries and removes them only when it rehashes. So after many evictions from the front, a fresh keys iterator walks over every hole before reaching a live key. Refreshing an existing key is fast: 200 thousand refreshes took 10 milliseconds. Evicting through the iterator was the slow part, 538 milliseconds for the same count.
