---
lesson: recursion-design
source: 21d11d55ca6a96d5
---
## 1

A function computes the length of a linked list recursively: zero for an empty list, otherwise one plus the length of the rest. In CPython, on a list of 5,000 nodes, what happens?

A, it segfaults, since CPython cannot catch a stack overflow. B, it raises a recursion error at about 1,000 frames deep. C, it returns a wrong answer, because of integer overflow. D, it returns 5,000, since 8 megabytes of stack holds 5,000 frames.

[think]

The answer is B: a recursion error at about 1,000 frames deep.

The depth equals the list's length, and CPython's default recursion limit is 1,000, so it raises a catchable error long before any memory limit matters. The algorithm is correct, but its depth is proportional to the input size, which is exactly the shape that needs a loop or an explicit stack.

## 2

A power function computes x to the n by calling itself twice on n over 2 and multiplying the two results, times one more x when n is odd. Which change takes it from linear time to log n?

A, calling it once, and squaring the stored result. B, adding a second base case, to stop at n equal to 1. C, replacing the recursion with an explicit stack. D, rewriting it in tail form with an accumulator.

[think]

The answer is A: call it once, and square the stored result.

Two calls per frame on half the input gives linear time in total. One stored call gives log n. An explicit stack or tail form changes where the frames live, not how many calls are made, and an extra base case trims one level at most.

## 3

Why does writing a function in tail-recursive accumulator form not reduce its stack usage in Python or Node?

A, the accumulator argument makes each frame bigger. B, neither runtime reuses the frame for a tail call. C, they eliminate tail calls only once the JIT warms up. D, tail form only helps functions with one argument.

[think]

The answer is B: neither runtime reuses the frame for a tail call.

Tail-call elimination is a runtime optimisation that reuses the frame, so each call no longer needs its own. CPython and V8 deliberately do not do it at all, JIT or not. The value of tail form is that it converts mechanically to a loop, which you then write yourself.

## 4

Towers of Hanoi with 20 discs makes about a million moves, using two recursive calls per frame. What is the maximum stack depth?

A, about 20, one per disc. B, about 400, n squared for n discs. C, about 40, two per disc. D, about a million, one per move.

[think]

The answer is A: about 20, one per disc.

Depth is the longest chain of nested calls, which is n. The two calls in each frame run one after the other, so they make the tree wider, not deeper, and the million moves are the total number of calls in that tree. Time is exponential; the stack is linear in n.

## 5

A recursive-descent JSON parser in a web service crashes on some requests with a stack overflow. What is the most likely root cause?

A, malformed UTF-8 bytes inside long string values. B, a missing base case for the empty document. C, very long flat arrays with millions of elements. D, deeply nested arrays or objects in untrusted input.

[think]

The answer is D: deeply nested arrays or objects in untrusted input.

The parse functions call each other, and the depth equals the nesting depth of the input, which an attacker can make arbitrarily large. The fix is a nesting limit or an explicit stack. A long flat array is parsed by a loop, so its length adds no depth, and a missing base case would fail on every input, not some.

## 6

On CPython 3.12 or later, you raise the recursion limit to 200 thousand and run a pure-Python recursion 100 thousand deep in the main thread. What happens?

A, it segfaults, because every Python frame also uses a frame of the 8 megabyte C stack. B, it raises a recursion error, because the limit cannot go above 10 thousand without a new thread. C, it runs only after the thread stack size is raised, because frames still live on the C stack. D, it runs, because Python frames live in heap chunks, and only C recursion has a separate guard.

[think]

The answer is D: it runs, because Python frames live in heap chunks.

Since 3.11, Python-to-Python calls do not re-enter the C interpreter loop, so their frames come from heap chunks and a raised limit is honoured. Version 3.12 added a separate guard for C code that calls back into Python, which the Python-level limit cannot lift. The segfault was the behaviour before 3.11, and the thread trick matters for C recursion or older interpreters, not this case.
