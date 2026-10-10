---
lesson: invariants-and-loop-reasoning
source: 07fbb2e7e9e67ec4
fit: great
desk:
  - "The pair-sum code and its trace on 1, 3, 4, 6, 10"
  - "The first-true binary search in Python and JavaScript, and its trace"
  - "The three bracketing conventions, side by side"
  - "The assert cost measurements, Rust's debug assertions and Go's bounds-check report"
  - "Exercises: pair sum with two pointers, binary search for the first true"
---
## Introduction

Every engineer has written a binary search that was off by one. Usually the fix is a sequence of guesses: change less-than to less-than-or-equal, run the tests, change mid to mid plus one, run the tests, until they pass and nobody is sure why. That does not work on a whiteboard, where there are no tests. And it does not work on the bug that only appears at scale. The JDK's binary search computed the midpoint as low plus high, divided by two. That sum overflows a 32-bit integer once the array has more than about 2 to the 30 elements, and the bug survived nine years before it was reported in 2006.

There is a better tool, and it is not "be more careful". It is one sentence, written before the loop, that says what is true every time the loop condition is checked. That sentence is a loop invariant. Once you have it, correctness stops being a matter of faith. The candidate who says "the invariant is that the answer, if it exists, is inside lo to hi" has told an interviewer more than ten minutes of debugging would.

Coming up: the three checks that prove a loop, the two-pointer pair sum proved, binary search on a boundary, the one convention to pick, and what asserts and compilers do with an invariant.

## Pre, post, and the bridge between them

Three sentences describe a piece of code. The precondition: what must be true of the inputs, such as "the array is sorted". Violate it, and the code may do anything. The postcondition: what the code promises about its output. And the loop invariant: a statement about the loop's variables that is true before the first iteration and stays true after every one.

The invariant is the bridge. Proving a loop is three checks. Initialisation: the invariant holds before the first check. Maintenance: if it holds at the start of an iteration, the body keeps it true. Termination: the loop stops, because some quantity strictly decreases and is bounded below, and at exit the invariant plus the exit condition gives you the postcondition.

None of that needs notation. It needs the invariant as a precise sentence. Vague invariants, "lo and hi bracket the answer", are where off-by-ones hide. Precise ones, "every index below lo has been ruled out, every index above hi has been ruled out", expose them.

## Pair sum in a sorted array

A sorted array and a target: return two distinct indices whose values sum to the target, in constant extra space. Put one pointer at each end. If the sum is too small, move the left pointer right. If it is too big, move the right pointer left. If it matches, return.

Ask why that is correct and the usual answer is "it's sorted, so you move the pointer that helps". Right intuition, not an argument. Here is the argument.

The invariant: if any valid pair exists, then some valid pair lies between lo and hi. The pointers never discard an index that could still be part of an answer.

Initialisation: lo is 0 and hi is the last index, so everything is inside. Maintenance: suppose the sum is too small, and you discard lo. Could lo have a partner? Any partner is at or below hi, and since the array is sorted, its value is at most the value at hi. So lo plus any partner is at most the current sum, which is already too small. No partner works, so discarding lo is safe. The too-big case is the mirror image. Termination: each step shrinks the gap by one, so at most n minus 1 steps.

Now the question that trips people. Is the loop condition lo less than hi, or lo less than or equal to hi?

[pause]

Less than. A pair needs two distinct indices, and when lo equals hi there is only one. With less-than-or-equal, the loop compares an element with itself, and on 1, 2, 3, 4 with target 8, it would happily return 4 plus 4. At exit, lo is at or past hi, so no two indices remain, and the invariant tells you no pair exists anywhere. The postcondition falls out of the invariant plus the exit condition, exactly as promised.

## Binary search on a boundary

Most binary search bugs come from searching for a value when the problem is about a boundary. The cleanest form takes a predicate that is false for a prefix and true for the rest, and finds where it switches. First bad version, first element at least x, smallest capacity that ships in time: all the same problem.

Why bother? If each lookup is a ten-minute CI run over 10 thousand versions, scanning takes about 69 days. Binary search takes 14 lookups, under three hours.

The invariant: every index below lo is false, and every index at or above hi is true. So the unknown region is exactly from lo up to, but not including, hi: half-open.

Initialisation is where the classic mistake lives. Lo starts at 0, and hi starts at n, the length, not n minus 1. Why n?

[pause]

Because hi must be the first index known to be true, and before you have looked at anything, the only index you know is true is the imaginary one just past the end. Start hi at n minus 1 and you have asserted that the last element is true before checking it. That breaks on an all-false array, where the right answer is n. Starting at n makes "none found" fall out for free.

Maintenance. Probe the middle. If it is true, everything from there on is true, so hi moves to mid: inclusive, because mid might be the answer. If it is false, everything up to mid is false, so lo moves to mid plus 1: exclusive, because mid is definitely not the answer. Notice the asymmetry; it comes straight from the invariant.

