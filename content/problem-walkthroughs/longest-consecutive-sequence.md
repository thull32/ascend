---
problem: longest-consecutive-sequence
args: [[100, 4, 200, 1, 3, 2]]
frames: 35
source: 23ef92ab5dbc9a57
---
@0-2
Six numbers: a hundred, four, two hundred, one, three and two. The longest run of consecutive values is one, two, three, four, so the answer should be four, and we want it in linear time, without sorting. First, every value goes into a hash set, so asking whether a number is present costs constant time. Then we could walk upward from each number. But walking from every number is quadratic on an input like one to n. Here is the fix, and it is the whole solution: only walk from the start of a run. A number starts a run exactly when the number below it is missing.

@3-4
The set hands us one first. Is zero in the set? No, so one starts a run. The run's length starts at one.

@5-12
Now walk upward. Is two present? Yes, length two. Three? Yes, length three. Four? Yes, length four. Five? No, so the walk stops. Best becomes four.

@13-18
Next comes two. Is one in the set? Yes, so two is in the middle of a run that someone else has already walked. Skip it, in one lookup. The same for three: two is present, so skip.

@19-23
Then a hundred. Ninety nine is missing, so it starts a run. But a hundred and one is missing too, so the run has length one. Best stays four.

@24-26
Four: three is present, so skip. Notice the order the set hands us values in does not matter. Whenever we meet a number in the middle of a run, we skip it, and the run is walked exactly once, from its bottom.

@27-31
Two hundred: a start, with length one.

@32-34
The loop is done, and we return four.

Here is why it is linear. Building the set is one pass. The outer loop is one pass. And every value is stepped over by exactly one walk, the one that started at the bottom of its run, so all the walks together cost at most n steps. Space is the set. The classic mistake is leaving out the start-of-run check. The answer is still right, but on the input zero to a hundred thousand it walks from every number, and the cost becomes quadratic. Also, loop over the set rather than the list, so duplicates are examined once, and check membership in the set, never in the list.
