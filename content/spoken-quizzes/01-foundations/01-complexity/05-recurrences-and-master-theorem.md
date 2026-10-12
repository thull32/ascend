---
lesson: recurrences-and-master-theorem
source: 0b00c1d8d8710cbc
---
## 1

An algorithm splits its input into three equal parts, recurses on all three, and combines the results in linear time. What is its complexity?

A, n to the power 1.585. B, n squared. C, n log n. D, linear.

[think]

The answer is C: n log n.

Three calls on a third of the input, plus linear work. The leaf count is n to the log base 3 of 3, which is n, and that matches the linear combine: the master theorem's second case, n log n. The n to the 1.585 figure is for three calls on halves, as in Karatsuba. Linear would need a combine step cheaper than n, and n squared would need more subproblems than the split factor.

## 2

Which of these recurrences describes an exponential-time algorithm?

A, two calls on half the input, plus linear work. B, one call on n minus 1, plus n squared work. C, two calls on n minus 1, plus constant work. D, four calls on half the input, plus n squared work.

[think]

The answer is C: two calls on n minus 1, plus constant work.

Two calls that each shrink n by only a constant produce a tree of depth n that doubles in width at each level: 2 to the n nodes. Two calls on halves plus linear work is n log n, and one call on n minus 1 plus n squared work is cubic. Four calls on halves has more branches, but they shrink n by a constant factor, so the depth is only log n, and the total is polynomial: n squared log n.

## 3

A recursive binary search in Python passes a slice of the list, either the half before the middle or the half after it, to the recursive call. On a million elements it takes 3.3 milliseconds, against 0.9 microseconds for the version that passes indexes. Which recurrence explains the gap?

A, two calls on halves plus constant work, so both halves are visited. B, one call on n minus 1 plus constant work, because slicing removes one element. C, one call on half plus log n work, which adds a log factor. D, one call on half plus linear work: the master theorem's third case, so the search is linear.

[think]

The answer is D: one call on half plus linear work, the master theorem's third case, so the search is linear.

The slice copies half the list before every call, so the work outside the recursion is linear, not constant. With one call on half the input, the leaves cost only constant work, the linear copying dominates, and the root's work sets the total: order n. The code still visits one half, and each call still halves the size; the copying is the whole problem.

## 4

You memoise the naive recursive Fibonacci function. How does the complexity change, and why?

A, it becomes linear, since each of the n arguments is computed once. B, it becomes quadratic, since each call scans the memo table. C, it becomes log n, as with fast matrix exponentiation. D, it stays exponential, because the call tree is unchanged.

[think]

The answer is A: it becomes linear, since each of the n arguments is computed once.

With a memo, the recurrence no longer describes the cost. The cost becomes the number of distinct states, n, times the work per state, constant in the RAM model, and repeated calls return from the memo instead of re-expanding the tree. Log n needs a different algorithm, matrix powers, not a cache. And the recursion depth is still n, so the auxiliary space is linear too.

## 5

A recurrence makes two calls on halves of the input, plus n log n work. Why does the master theorem not apply, and what is the answer?

A, the extra work exceeds n only by a log factor, not by a polynomial factor: n log squared n. B, the second case applies, since the extra work is about n: n log n. C, the third case applies, since the extra work grows faster than n: n log n. D, the first case applies, since the leaves dominate: linear.

[think]

The answer is A: the extra work exceeds n only by a log factor, not by a polynomial factor, and the answer is n log squared n.

Compare n log n with the leaf count, which is n. The third case needs the extra work to beat n by a polynomial factor, n to some positive power epsilon, and a log factor is not that. The second case needs the extra work to be Theta of n, which is also false. Summing the levels of the tree gives n log squared n, and Akra-Bazzi gives the same.

## 6

A recurrence makes one call on half the input and one on a quarter, plus linear work. Akra-Bazzi gives an exponent p of about 0.694, and the answer linear. What is the quickest independent check of that answer?

A, the leaf count is n to the 0.694, smaller than n, so the leaves cannot dominate. B, the sizes at each level sum to three quarters of the level above, so the work is a geometric series under 4 n. C, substitution with a linear guess fails, which shows the bound is at least n log n. D, the depth is log n, and each level does n work, so the total is n log n.

[think]

The answer is B: the sizes at each level sum to three quarters of the level above, so the work is a geometric series under 4 n.

A node of size m has children of sizes m over 2 and m over 4, so each level does three quarters of the work of the level above. The series n, three quarters n, nine sixteenths n, and so on, sums to less than 4 n, so the root dominates and the total is linear. The levels do not each do n work, and substitution with a linear guess does close here, for any constant of at least 4, which confirms the linear bound rather than refuting it.
