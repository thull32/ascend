---
slug: testing-your-own-code
title: "Testing your own code: edge cases, hand traces and reading errors"
description: An edge-case taxonomy applied row by row to two real problems, with what each plausible bug actually returns; the hand-trace table that catches off-by-ones on a whiteboard; how the test harness compares your answer and how property-based tools shrink a failure; and how to read an error message instead of guessing.
minutes: 50
difficulty: easy
tags: [testing, edge-cases, debugging, tracing, interview]
problems: [merge-intervals, valid-palindrome, valid-parentheses]
---
"It works on the example." Every failed interview submission and a large fraction of production bugs share that sentence. The example in the problem statement is the one input the author guaranteed to be friendly: non-empty, no duplicates, no negatives, a clean answer. Real inputs and hidden tests are none of those things, and the gap between "works on the example" and "works" is where the marks and the incidents live.

Testing your own code is a skill with two halves. The first is *generating* inputs that could break it, a taxonomy you can learn in an afternoon and run through in a minute. The second is *executing* your code against those inputs without a computer, by tracing it in a table, the only test runner available on a whiteboard and the fastest one everywhere else for small inputs. This lesson covers both on two real problems, then what a test harness does with your return value, plus the skill everyone assumes and nobody teaches: reading what the error output says.

## The edge-case taxonomy

Edge cases are not random. They come from a short list of ways an input can be degenerate, and the list is the same for every problem. Run through it in order, and for each category ask "does my code do the right thing, and what *is* the right thing?" Half the value is discovering that the statement did not say.

| Category | Cases | What it typically breaks |
|---|---|---|
| **Size** | Empty; one element; two elements; exactly the maximum `n` | Loops that assume `n ≥ 1`; `nums[0]` on empty; `hi = n - 1` becoming `-1`; quadratic solutions at max `n` |
| **Extremes of value** | Zero; negative; the maximum/minimum representable integer; very large `n` with tiny values | Sign assumptions; overflow in fixed-width languages; `abs(INT_MIN)` |
| **Repetition** | All elements equal; duplicates of the target; the answer appears twice | Uniqueness assumptions; "first occurrence" versus "any occurrence"; set-based deduping that loses counts |
| **Order** | Already sorted; reverse sorted; a single out-of-place element | Best/worst cases for quicksort-like code; algorithms that silently assumed sortedness |
| **Boundaries of the answer** | Answer at index 0; at index `n − 1`; answer is the whole input; no answer exists | Off-by-one on the last iteration; forgetting the "not found" return |
| **Structure** | Touching intervals (`[1,2]` and `[2,3]`); nested intervals; a tree that is a single chain; a graph with self-loops, disconnected parts, or one node | `<` versus `<=` on boundaries; recursion depth; unvisited components |
| **Strings** | Empty; single character; all one character; only non-alphanumerics; mixed case; whitespace at the ends | Case handling; filters that leave an empty string; indexing past the end after filtering |
| **Contract** | Input the statement says cannot happen (null, unsorted when sorted is promised) | Whether you validate or assume; state your choice out loud |

You will not test every row for every problem. The point is to *look* at every row and pick the three or four that this problem makes dangerous. Notice what the taxonomy is *not*: it is not "think of random inputs". Random inputs almost never hit a boundary. Every row above is a boundary. The two walkthroughs below apply every row to a real problem, with the input, the expected output, and what a plausible bug returns instead; every "bug returns" entry was produced by running that bug.

## Walkthrough 1: merge intervals

> Given a list of `[start, end]` intervals in any order, merge every overlapping or touching pair and return the result sorted by start.

This is [Merge Intervals](/practice/merge-intervals). The [problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop) first, then the taxonomy.

### From statement to sorted sweep

**Understand:** "touching" means `[1, 4]` and `[4, 5]` merge (they share the point 4), so the overlap test is `<=`; output order is by start; the statement should say whether `start > end` can occur (assume not). **Examples:** `[[1, 3], [2, 6], [8, 10], [15, 18]]` → `[[1, 6], [8, 10], [15, 18]]`; `[[1, 4], [4, 5]]` → `[[1, 5]]`; `[[1, 10], [2, 3], [4, 5], [6, 12]]` → `[[1, 12]]`; `[]` → `[]`.

**Brute force:** compare every pair, merge any that overlap, repeat until a pass changes nothing: $n(n-1)/2$ comparisons per pass, and up to $n$ passes when merges cascade. At $n = 10^4$ one pass is $5 \times 10^7$ comparisons, seconds in CPython, and a cascading input multiplies that. The repeated work: after sorting by start, the only interval the next one can overlap is the *last merged one*, because everything earlier ended before it started. That single observation turns the pass into a sweep.

