---
review: recursion-backtracking
source: 5ca34fd27f0a7051
---
## Introduction

Twelve questions from the recursion and backtracking module: recursion design, generating combinatorial objects, constraint satisfaction, and memoisation. Each has four options. Answer out loud before the answer comes.

## Question 1

A function computes the length of a linked list recursively: zero for an empty list, otherwise one plus the length of the rest. In CPython, on a list of 5,000 nodes, what happens?

A, it segfaults, since CPython cannot catch a stack overflow. B, it raises a recursion error at about 1,000 frames deep. C, it returns a wrong answer, because of integer overflow. D, it returns 5,000, since 8 megabytes of stack holds 5,000 frames.

[think]

The answer is B: a recursion error at about 1,000 frames deep. The depth equals the list's length, and CPython's default recursion limit is 1,000, so it raises a catchable error long before any memory limit matters. The algorithm is correct, but its depth is proportional to the input size, which is exactly the shape that needs a loop or an explicit stack.

## Question 2

Towers of Hanoi with 20 discs makes about a million moves, using two recursive calls per frame. What is the maximum stack depth?

A, about 20, one per disc. B, about 400, n squared for n discs. C, about 40, two per disc. D, about a million, one per move.

[think]

The answer is A: about 20, one per disc. Depth is the longest chain of nested calls, which is n. The two calls in each frame run one after the other, so they make the tree wider, not deeper, and the million moves are the total number of calls. Time is exponential; the stack is linear in n.

## Question 3

A recursive-descent JSON parser in a web service crashes on some requests with a stack overflow. What is the most likely root cause?

A, malformed UTF-8 bytes inside long string values. B, a missing base case for the empty document. C, very long flat arrays with millions of elements. D, deeply nested arrays or objects in untrusted input.

[think]

The answer is D: deeply nested arrays or objects in untrusted input. The parse functions call each other, and the depth equals the nesting depth of the input, which an attacker can make arbitrarily large. The fix is a nesting limit or an explicit stack. A long flat array is parsed by a loop, so its length adds no depth, and a missing base case would fail on every input, not some.

## Question 4

A subsets function records its answer by appending the path list itself, instead of a copy of it. What does the output contain when the call returns?

A, all 2 to the n subsets, each recorded correctly. B, all 2 to the n subsets, but in reverse order. C, 2 to the n references to one list, which now holds the full set. D, 2 to the n references to one list, which is now empty.

[think]

The answer is D: 2 to the n references to one list, now empty. The path is one list, mutated in place, and every recorded entry points at it. Every append is undone by a pop, so after the final pop it is empty and every entry reads as empty. Copy on record.

## Question 5

The subsets-with-duplicates code skips index i when i is greater than start and the value equals the previous one. If you change "greater than start" to "greater than zero", what happens on the input 1, 2, 2?

A, you lose only the subset 2, 2, and keep 1, 2, 2. B, you get 1, 2 and 2 twice each. C, you get the same six subsets as before. D, you lose both 1, 2, 2 and 2, 2.

[think]

The answer is D: you lose both 1, 2, 2 and 2, 2. With "greater than zero", the rule also fires when the equal element is the first choice of a deeper level, so a 2 can never follow a 2, whether the path starts with 1 or with 2. No duplicates appear, because sibling 2s are still skipped. The rule must only block equal siblings, which is what "greater than start" says.

## Question 6

Combination Sum allows reusing a candidate. Which single change to the combinations template implements that?

A, drop the start index and loop over all candidates. B, remove the early break, so larger candidates are retried. C, recurse with start reset to zero, so every candidate is open. D, recurse with start equal to i, rather than i plus 1.

[think]

The answer is D: recurse with start equal to i. That lets the same index be chosen again but still forbids going back to earlier ones, so each multiset comes out in one canonical order. Dropping the start index or resetting it to zero produces every ordering of the same sum. The break is only pruning on sorted input; removing it changes speed, not which items can repeat.

## Question 7

