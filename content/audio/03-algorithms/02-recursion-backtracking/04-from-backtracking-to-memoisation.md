---
lesson: from-backtracking-to-memoisation
source: 6e67abde09308871
fit: great
desk:
  - "The climbing-stairs call counts, with and without the memo"
  - "The decode ways and word break code, and the decode trace for 226"
  - "The purity demonstration with cache info"
  - "The when-to-memoise diagnostic table and the memoisation versus tabulation table"
  - "Exercises: count decodings, and word break, both memoised"
---
## Introduction

Your backtracking solution is correct, the tests pass, and the interviewer says: now do it for n of 10 thousand. You can hear that the search will not finish, and you have four minutes.

The move that saves the round is not a new algorithm or a clever data structure. It is noticing that the search solves the same subproblem thousands of times, and writing its answer down the first time. That is memoisation. It turns a certain kind of exponential recursion into a polynomial one with about three added lines, and it is the door into dynamic programming.

Three ideas, then. How to see the repeated subproblem, and what its state really is. When memoisation does not apply at all. And the cache itself, which costs memory and stack, and lies to you if the function is not pure.

## The repeated subproblem

Climbing stairs: you can take 1 or 2 steps at a time; how many distinct ways are there up n steps? The number of ways up n is the ways up n minus 1, plus the ways up n minus 2. With no stairs or one stair, there is one way. That is the Fibonacci recurrence.

Draw the call tree for 6 stairs, and the waste is plain. The count for 4 stairs is computed twice. For 3, three times. For 2, five times. The number of calls grows by a factor of about 1.6 per step. At 30 stairs, that is about 2.7 million calls. At 40, about 330 million, roughly ten seconds in Python. At 100, about 10 to the 21, longer than the universe has existed.

And there are only n plus 1 distinct inputs. The function is pure: same input, same output, no side effects. So keep a dictionary from n to its answer. Check it before computing, and fill it after. Now each n is computed once, and the call count drops to 2n minus 1: 59 calls for 30 stairs instead of 2.7 million. In Python, the idiomatic form is a cache decorator, lru cache.

Three practical notes. A mutable default argument as the memo persists across top-level calls, which is a bug when the answer depends on anything else that changed. Cache keys must be hashable, so recurse on an index, not on a slice of a list; slicing also copies, which turns linear into quadratic. And recursion depth is still n. Memoisation removes repeated work, not stack frames.

## What is the state?

Memoisation only helps when the same subproblem recurs, and a subproblem is defined by the arguments that affect the return value. Learning to see that state is the skill.

Decode ways: a digit string maps to letters, 1 is A and 26 is Z. How many decodings? At each position, the search takes one digit, or two if they form 10 to 26. What does the count from position i onwards depend on? Only on i. The digits before i are already decoded and do not change how the rest can be decoded. So there are n plus 1 states, and the exponential search becomes linear. A tiny example: 2, 2, 6 decodes three ways: B B F, B Z, and V F.

Word break, whether a string can be split into dictionary words, has the same state: the start index. Without the memo, a string of 24 As followed by a B, with dictionary words of 1 to 4 As, explores every way of composing 24 from parts of size 1 to 4 before discovering the B is unreachable. That is about 8 million calls. With the memo, it is 25 states, each tried against 4 words: 100 steps. Bound the prefix length by the longest word, too. That is pruning from the previous lesson, applied here.

The state can have two parts. Target Sum: give each number a plus or minus sign so the total hits a target; count the ways. After deciding the first i signs, what matters is the index and the running sum. Here is the interview question: two different sign patterns reach index i with the same running sum of 7. Why is it safe to reuse the count?

[pause]

Because the remaining choices and the remaining target are identical, however the 7 was reached. The future depends only on the index and the sum. That collapses 2 to the n paths into, at most, n times the range of sums. The wrong answer is "because the sums are equal", without arguing that the state determines the future.

That is the general test. Two paths through the search that arrive at the same arguments must have the same answer from there on. If the answer also depends on how you got there, those arguments are not the whole state. Enlarge the state, or memoisation does not apply.

## When it does not apply

Permutations. The state after placing k elements is which elements are used, and there are 2 to the n such sets, not n. Worse, the output is the list of permutations, and there are n factorial of them. No cache can produce n factorial things faster than n factorial. Memoisation cannot beat the output size. The same goes for listing all subsets, all N-queens boards, all palindrome partitions: if the question is "list them", the enumeration is the answer.

