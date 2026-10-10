---
slug: stack-applications
title: Stack applications
description: Bracket matching, postfix evaluation and shunting-yard parsing, nested decoding, undo/redo, DFS with an explicit stack and the min-stack design, each traced step by step, plus what the call stack does for you, what a frame costs in CPython, the JVM, V8 and native code, and what actually happens when it overflows.
minutes: 40
difficulty: medium
tags: [stack, parsing, expression-evaluation, dfs, call-stack, undo, min-stack, stack-machine]
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

Trace `{[()]}(]`:

| Char | Action | Stack after | Result |
|---|---|---|---|
| `{` | push | `{` | |
| `[` | push | `{ [` | |
| `(` | push | `{ [ (` | |
| `)` | pop `(`, matches | `{ [` | |
| `]` | pop `[`, matches | `{` | |
| `}` | pop `{`, matches | (empty) | |
| `(` | push | `(` | |
| `]` | pop `(`, needs `[` | | **invalid** |

```viz
{"type": "stack-queue", "algorithm": "balanced-parentheses", "input": "{[()]}(]", "title": "Openers push, closers must match the top"}
```

Three failure modes, and every test set should include each: a closer with an empty stack (`)(`), a closer that does not match the top (`(]`, the last row above), and leftover openers at the end (`((`). The last is the one people forget, and it is why the function returns `not stack` rather than `True`.

The same skeleton validates HTML tags, checks that `BEGIN`/`END` blocks in a config nest correctly, and, with the stack holding indices instead of characters, finds the *longest valid parentheses substring* (push indices; the distance from the current index to the top after a successful pop is a valid span). [Valid Parentheses](/practice/valid-parentheses) is the practice problem; its follow-up "now also handle escaped characters and string literals" is the first step toward a real tokenizer.

## Evaluating things that nest

## Postfix (reverse Polish) evaluation

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

Trace `["5", "1", "2", "+", "4", "*", "+", "3", "-"]`, which is `5 + (1 + 2) × 4 − 3`:

| Token | Action | Stack after |
|---|---|---|
| 5 | push | `5` |
| 1 | push | `5 1` |
| 2 | push | `5 1 2` |
| + | pop 2, pop 1, push 3 | `5 3` |
| 4 | push | `5 3 4` |
| * | pop 4, pop 3, push 12 | `5 12` |
| + | pop 12, pop 5, push 17 | `17` |
| 3 | push | `17 3` |
| − | pop 3, pop 17, push 14 | `14` |

Two details separate a working solution from a passing one. Operand order: `a` is the *second* pop; `5 3 -` must be `2`, not `−2`. Division: the problem convention is usually truncation toward zero, and Python's `//` floors (`-7 // 2 == -4`), so use `int(a / b)` or `math.trunc`; JavaScript's `Math.trunc(a / b)`. This is a real bug class in interpreters that assume C semantics.

Postfix is not an interview curiosity: it is how stack-based virtual machines work. Python bytecode, the JVM and WebAssembly are all stack machines; `a + b * c` compiles in CPython 3.11 and 3.12 to `LOAD_FAST a; LOAD_FAST b; LOAD_FAST c; BINARY_OP *; BINARY_OP +` (3.13 fuses the first two loads into one `LOAD_FAST_LOAD_FAST` instruction and 3.14 into `LOAD_FAST_BORROW_LOAD_FAST_BORROW`: the same stack program with one dispatch fewer), in the JVM to `iload_1; iload_2; iload_3; imul; iadd`, and in WebAssembly to `local.get 0; local.get 1; local.get 2; i32.mul; i32.add`. The interpreter's main loop is the function above with a few hundred opcodes. [Evaluate Reverse Polish Notation](/practice/evaluate-rpn) is the practice problem.

## Infix to postfix: the shunting-yard algorithm

Humans write infix (`3 + 4 * 2`), and precedence plus parentheses make it ambiguous without rules. Dijkstra's shunting-yard algorithm converts infix to postfix with an operator stack:

- Number: output it.
- Operator `o`: while the stack top is an operator with precedence `≥` that of `o` (for left-associative operators), pop it to output. Then push `o`.
- `(`: push. `)`: pop to output until the matching `(`, discard both.
- End: pop everything to output.

