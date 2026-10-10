---
lesson: stack-patterns
source: bc6d3959f27849bf
fit: partial
desk:
  - "The stack-scan skeleton in Python and JavaScript, and the four-families table"
  - "The Valid Parentheses and Min Stack traces, including the strict less-than bug"
  - "The Reverse Polish trace with truncation against floor division, and its code"
  - "The Decode String and Car Fleet traces, including the buggy per-car column"
  - "The variants table and the bracket-validation approaches compared"
  - "Exercises: simplify a Unix path, and asteroid collision"
---
## Introduction

You are asked whether a string of mixed brackets is balanced. Or what "2, open bracket, a, 10, open bracket, b, close, close, c" expands to. Or how many groups of cars reach a finish line together. None of these looks like a data-structure question. All three collapse into the same dozen-line loop once you notice one thing: at each step, the most recent unfinished thing is the only thing that matters.

That property, last opened is first closed, is what a stack encodes. The interview skill is spotting it in a statement that never says "stack".

Interviewers use these problems early in the round because the templates are short. They want to see whether you recognise the shape, write it without hesitation, and then they spend the rest of the time on follow-ups. So: the signal and its near-misses, the one invariant and four families, five problems with the bug each one hides, and the follow-ups that change the pattern.

## The signal

Reach for a plain stack when the statement has one of four properties. Nesting or matching: brackets, tags, nested repetition, file paths with "dot dot". The most recently opened thing must close first, which is last-in, first-out by definition. Operator after operands: Reverse Polish notation, undo and redo, anything where the operation arrives after the values it consumes. A constant-time query on top of push and pop: get the minimum, get the maximum, the state as of the last checkpoint. And collisions from one direction: cars that catch up but cannot pass, asteroids flying at each other. Each new item merges into, destroys, or is destroyed by the most recent survivor.

The near-misses. "For each day, how many days until a warmer one" is a monotonic stack: the invariant is on the values in the stack, not on nesting, and it has its own lesson. "Generate all valid combinations of n pairs" is backtracking: you generate, you do not validate. Parentheses with a star that can be either bracket or nothing need a greedy range of possible open counts, because one stack cannot represent three choices. "Oldest first" or "level by level" is a queue. Valid brackets of a single type is a counter: with one type, everything on the stack is identical, so its height is the whole state. And "get the minimum and also pop the minimum" is a heap, because removing the minimum from the middle of a stack is linear.

One more confusable: recursion itself. Every stack algorithm can be written recursively, because the call stack is a stack. Making it explicit buys control: no recursion limit, a place to attach extra state, and a clean early exit.

## One invariant, four families

The skeleton: scan left to right, and each item either pushes, pops and combines, or is rejected. The invariant is the sentence to say: the stack holds exactly the opened-but-not-yet-closed items, most recent on top.

A family is a choice of what an item is and what happens when it closes. Matching: the stack holds opening brackets, and a close checks the pair and discards it. Evaluation: the stack holds operands or saved contexts, and an operator pops its inputs and pushes a result. Augmented: each entry carries an aggregate alongside its value, like the minimum so far. Simulation: the stack holds the surviving entities, and each arrival absorbs, merges or annihilates.

## Matching and the duplicate minimum

Valid Parentheses. Why is counting not enough? Take open round, open square, close round, close square. Every type has one open and one close, so per-type counters accept it. The stack does not. After the two opens, the top is the square bracket, and a round close arrives. Mismatch. Order is part of the invariant, and only a structure that remembers the order of the open brackets can see it.

Two small things the lesson insists on. At the end, return whether the stack is empty, not just "true", or an input of two opening brackets passes. And an odd-length string can be rejected before the scan.

Min Stack: push, pop, top and get-minimum, all constant time. Each entry must know the minimum of everything at or below it. One way is a single stack of pairs, each value with the minimum so far. The other is a main stack plus a parallel stack of minimums, pushed only when the new value is at most the current minimum.

That "at most" is the trap. Push 4, push 2, push 2 again, then pop once. What does get-minimum return, if the parallel stack was pushed on strictly less than?

[pause]

It returns 4, and that is wrong, because a 2 is still on the main stack. With strictly less, the second 2 was never recorded. Popping one 2 removed the only record of the minimum. With "less than or equal", both copies are recorded and the answer is 2. Under time pressure, write the pairs version: it cannot get the duplicate case wrong. Then mention the parallel version, which saves memory on ascending input, and its "or equal".

## Evaluation: operand order, truncation and nested contexts

Evaluate Reverse Polish Notation. Tokens are integers or the four operators, and division truncates towards zero. Push operands. On an operator, pop the right operand first, then the left. Pop them the other way round and seven divided by minus three becomes minus three divided by seven.