A sudoku solver that fills cells in reading order takes minutes on a hard puzzle. Which change is most likely to make it fast?

A, always filling the empty cell with the fewest candidates first. B, replacing the used-digit sets with a bitmask per row, column and box. C, converting the recursion to a loop with an explicit stack. D, trying the digits from 9 down to 1, instead of 1 up to 9.

[think]

The answer is A: fill the cell with the fewest candidates first. That ordering, minimum remaining values, finds dead ends before branching and takes forced moves with no branching at all, cutting the measured puzzle from millions of nodes to under a thousand. Bitmasks and an explicit stack only change the cost per node, and digit order rarely matters much.

## Question 8

Word search on a 6 by 6 board filled with A, for the word made of eleven As followed by a B, is slow. Which pre-check avoids the search entirely?

A, check that the word fits in the 36 board cells. B, cap the recursion depth at 6, the width of the board. C, compare the letter counts of the board and the word. D, start the search from the centre cell of the board.

[think]

The answer is C: compare the letter counts. The board has no B, so a frequency count rejects the instance in linear time. The length check passes, since 12 letters fit in 36 cells, and neither a start cell nor a depth cap removes the exponential number of A-paths the search explores before finding there is never a B.

## Question 9

Switching an 8-queens solver from three Python sets to three bitmask integers made it about 3.7 times faster on one machine. What did the change do to the search tree?

A, it halved the tree, by exploiting the mirror symmetry of the board. B, it pruned the tree further, since masks encode both diagonals at once. C, it removed the leaf checks, so only interior nodes are visited. D, nothing: the same 2,057 nodes, each processed with cheaper operations.

[think]

The answer is D: nothing; the same 2,057 nodes, each cheaper. Bitmasks are a change of representation. The same constraints are checked at the same moments, so the tree is identical, but each check is a few integer operations instead of hashed set lookups and method calls. Pruning and symmetry are separate levers that the representation does not touch.

## Question 10

A backtracking function counts valid completions from position i. It also takes the path, the list of choices so far, which does not affect the count. What is the right memo key?

A, i together with the path, as a tuple. B, the path alone, as a tuple. C, the length of the path. D, i alone.

[think]

The answer is D: i alone. Only arguments that affect the result belong in the key. Including the path makes every call unique, so the cache never hits. Keying on i alone gives n states. The path's length is usually i again, but only if it is truly determined by i.

## Question 11

You add lru cache to the naive recursive Fibonacci and call it on 50 thousand. What happens in CPython?

A, it hangs, since the unbounded cache fills memory. B, it returns a wrong answer, since the integers overflow 64 bits. C, a recursion error, because the first call nests 50 thousand frames deep. D, it returns instantly, since each value is computed once.

[think]

The answer is C: a recursion error. Memoisation removes repeated work, not stack depth. The first call still recurses 50 thousand frames deep before anything is cached, and the default limit is about 1,000. A bottom-up loop is the fix. Python integers do not overflow, and 50 thousand cached values are a trivial amount of memory.

## Question 12

A memoised recursive function reads a global list that another part of the program changes between calls. What symptom should you expect?

A, stale answers that depend on the order of calls. B, a key error when the cache sees the new list. C, a recursion error once the list grows long. D, correct results, but more cache misses.

[think]

The answer is A: stale answers that depend on call order. The cache key does not include the global, so the cache never notices the change: no miss, no error. Once an answer is cached, it is returned even after the data changes. Bugs like this are intermittent and hard to reproduce, which is why a memoised function must be pure in its arguments.

## Recap

Three ideas kept coming back. Depth and call count are different numbers: depth costs stack and is what crashes on a deep list, a nested document, or the first call of a memoised recursion, while call count costs time. Backtracking lives or dies by what it refuses to explore: copy and undo symmetrically, skip equal siblings, check constraints early, choose the most constrained variable, and pre-check what you can. And a memo is keyed on the state, the arguments that decide the future, and nothing else, so leave the path out, and never let the function read anything the key does not hold.
