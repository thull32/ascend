---
lesson: testing-your-own-code
source: 25f8c9e40c449892
fit: great
desk:
  - "The edge-case taxonomy table"
  - "The merge-intervals code, its trace, and every taxonomy row run against four bugs"
  - "The bracket-matcher code, its trace, and its taxonomy table"
  - "The brute-force cross-check code and the shrinking sequence"
  - "How the harness canonicalises results, and the hand trace, print, debugger, property test comparison"
  - "Exercises: merge intervals against the taxonomy, palindrome after filtering"
---
## Introduction

"It works on the example." Every failed interview submission and a large share of production bugs share that sentence. The example in the problem statement is the one input the author guaranteed to be friendly: non-empty, no duplicates, no negatives, a clean answer. Real inputs and hidden tests are none of those things, and the gap between works on the example and works is where the marks and the incidents live.

Testing your own code has two halves. Generating inputs that could break it, from a taxonomy you can learn in an afternoon and run through in a minute. And executing your code on those inputs without a computer, by tracing it in a table: the only test runner on a whiteboard, and the fastest one anywhere for small inputs.

Coming up: the taxonomy, applied to one real problem with the bugs it catches; the rules of a hand trace; brute-force cross-checks, property tests and shrinking; how to read an error; and a two-minute protocol for the end of an interview.

## The edge-case taxonomy

Edge cases are not random. They come from a short list of ways an input can be degenerate, and the list is the same for every problem.

Size: empty, one element, two elements, exactly the maximum n. Extremes of value: zero, negatives, the largest and smallest representable integers. Repetition: all elements equal, duplicates of the target, an answer that appears twice. Order: already sorted, reverse sorted, one element out of place. Boundaries of the answer: at index zero, at the last index, the whole input, or no answer at all. Structure: touching intervals, nested intervals, a tree that is a single chain, a graph with self-loops or disconnected parts. Strings: empty, one character, only punctuation, mixed case. And contract: input the statement says cannot happen, where you must decide aloud whether to validate or assume.

You will not test every row for every problem. The point is to look at every row and pick the three or four this problem makes dangerous. And notice what the taxonomy is not: it is not "think of random inputs". Random inputs almost never hit a boundary. Every row is a boundary.

## The taxonomy on merge intervals

Given intervals in any order, merge every overlapping or touching pair, and return them sorted by start. The solution: sort by start, then sweep, either extending the last merged interval or starting a new one. The key observation is that after sorting, the only interval the next one can overlap is the last merged one.

Now the tempting bug. When you extend the last merged interval, you set its end to the new interval's end, rather than the larger of the two ends. Before I tell you: which taxonomy row catches that?

[pause]

The nested interval. Take 1 to 10, then 2 to 3, then 4 to 5. The correct code keeps 1 to 10 throughout. The buggy code sets the end to 3 when it meets 2 to 3, so 4 to 5 no longer overlaps, and it returns 1 to 3 and 4 to 5. A three-row trace catches it in under a minute. And the statement's own example passes under the bug, because none of its intervals is nested.

The lesson ran four plausible bugs against every row: that one, a strict less-than so touching intervals do not merge, a forgotten sort, and no guard for empty input. Three things fall out. Each bug is caught by a different row, and no row catches all four, which is why the taxonomy is a list and not a favourite input. The chain row, 1 to 3, 2 to 5, 4 to 7, passes the end bug, because the ends keep increasing; a test that looks like it covers the merge logic misses the one line that matters. And two rows fail nothing, which is still information: ten seconds established the code does not care about signs or duplicates.

Several rows are really questions about the specification, and the time to ask them is in the understand step. Can the input be empty, and what is the answer then? Do 1 to 2 and 2 to 3 overlap? The code differs by one character. If several answers are valid, does any one do? Asking is not stalling. An interviewer would rather spend forty seconds on that than watch you solve the wrong problem.

The same taxonomy on balanced brackets, briefly. One lone closing bracket is where most first attempts throw, popping an empty stack. A lone opening bracket catches forgetting to check for leftovers at the end. And the interleaved string, open round, open square, close round, close square, separates a real stack from per-type counters, because every counter ends at zero.

## The hand trace

A hand trace is a table with one column per variable and one row per iteration, filled in by executing your code line by line on a small input chosen from the taxonomy. It is useless for performance, but for correctness on inputs of two to six elements it is faster than typing. Three rules make it reliable.

First, trace the code you wrote, not the code you meant. The bug is always in the gap between them, so read each line from the screen as you execute it. Second, write every variable on every row, even unchanged ones; skipping columns is how you lose track of left while watching right. Third, pick the input for the bug you suspect. A two-element input tests initialisation and the last iteration. An answer at index zero tests the state before the loop. A nested interval tests the max.