**Optimise:** sort by start, $O(n \log n)$, then one pass: extend the last merged interval or start a new one, $O(n)$. Total $O(n \log n)$ time, $O(n)$ output.

```python
def merge_intervals(intervals):
    if not intervals:
        return []
    intervals = sorted(intervals)             # by start, then end
    merged = [list(intervals[0])]
    for start, end in intervals[1:]:
        last = merged[-1]
        if start <= last[1]:                  # overlap or touch
            last[1] = max(last[1], end)       # not `end`: a nested interval must not shrink it
        else:
            merged.append([start, end])
    return merged
```

### Trace

Trace it on `[[1, 10], [2, 3], [4, 5]]`, chosen because the "nested interval" row of the taxonomy looks dangerous:

| Iteration | `start, end` | `last` before | `start <= last[1]`? | `last` after | `merged` |
|---|---|---|---|---|---|
| init | – | – | – | – | `[[1,10]]` |
| 1 | `2, 3` | `[1,10]` | `2 <= 10` yes | `[1, max(10,3)] = [1,10]` | `[[1,10]]` |
| 2 | `4, 5` | `[1,10]` | `4 <= 10` yes | `[1,10]` | `[[1,10]]` |

Returns `[[1, 10]]`. Now the tempting bug, `last[1] = end` instead of `max(last[1], end)`: row 1 sets `last` to `[1, 3]`, row 2 finds `4 <= 3` false and appends `[4, 5]`, and the function returns `[[1, 3], [4, 5]]`. The trace catches it in under a minute, and the input that catches it was chosen from the taxonomy, not by luck. The statement's own example, traced the same way, produces `[1, 6]` at iteration 1 and appends at iterations 2 and 3; it passes under the bug too, because no interval in it is nested.

### Every row, applied

Four plausible bugs were run against every row: `end` instead of `max` (**E**), strict `<` instead of `<=` (**S**), a forgotten sort (**N**), and no empty guard (**G**).

| Row | Input | Expected | Plausible bug | The bug returns |
|---|---|---|---|---|
| Size: empty | `[]` | `[]` | **G**: `merged = [intervals[0]]` | `IndexError` |
| Size: one | `[[1, 4]]` | `[[1, 4]]` | seeding with `intervals[1]` | `IndexError`; all four variants above pass, so this row tests only the return path |
| Size: two | `[[1, 3], [2, 6]]` | `[[1, 6]]` | starting the loop at `intervals[2:]` | `[[1, 3]]` |
| Size: max `n` | 10⁴ intervals | the merged list | the pairwise brute force | $5 \times 10^7$ comparisons per pass: time limit |
| Extremes: negatives | `[[-5, -1], [-3, 2]]` | `[[-5, 2]]` | none of the four fail | clears the code of sign assumptions in one line |
| Extremes: zero-width | `[[2, 2], [1, 1]]` | `[[1, 1], [2, 2]]` | **N** | `[[2, 2]]`, because `1 <= 2` swallows the second |
| Extremes: huge values | `[[0, 10⁹], [10⁹, 10⁹ + 1]]` | `[[0, 10⁹ + 1]]` | **S** | two intervals; no sums here, so no overflow row |
| Repetition: duplicates | `[[1, 3], [1, 3], [1, 3]]` | `[[1, 3]]` | none of the four fail | a set-based dedupe would also pass here and lose counts elsewhere |
| Order: reverse sorted | `[[5, 6], [3, 4], [1, 2]]` | `[[1, 2], [3, 4], [5, 6]]` | **N** | `[[5, 6]]`: every later start is `<= 6` |
| Order: one out of place | `[[1, 2], [5, 6], [3, 4]]` | `[[1, 2], [3, 4], [5, 6]]` | **N** | `[[1, 2], [5, 6]]`: `[3, 4]` is absorbed |
| Answer: everything merges | `[[1, 10], [2, 3], [4, 5]]` | `[[1, 10]]` | **E** | `[[1, 3], [4, 5]]` |
| Answer: nothing merges | `[[1, 2], [3, 4]]` | unchanged | treating adjacent integers as touching (`start <= last[1] + 1`) | `[[1, 4]]` |
| Structure: touching | `[[1, 2], [2, 3]]` | `[[1, 3]]` | **S** | `[[1, 2], [2, 3]]` |
| Structure: nested | `[[1, 10], [2, 3]]` | `[[1, 10]]` | **E** | `[[1, 3]]` |
| Structure: chain | `[[1, 3], [2, 5], [4, 7]]` | `[[1, 7]]` | none of the four fail | **E** survives a chain because ends increase; only nesting exposes it |
| Strings | not applicable | | | say so and move on |
| Contract: `start > end` | `[[3, 1]]` | forbidden by the statement | the sweep returns `[[3, 1]]` unchanged | decide aloud: validate, normalise, or assume |

