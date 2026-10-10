---
lesson: stack-applications
source: 4ad92361377296d4
fit: partial
desk:
  - "The bracket-matching code and its trace"
  - "The postfix evaluator, its trace, and the same expression as CPython, JVM and WebAssembly instructions"
  - "The shunting-yard traces, including the right-associative power operator"
  - "The decode-string, undo-redo and iterative DFS traces"
  - "The recursion against explicit stack comparison, and the per-runtime stack limits table"
  - "Exercises: evaluate reverse Polish notation, and the min-stack"
---
## Introduction

A JSON parser, a text editor's undo, a depth-first crawl of a file system, and every function call you have ever made share one data structure. Each involves nesting: something opens, other things happen inside it, and it must close in reverse order. A stack is the minimal structure that tracks nesting.

Most stack problems in interviews are one of four shapes. Match things that nest. Evaluate things that nest. Remember state you must return to. Or replace the call stack, because it is too small. That is the order here, with the traps in each, and then what the call stack actually is and what happens when it runs out.

## Matching things that nest

Is a string of brackets balanced? Push every opener. On a closer, pop, and the popped opener must match it. At the end, the stack must be empty.

There are exactly three ways to fail, and every test set should contain all three. A closer arrives when the stack is empty, as in a close bracket followed by an open one. A closer does not match the top, as in an open round bracket followed by a close square one. Or openers are left over at the end, as in two open brackets and nothing else.

Before I go on: a checker that returns true whenever the loop finishes without a mismatch. Which of those three does it get wrong?

[pause]

The leftovers. Two open brackets never trigger a mismatch inside the loop, so the checker accepts them. That is why the function returns "the stack is empty", not just "true". It is the one people forget.

The same skeleton validates HTML tags and checks that begin and end blocks in a config nest correctly. With the stack holding indices instead of characters, it finds the longest valid run of parentheses.

## Evaluating things that nest

Postfix notation, also called reverse Polish, writes the operator after its operands. "3, 4, plus, 2, times" means 3 plus 4, times 2. It needs no parentheses and no precedence rules, and it evaluates with one stack: push numbers; on an operator, pop two, apply, push the result. Push 3, push 4. Plus pops 4 and 3 and pushes 7. Push 2. Times pops 2 and 7 and pushes 14. Done.

Two details separate a working solution from a passing one. Operand order: the first pop is the right operand. "5, 3, minus" must give 2, not minus 2. And division: the usual convention truncates toward zero, but Python's floor division rounds down. Minus 7 divided by 2 truncates to minus 3, and floors to minus 4. A calculator that returns minus 4 has this bug, and it is a real bug class in interpreters that assume C semantics.

Postfix is not a curiosity. It is how stack-based virtual machines work. Python bytecode, the JVM and WebAssembly are all stack machines. "a plus b times c" compiles to: load a, load b, load c, multiply, add. The interpreter's main loop is the evaluator you just heard, with a few hundred opcodes.

Humans write infix, so you need to convert. Dijkstra's shunting-yard algorithm does it with an operator stack. Numbers go straight to the output. An incoming operator first pops, to the output, every operator on the stack that binds at least as tightly; then it is pushed. An open parenthesis is pushed; a close parenthesis pops until its match. At the end, pop everything.

So "3 times 4 plus 2": when the plus arrives, the times binds more tightly, so it is popped first, and the output is 3, 4, times, 2, plus. That "pop while the top binds at least as tightly" rule is a monotonic stack over precedence.

The "at least as tightly" is only right for left-associative operators. Power groups the other way. In Python, 2 to the 3 to the 2 is 2 to the 9, which is 512, not 8 squared, 64. For a right-associative operator, pop only while the top binds strictly more tightly. Unary minus is the other classic trap: it is told apart from subtraction by position, and it needs its own precedence. In Python, minus 2 to the power 2 is minus 4.

The same push-on-open, combine-on-close shape decodes nested strings: "3, open bracket, a, 2, open bracket, c, close, close" becomes "acc" three times. JSON, S-expressions and XML all follow it. Every hand-written parser has a stack, either explicit or in the recursion.

## Remembering state

Undo and redo are two stacks. Every edit pushes its inverse onto the undo stack. Undo pops an inverse, applies it, and pushes the inverse of that onto the redo stack. And a new edit after an undo clears the redo stack, because that branch of history is abandoned. Forget to clear it, and redo replays the wrong edit. Storing inverse operations rather than snapshots keeps memory linear in the number of edits. Snapshot per keystroke, and memory grows by the document size each time you type.

