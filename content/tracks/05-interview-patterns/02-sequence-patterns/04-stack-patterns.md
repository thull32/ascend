---
slug: stack-patterns
title: "Stack patterns: matching, evaluation and simulation"
description: When a problem's structure is nested or last-in-first-out, a stack is the whole algorithm. The four stack families and the signal and near-misses that select each, Valid Parentheses, Min Stack, Evaluate RPN, Decode String and Car Fleet traced state by state, the amortised bound, and what integer division, recursion limits and string building cost in CPython and V8.
minutes: 32
difficulty: medium
tags: [pattern:stack, stack, parsing, evaluation, simulation]
problems: [valid-parentheses, min-stack, evaluate-rpn, generate-parentheses, daily-temperatures, car-fleet, largest-rectangle-histogram, decode-string]
---
You are asked whether `"({})[(])"` is balanced, what `"2[a10[b]]c"` expands to, or how many groups of cars reach a finish line together. None of these looks like a data-structure question. All three collapse into the same dozen-line loop once you notice that the *most recent unfinished thing* is the only thing that matters at each step. That property, last opened is first closed, is what a stack encodes, and the interview skill is spotting it in a statement that never says "stack".

Interviewers use these problems in the first fifteen minutes because the templates are short: they want to see whether you recognise the shape, write it without hesitation, and spend the rest of the round on follow-ups. The data structure itself (array-backed push and pop, the call stack, shunting-yard) is taught in [Stacks and queues](/learn/data-structures/stacks-queues/stacks-and-queues) and [Stack applications](/learn/data-structures/stacks-queues/stack-applications). This lesson is about choosing the family, executing it without the classic bugs, and handling the follow-ups that change the pattern. The [monotonic stack](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern) shares the data structure but not the reasoning, and gets its own lesson.

## The signal

Reach for a plain stack when the statement has one of these properties:

- **Nesting or matching.** Brackets, tags, nested repetition (`3[a2[c]]`), paths with `..`. "The most recently opened thing must close first" is LIFO by definition.
- **Operator after operands.** Reverse Polish notation, undo and redo, anything where the operation arrives after the values it consumes.
- **An O(1) query on top of push and pop.** `getMin`, `getMax`, "the state as of the last checkpoint". Each entry carries extra state.
- **Collisions from one direction.** Cars that catch up but cannot pass, asteroids moving towards each other: each new item either merges into, destroys, or is destroyed by the most recent survivor.

The near-misses, which use a stack-shaped word or a stack-shaped problem but need something else:

| Statement says | Pattern | Why |
|---|---|---|
| "For each day, how many days until a warmer one" | [Monotonic stack](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern) | The invariant is on the *values* in the stack, not on nesting; [Daily Temperatures](/practice/daily-temperatures) and [Largest Rectangle](/practice/largest-rectangle-histogram) are solved there |
| "Generate all valid combinations of n pairs" | [Backtracking](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern) | You generate, not validate; the "closes ≤ opens" rule prunes a recursion ([Generate Parentheses](/practice/generate-parentheses)) |
| "Parentheses with `*` that may be `(`, `)` or empty" | Greedy range of possible open counts, or two index stacks | One stack cannot represent three choices per star ([Valid Parenthesis String](/practice/valid-parenthesis-string)) |
| "Process in arrival order", "oldest first", "level by level" | Queue or deque | FIFO, not LIFO |
| "Valid brackets of a **single** type, input streamed" | A counter | With one type the stack's contents are all identical; its height is the whole state |
| "`getMin` **and** `popMin`" | Heap with lazy deletion, or a sorted structure | Removing the minimum from the middle of a stack is O(n) |

The confusable pattern in the other direction is recursion itself. Every stack algorithm can be written recursively, because the call stack is a stack. Making it explicit buys control: no recursion limit, a place to attach extra state, and a clean early exit.

## The template

Four families, one skeleton. Scan left to right; each item pushes, pops and combines, or is rejected.

