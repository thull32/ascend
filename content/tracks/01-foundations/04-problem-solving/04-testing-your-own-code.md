---
slug: testing-your-own-code
title: "Testing your own code: edge cases, hand traces and reading errors"
description: An edge-case taxonomy you can run through in a minute, the hand-trace table that catches off-by-ones on a whiteboard, and how to read an error message instead of guessing.
minutes: 45
difficulty: easy
tags: [testing, edge-cases, debugging, tracing, interview]
problems: [merge-intervals, valid-palindrome, valid-parentheses]
---
"It works on the example." Every failed interview submission and a large fraction of production bugs share that sentence. The example in the problem statement is the one input the author guaranteed to be friendly: non-empty, no duplicates, no negatives, a clean answer. Real inputs and hidden tests are none of those things, and the gap between "works on the example" and "works" is where the marks and the incidents live.

Testing your own code is a skill with two halves. The first is *generating* inputs that could break it, which is a taxonomy you can learn in an afternoon and run through in a minute. The second is *executing* your code against those inputs without a computer, by tracing it in a table, which is the only test runner available on a whiteboard and the fastest one everywhere else for small inputs. This lesson covers both, plus the third skill everyone assumes and nobody teaches: reading what the error output actually says.

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

You will not test every row for every problem. The point is to *look* at every row and pick the three or four that this problem makes dangerous. For a merge-intervals problem that is: empty, single interval, touching intervals, an interval fully inside another, and unsorted input. For a palindrome-with-filtering problem: empty, a string that is entirely punctuation, mixed case, and a digit next to a letter.

Notice what the taxonomy is *not*: it is not "think of random inputs". Random inputs almost never hit a boundary. Every row above is a boundary.

## Which edge cases to raise before coding

Several rows are really questions about the specification, and the right time to ask them is in the *understand* step of the [problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop), not after the code is written.

- Can the input be empty, and what is the answer then? (An empty list of intervals merges to an empty list; the longest substring of `""` is 0; the maximum subarray of `[]` is undefined and you should say so.)
- Are `[1, 2]` and `[2, 3]` overlapping? Most statements say yes; some say no. The code differs by one character.
- If there are several valid answers, does any one do, or the first, or the lexicographically smallest?
- Are values bounded? If sums can exceed 2³¹, a Java or Go solution needs a wider type; a Python solution does not care.

Asking these questions is not stalling. An interviewer would rather spend forty seconds on them than watch you write a solution to the wrong problem.

## Hand-tracing: the whiteboard test runner

A hand trace is a table with one column per variable and one row per iteration. You fill it in by executing your code, line by line, in your head, on a *small* input, chosen from the taxonomy. It is slow for large inputs and useless for performance questions. For correctness on inputs of size two to six it is faster than typing, and it works with no computer.

Consider a merge-intervals implementation:

```python
def merge_intervals(intervals):
    if not intervals:
        return []
    intervals = sorted(intervals)
    merged = [list(intervals[0])]
    for start, end in intervals[1:]:
        last = merged[-1]
        if start <= last[1]:              # overlap or touch
            last[1] = max(last[1], end)
        else:
            merged.append([start, end])
    return merged
```

Trace it on `[[1, 10], [2, 3], [4, 5]]`, chosen because the "contained interval" row of the taxonomy looks dangerous:

| Iteration | `start, end` | `last` before | `start <= last[1]`? | `last` after | `merged` |
|---|---|---|---|---|---|
| init | – | – | – | – | `[[1,10]]` |
| 1 | `2, 3` | `[1,10]` | `2 <= 10` yes | `[1, max(10,3)] = [1,10]` | `[[1,10]]` |
| 2 | `4, 5` | `[1,10]` | `4 <= 10` yes | `[1,10]` | `[[1,10]]` |

Returns `[[1, 10]]`. Correct. Now imagine the tempting bug where the code writes `last[1] = end` instead of `max(last[1], end)`. Row 1 would set `last` to `[1, 3]`, and row 2 would find `4 <= 3` false and append `[4, 5]`, returning `[[1, 3], [4, 5]]`. The trace catches it in under a minute, and the input that catches it was chosen from the taxonomy, not by luck.