Why two to six elements rather than the statement's example? Because the bugs a trace finds live at boundaries, which a tiny input reaches immediately, and a nine-element trace is long enough that you start making errors in the trace itself.

## Testing with a computer

When you have a runtime, two techniques go beyond hand-picked cases.

Brute-force cross-checking. You wrote a brute force in step three of the problem-solving loop; it is slow, but you trust it. Generate a few hundred small random inputs, run both, compare. Keep the inputs small, because the point is coverage of shapes, and small inputs hit empty, single, duplicate and all-equal constantly. Run against the end bug, the check failed on its second trial, with four intervals.

Four intervals is more than a hand trace wants, which is what shrinking is for. Property-testing libraries like Hypothesis and fast-check, after a failure, search for a simpler input that still fails: delete elements while the bug persists, then push numbers toward zero. Done by hand on that failure, it took 27 candidate runs to reach the minimal case: 1 to 1, and 0 to 2. That is the nested row with the smallest possible numbers, and it names the bug without a debugger.

And when you cannot write a brute force, test properties of any correct output instead. Merged intervals must be sorted by start, must neither overlap nor touch, and must cover exactly the same points as the input. A sort's output must be a permutation of the input, in order. Checking properties is often trivial even when computing the answer is not. Running the same function twice, by contrast, only tests that it is deterministic.

One more thing about checkers. The harness here does not compare with equals; it canonicalises both sides to JSON. So a Python tuple passes where a list was expected, because both encode as a list. A JavaScript function that forgets to return produces undefined, which becomes null and fails against anything but null. Floats are rounded to six places, so 0.1 plus 0.2 matches 0.3. And a returned set comes out in an unspecified order, so it can pass on one run and fail on the next. Return the type the statement names.

## Reading error output

Most engineers glance at an error, guess, and change something. The error usually says exactly what happened; the skill is reading the right line.

Find the message, then the innermost frame of your own code. Python prints the message last, so read it bottom-up. Node prints it first. An index error on the line that reads nums at hi says hi is out of range, and the likely causes are both taxonomy rows: empty input, or hi initialised to the length instead of the length minus one.

A recursion error means a missing base case, or an input deeper than the default limit, which is 1,000 frames in CPython. Bracket matching done recursively on 5,000 nested pairs hits it. The fix is an explicit stack, not raising the limit.

Wrong answer with no error is the hard case, and it is what hand traces exist for; printing the loop variables per iteration is a machine-generated trace table. And time limit exceeded is usually not a bug in the logic. Before rewriting the algorithm, look for a hidden linear operation inside the loop: popping from the front of a list, "in" on a list, slicing, string concatenation. Each silently turns a linear solution quadratic.

Interviewers notice how you react to an error. Reading it aloud, naming the line and stating a hypothesis, "hi is negative, so the empty-input path is wrong", is a senior signal. Changing a less-than to less-than-or-equal and re-running is not.

## The two-minute test protocol

There is no test runner in most interviews. This replaces it, in the last five minutes of a 45-minute round.

One: trace the statement's example through your code in a table, aloud. Two: pick the three most dangerous taxonomy rows for this problem and say why. Three: trace the smallest input from each; for empty, that is usually one sentence, "the loop doesn't run and we return the initial value, zero". Four: state what you did not test and why it is safe.

Doing this reliably is a bigger differentiator than solving a harder problem. It shows that when your code ships, it will have been tested by someone who knows where bugs live.

## In the interview

Here is a follow-up the lesson expects. A test fails on CI but passes on your machine. What is your first hypothesis?

[pause]

Order dependence. A set or dict iterated in an order that hash randomisation changes between processes, or state shared between tests through a mutated fixture or a module-level variable. Run the failing test alone, then in CI order, and diff the outputs before touching the code. The wrong answer is "CI is flaky, rerun it".

And another: how would you test the merge without a brute force? By properties: sorted by start, each start strictly after the previous end, the same points covered, no more intervals than the input. Together they reject every bug in the table. Comparing against the example does not, because the end bug passes it.

## Recap

Four things to remember. Edge cases come from a fixed taxonomy of boundaries, size, values, repetition, order, the answer's position, structure, strings and contract, and different rows catch different bugs. Trace by hand on two to six elements chosen for the bug you suspect, tracing the code as written. With a computer, cross-check against the brute force on small random inputs, shrink failures to something traceable, and check output properties when there is no brute force. And read the error before changing anything, and end every interview solution by saying what you tested and what you did not.

At your desk: the taxonomy table, the merge-intervals and bracket tables with each bug's output, the cross-check code and shrinking sequence, the harness rules and tool comparison, and the two exercises.