```python
def stack_scan(items):
    stack = []
    for x in items:
        if opens(x):
            stack.append(x)
        elif closes(x):
            if not stack or not matches(stack[-1], x):
                return REJECT          # a close with nothing (or the wrong thing) open
            top = stack.pop()
            combine(top, x)            # matching: nothing; evaluation: push a result
        else:
            accumulate(x)              # digits, letters, operands
    return finish(stack)               # matching: the stack must be empty
```

```javascript
function stackScan(items) {
  const stack = [];
  for (const x of items) {
    if (opens(x)) {
      stack.push(x);
    } else if (closes(x)) {
      if (stack.length === 0 || !matches(stack[stack.length - 1], x)) return REJECT;
      const top = stack.pop();      // pop() on an empty array returns undefined, not an error
      combine(top, x);
    } else {
      accumulate(x);
    }
  }
  return finish(stack);
}
```

The invariant: **the stack holds exactly the opened-but-not-yet-closed items, most recent on top.** A family is a choice of what an item is and what `combine` does:

| Family | Stack holds | `combine` does | Examples |
|---|---|---|---|
| Matching | opening brackets (or their indices) | check the pair, discard | [Valid Parentheses](/practice/valid-parentheses), path simplification |
| Evaluation | operands or saved contexts | pop inputs, push a result | [Evaluate RPN](/practice/evaluate-rpn), [Decode String](/practice/decode-string) |
| Augmented | `(value, aggregate)` pairs | nothing; the aggregate rides along | [Min Stack](/practice/min-stack) |
| Simulation | surviving entities | absorb, merge or annihilate | [Car Fleet](/practice/car-fleet), asteroid collision |

Watch the matching family stop at the first close that has no matching open, which is what makes one pass with no lookahead enough:

```viz
{"type": "stack-queue", "algorithm": "balanced-parentheses", "input": "{[()]}(]"}
```

## Worked problems

### Valid Parentheses: why counting is not enough

[Valid Parentheses](/practice/valid-parentheses): decide whether a string of `()[]{}` closes every bracket with the right type in the right order.

A close may only match the most recently opened, still-open bracket, which is the top of the stack. Trace `"({})[(])"`:

| Step | Char | Top before | Action | Stack after |
|---|---|---|---|---|
| 1 | `(` | | push | `(` |
| 2 | `{` | `(` | push | `( {` |
| 3 | `}` | `{` | matches, pop | `(` |
| 4 | `)` | `(` | matches, pop | empty |
| 5 | `[` | | push | `[` |
| 6 | `(` | `[` | push | `[ (` |
| 7 | `]` | `(` | **mismatch**: `]` needs `[` | return false |

Per-type counts are balanced (two `(` and two `)`, one of each other type), so a counter would accept this string. The stack rejects it because order is part of the invariant.

```python
def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for c in s:
        if c in pairs:
            if not stack or stack[-1] != pairs[c]:
                return False
            stack.pop()
        else:
            stack.append(c)
    return not stack               # "((" never mismatches; the leftover makes it invalid
```

Time O(n), space O(n) for `"((((("`. An odd length can be rejected before the scan.

### Min Stack: the duplicate minimum

[Min Stack](/practice/min-stack): `push`, `pop`, `top` and `getMin`, all O(1). Each entry must know the minimum of everything at or below it. Two implementations: a single stack of `(value, min_so_far)` pairs, or a main stack plus a parallel `mins` stack that is pushed only when the new value is at most the current minimum.

Trace `push 4, push 2, push 2, push 5, getMin, pop, pop, getMin, pop, getMin`, comparing the parallel stack with `<=` against the tempting `<`:

| Operation | Main stack | `mins` with `<=` | `mins` with `<` | `getMin` (`<=`) | `getMin` (`<`) |
|---|---|---|---|---|---|
| push 4 | `4` | `4` | `4` | | |
| push 2 | `4 2` | `4 2` | `4 2` | | |
| push 2 | `4 2 2` | `4 2 2` | `4 2` (2 < 2 is false) | | |
| push 5 | `4 2 2 5` | `4 2 2` | `4 2` | | |
| getMin | | | | 2 | 2 |
| pop (5) | `4 2 2` | `4 2 2` | `4 2` | | |
| pop (2) | `4 2` | `4 2` (popped 2 == top) | `4` (popped 2 == top) | | |
| getMin | | | | **2** | **4, wrong** |
| pop (2) | `4` | `4` | `4`; 2 ≠ 4, nothing popped | | |
| getMin | | | | 4 | 4 |