The lesson's expression is seven divided by minus three, times 2, plus 10, and the answer is 6. Truncating seven over minus three gives minus 2. Python's floor division gives minus 3, and the final answer comes out 4. Every sample passes, and the hidden test with a negative division fails.

Two more traps here. "Minus 3" as a token is an operand, so the operator test must compare the whole token, never its first character. And the obvious truncation, converting the float quotient to an integer, goes through a 64-bit float, which holds integers exactly only up to 2 to the 53. For big operands it is off by one. The exact form divides the absolute values, then negates if the signs differ.

In JavaScript there is a quieter failure. Popping an empty array returns undefined, not an error, and undefined plus 3 is NaN. So a malformed expression produces NaN with no exception. Guard every pop.

Decode String: a count, then a bracketed string, means repeat it that many times, nested to any depth. The key idea: at an opening bracket, the count read so far and the string built so far belong to the outer context, which must be resumed after the matching close. Push both, and reset both. At the close, pop them, and the new current string is the saved one plus the inner one repeated. The lesson's input has a count of 10, which catches the two classic slips: reading the 1 and the 0 as separate counts instead of accumulating digits, and forgetting to reset the count at the bracket. The cost is output-sensitive: each close copies the string it builds, so the work is at most the output length times the nesting depth.

## Simulation: store the fleet, not the car

Car Fleet. Cars at distinct positions drive towards a target at constant speeds, on one lane. A car that catches a slower one ahead joins it. Count the fleets that arrive.

A car can only be blocked by cars ahead of it, so sort by position, closest to the target first, and compute each car's arrival time if it drove alone. If a car would arrive no later than the fleet directly ahead, it catches that fleet and is held to the fleet's time. Otherwise it heads a new fleet. The stack holds fleet arrival times, and the answer is its height.

The bug is to remember the previous car's own time instead of its fleet's. In the lesson's trace, one car would arrive at 5 alone, but it is stuck behind a slow car and really arrives at 11. The next car back would arrive at 8 alone. Judged against 5, it looks like a new fleet. Judged against the fleet's 11, it joins. The buggy version counts three fleets; the right answer is two. And "less than or equal" is correct at equal times, because arriving together is one fleet. The sort makes it n log n; the scan is linear.

## Costs and depth

Every item is pushed at most once and popped at most once, so a scan does at most 2 n stack operations: linear time. The simulation family can pop several items for one arrival, an asteroid destroying five smaller ones, but each item can only be popped once over the whole run, so the total is still linear. Space is the maximum stack height: linear for a string of all opening brackets, the nesting depth for balanced input, and constant with a counter when there is one bracket type.

Depth matters in production, too. A parser that recurses once per nesting level inherits the runtime's stack limit. On the lesson's machine, CPython's JSON loader handled 5 thousand levels of nesting and raised a recursion error at 100 thousand. Node's JSON parser handled a million levels, because V8's parser is iterative, yet turning the result back into a string overflowed at 10 thousand. A service that walks user-uploaded documents recursively will crash on one customer's file. The fix is an explicit stack, plus a depth cap enforced at parse time: treat nesting depth as an input size to validate, like body length.

## In the interview

Here is a follow-up the lesson expects. The input is a billion brackets streamed from disk. How much memory do you need?

[pause]

With one bracket type, a depth counter: one integer. With several types, memory proportional to the depth. After d unclosed openers of two types, any of 2 to the d type sequences is possible, and each one needs a different closing sequence to be valid. An algorithm that cannot tell two of them apart gets one of them wrong. The stack is that information. The common wrong answer is "one counter per type", which accepts open round, open square, close round, close square.

And the second: support pop-minimum as well. The pattern changes, because removing the minimum from the middle of a stack is linear. Keep a min-heap of value and sequence number beside the stack, and lazily skip heap entries whose sequence number has already been popped from the stack: logarithmic per operation. The wrong answer is "the min stack already knows the minimum". It knows its value, not how to remove it.

## Recap

Four things to remember. The signal is that only the most recent unfinished thing matters: nesting, operators after operands, an aggregate riding along, or collisions from one direction. The invariant is that the stack holds exactly what is open, most recent on top, and the end check is that it is empty. The bugs hide in small choices: "or equal" in the parallel min stack, the right operand popped first and truncating division in Reverse Polish, resetting both saved values in Decode String, and storing the fleet's time, not the car's. And depth is a resource: one type is a counter, several types need the stack, and recursion fails at a few thousand levels.

At your desk: the skeleton and families table, the five problem traces with their code, the variants table, and the two exercises on Unix paths and asteroid collisions.
