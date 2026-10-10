---
lesson: asymptotic-notation
source: ffe3b36a60f25b80
fit: partial
desk:
  - "The formal definitions, and the worked hunt for the constant and the threshold"
  - "The growth-class table with the input size each class fits in a second"
  - "The binary search timing table by cache level"
  - "The two-pointer trace and the ordering of growth rates"
  - "Exercises: count halvings, and decode a constraint from an operation budget"
---
## Introduction

An interviewer asks for the complexity of your solution, and you say "order n". They ask, "is that tight?", and you are not sure what they mean. Later they say, "the constraint is n up to 100 thousand, so quadratic is out." You nod, but you could not have said where that line falls, or why.

Both come from the same gap: treating Big O as a label on algorithms rather than as a precise statement about functions. Four ideas: what the three notations actually claim, the growth classes and what each can afford in a second, a feel for logarithms you can do in your head, and how to read the class off code, including the trap where the input size is not what it seems.

## What the notations claim

Every notation here compares two functions of n: the cost of your code, and a simpler reference like n squared. And each only cares about large n.

Big O is an upper bound. It says that eventually, past some threshold, your cost is at most a constant times the reference. So three n plus two is order n. But here is the part people miss: three n plus two is also order n squared, and also order two to the n. All true. Big O means "no worse than", not "equal to".

Big Omega is the mirror: eventually, your cost is at least a constant times the reference. A lower bound.

Big Theta is both at once: your cost and the reference grow at the same rate, up to constants. That is the tight bound. So when the interviewer asks "is that tight?", they are asking whether your Big O is also a Big Theta.

One detail from finding those constants by hand is worth carrying. For three n squared plus 500 n plus a million, a constant of four works, but only once n reaches about 1,500. Below that, the so-called lower-order terms are the majority of the cost. That threshold is often in the thousands, which is the first hint that dropping constants is only safe once n is large.

When an engineer says "this is order n", they almost always mean Theta: it grows linearly. Saying binary search is order n is technically true and practically useless. If you want to be exact without being pedantic, say "order n, and that's tight".

And pick the case out loud. "Worst case quadratic" and "average case n log n" are statements about different functions: the maximum cost over all inputs of a size, against the expected cost over some distribution. Quicksort is both, and neither contradicts the other.

## The growth classes and what they afford

Take a budget of 100 million simple operations as "about a second". That comes from the previous lesson: a simple CPython loop iteration costs about 11 nanoseconds, so roughly 100 million a second. Compiled Go or Rust does ten times that.

Against that budget, here is what each class can process. Constant and logarithmic: any size. Linear: about 100 million. N log n: about four and a half million. Quadratic: about ten thousand. Cubic: about 460. Exponential, two to the n: about 26. Factorial: 11.

This is how you decode a constraint. If n can be 100 thousand, n squared is ten billion: a hundred seconds of work. The intended solution is n log n or linear. If n is at most 20, two to the n is about a million subsets, so exponential is not only acceptable but probably intended. If n is at most five thousand, quadratic is fine, and you should not waste time hunting for something cleverer. And in a service with a 50 millisecond budget, divide every row by 20.

[pause]

Two classes deserve a closer look. N log n is almost linear: at a million elements, log n is about 20, so a sort costs about twenty passes' worth of work. That is why "sort first, then do one pass" wins so often. And two to the n is a cliff. Doubling n from 20 to 40 does not double the work; it multiplies it by a million.

Reading the constraint before choosing the approach saves more interview time than any other habit.

## A feel for logarithms

Log base 2 of n answers one question: how many times can you halve n before you reach 1? Halve a million and count: 500 thousand, 250 thousand, and so on. Nineteen halvings to reach 1. A million needs 20 bits.

Here is the rule you can do in your head. Every factor of a thousand adds about ten, because two to the ten is 1,024. A thousand is about 10. A million is about 20. A billion is about 30. A trillion is about 40. So a billion-element sorted array needs at most 30 probes for binary search, and a balanced tree of a billion nodes is about 30 levels tall.

The base does not matter inside Big O, since switching bases only multiplies by a constant. But it matters for real counts. A B-tree with a fan-out of a thousand is three levels tall for a billion keys, not thirty. That factor of ten is exactly why databases use B-trees on disk.