With `<`, the second 2 was never recorded, so popping one 2 removed the only record of the minimum while another 2 is still on the stack.

```python
class MinStack:
    def __init__(self):
        self.st = []                            # (value, min of this entry and below)
    def push(self, x):
        m = x if not self.st else min(x, self.st[-1][1])
        self.st.append((x, m))
    def pop(self):
        self.st.pop()
    def top(self):
        return self.st[-1][0]
    def getMin(self):
        return self.st[-1][1]
```

Under time pressure write the pairs version: it cannot get the duplicate case wrong. The parallel version saves memory on ascending input (only new minimums are stored); mention it and the `<=`.

```viz
{"type": "stack-queue", "algorithm": "min-stack", "operations": [["push",4],["push",2],["push",2],["push",5],["getMin"],["pop"],["pop"],["getMin"],["pop"],["getMin"]]}
```

### Evaluate RPN: operand order and truncation

[Evaluate Reverse Polish Notation](/practice/evaluate-rpn): tokens are integers or `+ - * /`; division truncates towards zero. Push operands; on an operator pop the **right** operand first, then the left.

Trace `["7", "-3", "/", "2", "*", "10", "+"]`, which is `(7 / −3) × 2 + 10`, with truncation and, for contrast, with Python's floor division:

| Token | Kind | Popped (left, right) | Result, truncate | Stack, truncate | Stack, floor `//` |
|---|---|---|---|---|---|
| `7` | operand | | | `7` | `7` |
| `-3` | operand (not the `-` operator) | | | `7 −3` | `7 −3` |
| `/` | operator | (7, −3) | −2 | `−2` | `−3` |
| `2` | operand | | | `−2 2` | `−3 2` |
| `*` | operator | (−2, 2) | −4 | `−4` | `−6` |
| `10` | operand | | | `−4 10` | `−6 10` |
| `+` | operator | (−4, 10) | 6 | `6` | `4` |

The answer is 6; floor division gives 4. Two more traps live in this table. `"-3"` is an operand, so the operator test must compare the whole token (`t in {"+", "-", "*", "/"}`), never its first character. And the first pop is the right operand: popping in the other order computes `−3 / 7`.

```python
def eval_rpn(tokens):
    st = []
    for t in tokens:
        if t in {"+", "-", "*", "/"}:
            b = st.pop()                  # right operand
            a = st.pop()                  # left operand
            if t == "+": st.append(a + b)
            elif t == "-": st.append(a - b)
            elif t == "*": st.append(a * b)
            else:
                q = abs(a) // abs(b)      # exact truncation, no float round trip
                st.append(q if (a < 0) == (b < 0) else -q)
        else:
            st.append(int(t))
    return st[0]
```

The stack depth at any moment is the number of values waiting for an operator; a well-formed expression leaves exactly one. The same run as bare stack operations, with each operator's two pops and one push:

```viz
{"type": "stack-queue", "algorithm": "stack-ops", "operations": [["push",7],["push",-3],["pop"],["pop"],["push",-2],["push",2],["pop"],["pop"],["push",-4],["push",10],["pop"],["pop"],["push",6]],
 "title": "Evaluating 7 -3 / 2 * 10 +", "caption": "Operands push; each operator pops the right operand, then the left, and pushes the result."}
```

### Decode String: saving the outer context

[Decode String](/practice/decode-string): `k[s]` means `s` repeated `k` times, nested arbitrarily. At `[`, the count read so far and the string built so far belong to the *outer* context, which must be resumed after the matching `]`. Push both and reset.

```python
def decode(s):
    counts, strings = [], []
    cur, num = "", 0
    for c in s:
        if c.isdigit():
            num = num * 10 + int(c)          # counts can have several digits
        elif c == "[":
            counts.append(num)
            strings.append(cur)
            cur, num = "", 0                 # reset BOTH, or the outer context leaks in
        elif c == "]":
            k = counts.pop()
            cur = strings.pop() + cur * k
        else:
            cur += c
    return cur
```

