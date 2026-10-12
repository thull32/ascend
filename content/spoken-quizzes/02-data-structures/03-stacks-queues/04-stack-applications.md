---
lesson: stack-applications
source: f4bc35f48450e5d8
---
## 1

A bracket checker pushes openers and pops on closers, and returns true whenever the loop finishes without a mismatch. Which input does it wrongly accept?

A, open round, open square, close round, close square. B, two open round brackets. C, an open curly brace followed by a close curly brace. D, a close round bracket followed by an open round bracket.

[think]

The answer is B: two open round brackets.

Leftover openers never trigger a mismatch inside the loop, so the function must also check that the stack is empty at the end. The crossed input fails on a mismatch, the closer-first input fails on an empty stack, and the balanced pair is correctly accepted.

## 2

You evaluate the postfix expression 6, minus 132, divide, in a language whose integer division floors. What do you get?

A, minus 22, because the top operand is divided by the one below. B, 0, because the true quotient, about minus 0.045, truncates to zero. C, minus 1, because floor division rounds toward negative infinity. D, minus 0.045, because dividing two integers returns a float here.

[think]

The answer is C: minus 1, because floor division rounds toward negative infinity.

6 divided by minus 132 is about minus 0.045. Truncating toward zero gives 0, which is the usual postfix convention, but floor division gives minus 1. The left operand is the second one popped, so the expression is 6 divided by minus 132, not the other way round. Python's floor division floors, so evaluators must truncate explicitly to match the usual convention.

## 3

Why does iterative depth-first search push a node's neighbours in reverse order?

A, so the stack stays smaller, since fewer nodes wait at once. B, so undirected edges are not traversed in both directions. C, so the first neighbour pops first, matching the recursive order. D, so reachability is correct, since order changes what is found.

[think]

The answer is C: so the first neighbour pops first, matching the recursive order.

A stack pops the most recently pushed item. Pushing the neighbours in reverse makes the first neighbour the last pushed, and therefore the next popped, matching the visit order of the recursive version. Reachability is correct in either order; only the visit sequence changes.

## 4

A min-stack saves space by pushing onto its auxiliary stack only when a new minimum arrives. What subtle bug appears with duplicate values?

A, popping one of two equal minimums drops the auxiliary entry too early. B, the auxiliary stack keeps growing, because duplicates are pushed twice. C, get-min becomes linear, because the auxiliary stack must be rescanned. D, push becomes logarithmic, because the auxiliary stack must stay sorted.

[think]

The answer is A: popping one of two equal minimums drops the auxiliary entry too early.

If you push to the auxiliary stack only on strictly smaller values, two equal minimums on the main stack share one auxiliary entry. Popping the first of them removes that entry, and leaves the second minimum unrepresented. Push on less-than-or-equal, or use the parallel-stack version. Every operation stays constant time either way.

## 5

Recursive depth-first search on a graph containing a simple path of 50 thousand nodes crashes in Python. What is the right fix?

A, switch to breadth-first search, since it visits nodes in the same order. B, use an explicit stack, since the depth is bounded by the input. C, memoise the recursive calls, since each node is visited once. D, raise Python's recursion limit to 100 thousand, since frames are cheap.

[think]

The answer is B: use an explicit stack, since the depth is bounded by the input.

Raising the limit works on 3.12 and later for pure-Python recursion, but it only postpones the problem to the next larger input, and still fails inside C-implemented callbacks. Iterative search keeps its stack in heap memory and handles any depth. Memoisation does not reduce the recursion depth, and breadth-first search is not equivalent when depth-first order or finish times matter.

## 6

In the shunting-yard algorithm, you read a plus sign while the top of the operator stack is a times sign. What happens?

A, both operators are output, because the stack must hold one operator. B, the plus is pushed on top, because later operators always go on top. C, the times is popped to the output first, because it binds at least as tightly. D, the times is discarded, because plus has lower precedence and replaces it.

[think]

The answer is C: the times is popped to the output first, because it binds at least as tightly.

An incoming left-associative operator pops every stacked operator of greater or equal precedence before it is pushed, so 3 times 4 plus 2 becomes 3, 4, times, 2, plus. That rule, pop while the top binds at least as tightly, is the monotonic-stack invariant applied to precedence. Nothing is ever discarded except parentheses.