The moment the question becomes count, decide, minimise or maximise, the picture changes. "How many palindrome partitions", "the minimum number of cuts", "does a segmentation exist", "how many ways to reach the sum": each has a small state and memoises. "How many N-queens solutions" is still hard, because its state, the columns and two diagonal masks, does not collapse.

So the lesson's recognition protocol, in order. Is the output itself exponential? If so, stop: the search is the algorithm, and pruning is the only lever. Which arguments actually affect the result? Drop the ones that do not, like the path so far, or shrink them, the sum instead of the sequence of signs. How many distinct values can the rest take? If that is polynomial, memoise. Does the same argument tuple actually recur? And is the recursion pure?

## The cache is a data structure

That last question is the production bug. The cache is keyed on the arguments and nothing else. Picture a memoised function that sums a global list of prices from index i onwards. Call it, and get 6. Change the first price to 100, call it again, and you still get 6. It is a cache hit, and it never looks at the list again. No exception, no warning, an answer that was right an hour ago. In a service, that is "the recommendation for user 42 is stale until the process restarts", and it is intermittent because it depends on which arguments were cached before the data changed. Everything the function reads must be an argument or immutable, or the cache must be cleared, or the data's version must be in the key.

Memory is the second cost. Measured in CPython, an integer-keyed entry costs about 84 bytes, and a two-integer tuple key about 116. With a maximum size, the cache also keeps a linked list for eviction, and each entry costs more. The rule of thumb: 100 to 200 bytes per cached state, so a million states is 100 to 200 megabytes. A memo over two indices up to 3,000 each is 9 million entries, about a gigabyte. The same table as a typed array is 36 megabytes, and as two rolling rows, 24 kilobytes. And an unbounded cache on a function whose arguments are user ids or timestamps grows for days until a restart.

One trap with methods: a cache on a method keys on self, so it holds a reference to every instance ever called, and none of them are ever garbage collected.

Stack is the third cost. Call a memoised Fibonacci on 10 thousand and it still fails, because the first call must recurse all the way down before anything is cached, and CPython's limit is 1,000 frames. Worse, the cache wrapper is C code that re-enters the interpreter at each level, so raising the limit can exhaust the C stack and crash the process. The fix is not a bigger limit. Fill the table bottom-up in a loop, or drive the recursion with an explicit stack.

## Top-down or bottom-up

Memoisation is top-down: start from the whole problem, recurse, cache. Tabulation is bottom-up: work out the order subproblems depend on each other, and fill an array in that order. They compute exactly the same values.

Bottom-up has no stack, is several times faster per state in Python, uses 8 bytes per slot instead of a hundred or more, and often shrinks to the last row or two values. Top-down wins when most states are unreachable, because it only computes the ones it reaches, and when the dependency order is awkward to state.

In an interview, derive the recursion and memoise it first. It is the fastest route to a correct polynomial solution, and it makes the state explicit, because the state is the function's parameter list. If asked for the bottom-up version, the parameters become array indices and the base cases become the first cells.

## In the interview

A follow-up the lesson expects. You memoised on the index and the remaining sum. How much memory is that for n of 10 thousand and sums up to 10 thousand?

[pause]

Up to 10 to the 8 states. At 100 to 200 bytes each in a Python dictionary, that is 10 to 20 gigabytes, so the memo is infeasible. Bottom-up with two rolling rows is 20 thousand cells. And if the reachable sums are sparse, the memo may touch far fewer states, which the cache's statistics would show. The wrong answer is "it is n times S, which is fine", with no bytes attached.

And another: your memoised search reads a board that the caller mutates between calls. What happens? Stale hits. The board must be part of the key, as a hash of its contents or a version counter, or the cache must be cleared on every change. The wrong answer is "the cache notices the change". Nothing in lru cache does that.

## Recap

Four things to remember. Memoisation caches a pure function on the arguments that determine its result, and two paths reaching the same arguments must have the same future. Count the states before coding: n states becomes linear, 2 to the n states will not be saved, and listing all objects is output-bound whatever you cache. Count the bytes too: 100 to 200 per state in CPython. And memoisation removes repeated work, not stack depth, so deep inputs need a bottom-up loop.

At your desk: the climbing-stairs call counts, the decode ways and word break code, the purity demonstration, the two comparison tables, and the two exercises, count decodings and word break.