Trace `"2[a10[b]]c"` (the classic `"3[a2[c]]"` is traced in [Stack applications](/learn/data-structures/stacks-queues/stack-applications)):

| Step | Char | `num` | `cur` | `counts` | `strings` | Note |
|---|---|---|---|---|---|---|
| 1 | `2` | 2 | `""` | | | |
| 2 | `[` | 0 | `""` | `2` | `""` | save (2, `""`), reset |
| 3 | `a` | 0 | `a` | `2` | `""` | |
| 4 | `1` | 1 | `a` | `2` | `""` | |
| 5 | `0` | 10 | `a` | `2` | `""` | multi-digit: 1 × 10 + 0 |
| 6 | `[` | 0 | `""` | `2 10` | `"" a` | save (10, `a`), reset |
| 7 | `b` | 0 | `b` | `2 10` | `"" a` | |
| 8 | `]` | 0 | `a` + `b` × 10 (11 chars) | `2` | `""` | |
| 9 | `]` | 0 | `""` + that × 2 (22 chars) | | | |
| 10 | `c` | 0 | 23 chars | | | `abbbbbbbbbbabbbbbbbbbbc` |

Treating `1` and `0` as separate counts, or not resetting `num` at `[`, are the two slips this input catches. Cost is output-sensitive: each `]` copies the string it builds, so the work is at most the output length times the nesting depth.

### Car Fleet: store the fleet, not the car

[Car Fleet](/practice/car-fleet): cars at distinct positions drive towards `target` at constant speeds on one lane; a car that catches a slower one ahead joins it. Count the fleets that arrive.

A car can only be blocked by cars ahead of it, so sort by position descending and compute each car's unobstructed arrival time `(target − pos) / speed`. If a car would arrive no later than the fleet directly ahead, it catches that fleet and is held to the fleet's time; otherwise it heads a new fleet. The stack holds **fleet** arrival times.

```python
def car_fleet(target, position, speed):
    cars = sorted(zip(position, speed), reverse=True)    # closest to target first
    stack = []                                           # arrival time of each fleet
    for pos, spd in cars:
        t = (target - pos) / spd
        if stack and t <= stack[-1]:
            continue                                     # caught the fleet ahead
        stack.append(t)
    return len(stack)
```

Trace `target = 20`, `position = [5, 16, 0, 9, 4, 12]`, `speed = [3, 2, 5, 1, 2, 4]`. The last column is a buggy version that remembers the previous *car's* time instead of the fleet's:

| Car (pos, speed) | Alone arrival | Fleet time on top | Action | Stack | Buggy: compares with | Buggy count |
|---|---|---|---|---|---|---|
| (16, 2) | 2.0 | | new fleet | `2.0` | | 1 |
| (12, 4) | 2.0 | 2.0 | 2.0 ≤ 2.0, joins | `2.0` | 2.0 | 1 |
| (9, 1) | 11.0 | 2.0 | new fleet | `2.0 11.0` | 2.0 | 2 |
| (5, 3) | 5.0 | 11.0 | joins | `2.0 11.0` | 11.0 | 2 |
| (4, 2) | 8.0 | 11.0 | joins | `2.0 11.0` | **5.0**, so 8.0 looks like a new fleet | **3** |
| (0, 5) | 4.0 | 11.0 | joins | `2.0 11.0` | 8.0 | 3 |

Two fleets. The car at 5 would arrive at 5.0 alone, but it is stuck behind the 9-position car and arrives at 11.0; the car at 4 must be judged against 11.0. The `<=` is correct at equal times: arriving together is one fleet. Time O(n log n) for the sort, O(n) for the scan.

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| **Minimum removals to make brackets valid** | Push *indices* of `(`; record unmatched `)` indices; delete both sets at the end | O(n) |
| **Longest valid parentheses substring** | Stack of indices seeded with `−1`; after a pop, length is `i − stack[-1]`; on an empty stack push `i` as the new base | O(n) |
| **Infix calculator with precedence** | Two stacks (operands, operators) or shunting-yard to RPN first | O(n) |
| **`getMax` in O(1)** | Min stack with the comparison flipped | O(1) per op |
| **Asteroid collision** | Simulation with three outcomes per collision; a `while` pops smaller opposite movers (see the exercise) | O(n) amortised |
| **Undo/redo** | Two stacks; a new action clears the redo stack | O(1) per op |
| **Single bracket type** | Replace the stack with a depth counter | O(1) space |
| **i-th character of a huge decoded string** | Compute each group's decoded length, then descend, reducing the index modulo the repeated part's length, without expanding | O(n) |