Termination. Mid is always at least lo and strictly less than hi. So moving hi to mid strictly shrinks the range, and moving lo past mid strictly shrinks it too. At exit lo equals hi, everything below is false, everything at or above is true, and lo is the answer. About 20 iterations for a million elements, 40 for a trillion.

The termination check also catches the infinite loop. Write "lo equals mid" in the false branch, and when the range has width one, mid rounds down to lo and nothing changes. On false, true, the loop is still at lo 0, hi 1 after 50 million iterations. Asking "does every branch strictly shrink the range?" takes ten seconds and catches it before any test does.

And the overflow. Compute the midpoint as lo plus half of hi minus lo, which never forms the large sum. In JavaScript, shifting the sum right by one reinterprets it as a signed 32-bit integer and fails at the same size as the JDK bug.

## Pick one convention

There are three common ways to bracket a binary search: half-open, closed with an answer variable, and closed with the pointers meeting. All three are correct with their own invariant. The bugs come from mixing them.

The hybrid mid-level code produces most often takes hi as n minus 1 from the closed convention, and the loop condition and return from the half-open one. Checked against a brute-force scan on 2,000 random inputs, it was wrong on 390 of them, and on every all-false input, where it returns n minus 1. Each line came from a correct search; together they are wrong. Pick one column, half-open is the safest, and use it for every binary search you write.

Better still, write the invariant first and let it generate the code. Commit to "everything below lo is false, everything at or above hi is true", and there are no decisions left: loop while the unknown region is non-empty, probe the middle, move hi to it on true, move lo past it on false. In an interview, instead of "let me try less-than-or-equal, hmm", you say "the unknown region is lo to hi, half-open, so I loop while it's non-empty."

The same discard argument covers every two-pointer and sliding-window algorithm: whenever a pointer moves, the positions it skips cannot contribute to a better answer. Container with most water moves the pointer at the shorter line, because keeping the shorter line and moving the other one inward only shrinks the width without raising the limiting height. If you cannot state the discard argument for a pointer move, the algorithm is probably wrong.

## Asserts and compilers

An invariant is a sentence, and two pieces of software can act on it. The runtime, when you make it an assert. And the compiler, when it can prove it.

In CPython, asserts cost real time when they are on. A binary search over a million integers took 1.7 microseconds per search. With a four-clause invariant asserted inside the loop, 2.75 microseconds: about 50 nanoseconds extra per iteration, 60 percent of the loop. Run with python dash O and asserts are not executed cheaply; they are not compiled at all.

That gives the production trap. A service validates request sizes with an assert, and is deployed with dash O. What happens? The check vanishes, and every size is accepted, in exactly the environment where input is least trusted. Input validation, and anything with a side effect, must be an explicit if that raises. Asserts are for invariants that only a bug in this function could break. Rust makes the split explicit: assert always runs, debug assert is compiled out of release builds. Go has no assert at all, by design.

The compiler uses the same facts. Bounds-check elimination removes the check on each array access when it can prove the index is in range from the loop's structure. In Go, a loop over the range of a slice keeps no check, while a loop up to an unrelated n keeps one per access. An iterator carries the invariant, so there is nothing left to prove.

Invariants scale up too. A binary heap's invariant is every parent at most its children. Raft is an elaborate maintenance argument for one sentence: every committed write is on a majority of replicas. And in design reviews, a senior engineer asks what invariant this lock, transaction or protocol protects before asking how it is implemented.

## In the interview

Here is a follow-up the lesson expects. The array has duplicates. Return the first occurrence of the target.

[pause]

It is the first-true search with the predicate "value at least target". The result lo is the first index at or above the target, so return it if it is in range and holds the target, otherwise minus one. The last occurrence is the first index strictly above the target, minus one. The wrong answer is a value search that returns on equality and then walks left, which is linear when the whole array is the target.

And: how do you know it terminates? Hi minus lo is a non-negative integer that strictly decreases in every branch, because mid is strictly below hi, and lo moves past mid. A strictly decreasing quantity bounded below by zero can only decrease finitely often. The wrong answer is "binary search always terminates", which is false the moment someone writes lo equals mid.

## Recap

Four things to remember. A loop is proved by three checks: the invariant holds at the start, each iteration keeps it, and at exit the invariant plus the exit condition gives the postcondition. For two pointers, the invariant is that no discarded index could be in a remaining answer, and every pointer move needs that discard argument. For binary search, search a boundary, keep "below lo is false, at or above hi is true", start hi at n, check every branch shrinks the range, and compute mid without forming lo plus hi. And never put validation in an assert, because a deployment flag deletes it.

At your desk: the pair-sum and first-true code with their traces, the three bracketing conventions side by side, the assert and bounds-check measurements, and the two exercises.
