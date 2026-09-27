---
slug: stack-patterns
title: "Stack patterns: matching, evaluation and simulation"
description: When a problem's structure is nested or last-in-first-out, a stack is the whole algorithm; learn the four stack families, the signal that selects each, and the traces that prove them.
minutes: 32
difficulty: medium
tags: [pattern:stack, stack, parsing, evaluation, simulation]
problems: [valid-parentheses, min-stack, evaluate-rpn, generate-parentheses, daily-temperatures, car-fleet, largest-rectangle-histogram, decode-string]
---
You are asked whether `"{[()]}"` is balanced, or what `"3[a2[c]]"` expands to, or how many groups of cars arrive at a finish line together. None of these looks like a data-structure problem. All three collapse into the same twelve-line loop once you notice that the *most recent unfinished thing* is the only thing that matters at each step. That property, last opened is first closed, is what a stack encodes, and the interview skill is spotting it in a statement that never says the word "stack".

The stack family is small and the templates are short, which is exactly why interviewers use them in the first fifteen minutes: they want to see whether you recognise the shape, write it without hesitation, and then spend the remaining time on the follow-ups. This lesson covers the four shapes that account for nearly every stack problem in the Ascend 150, traces three of them step by step, and separates them from the [monotonic stack](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern), which shares the data structure but not the reasoning.

## The signal

Reach for a stack when the problem statement has any of these properties:

- **Nesting or matching.** Brackets, HTML tags, nested repetition (`3[a2[c]]`), directory paths with `..`. The rule "the most recently opened thing must be the first one closed" is LIFO by definition.
- **Postfix or "apply the last operator to the last two things".** Reverse Polish notation, undo/redo, calculator problems where the operands are already in order and only the operator arrives late.
- **"In O(1)" on top of push/pop.** `getMin()` in constant time, `getMax()`, a running median restricted to push/pop. The stack must carry extra state per entry.
- **Simulation where things collide from one direction.** Cars that catch up but cannot pass, asteroids moving towards each other, a stream of events where the latest one either merges into or is absorbed by the previous one.

What rules a stack out:

- If you need the *oldest* unfinished thing first (breadth-first, fairness, sliding windows that evict from the left), you want a queue or a deque.
- If the question is "for each element, the next/previous element that is greater/smaller", you want the [monotonic stack](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern). It still uses `push` and `pop`, but the invariant is on the *values in the stack*, not on nesting. [Daily Temperatures](/practice/daily-temperatures) and [Largest Rectangle in Histogram](/practice/largest-rectangle-histogram) are listed as stack problems and are solved there.
- If you must *generate* all valid nestings rather than validate one, that is backtracking with an open/close count invariant; [Generate Parentheses](/practice/generate-parentheses) is covered in the [backtracking pattern](/learn/interview-patterns/combinatorial-patterns/backtracking-pattern). The stack idea (never let closes exceed opens) shapes the pruning, but the driver is recursion.

