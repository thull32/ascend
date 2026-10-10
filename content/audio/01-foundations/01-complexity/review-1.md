---
review: complexity
source: a03b33e2ff265e90
---
## Introduction

Twelve questions from the complexity module. Answer out loud before the answer comes.

They run through the module in order, two from each lesson: the cost model, asymptotic notation, amortised analysis, space and the memory hierarchy, recurrences, and benchmarking. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A function does a single linear pass, and then, inside a loop over all n elements, inserts each one at the front of a Python list, at position zero. The list grows to n elements. What is the function's overall time complexity?

A, order n. B, order n squared. C, order 2 n. D, order n log n.

[think]

The answer is B: order n squared.

Inserting at position zero shifts every existing element right, so each insert costs the current length of the list. Summed over n inserts, that is zero plus one plus two, up to n minus 1, which is order n squared, and it dominates the earlier linear pass. And "order 2 n" is not a separate class: constants are dropped.

## Question 2

Summing a 512 megabyte array by random but independent indexes measured about 4 nanoseconds per element. Following a random pointer chain through the same array measured about 100 nanoseconds per hop. What explains the 25 times gap?

A, index arithmetic is vectorised, while pointer loads are scalar. B, the pointer chain touches 25 times more cache lines per element. C, the prefetcher predicts random indexes, but not pointer targets. D, independent misses overlap in flight, while dependent loads serialise.

[think]

The answer is D: independent misses overlap in flight, while dependent loads serialise.

An out-of-order processor can keep dozens of cache misses outstanding at once when the addresses do not depend on each other, so their 100 nanosecond latencies overlap. In a pointer chain, the next address is unknown until the current load returns, so every hop pays the full latency. Both patterns touch one cache line per element, and the prefetcher cannot predict either random pattern.

## Question 3

A problem states that n is between 1 and 200 thousand. Which complexity is the intended solution most likely to have?

A, n log n, or linear. B, two to the n, with memoisation. C, n cubed, with small constants. D, n squared, with a tight inner loop.

[think]

The answer is A: n log n, or linear.

N squared at 200 thousand is 40 billion operations, minutes of work, so quadratic is ruled out however tight the inner loop. N log n is about 3.6 million, which is comfortable. Exponential and cubic are far worse. The constraint is the problem setter telling you the target class.

## Question 4

An interviewer asks whether you can sort n arbitrary comparable objects faster than n log n. What is the senior answer?

A, yes: a hash map groups equal keys in linear time, then reads them out in order. B, no: the comparison lower bound is Omega of n log n, unless the keys allow a non-comparison sort. C, no: sorting is Theta of n log n for every algorithm, regardless of the key type. D, yes: Timsort runs in linear time on real-world data, so the bound does not apply.

[think]

The answer is B: no, the comparison lower bound is Omega of n log n, unless the keys allow a non-comparison sort.

A comparison sort is a decision tree that must reach a different leaf for each of the n factorial orderings, so its depth, the number of comparisons on some input, is at least about n log n. Counting sort and radix sort escape the bound by inspecting digits of bounded keys. A hash map has no order, and Timsort's linear best case is for already-sorted runs, not a general guarantee.

## Question 5

Which statement correctly distinguishes amortised analysis from average-case analysis?

A, amortised assumes uniformly random inputs; average case assumes worst-case ones. B, average case bounds the total cost; amortised bounds each single operation. C, amortised holds for every sequence; average case assumes a distribution of inputs. D, they are the same idea: the typical cost per operation over a long run.

[think]

The answer is C: amortised holds for every sequence; average case assumes a distribution of inputs.

Amortised analysis says that for every possible sequence of m operations, the total is at most m times some constant. There is no randomness in it, so it is not about typical inputs. Average case needs a probability distribution, and adversarial inputs can break it. Amortised bounds cannot be broken that way.

## Question 6

Java's array list and V8's arrays grow by about one and a half times when full, while Rust's vector doubles. What is the standard argument for the smaller factor?

A, one and a half keeps the amortised cost constant, while doubling makes it log n. B, one and a half is the largest factor that keeps the amortised copies under one per element. C, doubling is required for SIMD alignment, which Java and V8 do not use. D, below the golden ratio, freed blocks can be reused for the next allocation; doubling trades that for fewer copies.

[think]

The answer is D: below the golden ratio, freed blocks can be reused for the next allocation; doubling trades that for fewer copies.

Both factors give amortised constant-time appends. With doubling, the blocks freed so far always add up to one less than the next request, so they can never be reused for it. With a factor below about 1.618, the freed blocks eventually add up to more than the next request. Doubling copies each element at most twice; one and a half, at most three times. Alignment has nothing to do with it.

## Question 7