Trace `3 + 4 * (2 - 1)`:

| Token | Action | Operator stack | Output |
|---|---|---|---|
| 3 | output | | `3` |
| + | stack empty, push | `+` | `3` |
| 4 | output | `+` | `3 4` |
| * | top `+` binds less tightly, push | `+ *` | `3 4` |
| ( | push | `+ * (` | `3 4` |
| 2 | output | `+ * (` | `3 4 2` |
| − | top is `(`, push | `+ * ( −` | `3 4 2` |
| 1 | output | `+ * ( −` | `3 4 2 1` |
| ) | pop `−` to output, discard `(` | `+ *` | `3 4 2 1 −` |
| end | pop `*`, pop `+` | | `3 4 2 1 − * +` |

Evaluating the postfix gives `3 + 4 × (2 − 1) = 7`. Without the parentheses, `*` would still have been pushed above `+` and the output would be `3 4 2 * +`; with `3 * 4 + 2`, the `+` would first pop the `*` because `*` binds at least as tightly, giving `3 4 * 2 +`. The operator stack is a monotonic stack over precedence (the [Monotonic stack](/learn/data-structures/stacks-queues/monotonic-stack) lesson's invariant, with "binds at least as tightly" as the comparison). A two-stack variant (operands and operators) evaluates directly without producing postfix; either is the expected answer to "implement a calculator" in an interview, and recursive descent (a function per precedence level, using the call stack) is the third.

### Edge case: a right-associative operator

The `≥` in the operator rule is only right for left-associative operators, where `8 − 3 − 2` means `(8 − 3) − 2`. Exponentiation groups the other way: Python's reference manual says a sequence of power operators is evaluated from right to left, so `2 ** 3 ** 2` is `2 ** 9 = 512`, not `8 ** 2 = 64`. For a right-associative operator, pop only while the top binds *strictly* more tightly. Trace `2 ^ 3 ^ 2` with that rule:

| Token | Action | Operator stack | Output |
|---|---|---|---|
| 2 | output | | `2` |
| ^ | stack empty, push | `^` | `2` |
| 3 | output | `^` | `2 3` |
| ^ | top `^` has equal precedence, not strictly higher: push | `^ ^` | `2 3` |
| 2 | output | `^ ^` | `2 3 2` |
| end | pop `^`, pop `^` | | `2 3 2 ^ ^` |

The postfix evaluates `3 2 ^ = 9`, then `2 9 ^ = 512`. With the left-associative `≥` rule, the second `^` would pop the first and the output would be `2 3 ^ 2 ^`, which is 64. Unary minus is the other classic trap: it has to be told apart from subtraction by position (a `-` at the start or after an operator or `(` is unary), and it needs its own precedence: in Python a unary minus binds less tightly than a `**` to its right, so `-2 ** 2` is `-(2 ** 2) = -4`. A calculator that treats every `-` as binary pops the wrong operand count and fails on the first negative literal.

## Nested structures

Decode `3[a2[c]]` into `accaccacc`: keep the current string and the current number; push both when you see `[`, pop and combine at `]`:

| Char | Action | Stack (saved string, count) | `cur` | `num` |
|---|---|---|---|---|
| 3 | digit | | `""` | 3 |
| [ | push (`""`, 3), reset | `("", 3)` | `""` | 0 |
| a | append | `("", 3)` | `"a"` | 0 |
| 2 | digit | `("", 3)` | `"a"` | 2 |
| [ | push (`"a"`, 2), reset | `("", 3) ("a", 2)` | `""` | 0 |
| c | append | `("", 3) ("a", 2)` | `"c"` | 0 |
| ] | pop (`"a"`, 2): `cur = "a" + "c" × 2` | `("", 3)` | `"acc"` | 0 |
| ] | pop (`""`, 3): `cur = "" + "acc" × 3` | | `"accaccacc"` | 0 |

Nested JSON, S-expressions and XML follow the same push-on-open, pop-and-combine-on-close shape; every hand-written parser has a stack, either explicit or in the recursion. [Decode String](/practice/decode-string).

## Remembering state you must return to

### Undo and redo

Two stacks. Every edit pushes an *inverse operation* onto `undo`. Undo pops it, applies it, and pushes the inverse of that onto `redo`. A new edit after an undo clears `redo` (the branch is abandoned).

| Action | Document | `undo` stack | `redo` stack |
|---|---|---|---|
| type `a` | `a` | `del a` | |
| type `b` | `ab` | `del a`, `del b` | |
| undo | `a` | `del a` | `ins b` |
| undo | (empty) | | `ins b`, `ins a` |
| redo | `a` | `del a` | `ins b` |
| type `c` | `ac` | `del a`, `del c` | (cleared) |

This is the command pattern, and it is how editors, image tools and database transaction rollback (the undo log) work. Storing inverse operations rather than full snapshots keeps memory linear in the number of edits; storing snapshots is simpler and is what small apps do until the document is large. Collaborative editors cannot use a plain stack, because another user's edits arrive between yours; [CRDTs and collaboration](/learn/system-design/distributed-systems/crdts-and-collaboration) covers what replaces it.

### The min-stack

"A stack with O(1) `get_min`." Push onto the main stack, and onto an auxiliary stack push `min(x, aux_top)` so that `aux[i]` is the minimum of `main[0..i]`. Pop both together. `get_min` is `aux[-1]`.

```viz
{"type": "stack-queue", "algorithm": "min-stack", "variant": "parallel", "operations": [["push", 5], ["push", 3], ["push", 7], ["push", 3], ["getMin"], ["pop"], ["getMin"], ["pop"], ["pop"], ["getMin"]], "title": "Min-stack: the auxiliary stack tracks the running minimum"}
```

The trick generalises: any *associative* summary of the stack contents (min, max, sum, gcd, "count of vowels") can be kept as a parallel stack of prefix summaries, giving O(1) queries. The space optimisation of pushing onto the auxiliary stack only when a new minimum arrives (and popping it only when the popped value equals it) saves memory at the cost of a subtle equality bug with duplicates; the parallel version is the one to write on a whiteboard. [Min Stack](/practice/min-stack) is the practice problem and the second exercise.

### Backtracking state

Generating all valid bracket sequences, permutations or subsets keeps a partial solution that grows and shrinks: push a choice, recurse, pop it. The "pop" is the backtrack. Usually the call stack does the work implicitly; [Generate Parentheses](/practice/generate-parentheses) and the [Recursion and backtracking](/learn/algorithms/recursion-backtracking/recursion-design) module make it explicit.

## Replacing the call stack

## DFS with an explicit stack, traced

Recursive DFS is elegant and overflows. Python's default recursion limit is 1,000 frames; a graph with a path of 10,000 nodes, a deeply nested document or a degenerate tree crashes it. The iterative version pushes the start node and loops:

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

Graph `A: [B, C]`, `B: [D]`, `C: [D]`, `D: []`:

| Step | Pop | Order so far | Push (reversed, unseen) | Stack after | Seen |
|---|---|---|---|---|---|
| 1 | A | A | C, then B | `C B` | A B C |
| 2 | B | A B | D | `C D` | A B C D |
| 3 | D | A B D | – | `C` | |
| 4 | C | A B D C | D already seen | (empty) | |

Order `A B D C`, which is what the recursive version produces. Without `reversed`, step 1 would push B then C and the pop would visit C first. Marking on push (above) never pushes a node twice, so the stack is bounded by the number of nodes, but it is not a faithful reproduction of recursive DFS's discovery order in every graph: a node can be marked seen via one edge and later popped after a node that the recursion would have visited first. For algorithms that depend on exact recursive semantics (finish times for topological sort, Tarjan's SCC), you push `(node, iterator over its neighbours)` frames and advance the top frame's iterator one neighbour at a time, which is literally simulating the call stack. [Depth-first search](/learn/data-structures/graphs/depth-first-search) works through both.

