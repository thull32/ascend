---
lesson: binary-search
source: 47b92c4297c81f45
---
## 1

A first-true binary search loops while lo is below hi. It sets mid to lo plus half the gap, rounded down. If the predicate holds at mid, hi becomes mid; otherwise lo becomes mid plus 1. Which single change causes an infinite loop on some inputs?

A, returning hi instead of lo after the loop ends. B, on a false, setting lo to mid instead of mid plus 1. C, on a true, setting hi to mid minus 1 instead of mid. D, computing mid as lo plus hi, halved and floored, in Python.

[think]

The answer is B: on a false, setting lo to mid instead of mid plus 1.

With a midpoint rounded down and a two-element range, mid equals lo, so setting lo to mid makes no progress and the loop never exits. Setting hi to mid minus 1 is wrong, because it can skip the boundary, but it still terminates. Lo plus hi, halved, floors identically in Python, and returning hi is fine because lo equals hi at exit.

## 2

A sorted array contains duplicates, and you need the index of the last element that is at most t. Which search do you write?

A, predicate: the element is at most t, and return the first true index as it is. B, predicate: the element equals t, and return the index where it first holds. C, predicate: the element is at least t, and return the first true index minus one. D, predicate: the element is greater than t, and return the first true index minus one.

[think]

The answer is D: predicate greater than t, and return the first true index minus one.

Greater than t is false for a prefix and true afterwards, so first-true is well defined, and the element just before it is the last one at most t. At least t, minus one, lands on the last element strictly below t, one short of a run equal to t. At most t is true then false, the wrong shape for a first-true search.

## 3

In Median of Two Sorted Arrays, you search the cut i in the first array, A, and set the cut j in the second array, B, to half the total length minus i. The predicate is: the element just before cut j in B is at most the element at cut i in A. Why is this predicate false, then true?

A, because A is the shorter array, every cut beyond the median is valid. B, as i grows, both elements rise, so the gap between them keeps shrinking. C, because the merged array is sorted, every predicate on a cut is monotone. D, as i grows, the element in A rises and the element in B falls, so once it holds it keeps holding.

[think]

The answer is D: the element in A rises and the element in B falls.

Moving the cut right in A takes a larger element there, and forces j down, so the element in B is smaller. The inequality can only go from false to true. At the first true cut, the predicate was false one step earlier, which means the element just before cut i in A is below the element at cut j in B, so both partition conditions hold. Searching the shorter array keeps j in range; it does not make the predicate monotone.

## 4

Python's bisect left runs on a list of a million objects whose class defines only the less-than method, with no key. How many comparisons does one search make, and which?

A, about 40 less-than calls, since each probe tests both directions. B, it raises a TypeError, because bisect needs less-or-equal and equality too. C, about 20 calls each to less-than and to equality, to detect exact matches. D, about 20 less-than calls, one per probe of the halving loop.

[think]

The answer is D: about 20 less-than calls, one per probe.

The C loop asks one question per probe: is the middle element less than x? Log base 2 of a million is about 20, and a measured run made exactly 20 less-than calls. Bisect never tests equality, which is why it returns an insertion point rather than a found flag, and it needs no other comparison methods.

## 5

A first-true search over the range from minus 3 up to, but not including, minus 2 hangs in Java but not in Python. The midpoint is written as lo plus hi, divided by 2. Why?

A, Python's floor division rounds up for negatives, which happens to skip the stuck case. B, Java's int overflows when adding two negatives, so mid becomes a huge positive. C, Java evaluates the predicate lazily, so the true branch is never taken here. D, Java's division truncates toward zero, so mid is minus 2, equal to hi, and setting hi to mid stalls.

[think]

The answer is D: Java truncates toward zero, so mid equals hi and the loop stalls.

Minus 3 plus minus 2, halved, is minus 2.5, which Java truncates to minus 2, the value of hi. So mid is not strictly below hi, and a true predicate sets hi to itself forever. Python's floor division gives minus 3, rounding down, not up, which keeps mid below hi. Writing lo plus half of hi minus lo floors in every language, because the gap is never negative. No overflow happens at these sizes.

## 6

On the same machine, a JavaScript binary search takes 51 nanoseconds per lookup on a thousand sorted integers, and 343 nanoseconds on a hundred million. The number of probes rises only from 10 to 27. What explains the rest?

A, the JIT deoptimises the loop for large arrays, which runs it in the interpreter. B, later probes miss the caches once the array outgrows them, and wait on main memory. C, Math dot floor becomes slow past 2 to the 31, which penalises every midpoint. D, typed arrays above ten million elements are paged to disk by the engine.

[think]

The answer is B: later probes miss the caches and wait on main memory.

A small array sits in the fastest cache, and each probe costs a few nanoseconds, mostly a mispredicted branch. A 400 megabyte array is far bigger than the 96 megabyte last-level cache, so the middle probes, which land on elements no recent search touched, each wait on main memory. Layouts like the Eytzinger order or B-tree nodes reduce those misses.