The min-stack: a stack with a constant-time minimum. Keep a second stack alongside. On every push, push onto it the smaller of the new value and its current top, so each entry is the minimum of everything at or below it. Pop both together. Push 5, 3 and 7: the auxiliary stack reads 5, 3, 3. Pop the 7, and the minimum is 3. Pop the 3, and it is 5.

That generalises to any associative summary: max, sum, greatest common divisor. There is a space optimisation, pushing to the auxiliary stack only when a new minimum arrives, and it has a duplicate bug: if you only push on strictly smaller values, two equal minimums share one entry, and popping the first one loses the second. Push on less-than-or-equal, or write the parallel version, which is the one for a whiteboard.

## Replacing the call stack

Recursive depth-first search is elegant, and it overflows. Python's default recursion limit is 1,000 frames. A graph with a path of 10 thousand nodes, a deeply nested document, or a degenerate tree crashes it. The iterative version pushes the start node and loops: pop a node, visit it, push its unseen neighbours.

Two details. Push the neighbours in reverse order. A stack pops the last thing pushed, so reversing makes the first neighbour come out first, matching the recursive visit order. Take the graph where A points to B and C, and both B and C point to D. Recursion visits A, B, D, C. With reversed pushes, so does the loop. Without them, it visits C first.

Second, mark nodes as seen when you push them, not when you pop them. Mark on pop, and a dense graph can push the same node thousands of times. Mark on push, and the stack is bounded by the number of nodes. But that still does not reproduce recursion's exact order in every graph. For algorithms that need it, such as finish times for topological sort, you push frames of "node, plus where I am in its neighbour list", and advance one neighbour at a time. That is literally simulating the call stack.

The rule for when to bother: if recursion depth is bounded by the input, a list length, a path, the nesting of a document a user uploads, it is a stack overflow waiting for the right input. If depth is bounded by log n, as in balanced trees and halving, recursion is fine.

## The call stack itself

Each call pushes a frame: return address, saved registers, parameters and locals. Return pops it. The frame size is fixed per function, which is why calls are fast, a pointer bump. And the stack is a fixed reservation. Run off its end, and you hit a guard page the kernel deliberately left unmapped, and the process gets a segmentation fault. The stack does not grow into the heap.

The limits differ by runtime. Native code on Linux gets 8 megabytes on the main thread, and a Rust spawned thread gets 2. The JVM gives a thread 1 megabyte by default, about 10 to 20 thousand frames, and throws a catchable error. Node gets about 10 thousand frames for a trivial function. Go goroutines start at a few kilobytes and grow by copying the whole stack to a block twice the size, the dynamic-array doubling argument applied to frames, up to a 1 gigabyte ceiling, after which the program dies with no recovery.

And CPython, since 3.11, keeps Python frames in heap chunks, not on the C stack. So its 1,000-frame default is a sanity limit, not a memory limit. With the limit raised to 60 thousand, a 50-thousand-deep pure-Python recursion ran fine on 3.14. Neither CPython nor V8 eliminates tail calls, so a "tail-recursive" Python function still costs a frame per call.

## In the interview

A follow-up from the lesson. How would you protect a JSON parser from deeply nested input?

[pause]

Count depth as you push, and reject past a limit; a few hundred is generous for any real document. Prefer an explicit-stack parser, so the limit is a policy and not a crash. The same applies to XML, YAML and expression evaluators. The common wrong answer is "raise the recursion limit."

And: why does CPython cap recursion at 1,000 if its frames are on the heap? Since 3.11, Python-to-Python calls do not consume C stack, so the limit guards against runaway recursion and is adjustable. Before 3.11, each Python call recursed in C, so a high limit could overflow the real 8-megabyte stack and segfault, which is why 3.12 separated the C recursion limit. The wrong answer is "because each frame is huge."

## Recap

Four things to remember. Bracket matching fails three ways, and the forgotten one is leftover openers, so return "stack is empty". In postfix, the first pop is the right operand and division truncates toward zero; shunting-yard pops while the top binds at least as tightly, and strictly more tightly for right-associative power. Undo is two stacks of inverse operations, and a new edit clears redo; a min-stack is a parallel stack of running minimums. And when recursion depth is bounded by the input, use an explicit stack: reversed pushes for order, mark on push to bound it.

At your desk: the bracket, postfix, shunting-yard, decode, undo and DFS traces, the per-runtime stack limits table, and the two exercises.