## Any recursion, mechanically

Any recursive function can be converted by pushing what a stack frame would hold: the arguments plus a "where am I" marker for code after the recursive call. In-order tree traversal is the classic: push nodes going left, pop and visit, then go right. Morris traversal removes even that stack by temporarily threading the tree; [Binary tree traversals](/learn/data-structures/trees/binary-tree-traversals) covers it.

| | Recursion | Explicit stack, mark on push | Frame simulation (node + iterator) |
|---|---|---|---|
| Depth limit | Runtime's (1,000 frames in CPython by default) | Heap memory | Heap memory |
| Visit order | Reference | Same only with reversed pushes; can diverge in graphs | Identical |
| Finish times / post-order | Free | Not available | Available |
| Memory per pending node | A frame (~100 bytes or more in CPython, more with locals) | One reference (8 bytes) | A reference plus an iterator |
| Code | Shortest | Short | Longest, and easy to get subtly wrong |

## Under the hood: the call stack

Each function call pushes a frame holding the return address, saved registers, parameters and locals. Return pops it. The frame size is fixed per function and known at compile time, which is why the stack is fast (a pointer bump) and why deep recursion is dangerous: the stack is a fixed reservation, and running off its end hits a guard page that the kernel deliberately left unmapped, which is the `SIGSEGV` (or "stack overflow") you see. The sizes differ by runtime:

| Runtime | Stack | Practical depth for a small function | What overflow looks like |
|---|---|---|---|
| Native (C, Rust, Go cgo) on Linux | 8 MB main thread (`ulimit -s`, measured 8,388,608 here); glibc threads inherit it; Rust spawned threads 2 MB | 10⁴–10⁵ frames, depending on frame size | Guard page fault: `SIGSEGV`; Rust prints "thread has overflowed its stack" |
| Go goroutines | Start at a few KB, grown by copying the whole stack to a larger block | Effectively bounded by memory (default 1 GB max stack on 64-bit) | Fatal "stack overflow" after the maximum |
| JVM | 1 MB per thread by default (`-Xss`) | ~10,000–20,000 frames | `StackOverflowError`, catchable, thrown when a yellow-zone guard page is touched |
| V8 / Node | ~1 MB by default (`--stack-size`) | About 10,000 frames on Node 24 for a trivial function (measured ~9,600) | `RangeError: Maximum call stack size exceeded`, catchable |
| CPython 3.11+ | Python frames live in 16 KiB heap chunks, not on the C stack; the C stack is used only when C code calls back into Python | `sys.getrecursionlimit()`, 1,000 by default; raised to 60,000, a 50,000-deep pure-Python recursion ran fine on 3.14 | `RecursionError`, catchable; 3.12+ tracks C recursion separately so a raised limit no longer risks a real segfault in pure-Python recursion |

Go is the runtime where "the stack" is itself a growable array. In Go 1.27's `runtime/stack.go` the minimum goroutine stack is 2,048 bytes (`stackMin`), and since Go 1.19 new goroutines start at the average stack size the last garbage collection observed, a power of two, so a program full of deep call chains does not pay for regrowth in every goroutine. Every function prologue compares the stack pointer against a limit; when a call would cross it, `newstack` doubles the size and calls `copystack`, which allocates the new block, copies the frames, adjusts every pointer into the stack and frees the old block. That is the dynamic-array doubling argument from [Arrays and dynamic arrays](/learn/data-structures/arrays-strings/arrays-and-dynamic-arrays) applied to frames: a recursion a million frames deep with 64-byte frames needs 64 MB, about 15 doublings from 2 KB, amortised O(1) per call, with an occasional copy pause proportional to the stack size. The ceiling is `maxstacksize`, 1,000,000,000 bytes on 64-bit, after which the runtime prints `goroutine stack exceeds 1000000000-byte limit` and dies with `fatal error: stack overflow`, which, unlike a Java `StackOverflowError`, cannot be recovered.

## What a frame costs, and when recursion is safe

A CPython frame in 3.11+ is a fixed header plus one 8-byte slot per local, cell and evaluation-stack entry, on the order of a hundred bytes for a small function; the 1,000 default is a sanity limit, not a memory one. Tail-call elimination lets some languages (Scheme, Erlang, and some cases in Rust/C via the optimiser) reuse the frame; CPython and V8 do not, so a "tail-recursive" Python function still consumes a frame per call.

