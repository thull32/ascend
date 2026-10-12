---
lesson: top-k-elements
source: 1fe18d64b81b4b5e
---
## 1

In an insert-only stream, a value evicted from a size-k min-heap is never needed again. What property makes that safe?

A, heap replace keeps a copy of every root it evicts. B, the heap keeps its values sorted, so the root is final. C, an evicted value is the smallest of all the values seen. D, the kth largest so far can only rise as values arrive.

[think]

The answer is D: the kth largest so far can only rise.

Adding values either raises the kth-largest threshold or leaves it alone, so a value that fell below it stays below it forever. The heap is not sorted, and the evicted root is only the smallest of the k plus 1 current candidates, not of everything seen. Deletions break exactly this monotonicity.

## 2

A leaderboard must always show the top 10, and players' scores can also decrease. Why does a size-10 min-heap stop being correct?

A, heaps cannot store score decreases, only score increases. B, a size-10 heap cannot hold ties between equal player scores. C, when a top-10 score drops, the 11th player was already evicted. D, the heap must become a max-heap once scores are allowed to fall.

[think]

The answer is C: when a top-10 score drops, the 11th player was already evicted.

A decrease can lower the threshold, and the player who should now enter the top 10 is one the heap discarded earlier. Keep every player in an ordered structure, such as a sorted container, a balanced tree or a Redis sorted set, or keep an indexed heap over all of them. Polarity is not the issue; eviction has stopped being permanent.

## 3

You want the top 2 most frequent words, with ties broken alphabetically. You keep a size-2 min-heap of count and word tuples. On the words b, a, c, a, b, c, what does it return?

A, a and b, because tuples compare the word when the counts tie. B, a and c, because the heap keeps the first word seen per count. C, a TypeError, because Python cannot compare an integer with a string. D, b and c, because a tie evicts the alphabetically smallest word.

[think]

The answer is D: b and c, because a tie evicts the alphabetically smallest word.

All the counts are 2, so the comparison falls through to the word, and the root is the alphabetically smallest entry, which is the one evicted: the opposite of the tie rule. The weakest entry must be the lower count and then the alphabetically later word, through a wrapper with its own less-than, or you heapify every negated count and word pair and pop k times. Fields are compared position by position, so an integer is never compared with a string.

## 4

Measured on CPython 3.14, with a million random floats and k of half a million, which of these three is fastest?

A, all three tie, since each one is n log k here. B, heapq nlargest, since its heap loop runs in C. C, a hand-written size-k heap loop with heap replace. D, sorting in reverse and slicing off the first k, since Timsort runs in C.

[think]

The answer is D: sorting in reverse and slicing, since Timsort runs in C.

With k at half of n, log k is about log n, so the heap does n log n work and gains nothing. The sort took about 141 milliseconds, the hand loop about 234, and nlargest about 806, because it decorates each candidate as a value and order tuple and compares tuples. An in-place quickselect beat all three at 107. The heap wins only when k is much smaller than n: 5 milliseconds against 137 at k of 10.

## 5

A full size-k min-heap has the root 5. You call heapq's heap replace with 3, without checking first. What happens?

A, 5 is evicted and 3 enters, so the heap no longer holds the top k. B, the heap re-sifts itself so that 5 comes back up to the root. C, 3 is returned unchanged, and the heap is left exactly as it was. D, an IndexError is raised, because 3 is smaller than the current root.

[think]

The answer is A: 5 is evicted and 3 enters, so the heap no longer holds the top k.

Heap replace always returns the old root and puts the new item in its place, even when the new item is worse, which is why it must follow a check that the new value beats the root. Heap push-pop is the call that returns 3 untouched when 3 is not larger than the root. An IndexError happens only on an empty heap.

## 6

Only 107 of a million random floats ever entered a size-10 min-heap. Which input order makes every element enter, and what does it cost?

A, ascending input: each value beats the root, about ten times slower. B, many duplicates: each tie evicts the root, about ten times slower. C, descending input: each value beats the root, about ten times slower. D, random input with k equal to 1: each value replaces the root, ten times slower.

[think]

The answer is A: ascending input, about ten times slower.

In ascending order every new value is the largest so far, so it beats the root and forces a sift: a million entries, and 132 milliseconds against 13 on random order. Descending input is the best case, because everything after the first k is rejected. A strict greater-than test rejects ties, and random input with k equal to 1 enters only about the natural log of n times.