Three rules make traces reliable:

1. **Trace the code you wrote, not the code you meant.** The bug is always in the gap between the two. Read each line from the screen or board as you execute it.
2. **Write every variable every row**, even the ones that did not change. Skipping columns is how you lose track of `left` while watching `right`.
3. **Pick the input for the bug you suspect.** A two-element input tests initialisation and the last iteration. An input with the answer at index 0 tests the "before the loop" state. A touching-intervals input tests the `<=`.

A stack trace by hand looks the same. For balanced parentheses on `"([]{})"`:

```viz
{"type": "stack-queue", "algorithm": "balanced-parentheses", "input": "([]{})", "title": "Tracing a stack by hand", "caption": "Each opener pushes, each closer must match the top; the answer is whether the stack is empty at the end."}
```

The taxonomy immediately suggests the cases the animation does not show: `""` (empty stack at end, balanced), `"("` (non-empty stack at end, not balanced), `")"` (closer with empty stack, must not crash), `"(]"` (mismatched top). The third one is where most first attempts throw an exception.

## Generating tests systematically

When you do have a computer, the taxonomy turns into a checklist you encode. Two techniques are worth knowing beyond hand-picked cases.

**Brute-force cross-checking.** You wrote a brute force in step 3 of the loop. It is slow but you trust it. Generate a few hundred small random inputs, run both, and compare.

```python
import random

def check(fast, slow, trials=500):
    for _ in range(trials):
        n = random.randint(0, 8)
        xs = [random.randint(-5, 5) for _ in range(n)]
        assert fast(xs) == slow(xs), (xs, fast(xs), slow(xs))
```

Keep `n` small: the point is coverage of *shapes*, and small inputs hit empty, single, duplicate and all-equal cases constantly. When it fails, you get a minimal counter-example, which is exactly what a hand trace needs.

**Property tests.** For some problems you cannot easily write a brute force but you can state properties of any correct output. Merged intervals must be sorted, non-overlapping, and cover exactly the same set of points as the input. A sort's output must be a permutation of the input and be non-decreasing. Checking the properties is often trivial even when computing the answer is not.

## Reading error output

Most engineers glance at an error, guess, and change something. The error usually says exactly what happened; the skill is reading the right line.

- **Read the last line first, then the trace bottom-up.** Python and Node print the exception type and message last and the innermost frame just above it. Start there: `IndexError: list index out of range` at `nums[hi]` tells you `hi` is `-1` or `n`, and both are taxonomy rows (empty input; `hi` initialised as `n`).
- **Distinguish your frames from library frames.** The topmost frames in your own file are where to look; a frame in `sorted` or `Map.get` means you passed something wrong *into* it.
- **`RecursionError` / `Maximum call stack size exceeded`** means either a missing base case or an input deeper than the default limit (about 1,000 frames in Python, roughly 10,000 in V8). A linked list of 10⁵ nodes traversed recursively will hit it; see [the call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack).
- **`TypeError: unsupported operand` / `undefined is not a function`** is almost always a value that was `None`/`undefined` because a lookup missed. Trace back to the lookup.
- **Wrong answer, no error** is the hard case, and it is the one hand traces exist for. Print the loop variables per iteration on the failing input; that is a machine-generated trace table.
- **Time limit exceeded** is not a bug in the code path; it is the complexity or an accidental $O(n)$ inside the loop (`list.pop(0)`, `in` on a list, string concatenation in a loop, slicing). Look for hidden linear operations before rewriting the algorithm.

Interviewers notice how you react to an error. Reading it aloud, naming the line, and stating the hypothesis ("`hi` is negative, so the empty-input path is wrong") is a senior signal. Changing a `<` to `<=` and re-running is not.

## The two-minute test protocol for interviews

There is no test runner in most interviews. This is the procedure that replaces it, and it fits in the last five minutes of a 45-minute round:

1. Trace the statement's example through your code in a table. Aloud.
2. Pick the three most dangerous taxonomy rows for this problem. Say why they are dangerous.
3. Trace the smallest input from each. For "empty" this is usually a one-line observation ("the loop doesn't run and we return the initial value, which is 0").
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
  - "When merging, extend the end with `max(last_end, end)`, not just `end`, or a contained interval will shrink the merged range."
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

## Senior signals

- You ask the specification questions (empty input, touching intervals, ties) before coding, and you name the row of the taxonomy each test is drawn from.
- You trace by hand on a two- or three-element input chosen to hit the boundary you suspect, and you trace the code as written, not as intended.
- You cross-check an optimised solution against the brute force on small random inputs, and you can state output properties when no brute force is practical.
- You read an error from the last line up, identify the frame in your own code, and state a hypothesis before changing anything.
- You treat time-limit failures as a search for hidden linear operations before rewriting the algorithm.
- You end an interview solution by saying what you tested, what you did not, and why the untested cases are safe.

## Check yourself

```quiz
- q: >-
    A merge-intervals solution passes the statement example but fails a hidden test. Which input from the taxonomy is most likely to expose a bug in the merge step specifically?
  options: ["A single interval, with nothing to merge it against", "Intervals that already arrive sorted by their start", "An empty list, which has nothing to merge at all", "An interval nested inside the previous merged one"]
  answer: 3
  explanation: >-
    A contained interval has a smaller end than the current merged end; code that sets the end to the new interval's end (instead of the max) shrinks the merged range and later intervals wrongly fail to merge. Empty and single inputs test setup and return paths, not the merge logic.
- q: >-
    Your Python solution throws `IndexError: list index out of range` on the line `while nums[hi] > target`. What is the most likely cause?
  options: ["Python cannot index a list inside a while condition", "hi starts at len(nums), or the input list is empty", "hi became a float from / division, not an int", "target is larger than every element in the array"]
  answer: 1
  explanation: >-
    An index error names the index that is out of range; both the size row (empty input, so hi is -1 and there is nothing to index) and the boundary row (hi initialised to len(nums) rather than len(nums) - 1) produce it. A float index would raise TypeError, not IndexError, and a target above every element simply skips the loop. Reading the failing line and asking which value of hi could be out of range leads straight to the initialisation.
- q: >-
    Why should hand traces use inputs of size two to six rather than the statement example?
  options: ["Hidden tests mostly use small inputs, so they matter most", "The statement example is guaranteed to pass already", "Boundaries show up at once, and the trace stays accurate", "Small inputs run faster, so you get results sooner"]
  answer: 2
  explanation: >-
    The bugs a trace can find live at boundaries (initialisation, last iteration, empty), which a two-element input reaches immediately; a nine-element trace is long enough that you start making errors in the trace itself. The statement example is usually chosen to be friendly rather than boundary-hitting, which is why passing it proves little.
- q: >-
    A solution is correct but reports "time limit exceeded". Which should you check first?
  options: ["Whether the language is simply too slow for this", "Whether the recursion is too deep for the default stack", "Hidden linear operations in the loop, such as `pop(0)`", "Whether the judge's test inputs are malformed or huge"]
  answer: 2
  explanation: >-
    An O(n) operation inside an O(n) loop (`pop(0)`, `x in list`, slicing, string concatenation) silently makes an O(n^2) solution, and it is the most common cause of a timeout on an algorithm that is otherwise right. Language constants rarely account for a factor of n. Recursion depth produces a stack error, not a timeout.
- q: >-
    You cannot write a brute force for a problem but want to test your solution on random inputs. What can you do?
  options: ["Check properties every correct output must satisfy", "Test only the statement example, which is verified", "Nothing; random testing always needs an oracle", "Compare against the same function run a second time"]
  answer: 0
  explanation: >-
    Property-based checks replace an oracle with invariants of the output, such as sortedness, non-overlap and covering the same points. They are often trivial to write even when the answer is hard to compute, and a violated property on a small random input gives you a minimal case to trace by hand. Running the same function twice only tests determinism.
```