A recursive function computes the depth of a binary tree with n nodes by recursing into both children. What is its auxiliary space complexity?

A, constant, because it allocates no data structures. B, log n always, since each call halves the tree. C, order of the height: log n if balanced, n if degenerate. D, order n, because there are n calls in total.

[think]

The answer is C: order of the height, log n if the tree is balanced and n if it is degenerate.

Only the frames on the current root-to-leaf path are live at once, so the stack holds at most one frame per level. The total number of calls is n, but they never coexist. "Constant" ignores the stack, and "log n always" assumes the tree is balanced, when a chain-shaped tree has height n.

## Question 8

Summing ten million integers took 2 milliseconds from an array, 7 from a linked list whose nodes were allocated one after another, and 890 from the same list after its nodes were scattered. What explains the gap between the two linked-list figures?

A, consecutive nodes let the prefetcher follow the chain, while scattered ones make every hop a main-memory miss. B, scattered nodes trigger a page fault on every access, costing microseconds each. C, scattered nodes are larger, because each carries an allocator header. D, the consecutive list is really an array, so the compiler vectorised the loop.

[think]

The answer is A: consecutive nodes let the prefetcher follow the chain, while scattered ones make every hop a main-memory miss.

Both lists do the same dependent loads. When the nodes are consecutive, the addresses advance predictably, and the prefetcher and shared cache lines hide most of the latency. When they are scattered, each hop waits about 100 nanoseconds for main memory, and nothing can overlap it. The node size is the same in both cases, the pages were resident, and a compiler cannot vectorise a pointer chase.

## Question 9

An algorithm splits its input into three equal parts, recurses on all three, and combines the results in linear time. What is its complexity?

A, n to the power 1.585. B, n squared. C, n log n. D, linear.

[think]

The answer is C: n log n.

Three calls on a third of the input, plus linear work. The leaf count is n to the log base 3 of 3, which is n, and that matches the linear combine: the master theorem's tie case, n log n. The n to the 1.585 figure is for three calls on halves, as in Karatsuba, where the subproblems multiply faster than they shrink.

## Question 10

You memoise the naive recursive Fibonacci function. How does the complexity change, and why?

A, it becomes linear, since each of the n arguments is computed once. B, it becomes quadratic, since each call scans the memo table. C, it becomes log n, as with fast matrix exponentiation. D, it stays exponential, because the call tree is unchanged.

[think]

The answer is A: it becomes linear, since each of the n arguments is computed once.

With a memo, the recurrence no longer describes the cost. The cost becomes the number of distinct states, n, times the work per state, constant in the RAM model, and repeated calls return from the memo instead of re-expanding the tree. Log n needs a different algorithm, matrix powers, not a cache. And the recursion depth is still n, so the auxiliary space is linear too.

## Question 11

A request spends 120 milliseconds in a database call, 11 in serialisation, and 33 in a quadratic loop that you can make linear. By Amdahl's law, what is the maximum overall speed-up from fixing the loop?

A, about 20 times, as the loop was the only quadratic code. B, about 1.2 times, since the loop is under a fifth of the time. C, it depends on n, since the loop's cost grows as n squared. D, about 2 times, because quadratic to linear is a big win.

[think]

The answer is B: about 1.2 times, since the loop is under a fifth of the time.

The loop is 33 of 164 milliseconds, about 20 percent. Even if it became infinitely fast, the total would drop to 131 milliseconds: about a 1.25 times improvement, whatever n is today. The database call is where the time is. Profile first, then apply Amdahl's law to decide what is worth optimising.

## Question 12

A C benchmark of a loop that sums the integers below N reports zero milliseconds when compiled with optimisation, even though the sum is printed afterwards. What happened?

A, the processor ran the loop in parallel across its cores. B, printing the result happens before the loop finishes. C, the clock's resolution is too coarse to see a fast loop. D, the compiler replaced the loop with the closed-form formula, N times N minus 1, over 2.

[think]

The answer is D: the compiler replaced the loop with the closed-form formula.

Using the result is not enough when the compiler can compute it algebraically. Gcc recognises the arithmetic series and emits a multiplication. Only an input the compiler cannot see, read at run time, and an output it cannot remove, a volatile store or a black-box sink, force the loop to run. The clock resolves nanoseconds, and compilers do not spread a loop across cores at that setting.

## Recap

Three ideas kept coming back. The growth class is only the first answer: inside one class, memory access patterns and compilers move the cost by tens to hundreds of times, which is why independent misses beat pointer chases and scattered lists lose to fresh ones. Look for the hidden cost: an insert at the front, a stack that grows with the recursion, a third recursive call at every node. And know exactly what a bound promises: amortised against average, a lower bound for the problem against an upper bound for your code, and Amdahl's limit on what any one fix can buy.