Three things to read off the table. Each bug is caught by a different row and no row catches all four, which is why the taxonomy is a list and not a favourite input. The "chain" row passes the `end` bug that the "nested" row fails: a test that looks like it covers the merge logic can miss the one line that matters. And two rows fail nothing, which is still information: ten seconds established that the code is sign-agnostic and count-agnostic.

## Walkthrough 2: balanced brackets

> Given a string of `()[]{}`, return whether every opener is closed by the matching closer in the right order.

This is [Valid Parentheses](/practice/valid-parentheses). **Understand:** `([)]` is not balanced even though counts match; the empty string is balanced; assume only bracket characters. **Examples:** `"()[]{}"` → true; `"{[]}"` → true; `"([)]"` → false.

**Brute force:** delete any adjacent matching pair, repeat until nothing changes, balanced if the string is empty. Each pass is $O(n)$ and a fully nested string needs $n/2$ passes: measured on `"(" * 5000 + ")" * 5000` (CPython 3.14.7, `str.replace` doing each pass in C), 5,001 passes and 73 ms; in pure Python the scan would be seconds. **Bottleneck:** every pass rescans characters whose fate is already known. The most recently opened bracket is the only one the next closer can match, which is last-in-first-out. **Optimise:** a stack of openers; $O(n)$ time, $O(n)$ space when the input is all openers; measured 0.22 ms on the same input.

```python
PAIRS = {")": "(", "]": "[", "}": "{"}

def is_valid(s: str) -> bool:
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        else:
            if not stack or stack[-1] != PAIRS[ch]:   # empty-stack check before the pop
                return False
            stack.pop()
    return not stack                                  # leftover openers are unbalanced
```

```viz
{"type": "stack-queue", "algorithm": "balanced-parentheses", "input": "([]{})", "title": "Tracing a stack by hand", "caption": "Each opener pushes, each closer must match the top; the answer is whether the stack is empty at the end."}
```

**Trace** on `"([]{})"`:

| `ch` | Action | Stack after |
|---|---|---|
| `(` | push | `[ ( ]` |
| `[` | push | `[ ( [ ]` |
| `]` | top `[` matches, pop | `[ ( ]` |
| `{` | push | `[ ( { ]` |
| `}` | top `{` matches, pop | `[ ( ]` |
| `)` | top `(` matches, pop | `[ ]` |

Stack empty at the end: true. The taxonomy, applied more briefly, with three bugs run against it: popping without the empty check (**P**), forgetting the leftover check and returning true after the loop (**L**), and per-type counters instead of a stack (**C**):

| Row | Input | Expected | Bug | Returns |
|---|---|---|---|---|
| Size: empty | `""` | true | requiring a non-empty input | false |
| Size: one, opener | `"("` | false | **L** | true |
| Size: one, closer | `")"` | false | **P** | `IndexError: pop from empty list` |
| Size: max `n`, nested | 5,000 `(` then 5,000 `)` | true | a recursive matcher, one frame per nesting level | `RecursionError` past the default 1,000 frames |
| Repetition: all one char | `"(((("` | false | **L** | true |
| Structure: mismatched types | `"(]"` | false | a single counter ignoring type | true |
| Structure: interleaved | `"([)]"` | false | **C** | true: every counter ends at zero |
| Contract: other characters | `"(a)"` | forbidden | `PAIRS[ch]` on `a` | `KeyError` |

The interleaved row is the one that separates a stack from a counter, and it is the row the statement's third example already contains; the single-closer row is where most first attempts throw.

## Which edge cases to raise before coding

Several rows are questions about the specification, and the right time to ask them is in the *understand* step, not after the code is written: can the input be empty and what is the answer then; are `[1, 2]` and `[2, 3]` overlapping (the code differs by one character); if several answers are valid, does any one do, or the first, or the smallest; are values bounded, so that a Java or Go solution needs a wider type for sums while Python does not. Asking these is not stalling. An interviewer would rather spend forty seconds on them than watch you solve the wrong problem; [Clarifying and scoping](/learn/interview-patterns/interview-execution/clarifying-and-scoping) has the full list.