## Complexity, derived

Every item is pushed at most once and popped at most once, so a scan performs at most `2n` stack operations, each O(1) amortised on a dynamic array: O(n) time. The simulation family can pop several items for one arrival (an asteroid of size 10 destroying five smaller ones), but each item can be popped only once over the whole run, so the total is still O(n), the same amortised argument the monotonic stack relies on.

Space is the maximum stack height: O(n) for `"(((("`, O(depth) for well-balanced nested input, O(1) with a counter when there is one bracket type. Decode String is output-sensitive: its cost is bounded by the output length times the nesting depth. Car Fleet is dominated by the O(n log n) sort.

| Approach to "validate nested brackets" | Time | Extra space | Handles several types | Handles streams | Failure point |
|---|---|---|---|---|---|
| Explicit stack | O(n) | O(depth) | yes | yes, while depth fits in memory | memory at extreme depth |
| Depth counter | O(n) | O(1) | no, one type only | yes | accepts `([)]` if types are mixed |
| Recursive descent | O(n) | O(depth) call frames | yes | yes | recursion limit: about 1,000 frames in CPython |
| Repeated `replace("()", "")` | O(n²) | O(n) copies | yes | no | quadratic on deep nesting |

## Under the hood

### Division is three different operations

Python's `//` floors (`-7 // 2 == -4`, `7 // -3 == -3`); the problem wants truncation (`-3` and `-2`). `int(a / b)` truncates but goes through a 64-bit float, which holds integers exactly only up to 2⁵³: `int((10**17 + 1) / 1)` returns `100000000000000000`, one less than the true quotient (CPython 3.14). The `abs(a) // abs(b)` form in the code above is exact for any size. In JavaScript, `Math.trunc(a / b)` is exact for 32-bit operands; `(a / b) | 0` also truncates but wraps outside ±2³¹.

### `pop()` on an empty stack

Python raises `IndexError`, which at least points at the line. JavaScript's `Array.prototype.pop` returns `undefined`, and `undefined + 3` is `NaN`, so a malformed RPN expression in JavaScript produces `NaN` rather than an error. Guard every pop, or check `stack.length >= 2` before an operator.

### Explicit stacks versus the recursion limit

