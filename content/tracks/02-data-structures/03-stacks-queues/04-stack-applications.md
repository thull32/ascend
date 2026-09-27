---
slug: stack-applications
title: Stack applications
description: Bracket matching, postfix evaluation and shunting-yard parsing, undo/redo, DFS with an explicit stack, the min-stack design, and what the call stack does for you until it overflows.
minutes: 45
difficulty: medium
tags: [stack, parsing, expression-evaluation, dfs, call-stack, undo, min-stack]
problems: [valid-parentheses, evaluate-rpn, decode-string, min-stack, generate-parentheses]
---
A JSON parser, a text editor's undo, a depth-first crawl of a file system, and every function call you have ever made share one data structure. Each involves *nesting*: something opens, other things happen inside it, and it must close in reverse order. A stack is the minimal structure that tracks nesting, and most "stack problems" in interviews are one of four shapes: match things that nest, evaluate things that nest, remember state you must return to, or replace the call stack because it is too small.

## Matching things that nest

The bracket problem: is `{[()]}` balanced? Push every opener; on a closer, the top must be the matching opener, otherwise the string is invalid. At the end the stack must be empty.

```python
PAIRS = {")": "(", "]": "[", "}": "{"}

def balanced(s):
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif ch in PAIRS:
            if not stack or stack.pop() != PAIRS[ch]:
                return False
    return not stack
```

```viz
{"type": "stack-queue", "algorithm": "balanced-parentheses", "input": "{[()]}(]", "title": "Openers push, closers must match the top"}
```

Three failure modes, and every test set should include each: a closer with an empty stack (`)(`), a closer that does not match the top (`(]`), and leftover openers at the end (`((`). The last is the one people forget, and it is why the function returns `not stack` rather than `True`.

The same skeleton validates HTML tags, checks that `BEGIN`/`END` blocks in a config nest correctly, and, with the stack holding indices instead of characters, finds the *longest valid parentheses substring* (push indices; the distance from the current index to the top after a successful pop is a valid span). [Valid Parentheses](/practice/valid-parentheses) is the practice problem; its follow-up "now also handle escaped characters and string literals" is the first step toward a real tokenizer.

## Evaluating things that nest

### Postfix (reverse Polish) evaluation

Postfix notation writes the operator after its operands: `3 4 + 2 *` means `(3 + 4) × 2`. It needs no parentheses and no precedence rules, and it evaluates with a single stack: push numbers; on an operator, pop two operands, apply, push the result.

```python
def eval_rpn(tokens):
    stack = []
    for t in tokens:
        if t in {"+", "-", "*", "/"}:
            b = stack.pop()          # right operand is on top
            a = stack.pop()
            if t == "+": stack.append(a + b)
            elif t == "-": stack.append(a - b)
            elif t == "*": stack.append(a * b)
            else: stack.append(int(a / b))     # truncate toward zero, not floor
        else:
            stack.append(int(t))
    return stack[0]
```

Trace `["2", "1", "+", "3", "*"]`: push 2, push 1; `+` pops 1 and 2, pushes 3; push 3; `*` pops 3 and 3, pushes 9. Result 9.

Two details that separate a working solution from a passing one. Operand order: `a` is the *second* pop; `5 3 -` must be `2`, not `−2`. Division: the problem convention is usually truncation toward zero, and Python's `//` floors (`-7 // 2 == -4`), so use `int(a / b)` or `math.trunc`; JavaScript's `Math.trunc(a / b)`. This is a real bug class in interpreters that assume C semantics.

Postfix is not an interview curiosity: it is how stack-based virtual machines work. Python bytecode, the JVM and WebAssembly are all stack machines; `a + b * c` compiles to `LOAD a; LOAD b; LOAD c; MUL; ADD`, and the interpreter is the loop above with more opcodes. [Evaluate Reverse Polish Notation](/practice/evaluate-rpn) is the practice problem.

### Infix to postfix: the shunting-yard algorithm

Humans write infix (`3 + 4 * 2`), and precedence plus parentheses make it ambiguous without rules. Dijkstra's shunting-yard algorithm converts infix to postfix with an operator stack:

- Number: output it.
- Operator `o`: while the stack top is an operator with precedence `≥` that of `o` (for left-associative operators), pop it to output. Then push `o`.
- `(`: push. `)`: pop to output until the matching `(`, discard both.
- End: pop everything to output.

For `3 + 4 * 2`: output 3; push `+`; output 4; `*` has higher precedence than `+` so push; output 2; end: pop `*`, pop `+`. Postfix `3 4 2 * +` = 11. For `(3 + 4) * 2`: `(` pushed, 3, `+` pushed, 4, `)` pops `+`; `*` pushed; 2; end pops `*`: `3 4 + 2 *` = 14.

The operator stack is a monotonic stack over precedence (the [Monotonic stack](/learn/data-structures/stacks-queues/monotonic-stack) lesson's invariant, with "greater precedence" as the comparison). A two-stack variant (operands and operators) evaluates directly without producing postfix; either is the expected answer to "implement a calculator" in an interview, and recursive descent (a function per precedence level, using the call stack) is the third.

### Nested structures

Decode `3[a2[c]]` into `accaccacc`: push the current string and repeat count when you see `[`, pop and combine at `]`. Nested JSON, S-expressions and XML follow the same push-on-open, pop-and-combine-on-close shape; every hand-written parser has a stack, either explicit or in the recursion. [Decode String](/practice/decode-string).

## Remembering state you must return to

### Undo and redo

Two stacks. Every edit pushes an *inverse operation* onto `undo`. Undo pops it, applies it, and pushes the inverse of that onto `redo`. A new edit after an undo clears `redo` (the branch is abandoned). This is the command pattern, and it is how editors, image tools and database transaction rollback (the undo log) work. Storing inverse operations rather than full snapshots keeps memory linear in the number of edits; storing snapshots is simpler and is what small apps do until the document is large.

### The min-stack

"A stack with O(1) `get_min`." Push onto the main stack, and onto an auxiliary stack push `min(x, aux_top)` so that `aux[i]` is the minimum of `main[0..i]`. Pop both together. `get_min` is `aux[-1]`.

```viz
{"type": "stack-queue", "algorithm": "min-stack", "operations": [["push", 5], ["push", 3], ["push", 7], ["push", 3], ["getMin"], ["pop"], ["getMin"], ["pop"], ["pop"], ["getMin"]], "title": "Min-stack: the auxiliary stack tracks the running minimum"}
```

The trick generalises: any *associative* summary of the stack contents (min, max, sum, gcd, "count of vowels") can be kept as a parallel stack of prefix summaries, giving O(1) queries. The space optimisation of pushing onto the auxiliary stack only when a new minimum arrives (and popping it only when the popped value equals it) saves memory at the cost of a subtle equality bug with duplicates; the parallel version is the one to write on a whiteboard. [Min Stack](/practice/min-stack) is the practice problem and the second exercise.

### Backtracking state

Generating all valid bracket sequences, permutations or subsets keeps a partial solution that grows and shrinks: push a choice, recurse, pop it. The "pop" is the backtrack. Usually the call stack does the work implicitly; [Generate Parentheses](/practice/generate-parentheses) and the [Recursion and backtracking](/learn/algorithms/recursion-backtracking/recursion-design) module make it explicit.

## Replacing the call stack

### DFS with an explicit stack

Recursive DFS is elegant and overflows. Python's default recursion limit is 1,000 frames; a graph with a path of 10,000 nodes, a deeply nested JSON document or a degenerate tree crashes it. The iterative version pushes the start node and loops:

```python
def dfs_iterative(graph, start):
    seen = {start}
    stack = [start]
    order = []
    while stack:
        node = stack.pop()
        order.append(node)
        for nb in reversed(graph[node]):      # reversed: visit neighbours in the same order as recursion
            if nb not in seen:
                seen.add(nb)
                stack.append(nb)
    return order
```

Two things change compared with the recursive version. The visit order differs unless you push neighbours in reverse, because the stack pops the *last* pushed neighbour first. And "mark seen when pushed" versus "mark seen when popped" gives different behaviour: marking on push (above) never pushes a node twice, so the stack is bounded by the number of edges, but it is not a faithful reproduction of recursive DFS's discovery order. For algorithms that depend on exact recursive semantics (finish times for topological sort, Tarjan's SCC), you push `(node, iterator over its neighbours)` frames and advance the top frame's iterator one neighbour at a time, which is literally simulating the call stack. [Depth-first search](/learn/data-structures/graphs/depth-first-search) works through both.