## Hand-tracing: the whiteboard test runner

A hand trace is a table with one column per variable and one row per iteration, filled in by executing your code line by line on a *small* input chosen from the taxonomy. It is slow for large inputs and useless for performance questions. For correctness on inputs of size two to six it is faster than typing, and it works with no computer. Three rules make traces reliable:

1. **Trace the code you wrote, not the code you meant.** The bug is always in the gap between the two. Read each line from the screen or board as you execute it.
2. **Write every variable every row**, even the ones that did not change. Skipping columns is how you lose track of `left` while watching `right`.
3. **Pick the input for the bug you suspect.** A two-element input tests initialisation and the last iteration; an input with the answer at index 0 tests the state before the loop; a nested interval tests the `max`.

## Generating tests systematically

When you have a computer, the taxonomy becomes a checklist you encode, and two techniques go beyond hand-picked cases.

**Brute-force cross-checking.** You wrote a brute force in step 3 of the loop. It is slow but you trust it. Generate a few hundred small random inputs, run both, and compare.

```python
import random

def check(fast, slow, trials=500):
    for _ in range(trials):
        n = random.randint(0, 5)
        xs = [sorted([random.randint(0, 8), random.randint(0, 8)]) for _ in range(n)]
        assert fast(xs) == slow(xs), (xs, fast(xs), slow(xs))
```

Keep `n` small: the point is coverage of *shapes*, and small inputs hit empty, single, duplicate and all-equal cases constantly. Run against the `end`-instead-of-`max` bug with the seed used for this lesson, the check fails on the second trial with `[[2, 7], [1, 7], [2, 4], [1, 8]]`: the bug returns `[[1, 7]]`, the sweep `[[1, 8]]`. Four intervals is more than a hand trace wants, which is what shrinking is for, below.

**Property tests.** For some problems you cannot write a brute force but you can state properties of any correct output. Merged intervals must be sorted by start, pairwise non-overlapping and non-touching, and cover exactly the same set of points as the input. A sort's output must be a permutation of the input and be non-decreasing. Checking the properties is often trivial even when computing the answer is not. The same idea runs at fleet scale: automated canary analysis, which Netflix open-sourced as Kayenta, compares a new deployment's metrics against the baseline's, a property test whose output is a service.

## Under the hood: what the harness does with your answer

### How the comparison works

When you press Run on an exercise here, your return value is not compared with `==`. Both harnesses canonicalise the expected and actual values and compare the resulting strings, so the canonical form decides what counts as equal (from `web/src/runner/harness.ts` and its Python mirror in `py.worker.ts`):

