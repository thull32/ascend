---
problem: generate-parentheses
args: [2]
frames: 44
source: fca19be5b46646fd
---
@0-2
We want every well-formed string of two opening and two closing brackets. Generating all sixteen strings of four brackets and filtering them works, but it wastes almost all of its effort. The insight: never build a prefix that cannot be finished. A prefix can still become valid exactly when two rules hold. It has used no more than n openers, and it has never closed more than it opened. Enforce both as you build, and every string you complete is an answer, with nothing to reject. The build starts with an empty prefix, zero opened and zero closed.

@3-8
The prefix is empty and not yet full length. Opened is zero, below 2, so we may add an opener. The prefix becomes one opener. Again, opened is 1, below 2, so we add another: open, open.

@9-12
Now opened is 2, the limit, so no more openers. But closed, zero, is less than opened, 2, so a closer is allowed. The prefix becomes open, open, close.

@13-22
Opened is still at the limit. Closed is 1, still less than 2, so another closer: open, open, close, close. The length is 4, twice n, so we record it. That is the first answer, and the calls return up the stack.

@23-25
Back at the prefix with a single opener. Its first branch, adding a second opener, is finished. Now its second branch: closed is zero, less than opened, 1, so we may close. The prefix becomes open, close.

@26-36
From open, close: opened is 1, below 2, so add an opener. Then opened is 2 and closed is 1, so add a closer. Open, close, open, close is full length, and we record it. The second answer.

@37-41
Unwinding. At open, close, the closer branch is not allowed, because closed equals opened: a closer there would close more than was opened. And back at the very first, empty prefix, the closer branch is refused for the same reason. That one check is what keeps a string like close, open out of the answer.

@42-43
Two strings: open, open, close, close, and open, close, open, close. The number of answers grows as the Catalan numbers, 1, 2, 5, 14, and so on, and each costs its length to build, so the work is proportional to the size of the output. You cannot do better.

The classic bug is allowing a closer whenever fewer than n have been used, instead of fewer than have been opened, which lets invalid strings through. If you find yourself deduplicating with a set, the branching rules are wrong. And if you build the prefix in a shared list rather than a new string each time, remember to pop after each recursive call.