## The price of one probe

Thirty probes sounds free until you ask what one probe costs. Measured in C on one desktop machine, binary search over a small array that fits in the fastest cache costs about 3.6 nanoseconds per probe. Over a 512 megabyte array, it costs about 18 nanoseconds per probe. The probe count grows exactly as log n predicts. The price per probe rises five times.

Why only five, when a main memory read is about 100 nanoseconds? Every search starts at the same midpoint, then one of the same two quarter-points, then one of the same four eighth-points. The top levels of the search touch only a few cache lines, so they stay hot across searches. Only the bottom few probes, spread across the whole array, miss to main memory.

That is the mechanism behind B-trees, which pack hundreds of keys per node so a lookup makes three or four visits instead of thirty, and behind cache-friendly layouts of sorted arrays. Both leave the algorithm at Theta of log n and attack the constant. Log n tells you the count. The hardware tells you the price.

## Comparing and reading growth

A few rules for ordering expressions. Polynomials sort by exponent. Any positive power of n eventually beats any power of log n. Any exponential eventually beats any polynomial, though "eventually" can be far away: one point zero one to the n only passes n to the hundredth at n around 120 thousand. In a sum, keep the largest term.

And keep separate variables separate. A loop over a matrix with r rows and c columns is order r times c, not n squared, unless the matrix is square. A graph traversal is order V plus E, vertices plus edges. Do not collapse that to V squared unless the graph is dense. Interviewers notice.

To read complexity off code: find the input size, find the innermost work and how many times it runs, price every library call, then multiply nested things, add sequential things and keep the biggest.

Two shapes catch people. First, a loop whose counter is not obvious. Two pointers start at the ends of a sorted array and every iteration moves one of them inward. The gap starts at n minus 1 and shrinks by one each time, so the loop runs at most n minus 1 times, whatever the data. "Every iteration makes progress on a bounded quantity" is the standard way to bound a loop like that.

Second, building a string by appending in a loop. Strings are immutable, so each append copies everything so far. With eight one-character parts, the copies are 0, 1, 2, up to 7 characters: 28 in total. That grows as n squared. Joining the parts once is linear.

## When the input size is the trap

Here is a question for you. A function checks whether a number k is prime by trying every divisor up to the square root of k. Is that polynomial time?

[pause]

No. Complexity is measured against the size of the input, and the size of a number is its number of digits, or bits. If k has b bits, the square root of k is two to the b over 2: exponential in the input size. For a 64-bit number, that is up to about 4 billion divisions. Doubling the bit count squares the work.

The same trap appears in production: a validation loop that runs up to the value of a numeric field, not the length of the input. A client sends a trillion, and the loop obliges.

And lower bounds are how you answer "can you do better?" without guessing. Anything that must look at every element is Omega of n, so a linear solution is optimal. Sorting by comparisons is Omega of n log n. The argument is short: a comparison sort is a decision tree with two outcomes per comparison, and it must reach a different leaf for each of the n factorial orderings, so its depth is at least log of n factorial, which is roughly n log n. The way around it is to stop comparing: counting sort and radix sort inspect digits of bounded keys instead.

## In the interview

A follow-up the lesson expects: can you beat n log n here?

[pause]

Not with comparisons, because any comparison sort is Omega of n log n by the decision-tree argument. If the keys are integers in a bounded range, counting sort is order n plus k. If you only need the top k elements, a heap gives n log k. The wrong answers are "no, sorting is always n log n", which is false for bounded keys, and "yes, with a hash map", which gives no order.

And another: log n is effectively constant, so is binary search order 1? No. It is Theta of log n, and on a 512 megabyte array the last several probes are main-memory misses, so a search costs about half a microsecond. "Effectively constant" is a remark about the count of probes, not their price.

## Recap

Four things to remember. Big O is an upper bound, Omega a lower bound, Theta both; "tight" means Theta, and always name the case. Decode constraints against roughly 100 million operations a second: 100 thousand rules out quadratic, 20 invites subsets. Every factor of a thousand adds about ten to log base 2, but each probe has a price set by the memory hierarchy. And measure input size by length, never by value, and keep separate variables separate.

At your desk: the formal definitions and the constant hunt, the growth-class table, the binary search timings, the two-pointer trace, and the two exercises.