- **`undefined` becomes `null`.** A JavaScript function that forgets to `return` produces `undefined`, which canonicalises to `null` and matches an `expected: null`, and nothing else.
- **Tuples become lists; sets become lists.** Python's `(0, 1)` is encoded as `[0, 1]` and matches `[0, 1]`. A returned `set` is encoded in its iteration order, which the language does not specify, so a set-valued answer compared without `any_order: true` can pass on one run and fail on the next.
- **Floats are rounded to six decimal places, and integral floats collapse to integers.** `0.1 + 0.2` (which is `0.30000000000000004` in both languages) matches `0.3`; Python's `2.0` matches `2`; `0.9999999999999998` becomes `1`. JavaScript has no separate integer type, so `JSON.stringify(1.0)` is already `1`.
- **`NaN` never equals itself in either language** (`NaN === NaN` is `false`; `float("nan") == float("nan")` is `False`; JavaScript's `[NaN].includes(NaN)` is `true` while `[NaN].indexOf(NaN)` is `-1`, two equality algorithms in one runtime). Through the harness the two languages diverge: `JSON.stringify(NaN)` is `null`, so a JavaScript `NaN` matches an expected `null`; Python's `json.dumps` writes the text `NaN`, which no expected value can contain, so a Python `NaN` matches nothing.
- **Object keys are sorted, `Map` becomes a plain object, `Set` becomes an array**; without that step `JSON.stringify(new Map([[1, 2]]))` is `{}`. An empty tagged list or tree (`{"$list": []}`) becomes `null`. Anything Python cannot encode falls through to `str(v)`, so a custom class returns its repr and never matches.
- **`any_order: true`** sorts the canonical strings of the elements on both sides, a multiset comparison.
- **Arguments are deep-copied per test** in the JavaScript worker (`JSON.parse(JSON.stringify(args))`), so a solution that sorts its input in place cannot corrupt the next test.

Most of this is invisible when your code is right. It matters the moment a result is "wrong" for a reason that is not the algorithm: a forgotten `return`, a set where a list was expected, a float printed with sixteen digits.

### How property-based tools shrink a failure

A random counterexample is rarely the smallest one. Property-based testing libraries add a shrinking phase: after the first failure they search for a simpler input that still fails, re-running the test on each candidate. Hypothesis (Python) records the sequence of random choices that produced the failing input and shrinks *that sequence*, deleting chunks and lowering values while the test keeps failing, then reports a "Falsifying example" and saves it to a local database so the next run replays it first. fast-check (JavaScript) attaches a shrink tree to each arbitrary (integers shrink towards 0, arrays by dropping elements) and reports the counterexample with a `seed` and `path` to replay. Neither library is installed in the browser runtime, so here is the mechanism by hand, applied to the counterexample above: delete an interval while the bug still fails, then decrement numbers towards 0 while it still fails.

```text
[[2, 7], [1, 7], [2, 4], [1, 8]]     trial 2 of the random check
[[1, 7], [2, 4], [1, 8]]             delete
[[2, 4], [1, 8]]                     delete
[[2, 3], [1, 8]] ... [[1, 1], [0, 8]] shrink values
[[1, 1], [0, 2]]                     minimal after 27 candidate runs
```

The minimal case, `[[1, 1], [0, 2]]`, is the "nested" row of the taxonomy with the smallest possible numbers: the bug returns `[[0, 1]]`, the sweep `[[0, 2]]`. That is a two-row hand trace, and it names the bug (`end` overwrote a larger end) without a debugger. Twenty-seven runs of a millisecond function is nothing; the libraries typically spend a few hundred.

## Hand trace, print, debugger, property test

| | Hand trace | Print statements | Debugger | Brute-force or property check |
|---|---|---|---|---|
| Needs | pen or whiteboard | a runtime | a runtime and a breakpoint | a runtime and an oracle or property |
| Input size it handles | 2 to 6 elements | any | any, but one path at a time | hundreds of small cases |
| Finds | off-by-ones, wrong initial state, wrong branch | the iteration where state goes wrong | the exact line, with all variables | the *existence* of a bug and a small case |
| Cost to set up | one minute | thirty seconds | minutes, less with an IDE | ten lines, once per problem |
| Output | a table you can show the interviewer | a machine-generated trace table | a live view | a minimal counterexample |
| In an interview | the primary tool | if a runtime is available | rarely | the mindset ("what would break this?") |

The mid-level habit is the debugger first and the trace never. The senior habit is the reverse: trace to find the bug on a tiny input, print to confirm it on the real one, the debugger when the state is too large to write down, and a differential check before shipping anything with a fast path.

## Reading error output

Most engineers glance at an error, guess, and change something. The error usually says exactly what happened; the skill is reading the right line.

- **Read the last line first, then the trace bottom-up.** Python and Node print the exception type and message last and the innermost frame above it. `IndexError: list index out of range` at `nums[hi]` says `hi` is `-1` or `n`, and both are taxonomy rows (empty input; `hi` initialised as `n`).
- **Distinguish your frames from library frames.** The topmost frames in your own file are where to look; a frame in `sorted` or `Map.get` means you passed something wrong *into* it.
- **`RecursionError` / `Maximum call stack size exceeded`** means a missing base case or an input deeper than the default limit (1,000 frames in CPython; on the order of 10,000 in V8 for a simple function). A linked list of 10⁵ nodes traversed recursively will hit it; see [the call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack).
- **`TypeError: unsupported operand` / `undefined is not a function`** is almost always a value that was `None` or `undefined` because a lookup missed. Trace back to the lookup.
- **Wrong answer, no error** is the hard case, and it is the one hand traces exist for. Print the loop variables per iteration on the failing input; that is a machine-generated trace table.
- **Time limit exceeded** is usually not a bug in the code path; it is the complexity or an accidental $O(n)$ inside the loop (`list.pop(0)`, `in` on a list, string concatenation in a loop, slicing). Look for hidden linear operations before rewriting the algorithm. On this platform the limit is enforced by terminating the worker after a whole-run budget (`time_limit_ms × tests + 2,000 ms` for JavaScript), so an infinite loop in test 1 of 8 is reported after about 34 s and the passed results die with the worker.

Interviewers notice how you react to an error. Reading it aloud, naming the line, and stating the hypothesis ("`hi` is negative, so the empty-input path is wrong") is a senior signal. Changing a `<` to `<=` and re-running is not.

## Failure modes in production

**The flaky test.** *Symptom:* a test passes locally and fails one run in five in CI, with the same elements in a different order. *Diagnosis:* the function returns a `set` or iterates a dict built in a data-dependent order, and the assertion compares ordered lists; hash randomisation (on by default for strings in CPython) changes the order between processes. *Fix:* return a list in a defined order, or compare as multisets (`any_order: true` here, `sorted()` in a unit test).

**The float that is not equal.** *Symptom:* expected `0.3`, got `0.30000000000000004`; expected `1`, got `0.9999999999999998`. *Diagnosis:* binary floating point cannot represent most decimals, and a chain of operations accumulates a few ulps of error. *Fix:* compare with a tolerance (`math.isclose`, `abs(a - b) < 1e-9`) or round to the precision the problem asks for; this harness rounds to six places for that reason.

**The test that passes against code you deleted.** *Symptom:* you rename `two_sum` to `twosum` and the tests still pass; a helper you removed keeps working. *Diagnosis:* the runner executed every submission in one shared namespace, so the stale definition survived from the previous run; this platform's Python worker had exactly that bug, described in [Running code in the browser](/learn/case-study-ascend/product-systems/running-code-in-the-browser). *Fix:* a fresh namespace per run, and in your own test suites, no module-level state shared between tests.

**The input mutated by the test before.** *Symptom:* test 2 fails only when run after test 1, and passes alone. *Diagnosis:* the solution sorts its argument in place and the fixture list is shared. *Fix:* copy inputs per test, which the JavaScript worker does with a JSON round trip; in your own suites, build fixtures inside the test or use a copying fixture factory.

## The two-minute test protocol for interviews

There is no test runner in most interviews. This procedure replaces it and fits in the last five minutes of a 45-minute round; [Testing live](/learn/interview-patterns/interview-execution/testing-live) covers the delivery.

1. Trace the statement's example through your code in a table. Aloud.
2. Pick the three most dangerous taxonomy rows for this problem and say why they are dangerous.
3. Trace the smallest input from each. For "empty" this is usually a one-line observation ("the loop does not run and we return the initial value, which is 0").
4. State what you did not test and why it is safe, or say that you would add it given more time.

Doing this reliably is a bigger differentiator than solving a harder problem. It shows the interviewer that when your code ships, it will have been tested by someone who knows where bugs live.

## Exercises

```exercise
id: merge-intervals-tested
title: Merge intervals against the edge-case taxonomy
prompt: |
  Given a list of `[start, end]` intervals in any order, merge every
  overlapping or touching pair and return the merged list sorted by start.
  `[1, 2]` and `[2, 3]` touch and merge into `[1, 3]`. The tests are drawn
  from the taxonomy in this lesson; trace the contained-interval case by
  hand before you submit.
languages: [python, javascript]
entry: merge_intervals
starter:
  python: |
    def merge_intervals(intervals):
        # your code here
        return []
  javascript: |
    function merge_intervals(intervals) {
      // your code here
      return [];
    }
tests:
  - args: [[[1, 3], [2, 6], [8, 10], [15, 18]]]
    expected: [[1, 6], [8, 10], [15, 18]]
  - args: [[[1, 4], [4, 5]]]
    expected: [[1, 5]]
    label: touching intervals merge
  - args: [[]]
    expected: []
    label: empty input
  - args: [[[1, 4]]]
    expected: [[1, 4]]
    label: single interval
  - args: [[[1, 4], [2, 3]]]
    expected: [[1, 4]]
    label: fully contained interval
  - args: [[[5, 6], [1, 2], [3, 4]]]
    expected: [[1, 2], [3, 4], [5, 6]]
    label: unsorted, nothing merges
  - args: [[[1, 10], [2, 3], [4, 5], [6, 7]]]
    expected: [[1, 10]]
    hidden: true
  - args: [[[2, 2], [1, 1]]]
    expected: [[1, 1], [2, 2]]
    hidden: true
hints:
  - "Sort by start first; then only the last merged interval can overlap the next one."
  - "When merging, extend the end with `max(last_end, end)`, not `end` alone, or a contained interval will shrink the merged range."
  - "Use `start <= last_end` so that touching intervals merge."
```

```exercise
id: palindrome-alnum
title: Palindrome after filtering
prompt: |
  Return `true` if `s` reads the same forwards and backwards after
  removing every character that is not a letter or digit (ASCII) and
  ignoring case. The empty string is a palindrome. Watch the taxonomy
  rows for strings: empty, single character, all punctuation, and a
  digit adjacent to a letter.
languages: [python, javascript]
entry: is_palindrome_alnum
starter:
  python: |
    def is_palindrome_alnum(s):
        # your code here
        return False
  javascript: |
    function is_palindrome_alnum(s) {
      // your code here
      return false;
    }
tests:
  - args: ["A man, a plan, a canal: Panama"]
    expected: true
  - args: ["race a car"]
    expected: false
  - args: [""]
    expected: true
    label: empty string
  - args: [" "]
    expected: true
    label: only non-alphanumerics leaves an empty string
  - args: ["0P"]
    expected: false
    label: digit next to a letter
  - args: ["Aa"]
    expected: true
    label: case-insensitive
  - args: ["ab_a"]
    expected: true
    hidden: true
  - args: ["x"]
    expected: true
    hidden: true
hints:
  - "Filter to lowercase letters and digits first, then compare with the reverse, or use two pointers that skip non-alphanumerics."
  - "In JavaScript, `/[a-z0-9]/i.test(ch)` is a safe alphanumeric check; in Python use `ch.isalnum()`."
```

## Interviewer follow-ups

**"How would you test the merge without a brute force?"** *Model answer:* by properties any correct output must have: sorted by start, each start strictly greater than the previous end (no overlap, no touch), the union of covered points equal to the input's, and no more intervals than the input. Each is a few lines, and together they reject every bug in the table. *Common wrong answer:* "compare against the example", which the `end` bug passes.

**"The intervals are now half-open, `[start, end)`. What changes?"** *Model answer:* touching changes meaning: `[1, 2)` and `[2, 3)` share no point but are adjacent, so the statement must say whether adjacency merges; the code differs only in `<=` versus `<`, and I would add the touching row to the tests either way. *Common wrong answer:* "nothing, the algorithm is the same", which skips the one-character decision the taxonomy exists to surface.

**"You returned a tuple. Will the checker accept it?"** *Model answer:* here, yes, because the harness encodes tuples as JSON lists before comparing; a set would not be safe, because its iteration order is unspecified and the comparison is ordered unless the test says otherwise; and a custom object falls through to its string form and never matches. I would return the type the statement names. *Common wrong answer:* "a tuple and a list are different types, so no", which is true of `==` and not of this comparison.

**"Your recursive matcher failed at depth 5,000. What now?"** *Model answer:* convert to an explicit stack, which is what the iterative bracket matcher already is; raising `sys.setrecursionlimit` trades a clean error for a possible interpreter crash, and V8 offers no equivalent. The taxonomy's "max n" row exists to find this before the hidden test does. *Common wrong answer:* raising the recursion limit and calling it fixed.

**"A test fails on CI but passes on your machine. First hypothesis?"** *Model answer:* order-dependence: a set or dict iteration order under hash randomisation, or state shared between tests through a mutated fixture or a module-level variable; I would run the failing test alone, then in the CI order, and diff the two outputs before touching the code. *Common wrong answer:* "CI is flaky, rerun it".

## What mid-level engineers get wrong

- **Testing the example and stopping.** The example is chosen to explain the problem, not to break code; the `end` bug passes the statement's example and fails on the first nested interval.
- **Generating random inputs without boundaries.** Random intervals over a large range almost never nest or touch; the shrunk counterexample `[[1, 1], [0, 2]]` is what small ranges and shrinking find in 27 runs.
- **Tracing the code they meant.** The trace shows the algorithm working while the code on the screen has `end` where `max` should be; rule one exists because this is the most common trace failure.
- **Changing the code before reading the error.** Toggling `<` to `<=` after an `IndexError` fixes nothing; the error named the index and the row.
- **Comparing floats with `==`.** `0.1 + 0.2 == 0.3` is `False` in every IEEE-754 language; a tolerance or a rounding rule is part of the test, not an afterthought.
- **Ending without saying what was not tested.** The interviewer then has to assume nothing was; one sentence listing the untested rows and why they are safe changes the grade.

## Senior signals

- You ask the specification questions (empty input, touching intervals, ties) before coding, and you name the row of the taxonomy each test is drawn from.
- You trace by hand on a two- or three-element input chosen to hit the boundary you suspect, and you trace the code as written, not as intended.
- You know which taxonomy row catches which bug in your own code, and which rows are cheap confirmation rather than coverage.
- You cross-check an optimised solution against the brute force on small random inputs, you shrink a failing case to a hand-traceable one, and you can state output properties when no brute force is practical.
- You know how the checker compares results (canonical JSON, tuples as lists, floats rounded, `undefined` as `null`, sets unordered) and return the type the statement names.
- You read an error from the last line up, identify the frame in your own code, and state a hypothesis before changing anything.
- You treat time-limit failures as a search for hidden linear operations before rewriting the algorithm.
- You end an interview solution by saying what you tested, what you did not, and why the untested cases are safe.

## Check yourself

```quiz
- q: >-
    A merge-intervals solution passes the statement example but fails a hidden test. Which input from the taxonomy is most likely to expose a bug in the merge step specifically?
  options: ["An empty list, which has nothing to merge at all", "Intervals that already arrive sorted by their start", "A single interval, with nothing to merge it against", "An interval nested inside the previous merged one"]
  answer: 3
  explanation: >-
    A contained interval has a smaller end than the current merged end; code that sets the end to the new interval's end (instead of the max) shrinks the merged range and later intervals wrongly fail to merge. Empty and single inputs test setup and return paths, not the merge logic, and a chain of increasing ends passes the same bug.
- q: >-
    Your Python solution throws `IndexError: list index out of range` on the line `while nums[hi] > target`. What is the most likely cause?
  options: ["hi starts at len(nums), or the input list is empty", "hi became a float from / division, not an int", "Python cannot index a list inside a while condition", "target is larger than every element in the array"]
  answer: 0
  explanation: >-
    An index error names the index that is out of range; both the size row (empty input, so hi is -1 and there is nothing to index) and the boundary row (hi initialised to len(nums) rather than len(nums) - 1) produce it. A float index would raise TypeError, not IndexError, and a target above every element skips the loop. Reading the failing line and asking which value of hi could be out of range leads straight to the initialisation.
- q: >-
    Why should hand traces use inputs of size two to six rather than the statement example?
  options: ["Hidden tests mostly use small inputs, so they matter most", "The statement example is guaranteed to pass already", "Small inputs run faster, so you get results sooner", "Boundaries show up at once, and the trace stays accurate"]
  answer: 3
  explanation: >-
    The bugs a trace can find live at boundaries (initialisation, last iteration, empty), which a two-element input reaches immediately; a nine-element trace is long enough that you start making errors in the trace itself. The statement example is usually chosen to be friendly rather than boundary-hitting, which is why passing it proves little.
- q: >-
    A solution is correct but reports "time limit exceeded". Which should you check first?
  options: ["Hidden linear operations in the loop, such as `pop(0)`", "Whether the recursion is too deep for the default stack", "Whether the judge's test inputs are malformed or huge", "Whether the language is too slow for this problem"]
  answer: 0
  explanation: >-
    An O(n) operation inside an O(n) loop (`pop(0)`, `x in list`, slicing, string concatenation) silently makes an O(n^2) solution, and it is the most common cause of a timeout on an algorithm that is otherwise right. Language constants rarely account for a factor of n. Recursion depth produces a stack error, not a timeout.
- q: >-
    You cannot write a brute force for a problem but want to test your solution on random inputs. What can you do?
  options: ["Compare against the same function run a second time", "Test only the statement example, which is verified", "Check properties every correct output must satisfy", "Nothing; random testing always needs an oracle"]
  answer: 2
  explanation: >-
    Property-based checks replace an oracle with invariants of the output, such as sortedness, non-overlap and covering the same points. They are often trivial to write even when the answer is hard to compute, and a violated property on a small random input gives you a minimal case to trace by hand. Running the same function twice only tests determinism.
- q: >-
    Your Python solution returns the tuple (0, 1) and the test expects [0, 1]. Your JavaScript version forgets its return statement on one path. What does the harness report?
  options: ["The tuple fails as a wrong type; undefined passes as an empty result", "The tuple passes as a list; the undefined becomes null and fails", "Both pass: the harness ignores return types and missing returns", "Both fail: a tuple is not a list and undefined is not null"]
  answer: 1
  explanation: >-
    The Python harness encodes tuples as JSON lists before comparing, so (0, 1) canonicalises to [0, 1] and matches. The JavaScript harness turns undefined into null, which only matches a test whose expected value is null; against [0, 1] it fails. Knowing the canonical form tells you which failures are the algorithm and which are the return value's shape.
```