A parser that recurses once per nesting level inherits the runtime's stack limit. Measured on this lesson's machine: CPython 3.14's `json.loads` parsed 5,000 levels of `[` and raised `RecursionError` at 100,000; Node 24's `JSON.parse` parsed 10⁶ levels (V8's parser is iterative), yet `JSON.stringify` on the result threw `RangeError: Maximum call stack size exceeded` at 10⁴. An explicit stack is bounded only by memory. The per-runtime frame budgets are tabulated in [Stack applications](/learn/data-structures/stacks-queues/stack-applications).

### Building strings

`cur += c` in a loop copies in principle. CPython resizes the string in place when the variable holds its only reference (10⁶ one-character appends took 16 ms with `+=` and 15 ms with a list and `"".join`), but PEP 8 tells you not to rely on that optimisation, and implementations without reference counting do not have it. V8 builds concatenations as ropes (`ConsString`) and flattens later: 10⁶ appends took 7 ms in Node 24. For production code collect parts and join; in an interview say that sentence and keep `+=`.

## Failure modes

**Leftover opens accepted.** *Symptom:* `"(("` or `"[{"` returns true. *Diagnosis:* the function returns `True` after the loop instead of checking that the stack is empty. *Fix:* `return not stack`.

**`NaN` from a malformed expression.** *Symptom:* a JavaScript calculator returns `NaN` for `["+"]` or `["1", "+"]`, with no exception. *Diagnosis:* `pop()` on an empty array returns `undefined`. *Fix:* check the stack height before popping, and reject malformed input explicitly.

**Wrong answers only for negative division or subtraction.** *Symptom:* every sample passes; the hidden test `["6", "-132", "/"]` returns −1 instead of 0, or `-` gives the negated result. *Diagnosis:* floor division instead of truncation, or the operands popped in the wrong order. *Fix:* truncate towards zero exactly; name the first pop `b` (right) and the second `a` (left).

**`getMin` reports a minimum that is gone, or the wrong one.** *Symptom:* after pushing a duplicate minimum and popping it once, `getMin` returns the old larger value. *Diagnosis:* the parallel `mins` stack pushes on `<` instead of `<=`. *Fix:* `<=`, or the pairs version.

**A service crashes on one customer's document.** *Symptom:* a worker dies with `RecursionError` or a segfault on a deeply nested JSON or XML upload; other requests are fine. *Diagnosis:* a recursive walker over user-controlled nesting depth, the same limit the measurements above hit. *Fix:* an explicit stack, plus a depth cap enforced at parse time; treat nesting depth as an input size to validate, like body length.

## Interviewer follow-ups

**"The input is 10⁹ brackets streamed from disk. Memory?"** Model answer: with one bracket type, a depth counter, one integer. With several types you need memory proportional to the depth: after `d` unclosed openers of two types, any of 2^d type sequences is possible, and each one needs a different closing sequence to be valid, so an algorithm that cannot tell two of them apart gets one of them wrong. The stack is that information. Common wrong answer: "one counter per type", which accepts `([)]`.

**"Support `popMin` as well."** Model answer: the pattern changes: removing the minimum from the middle of a stack is O(n). Keep a min-heap of `(value, sequence number)` beside the stack and lazily skip heap entries whose sequence number has already been popped from the stack, giving O(log n) per operation; see [two heaps](/learn/interview-patterns/sequence-patterns/two-heaps) for lazy deletion. Common wrong answer: "the min stack already knows the minimum", which knows its value, not how to remove it.

**"Now infix, with precedence and parentheses."** Model answer: shunting-yard converts to RPN with an operator stack (pop while the top has higher or equal precedence and is left-associative), then evaluate RPN; or evaluate directly with two stacks. O(n). Common wrong answer: evaluate left to right, which gives `2 + 3 × 4 = 20`.

**"The decoded string could be 10¹² characters; return only its i-th character."** Model answer: never expand. One stack pass computes the decoded length of every bracketed group (lengths multiply, so watch for 64-bit overflow outside Python). Then descend from the top level: skip letters and whole groups whose length is below the remaining index, subtracting their lengths; on entering a group `k[s]`, reduce the index modulo the decoded length of `s`. O(n) time after the length pass, O(depth) memory. Common wrong answer: expand lazily with generators, which is still O(i) work.

**"Why an explicit stack rather than recursion?"** Model answer: control: no runtime depth limit (CPython stops near 1,000 frames by default), early exit without unwinding, and a place to hang per-level state; the algorithm is the same. Common wrong answer: "recursion is slower", which is sometimes true and never the main reason.

## What mid-level engineers get wrong

- **Returning true at the end of a matching scan.** Consequence: unclosed openers pass.
- **Checking `t[0]` to detect operators.** Consequence: the operand `"-3"` is treated as subtraction, and the stack underflows.
- **Floor division, or swapped operands, in RPN.** Consequence: wrong answers only on negative or non-commutative cases, which is where the hidden tests live.
- **A strict `<` in the parallel min stack.** Consequence: duplicate minimums corrupt `getMin`.
- **Storing each car's own time in Car Fleet.** Consequence: a car held behind a slow fleet is judged by its unobstructed time, inflating the count (3 instead of 2 in the trace).
- **Reaching for a plain stack on "next greater element".** Consequence: an O(n²) scan, or a stack whose invariant nobody can state; that is the monotonic stack.

## Exercises

```exercise
id: simplify-unix-path
title: Simplify a Unix path
prompt: |
  Given an absolute Unix-style path, return its canonical form.

  Rules: `.` refers to the current directory, `..` moves up one directory
  (and does nothing at the root), multiple consecutive `/` count as one,
  the result starts with a single `/`, has no trailing `/` (except when the
  result is the root itself), and any other name (including `...` or
  `.hidden`) is an ordinary directory name.

  Examples: `"/home//foo/"` → `"/home/foo"`, `"/a/./b/../../c/"` → `"/c"`,
  `"/../"` → `"/"`.
languages: [python, javascript]
entry: simplify_path
starter:
  python: |
    def simplify_path(path):
        # split on "/", keep a stack of directory names
        return "/"
  javascript: |
    function simplify_path(path) {
      // split on "/", keep a stack of directory names
      return "/";
    }
tests:
  - args: ["/home/"]
    expected: "/home"
  - args: ["/../"]
    expected: "/"
    label: cannot go above root
  - args: ["/home//foo/"]
    expected: "/home/foo"
  - args: ["/a/./b/../../c/"]
    expected: "/c"
  - args: ["/"]
    expected: "/"
    label: root only
  - args: ["/..."]
    expected: "/..."
    hidden: true
    label: three dots is a directory name
  - args: ["/a//b////c/d//././/.."]
    expected: "/a/b/c"
    hidden: true
hints:
  - "Split on `/` and ignore empty parts and `.`; those are the two ways a segment can be a no-op."
  - "`..` pops the stack if it is non-empty; at the root it is ignored, not an error."
  - "Join the remaining stack with `/` and prefix a single `/`; an empty stack yields exactly `/`."
```

```exercise
id: asteroid-collision
title: Asteroid collision
prompt: |
  `asteroids` lists asteroids in a row. The absolute value is the size; the
  sign is the direction (positive moves right, negative moves left). All
  move at the same speed. When a right-mover meets a left-mover, the smaller
  one explodes; if they are the same size, both explode. Two asteroids
  moving in the same direction never meet, and a left-mover that is left of
  a right-mover never meets it.

  Return the asteroids that remain, in order. Use a stack of survivors so
  that the whole simulation runs in O(n).
languages: [python, javascript]
entry: asteroid_collision
starter:
  python: |
    def asteroid_collision(asteroids):
        stack = []
        return stack
  javascript: |
    function asteroid_collision(asteroids) {
      const stack = [];
      return stack;
    }
tests:
  - args: [[5, 10, -5]]
    expected: [5, 10]
  - args: [[8, -8]]
    expected: []
    label: equal sizes both explode
  - args: [[10, 2, -5]]
    expected: [10]
  - args: [[-2, -1, 1, 2]]
    expected: [-2, -1, 1, 2]
    label: nothing ever meets
  - args: [[]]
    expected: []
    label: empty input
  - args: [[1, -2, -2, -2]]
    expected: [-2, -2, -2]
    hidden: true
  - args: [[-2, 2, -1, -2]]
    expected: [-2]
    hidden: true
  - args: [[3, 5, -6, 2, -1, 4]]
    expected: [-6, 2, 4]
    hidden: true
    label: one arrival destroys several survivors
hints:
  - "Only a new left-mover can collide, and only with a right-mover on top of the stack."
  - "Loop while the new asteroid is alive, is moving left, and the top is moving right: pop a smaller top, pop an equal top and stop, or stop if the top is bigger."
  - "Push the new asteroid only if it survived. Each asteroid is pushed and popped at most once, so the loop is O(n) overall."
```

## Senior signals

- You say "the most recently opened thing is the only one that can close next, so the stack is the state" before writing code, and you name the family.
- You treat an explicit stack as recursion with the call stack made visible, and you can say why you chose it: depth limits (with numbers), early exit, per-level state.
- You get **truncating division and operand order** right in RPN without prompting, and you know why `int(a / b)` is wrong for big integers.
- You store the **fleet's** arrival time in Car Fleet and can defend `<=` at equal times.
- You know which augmentations are cheap (`getMin`, `getMax`) and which change the pattern (`popMin`, median), and you know the `<=` trap in a parallel min stack.
- You know when the stack **disappears**: one bracket type is a counter, and you can say why several types cannot be validated in constant memory.
- You treat **nesting depth of untrusted input** as a resource to validate, because recursive parsers fail at a few thousand levels.

## Check yourself

```quiz
- q: >-
    Why does counting opens and closes per bracket type accept "({})[(])" when the string is invalid?
  options: ["Counting fails only on inputs whose length is odd", "Counts ignore order, and the last opened must close first", "Counters overflow once more than one type is present", "Counting per type costs O(n^2) once several types mix"]
  answer: 1
  explanation: >-
    Each type has as many closes as opens, yet the seventh character "]" arrives while "(" is the innermost open bracket. Only a structure that remembers the order of the open brackets, the stack, can see that; the string has even length and the counters are fine.
- q: >-
    A min stack keeps a parallel mins stack and pushes to it only when the new value is strictly less than the current minimum. After push 4, push 2, push 2, pop, what does getMin return?
  options: ["2, because one 2 is still on the main stack", "4, because the only record of 2 was popped", "It raises an error, as the mins stack is empty", "2, because the mins stack stored both copies"]
  answer: 1
  explanation: >-
    With strict less-than, the second 2 is never pushed to mins. Popping the top 2 matches the mins top and removes it, leaving 4 as the recorded minimum while a 2 remains on the main stack. Pushing on less-than-or-equal records both copies and returns the correct 2.
- q: >-
    Evaluating ["7", "-3", "/", "2", "*", "10", "+"] should give 6. A Python solution uses // and returns 4. Which fix is exact for all integer sizes?
  options: ["Use round(a / b) so that negative quotients go to nearest", "Use the quotient abs(a) // abs(b), negated if the signs differ", "Pop the left operand first so the division is 7 / -3", "Replace // with int(a / b) so that division truncates"]
  answer: 1
  explanation: >-
    Floor division gives -3 for 7 // -3 where truncation wants -2. int(a / b) truncates but converts through a float with 53 bits of precision, so it is wrong for large operands; the abs form is exact. The operand order was already right, and rounding is a different operation.
- q: >-
    In Car Fleet, a car would arrive at 8.0 alone. The car directly ahead would arrive at 5.0 alone but has caught a fleet arriving at 11.0. How should the 8.0 car be judged?
  options: ["It heads a new fleet, because 8.0 is later than 5.0", "It depends on the gap between the two cars' positions", "It joins, because 8.0 is at most the fleet's time of 11.0", "It joins only if its speed is higher than that car's speed"]
  answer: 2
  explanation: >-
    The car ahead cannot pass its fleet, so it effectively arrives at 11.0; the stack stores fleet times, and 8.0 <= 11.0 means the new car catches up. Comparing with the unobstructed 5.0 counts an extra fleet, which is the bug traced in the lesson.
- q: >-
    You must validate a 10^9-character stream of brackets of three types. What is the least memory any correct algorithm needs?
  options: ["O(1), with one counter per bracket type", "O(depth), the stack of currently open brackets", "O(n), since the whole stream must be buffered", "O(log n), enough bits for the current position"]
  answer: 1
  explanation: >-
    With several types the identity and order of every open bracket matter, so the algorithm must remember the open brackets, which is the stack; per-type counters accept "([)]". Buffering the stream is unnecessary, since each character is processed once. With a single type the stack's contents are identical and a counter suffices.
- q: >-
    A service walks user-uploaded JSON with a recursive function and crashes on one customer's file. Measured in this lesson, what nesting depth breaks CPython's own json.loads?
  options: ["Around 1,000, where Python frames exhaust the C stack", "Somewhere above 5,000; 100,000 levels raise RecursionError", "It never breaks, because the json parser is iterative", "About 100, the default depth guard of the json module"]
  answer: 1
  explanation: >-
    json.loads handled 5,000 levels and raised RecursionError at 100,000 on CPython 3.14, and a hand-written recursive walker hits the 1,000-frame default limit sooner. V8's JSON.parse is iterative and parsed a million levels, but JSON.stringify then overflowed at 10^4. An explicit stack plus a depth cap on untrusted input avoids all of these.
```
