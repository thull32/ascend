---
lesson: monotonic-stack
source: 1a2aba6cd3f6346c
fit: partial
desk:
  - "The full daily-temperatures trace, eight elements, fourteen stack operations"
  - "The table of the four variants: what the stack holds, the pop condition, where the answer is read"
  - "The stock span and sum-of-subarray-minimums traces, row by row"
  - "The histogram code and its trace, with the sentinel and the width formula"
  - "The trade-off table against sparse tables and segment trees, and the failure modes"
  - "Exercises: next greater element, and largest rectangle in a histogram"
---
## Introduction

For each day in a list of temperatures, how many days do you wait until a warmer one? The obvious solution scans forward from each day. For a year of hourly readings, 8,760 samples, that is up to 38 million comparisons for a question that should take about 8,760.

The scan is wasteful because it forgets. When one day finds its answer four days later, it has just learned that the days in between were all colder than that warmer day. The scan from the next day will rediscover all of that from scratch.

A monotonic stack remembers exactly the right amount. It holds the elements that are still waiting for an answer, arranged so that one new arrival can answer several of them at once. It turns a whole family of quadratic "find the nearest bigger or smaller element" problems into linear ones. Three things to take away: the invariant, the argument for why a loop inside a loop is still linear, and the tie rules that separate a correct answer from an off-by-one.

## The invariant

For the next-greater-element problem, the stack holds indices whose values are strictly decreasing from bottom to top. Every index on the stack is waiting for its next greater element. None has found it yet.

When a new element arrives, you do two things. First, while the value at the top of the stack is smaller than the new one, pop it: the new element is its answer. Second, push the new index. When the input ends, whatever is left on the stack has no greater element anywhere to its right.

Why is the new element the right answer for everything it pops? Because nothing between that index and the new one was greater. If something had been, it would already have popped that index.

Here it is with the lesson's own temperatures. Suppose the stack is holding 75, 71 and 69, decreasing, all three waiting. Now 72 arrives. 69 is smaller, so pop it: its answer is one day later. 71 is smaller, so pop it: its answer is two days later. 75 is not smaller, so stop, and push 72. The stack now reads 75, 72, still decreasing. One arrival, two answers.

[pause]

And notice what you push: the index, not the value. The index gives you the distance in daily temperatures and the width in the histogram, and you can always look the value up. A stack of values can tell you what, but never where or how far.

## Why it is linear

The loop has a while inside a for, so it looks quadratic. It is not, and interviewers ask you to say why.

Each index is pushed exactly once, at its own iteration. An index can be popped at most once, because once it is gone it is gone. So across the whole run there are at most n pops, and at most 2n stack operations in total. The inner loop's iterations, summed over every outer iteration, are just the pops. Linear, however unevenly they fall.

The lesson gives the two extremes. On a strictly increasing input, every arrival pops exactly one. On an input that decreases all the way and then ends with one huge value, nothing pops until the last element, which pops everything at once. Same total. This is amortised analysis: each push deposits a credit, each pop spends it.

## The four variants and the tie rule

Next greater is one of four questions: next greater, next smaller, previous greater, previous smaller. The stack answers all four. For greater, keep the stack decreasing; for smaller, keep it increasing.

The difference between next and previous is when you read the answer. For next, the answer for an index is written when a later element pops it. For previous, the answer for the new index is whatever is on top after the pops: the nearest survivor to its left, which by construction is the nearest one bigger, or smaller. You can collect both in a single pass.

Then there are ties, and this is where people lose marks. Is an equal value "greater"? The problem decides, not you. Get it wrong and you produce off-by-one areas in the histogram problem, wrong spans in stock span, and double counts in sum of subarray minimums. Always put a tie case in your tests.