The confusable pattern in the other direction is recursion itself. Every stack problem can be written recursively, because the call stack is a stack. The reason to make the stack explicit is control: no recursion limit (Python's default is 1,000 frames, a long bracket string blows it), an explicit place to attach extra state, and easy early exit.

## The template

Four families, one skeleton. Scan left to right; each item either pushes, pops-and-combines, or is rejected.

```python
def stack_scan(items):
    stack = []
    for x in items:
        if opens(x):
            stack.append(x)
        elif closes(x):
            if not stack or not matches(stack[-1], x):
                return REJECT          # or handle the mismatch
            top = stack.pop()
            combine(top, x)            # matching: nothing; evaluation: push result
        else:
            accumulate(x)              # digits, letters, operands
    return finish(stack)               # matching: len(stack) == 0
```

```javascript
function stackScan(items) {
  const stack = [];
  for (const x of items) {
    if (opens(x)) {
      stack.push(x);
    } else if (closes(x)) {
      if (stack.length === 0 || !matches(stack[stack.length - 1], x)) {
        return REJECT;
      }
      const top = stack.pop();
      combine(top, x);
    } else {
      accumulate(x);
    }
  }
  return finish(stack);
}
```

The invariant is: **the stack holds exactly the opened-but-not-yet-closed items, most recent on top.** Every family is a choice of what an "item" is and what `combine` does.

| Family | Stack holds | `combine` does | Examples |
|---|---|---|---|
| Matching | opening brackets | check the pair, discard | [Valid Parentheses](/practice/valid-parentheses), path simplification |
| Evaluation | operands or partial results | pop operands, push result | [Evaluate RPN](/practice/evaluate-rpn), [Decode String](/practice/decode-string) |
| Augmented | (value, aggregate) pairs | nothing; the aggregate rides along | [Min Stack](/practice/min-stack) |
| Simulation | surviving entities | absorb, merge or annihilate | [Car Fleet](/practice/car-fleet), asteroid collision |

Watch the matching family on an input that contains an early failure. The animation stops the moment a close has no matching open, which is exactly the property that lets the algorithm run in a single pass with no lookahead.

```viz
{"type": "stack-queue", "algorithm": "balanced-parentheses", "input": "{[()]}(]"}
```

The evaluation family is the same loop with `combine` doing work. For RPN, "opens" is an operand (push it), "closes" is an operator (pop two, compute, push the result). The stack depth at any moment is the number of values waiting for an operator, and the final answer is the single value left. A senior-level note: integer division in RPN problems truncates towards zero, which is `int(a / b)` in Python and `Math.trunc(a / b)` in JavaScript, not `a // b` or `Math.floor`; `-7 // 2` is `-4` in Python and the problem wants `-3`.

The augmented family attaches state to each entry so that a query answers in O(1). For `getMin`, each stack frame stores the minimum of everything at or below it.

```viz
{"type": "stack-queue", "algorithm": "min-stack", "operations": [["push",5],["push",3],["push",7],["getMin"],["pop"],["getMin"],["pop"],["getMin"]]}
```

Two implementations, same complexity: a parallel `mins` stack that only pushes when the new value is less than or equal to the current minimum (saves memory on ascending data), or a single stack of `(value, min_so_far)` pairs (simpler, never wrong). Under interview pressure write the pairs version; mention the parallel-stack version and the `<=` subtlety (with `<` only, pushing a duplicate minimum and popping one copy corrupts the answer).

## Worked problems

### Valid Parentheses

Given a string of `()[]{}`, decide whether every bracket is closed by the correct type in the correct order. [Valid Parentheses](/practice/valid-parentheses).

The insight: a close bracket is only ever allowed to match the most recently opened, still-open bracket. That is the top of the stack, so a single pass suffices, and the string is valid if and only if no mismatch occurs and the stack is empty at the end.

```python
def is_valid(s: str) -> bool:
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for c in s:
        if c in pairs:                       # closing bracket
            if not stack or stack[-1] != pairs[c]:
                return False
            stack.pop()
        else:                                # opening bracket
            stack.append(c)
    return not stack
```

Trace on `"{[()]}"`:

| Step | Char | Action | Stack after |
|---|---|---|---|
| 1 | `{` | open, push | `{` |
| 2 | `[` | open, push | `{ [` |
| 3 | `(` | open, push | `{ [ (` |
| 4 | `)` | top `(` matches, pop | `{ [` |
| 5 | `]` | top `[` matches, pop | `{` |
| 6 | `}` | top `{` matches, pop | (empty) |
| end | | stack empty | valid |

Trace on `"([)]"`, which has balanced counts but the wrong order:

| Step | Char | Action | Stack after |
|---|---|---|---|
| 1 | `(` | push | `(` |
| 2 | `[` | push | `( [` |
| 3 | `)` | top is `[`, needs `(` | return false |

Counting alone (`opens == closes` per type) accepts `"([)]"`; the stack rejects it because order is part of the invariant. The other two failure cases are a close on an empty stack (`")("`: `)` arrives first) and leftover opens at the end (`"(("`), which is why the final line is `return not stack` and not `return True`.

Time O(n), one pass. Space O(n) in the worst case (`"((((("`). A cheap early exit: if `len(s)` is odd, return false before scanning.

### Decode String

Expand an encoded string where `k[substring]` means the substring repeated `k` times, with arbitrary nesting: `"3[a2[c]]"` becomes `"accaccacc"`. [Decode String](/practice/decode-string).

The insight: when you hit `[`, everything built so far and the repeat count belong to an *outer* context that must be resumed after the matching `]`. Two stacks (or one stack of pairs) hold that context: the count waiting for this bracket, and the string built before it.

```python
def decode(s: str) -> str:
    counts, strings = [], []
    cur, num = "", 0
    for c in s:
        if c.isdigit():
            num = num * 10 + int(c)          # multi-digit counts
        elif c == "[":
            counts.append(num)
            strings.append(cur)
            cur, num = "", 0
        elif c == "]":
            k = counts.pop()
            prev = strings.pop()
            cur = prev + cur * k
        else:
            cur += c
    return cur
```

Trace on `"3[a2[c]]"`:

| Step | Char | `num` | `cur` | `counts` | `strings` | Note |
|---|---|---|---|---|---|---|
| 1 | `3` | 3 | `""` | | | accumulate the digit |
| 2 | `[` | 0 | `""` | `3` | `""` | save (3, "") and reset |
| 3 | `a` | 0 | `"a"` | `3` | `""` | |
| 4 | `2` | 2 | `"a"` | `3` | `""` | |
| 5 | `[` | 0 | `""` | `3 2` | `"" "a"` | save (2, "a") and reset |
| 6 | `c` | 0 | `"c"` | `3 2` | `"" "a"` | |
| 7 | `]` | 0 | `"acc"` | `3` | `""` | pop 2 and `"a"`: `"a" + "c"*2` |
| 8 | `]` | 0 | `"accaccacc"` | | | pop 3 and `""`: `"" + "acc"*3` |

The multi-digit case is where candidates slip: `"10[a]"` must accumulate `num = 1`, then `num = 10`, not treat `1` and `0` as separate counts. The reset of `num` and `cur` at `[` is the other place; forgetting either leaks the outer context into the inner one.

Time O(n · L) where L is the output length, because the string concatenations copy; in Python `cur * k` is a single allocation per `]`. Space O(depth of nesting + output).

### Car Fleet

`n` cars start at distinct positions on a one-lane road and drive towards `target` at constant speeds. A faster car that catches a slower one slows down and forms a fleet with it (they arrive together). Return how many fleets reach the target. [Car Fleet](/practice/car-fleet).

The insight: a car can only be blocked by cars *ahead* of it. Sort by starting position descending, compute each car's unobstructed arrival time `(target - pos) / speed`, and scan. If a car would arrive no later than the fleet directly ahead, it catches that fleet and joins it; its own time no longer matters because it is now pinned to the fleet's time. If it would arrive later, it is the head of a new fleet. The stack holds the arrival time of each fleet head, most recent on top.

```python
def car_fleet(target: int, position: list[int], speed: list[int]) -> int:
    cars = sorted(zip(position, speed), reverse=True)   # closest to target first
    stack = []                                          # arrival times of fleet heads
    for pos, spd in cars:
        t = (target - pos) / spd
        if stack and t <= stack[-1]:
            continue                                    # catches the fleet ahead
        stack.append(t)                                 # new fleet
    return len(stack)
```

Trace with `target = 12`, `position = [10, 8, 0, 5, 3]`, `speed = [2, 4, 1, 1, 3]`. Sorted by position descending:

| Step | Car (pos, speed) | Arrival time | Top of stack | Action | Stack after |
|---|---|---|---|---|---|
| 1 | (10, 2) | (12−10)/2 = 1.0 | — | new fleet | `1.0` |
| 2 | (8, 4) | (12−8)/4 = 1.0 | 1.0 | 1.0 ≤ 1.0, joins | `1.0` |
| 3 | (5, 1) | (12−5)/1 = 7.0 | 1.0 | 7.0 > 1.0, new fleet | `1.0 7.0` |
| 4 | (3, 3) | (12−3)/3 = 3.0 | 7.0 | 3.0 ≤ 7.0, joins | `1.0 7.0` |
| 5 | (0, 1) | (12−0)/1 = 12.0 | 7.0 | 12.0 > 7.0, new fleet | `1.0 7.0 12.0` |

Three fleets. Note step 4: the car at position 3 is *faster* than the car at 5 and would arrive at 3.0 alone, but it catches the 7.0 fleet and is held to 7.0. Whether car 0 joins is decided against 7.0, not 3.0. That is why the stack stores the fleet's time, never the individual car's, and why a car that joins is not pushed.

The `<=` matters: a car arriving at exactly the same time as the fleet ahead is at the target when the fleet is, which counts as one fleet. Time O(n log n) for the sort; the scan is O(n). Space O(n).

## Variations

- **Multiple bracket types with priority rules.** Some variants say `(` cannot appear inside `[`. The template does not change; `matches` grows a rule, and you can check the new open against the current top before pushing.
- **Remove the minimum number of brackets to make it valid.** Push *indices* of unmatched `(`, and on an unmatched `)` record its index; at the end everything left on the stack plus the recorded closes is the deletion set. Same scan, different payload.
- **Infix instead of postfix.** A basic calculator with `+ - * /` and parentheses needs two stacks (operands and operators) with precedence, or a recursive-descent parser. The single-stack RPN template is the *result* of that parsing (the shunting-yard algorithm emits RPN). Say so; interviewers like hearing that you know the two problems are one problem.
- **`getMax` or `getMedian` in O(1).** `getMax` is the min-stack with the comparison flipped. `getMedian` is not achievable with a single augmented stack; that is the [two heaps](/learn/interview-patterns/sequence-patterns/two-heaps) pattern, and knowing which augmentations are cheap and which are not is a senior tell.
- **Simulation with both directions.** Asteroid collision: positive values move right, negatives move left, and only a right-mover followed by a left-mover collides. The stack holds survivors; a new left-mover pops right-movers smaller than it, is destroyed by a bigger one, and mutually annihilates an equal one. The `combine` step now has three outcomes, but the loop shape is unchanged.

## Pitfalls

- **Forgetting the end-of-scan check.** `"(("` scans with no mismatch; the answer is invalid because the stack is non-empty. Return `len(stack) == 0`, not `True`.
- **Popping an empty stack.** `")"` on an empty stack is a mismatch, not an exception. Guard every pop with `if not stack`.
- **Integer division semantics in RPN.** `6 / -132` must be `0`, not `-1`. Use truncation towards zero (`int(a / b)` in Python, `Math.trunc` in JS) and check the operand order: the *second* pop is the left operand.
- **Min-stack with strict `<`.** Push `2, 2`, pop once: with a parallel min stack that only pushed the first `2`, the pop removes the minimum record and `getMin` now reports the wrong value or crashes. Use `<=` on push and pop the min stack only when the popped value equals its top.
- **Building strings with repeated `+=` in a loop.** In JavaScript engines this is optimised into ropes and is fine; in Python it is quadratic in principle and usually fine in practice for interview sizes. Say you would collect into a list and `"".join` for production code.
- **Sorting car fleet the wrong way.** Sorting by position ascending and scanning naively makes a car "catch" cars behind it. The blocking relationship only runs from a car to the cars ahead, so scan from closest-to-target outward.
- **Using recursion for deep nesting.** A bracket string of 10⁵ characters is a legitimate input. Recursion depth limits in Python (1,000 by default) and V8 (around 10⁴ frames) turn a correct algorithm into a crash; the explicit stack has no such limit.

## Exercise

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

## Senior signals

- You say "the most recently opened thing is the only one that can close next, so the stack is the state" before you write code, and you name which of the four families you are in.
- You know that every explicit-stack solution is a recursive solution with the call stack made visible, and you can say why you chose explicit: recursion limits, early exit, and a place to hang extra state.
- You get integer division right in RPN without being told, and you mention shunting-yard when asked about infix.
- You store the *fleet's* arrival time in Car Fleet rather than each car's, and you can explain why the `<=` is correct at equal times.
- You distinguish the plain stack from the monotonic stack on sight: nesting and evaluation here; "next greater" and "nearest smaller" there.
- You know the `<=` versus `<` trap in a parallel-min-stack, and you reach for the pairs version under time pressure because it cannot be wrong.

## Check yourself

```quiz
- q: >-
    Why does counting opens and closes per bracket type fail as a validity check for strings like "([)]"?
  options: ["It cannot handle more than one bracket type at once", "Counting per type costs O(n²) once several types are mixed", "It ignores order, and the last opened must close first", "It fails only on strings whose length is odd"]
  answer: 2
  explanation: >-
    Counts are equal for "([)]" yet the string is invalid because ")" arrives while "[" is the innermost open bracket. The stack enforces order, which counts cannot see.
- q: >-
    In Decode String, what state must be saved when you encounter "[" so that the outer context is restored correctly after the matching "]"?
  options: ["The index of the bracket, to rescan from it after ']'", "The count and the string built so far, then reset both", "Only the string built so far, since counts are re-read", "Only the repeat count, since the string is rebuilt later"]
  answer: 1
  explanation: >-
    The count applies to the substring inside this bracket pair, and the string built before it must be prepended afterwards. Both go on the stack; forgetting to reset either leaks outer content into the inner segment.
- q: >-
    A min-stack uses a parallel stack that pushes a value only when it is strictly less than the current minimum. What breaks?
  options: ["getMin becomes O(n), since duplicates must be rescanned", "Nothing; a strict comparison is correct and saves memory", "Pushing 2, 2 then popping once loses the only min record", "Push becomes O(log n), since the min stack must stay sorted"]
  answer: 2
  explanation: >-
    With strict less-than, the second 2 is never recorded. Popping one 2 pops the min record, and the remaining 2 in the main stack has no minimum entry, so getMin becomes wrong. Use less-than-or-equal on push; the complexity of every operation is unaffected.
- q: >-
    In Car Fleet, the car at position 3 (speed 3, alone-arrival 3.0) is behind a fleet arriving at 7.0. Which time does the stack keep for deciding whether the next car behind joins?
  options: ["5.0, the average of the two arrival times", "Both, pushed as separate entries for later cars", "3.0, because the faster car now leads the fleet", "7.0, because the car is held to the fleet ahead"]
  answer: 3
  explanation: >-
    A car that catches a fleet cannot pass it, so its effective arrival time becomes the fleet's. The stack stores the fleet head's time; the joining car is not pushed at all.
- q: >-
    Evaluating the RPN tokens ["6", "-132", "/"] should give 0. Which implementation detail matters?
  options: ["Use floating point throughout and round at the end", "Truncate towards zero, and pop the right operand first", "Use floor division, then pop the right operand first", "Truncate towards zero, and pop the left operand first"]
  answer: 1
  explanation: >-
    Floor division gives -1 for 6 / -132; the problem wants truncation towards zero, which is int(a / b) in Python or Math.trunc in JavaScript. The first pop is the right operand and the second pop is the left, because operands were pushed in order; popping them the other way round computes -132 / 6.
```