The senior instinct: if the recursion depth is bounded by the input (a list length, a tree depth in an unbalanced tree, a graph path, the nesting of a document a user uploads), it is a stack overflow waiting for the right input. If it is bounded by `log n` (balanced trees, divide-and-conquer halving), recursion is fine. [Stack, heap and the call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame layout.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A service crashes on one specific request body; the body is `[[[[…` thousands deep | Recursive-descent parser with no depth limit: a nesting-depth denial of service | Depth limit at parse time (Jackson defaults to 1,000 since 2.15; CPython's `json` raises `RecursionError` at the recursion limit) or an iterative parser |
| Calculator returns −4 for `-7 / 2` | Floor division used where the specification truncates toward zero | `int(a / b)` / `Math.trunc`; add the negative-division test |
| RPN result has the wrong sign on subtraction | Operands popped in the wrong order | The first pop is the right operand |
| Undo works, redo replays the wrong edit after a new change | `redo` not cleared when a new edit follows an undo | Clear `redo` on every new edit |
| Editor memory grows by the document size per keystroke | Snapshot-per-edit undo | Inverse operations, or coalesce keystrokes into one command |
| Iterative DFS pushes the same node thousands of times on a dense graph | Marking on pop instead of on push | Mark on push (or frame simulation), and bound the stack by nodes, not edges |
| Recursive traversal passes every test and overflows in production | Depth bounded by an input the tests never made deep (a 100,000-node linked list, a 5,000-deep directory tree) | Explicit stack when depth is input-bounded; a test with a degenerate input |
| Min-stack reports the wrong minimum after popping a duplicate | Space-optimised auxiliary stack pushed only on strictly smaller values | Push on less-than-or-equal, or use the parallel version |

## Interviewer follow-ups

**"How would you protect a JSON parser from deeply nested input?"** Model answer: count depth as you push and reject past a limit (hundreds is generous for any real document), and prefer an explicit-stack parser so the limit is a policy rather than a crash; the same applies to XML, YAML and expression evaluators. Common wrong answer: "raise the recursion limit".

**"Implement a calculator with `+ − × ÷` and parentheses. Which approach?"** Model answer: two stacks (operands and operators) with shunting-yard precedence for a single pass over tokens, or recursive descent with one function per precedence level if the grammar will grow (unary minus, exponent, function calls); name the tie rules for associativity. Common wrong answer: evaluating left to right and patching precedence afterwards.

**"Why does CPython cap recursion at 1,000 if its frames are on the heap?"** Model answer: since 3.11 Python-to-Python calls do not consume C stack, so the limit is a guard against runaway recursion rather than a memory constraint, and it is adjustable; before 3.11 each Python call recursed in C, so a high limit could overflow the real 8 MB stack and segfault, which is why 3.12 separated the C recursion limit. Common wrong answer: "because each frame is huge".

**"What actually happens at a stack overflow in native code?"** Model answer: the stack pointer crosses into an unmapped guard page below the reservation; the next push faults, the kernel delivers `SIGSEGV`, and runtimes that want a clean message (Rust, the JVM) install a signal handler on an alternate stack that recognises the guard-page address. Common wrong answer: "the stack grows into the heap".

**"Undo for a collaborative editor where two people type at once?"** Model answer: a plain inverse-operation stack breaks because the document changed under you; you need operations that can be transformed against concurrent edits (operational transformation) or a data structure whose operations commute (a CRDT), and "undo" means "invert *my* operations in the current state". Common wrong answer: "lock the document during undo".

## What mid-level engineers get wrong

- **Returning `True` at the end of bracket matching** without checking that the stack is empty.
- **Popping operands in the wrong order** and using floor division in an evaluator.
- **Writing a recursive parser for user-supplied input** with no depth limit.
- **Converting recursion to a stack by marking on pop**, and shipping an algorithm that is exponential on dense graphs.
- **Assuming `reversed()` on push is enough to reproduce recursive DFS** for finish-time-dependent algorithms.
- **Raising `sys.setrecursionlimit` as the fix** for a depth that is bounded by the input.
- **Snapshotting the whole document per edit** for undo and wondering where the memory went.

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
- You know postfix operand order and truncation-toward-zero semantics, you know Python's `//` floors, and you can name the three stack machines that run your code.
- You can trace shunting-yard on an expression with parentheses, describe it as a monotonic stack over precedence, and name recursive descent as the alternative.
- You implement undo/redo as inverse operations on two stacks, explain why a new edit clears redo, and know why a collaborative editor cannot use it unchanged.
- You keep a parallel prefix-summary stack for min-stack and can generalise it to any associative summary.
- You convert recursion to an explicit stack when depth is input-bounded, you know the visit-order and mark-on-push subtleties, and you can say what each runtime's stack limit is and what an overflow physically does.

## Check yourself

```quiz
- q: >-
    A bracket checker pushes openers and pops on closers, returning true when the loop finishes without a mismatch. What input does it wrongly accept?
  options: ["\"([)]\"", "\"((\"", "\"{}\"", "\")(\""]
  answer: 1
  explanation: >-
    Leftover openers never trigger a mismatch inside the loop; the function must also check that the stack is empty at the end. The mismatched and closer-first inputs are rejected by the empty-stack and mismatch checks, and the balanced pair is correctly accepted.
- q: >-
    Evaluating the postfix expression 6 −132 / in a language whose integer division floors gives:
  options: ["−22, because the top operand is divided by the one below", "0, because the true quotient −0.045 truncates to zero", "−1, because floor division rounds toward negative infinity", "−0.045, because / on two integers returns a float here"]
  answer: 2
  explanation: >-
    6 / −132 is about −0.045. Truncation toward zero gives 0, which is the usual RPN convention but not what floor division does; floor division gives −1. The left operand is the second pop, so the expression is 6 / −132, not −132 / 6. Python's // floors, so RPN evaluators must use int(a / b) or math.trunc to match the usual convention.
- q: >-
    Why does iterative DFS push a node's neighbours in reverse order?
  options: ["So the stack stays smaller, since fewer nodes wait at once", "So undirected edges are not traversed in both directions", "So the first neighbour pops first, matching recursive order", "So reachability is correct, since order changes what is found"]
  answer: 2
  explanation: >-
    A stack pops the most recently pushed item. Pushing neighbours in reverse makes the first neighbour the last pushed and therefore the next popped, matching the visit order of the recursive version. Reachability is correct in either order; only the visit sequence changes.
- q: >-
    In a min-stack that pushes onto the auxiliary stack only when a new minimum arrives, what subtle bug appears with duplicate values?
  options: ["Popping one of two equal minimums drops the aux entry too early", "The aux stack keeps growing, because duplicates are pushed twice", "get_min becomes O(n), because the aux stack must be rescanned", "push becomes O(log n), because the aux stack must stay sorted"]
  answer: 0
  explanation: >-
    If you push onto aux only on strictly smaller values, two equal minimums on the main stack share one auxiliary entry. Popping the first one (if you pop aux whenever the popped value equals aux top) leaves the second minimum unrepresented. Push on less-than-or-equal, or use the parallel-stack version. Operation costs stay O(1) either way.
- q: >-
    Recursive DFS on a graph with a simple path of 50,000 nodes crashes in Python. The right fix is:
  options: ["Switch to BFS, since it visits nodes in the same order as DFS", "Use an explicit stack, since depth is bounded by the input", "Memoise the recursive calls, since each node is visited once", "Raise sys.setrecursionlimit to 100,000, since frames are cheap"]
  answer: 1
  explanation: >-
    Raising the limit works on 3.12+ for pure-Python recursion, but it only postpones the problem to the next larger input and still fails inside C-implemented callbacks. Iterative DFS uses heap memory for the stack and handles any depth. Memoisation does not reduce recursion depth, and BFS is not equivalent when DFS order or finish times matter.
- q: >-
    In shunting-yard, reading the operator `+` when the operator stack's top is `*` causes:
  options: ["Both operators to be output, because the stack must hold one operator", "The `+` to be pushed on top, because later operators always go on top", "The `*` to be popped to the output first, because it binds at least as tightly", "The `*` to be discarded, because `+` has lower precedence and replaces it"]
  answer: 2
  explanation: >-
    An incoming operator pops every stacked operator of greater or equal precedence (for left-associative operators) before being pushed, so `3 * 4 + 2` becomes `3 4 * 2 +`. That "pop while the top binds at least as tightly" rule is the monotonic-stack invariant applied to precedence. Nothing is ever discarded except parentheses.
```
