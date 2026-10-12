---
problem: three-sum
args: [[-1, 0, 1, 2, -1, -4]]
frames: 64
source: e2a90c53facd135c
---
@0
We want every distinct triple from minus 1, 0, 1, 2, minus 1, minus 4 that sums to zero. There are two: minus 1, minus 1, 2, and minus 1, 0, 1. The insight: fix the first number, and the question becomes "which two later numbers add up to its negative?", which is two sum on a sorted list. So sort once. Sorting also handles duplicates, because equal values end up side by side, and skipping over runs of equal values is enough to emit each triple once.

@1-3
Sorted, the list is minus 4, minus 1, minus 1, 0, 1, 2.

@4-8
Fix position zero, minus 4. It is not positive, and it is the first, so no duplicate check applies. lo starts just after it, at position 1, and hi at the end, position 5.

@9-23
Minus 4 plus minus 1 plus 2 is minus 3: too small, so lo moves right to make the sum bigger. Minus 3 again. Then minus 2, then minus 1. lo meets hi without ever reaching zero. Minus 4 is too negative for any pair here.

@24-28
Fix position 1, minus 1. It is the first minus 1, so it is not skipped. lo is position 2, the second minus 1, and hi is the 2.

@29-36
Minus 1, minus 1 and 2 sum to zero. Record the triple. Then both pointers move inward, and each skips past any copies of the value it just used. Here the neighbours differ, so no skipping is needed. lo is now on 0 and hi on 1.

@37-46
Minus 1, 0 and 1: zero again. Record it. The pointers move inward and cross, so this round is over.

@47-50
Position 2 is the second minus 1, the same as the number we just fixed. Everything it could find, the first minus 1 already found, so we skip it. The check compares with the previous position, not the next one. Comparing with the next would skip the first copy instead, and lose minus 1, minus 1, 2, because that triple needs both copies.

@51-60
Fix position 3, zero. lo is on 1 and hi on 2, summing to 3, too big, so hi moves left and the pointers meet. Nothing here.

@61-63
The outer loop stops two short of the end, since a triple needs two numbers after the fixed one. We return the two triples.

Sorting costs n log n, then each fixed number runs one linear walk, so the total is n squared, with no extra space beyond the output. The mistakes are skipping duplicates of the fixed number by looking ahead instead of behind, forgetting to skip duplicates on the pointers after a match, and reaching for a set of tuples to remove repeats, which works but shows you missed why sorting was enough. Also useful: once the fixed number is positive, every later one is too, so the loop can stop early.