### Any recursion, mechanically

Any recursive function can be converted by pushing what a stack frame would hold: the arguments plus a "where am I" marker for code after the recursive call. In-order tree traversal is the classic: push nodes going left, pop and visit, then go right. Morris traversal removes even that stack by temporarily threading the tree; [Binary tree traversals](/learn/data-structures/trees/binary-tree-traversals) covers it.

### The call stack itself

Each function call pushes a frame holding the return address, saved registers, parameters and locals. Return pops it. The frame size is fixed per function and known at compile time, which is why the stack is fast (a pointer bump) and why deep recursion is dangerous: main-thread stacks are typically 8 MB on Linux and 1 MB on Windows, and each frame may be tens to hundreds of bytes, so tens of thousands of frames is the practical ceiling in native code and about a thousand by default in CPython (which allocates its frames on the heap but caps depth to protect the C stack). Tail-call elimination lets some languages (Scheme, Erlang, and some cases in Rust/C via the optimiser) reuse the frame; Python and JavaScript engines in practice do not. [Stack, heap and the call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame layout.

The senior instinct: if the recursion depth is bounded by the input (a list length, a tree depth in an unbalanced tree, a graph path), it is a stack overflow waiting for the right input. If it is bounded by `log n` (balanced trees, divide-and-conquer halving), recursion is fine.

## Exercises

```exercise
id: eval-rpn
title: Evaluate reverse Polish notation
prompt: |
  `tokens` is a list of strings forming a valid postfix expression over
  integers with the operators `+`, `-`, `*` and `/`. Evaluate it with a
  stack and return the integer result. Division truncates toward zero
  (`7 / -2` is `-3`); take care with Python's `//`. Operands may be
  negative numbers written as strings like `"-11"`.
languages: [python, javascript]
entry: eval_rpn
starter:
  python: |
    def eval_rpn(tokens):
        # your code here
        return 0
  javascript: |
    function eval_rpn(tokens) {
      // your code here
      return 0;
    }
tests:
  - args: [["2", "1", "+", "3", "*"]]
    expected: 9
  - args: [["4", "13", "5", "/", "+"]]
    expected: 6
    label: integer division
  - args: [["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]]
    expected: 22
    label: negative operand and truncation toward zero
  - args: [["3"]]
    expected: 3
    label: single number
  - args: [["7", "-2", "/"]]
    expected: -3
    hidden: true
    label: truncate toward zero, not floor
  - args: [["5", "3", "-"]]
    expected: 2
    hidden: true
    label: operand order
hints:
  - "On an operator, the first pop is the right operand and the second is the left."
  - "Use `int(a / b)` in Python or `Math.trunc(a / b)` in JavaScript for division."
```

```exercise
id: min-stack
title: Min-stack
prompt: |
  Implement `MinStack` with `push(x)`, `pop()` (returns nothing), `top()`
  and `get_min()`, all O(1). Keep an auxiliary stack whose top is always
  the minimum of the main stack. `pop`, `top` and `get_min` are only
  called on a non-empty stack.
languages: [python, javascript]
entry: MinStack
starter:
  python: |
    class MinStack:
        def __init__(self):
            self.stack = []
            self.mins = []

        def push(self, x):
            # TODO
            pass

        def pop(self):
            # TODO
            pass

        def top(self):
            # TODO
            return None

        def get_min(self):
            # TODO
            return None
  javascript: |
    class MinStack {
      constructor() {
        this.stack = [];
        this.mins = [];
      }
      push(x) {
        // TODO
      }
      pop() {
        // TODO
      }
      top() {
        // TODO
        return null;
      }
      get_min() {
        // TODO
        return null;
      }
    }
tests:
  - args: [["push", -2], ["push", 0], ["push", -3], ["get_min"], ["pop"], ["top"], ["get_min"]]
    expected: [null, null, null, -3, null, 0, -2]
  - args: [["push", 5], ["push", 5], ["get_min"], ["pop"], ["get_min"], ["top"]]
    expected: [null, null, 5, null, 5, 5]
    label: duplicate minimums
  - args: [["push", 3], ["push", 1], ["push", 2], ["get_min"], ["pop"], ["get_min"], ["pop"], ["get_min"]]
    expected: [null, null, null, 1, null, 1, null, 3]
    hidden: true
  - args: [["push", 7], ["get_min"], ["top"], ["push", 9], ["get_min"], ["pop"], ["pop"], ["push", -1], ["get_min"]]
    expected: [null, 7, 7, null, 7, null, null, null, -1]
    hidden: true
hints:
  - "On push, push `min(x, mins[-1])` onto `mins` (or `x` if `mins` is empty); on pop, pop both stacks."
  - "`get_min` returns `mins[-1]`; because both stacks move together, it is always the minimum of what remains."
```

## Senior signals

- You list the three bracket-matching failure modes and test each.
- You know postfix operand order and truncation-toward-zero semantics, and you know Python's `//` floors.
- You can describe shunting-yard as a monotonic stack over precedence and name recursive descent as the alternative.
- You implement undo/redo as inverse operations on two stacks and explain why a new edit clears redo.
- You keep a parallel prefix-summary stack for min-stack and can generalise it to any associative summary.
- You convert recursion to an explicit stack when depth is input-bounded, and you know the visit-order and mark-on-push subtleties.

## Check yourself

```quiz
- q: >-
    A bracket checker pushes openers and pops on closers, returning true when the loop finishes without a mismatch. What input does it wrongly accept?
  options: ["\"([)]\"", "\")(\"", "\"{}\"", "\"((\""]
  answer: 3
  explanation: >-
    Leftover openers never trigger a mismatch inside the loop; the function must also check that the stack is empty at the end. The first two inputs are rejected by the empty-stack and mismatch checks.
- q: >-
    Evaluating the postfix expression 6 −132 / in a language whose integer division floors gives:
  options: ["−0.045, because / on two integers returns a float here", "0, because the true quotient −0.045 truncates to zero", "−22, because the top operand is divided by the one below", "−1, because floor division rounds toward negative infinity"]
  answer: 3
  explanation: >-
    6 / −132 is about −0.045. Truncation toward zero gives 0, which is the usual RPN convention but not what floor division does; floor division gives −1. The left operand is the second pop, so the expression is 6 / −132, not −132 / 6. Python's // floors, so RPN evaluators must use int(a / b) or math.trunc to match the usual convention.
- q: >-
    Why does iterative DFS push a node's neighbours in reverse order?
  options: ["So reachability is correct, since order changes what is found", "So undirected edges are not traversed in both directions", "So the first neighbour pops first, matching recursive order", "So the stack stays smaller, since fewer nodes wait at once"]
  answer: 2
  explanation: >-
    A stack pops the most recently pushed item. Pushing neighbours in reverse makes the first neighbour the last pushed and therefore the next popped, matching the visit order of the recursive version. Reachability is correct in either order; only the visit sequence changes.
- q: >-
    In a min-stack that pushes onto the auxiliary stack only when a new minimum arrives, what subtle bug appears with duplicate values?
  options: ["get_min becomes O(n), because the aux stack must be rescanned", "Popping one of two equal minimums drops the aux entry too early", "The aux stack keeps growing, because duplicates are pushed twice", "push becomes O(log n), because the aux stack must stay sorted"]
  answer: 1
  explanation: >-
    If you push onto aux only on strictly smaller values, two equal minimums on the main stack share one auxiliary entry. Popping the first one (if you pop aux whenever the popped value equals aux top) leaves the second minimum unrepresented. Push on less-than-or-equal, or use the parallel-stack version. Operation costs stay O(1) either way.
- q: >-
    Recursive DFS on a graph with a simple path of 50,000 nodes crashes in Python. The right fix is:
  options: ["Switch to BFS, since it visits nodes in the same order as DFS", "Memoise the recursive calls, since each node is visited once", "Raise sys.setrecursionlimit to 100,000, since frames are cheap", "Use an explicit stack, since depth is bounded by the input"]
  answer: 3
  explanation: >-
    Raising the limit only postpones the crash and risks overflowing the C stack. Iterative DFS uses heap memory for the stack and handles any depth. Memoisation does not reduce recursion depth, and BFS is not equivalent when DFS order or finish times matter.
```
