---
lesson: the-problem-solving-loop
source: 0cb9d0a1d031475a
---
## 1

You have coded a solution, and it returns the wrong answer for an example you had not written down before. According to the loop, where do you go first?

A, step 4, to rethink the optimisation you chose. B, step 1, to check you read the problem right. C, step 5, to find and fix the bug in the code. D, step 3, to compare against the brute force.

[think]

The answer is B: step 1, to check you read the problem right.

A failure on a case you never considered usually means the problem is different from the one you solved: a missed constraint or a misread term. Re-examine the statement first, because fixing code for the wrong problem wastes time. A failure on an example you did work by hand points at the optimisation, step 4, or the code instead.

## 2

In the sliding-window solution to longest substring without repeats, the window's left edge jumps past a repeated character only if that character was last seen at or after left. What goes wrong if you drop that check, and always set left to one past the last-seen index?

A, left can move backwards, re-admitting a repeated character. B, nothing: the check is redundant, since left only grows. C, it becomes quadratic, because left re-scans characters. D, it fails on the empty string with a missing-key error.

[think]

The answer is A: left can move backwards, re-admitting a repeated character.

On the string a, b, b, a, the final a was last seen at index 0, outside the current window of indexes 2 to 3. Without the check, left jumps back to 1, the window b, b, a contains two b's, and the function returns 3 instead of 2. The complexity is unaffected; the check is exactly what stops left from moving backwards.

## 3

The restart-from-each-start version of longest substring without repeats, using a set, measured 2.4 milliseconds on 8,000 random lowercase characters, but 2.4 seconds on 8,000 distinct characters. What explains the thousandfold gap?

A, non-Latin characters make each set lookup far slower. B, the interpreter caches results for repeated random text. C, distinct characters force a set resize on every insertion. D, a 26-letter alphabet caps every inner loop at about 26 steps.

[think]

The answer is D: a 26-letter alphabet caps every inner loop at about 26 steps.

The inner loop stops at the first repeat, which on a 26-letter alphabet arrives within about 20 characters, so the total work is n times the alphabet rather than n squared. With all-distinct characters every inner loop runs to the end of the string, and the quadratic worst case appears. Set resizes are amortised constant time, the interpreter caches nothing between runs, and the 40 percent slowdown measured for non-Latin text cannot account for a factor of a thousand.

## 4

In the one-pass Two Sum, what goes wrong if you record the current element's index in the map before checking whether its complement is already there, instead of after?

A, an element can pair with itself, so the input 3, 3 returns indexes 0 and 0. B, the map grows to 2 n entries and doubles the space used. C, negative numbers are never found, because the complement is computed first. D, nothing: the order of the two statements is irrelevant.

[think]

The answer is A: an element can pair with itself, so the input 3, 3 returns indexes 0 and 0.

With the insert first, when x is 3 and the target is 6, the lookup for a complement of 3 finds the entry inserted a moment earlier for the current index, so the function uses one element twice. Inserting after the check means the current element can only pair with earlier ones. The map holds at most n entries either way, and negatives are unaffected.

## 5

You are stuck in step 4, and the interviewer says: your brute force re-checks the same characters every time it extends. Which response follows the hint protocol?

A, restate the hint, place it at step 4, derive the change, and resume there. B, say of course, and keep typing the approach you were on. C, apologise, clear the editor, and restart from the restatement. D, ask for the name of the technique, so you can implement it directly.

[think]

The answer is A: restate the hint, place it at step 4, derive the change, and resume there.

The protocol is: stop, restate the hint and place it in the loop, derive its consequence out loud, then confirm the new plan and resume at the step it addressed. Continuing the original approach ignores the hint. Restarting throws away correct work from steps 1 to 3. And asking for the technique's name skips the derivation, which is the part being graded.

## 6

The sliding window ran at about 57 nanoseconds per character in CPython 3.14, and 21 nanoseconds per character on Node 24, for the same algorithm. Which conclusion is justified?

A, CPython dict lookups are asymptotically slower than V8 map lookups. B, both are linear: the constant belongs to the runtime, not the algorithm. C, the Python version is quadratic, because of the call to max. D, the JavaScript version has a lower time complexity.

[think]

The answer is B: both are linear, and the constant belongs to the runtime, not the algorithm.

Both implementations visit each character once, with a constant number of hash-map operations, so both are linear. The gap is interpreter dispatch and specialisation against a compiled loop, which changes the constant by about 3 times here and nothing about the growth. The max call costs about 10 nanoseconds per iteration: a constant, not a factor of n.