Stock span shows the tie decision made explicit. The span on a day is the number of consecutive days ending today with a price less than or equal to today's. Equal prices count toward the span, so you pop on less-than-or-equal. In the lesson's prices, 100, 80, 60, 70, 60, then 75: when 75 arrives it pops the 60 and the 70, stops at 80, and its span is 4. And stock span is online. Each day's span is known the moment its price arrives, which suits a streaming feed. Next-greater answers, by contrast, arrive only when a later element pops them.

## Sum of subarray minimums

Sum the minimum of every contiguous subarray. Think of each element's territory. An element is the minimum of every subarray that starts after its previous smaller element and ends before its next smaller element. If it has L choices of start and R choices of end, it contributes its value times L times R.

Equal values break this unless one side is strict and the other is not. Take the array 2, 2. Its three subarrays are 2, 2, and the pair; the answer is 6. If both boundaries are strict, neither 2 sees the other as a boundary, both claim the pair, and you get 8. If both are non-strict, neither claims it, and you get 4. The lesson's rule: previous strictly smaller on the left, next smaller-or-equal on the right. Then every tied subarray is credited to exactly one of its minimums.

## Largest rectangle in a histogram

The hard classic. Bars of width one; find the largest rectangle under them. For each bar, the widest rectangle of its height runs from just past the previous shorter bar to just before the next shorter bar.

Both boundaries come from one increasing stack. When a shorter bar arrives and pops a taller one, the arriving bar is its right boundary, and the new top of the stack, after the pop, is its left boundary. So you score each bar at the moment it is popped. The width is the right index, minus the left index, minus one, because both boundaries are exclusive.

The lesson's bars are 2, 1, 5, 6, 2, 3. When the bar of height 2 arrives at position four, it pops the 6, a rectangle of area 6, and then the 5, whose left boundary is the bar of height 1 at position one. Width four minus one minus one, two. Area 10, and that is the answer: the bars of height 5 and 6, at height 5.

One more piece: a sentinel. Process one extra bar of height zero at the end. Without it, the bars still on the stack when the input ends are never scored, and the answer is wrong exactly when the tallest bars sit at the end. The quadratic "expand from each bar" solution is what most candidates write first; moving to this one is the senior step.

## Cost and where it hides

The algorithm is a stack of integers, so its real cost is the language's loop overhead. On CPython, next-greater over a million random numbers measured 69 milliseconds. The same loop in Rust or C++ runs at one to three nanoseconds per element, because the stack lives in cache and the branch predictor learns the "push, rarely pop" pattern.

It hides in real systems. The operator stack in an expression parser pops while the top binds at least as tightly, which is a monotonic stack over precedence. The all-nearest-smaller-values pass builds a Cartesian tree in linear time, the first step of constant-time range-minimum queries on suffix arrays. And a metrics agent can compute "time since the last higher reading" online, with constant amortised work per sample.

How do you recognise the family? Listen for the words: next, previous, nearest, to the left, to the right, until a larger one, span, width bounded by smaller elements.

## In the interview

Two follow-ups from the lesson. First: the data is a stream. Which of the four variants can you answer online?

[pause]

Previous greater and previous smaller, because the answer for each element is read from the stack top the moment it arrives. Next-greater answers come only when a later element pops the index, so they arrive with a delay, and the stack holds every unanswered index. The common wrong answer is "all four, it is one pass."

Second: now the next greater element must be within a window of k positions. The stack cannot expire old indices from its bottom. So use a deque and pop expired indices from the front. That is the monotonic deque. The wrong answer is checking the distance on pop, which leaves expired indices blocking the ones beneath them.

## Recap

Four things to remember. The stack holds indices still waiting for an answer, in monotonic order, and a new element pops every index it answers. It is linear because each index is pushed once and popped at most once. Next answers are written on pop; previous answers are read from the top after popping, and only the previous variants are online. And ties are a decision: one side strict and the other not for counting problems, a sentinel to flush the histogram, and a tie case in every test.

At your desk: the full temperature trace, the four-variant table, the stock span, subarray-minimum and histogram traces with the code, and the two exercises.
