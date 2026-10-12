---
problem: combination-sum
args: [[2, 3, 6, 7], 7]
frames: 114
source: 106374c93fb180ba
---
@0-4
Candidates 2, 3, 6 and 7, each usable as often as you like, and we want every combination that sums to 7. The danger is building the same combination in different orders: 2, 2, 3 and 3, 2, 2 are one answer. The fix is a canonical order. Each level may only choose candidates at or after the position of the last one chosen. So 2 then 3 can be built, but 3 then 2 cannot. At or after, rather than strictly after, is what allows reuse. Sorting first adds a second gift: once a candidate is too big, every later one is too, and the loop can stop.

@5-22
We start at position zero with 7 remaining. Take a 2: 5 remaining, and recurse from the same position, so 2 is allowed again. Take another 2: 3 remaining. And another: 1 remaining. The path is 2, 2, 2.

@23-29
Now even the smallest candidate, 2, is bigger than the 1 remaining. Because the list is sorted, we break out of the loop: nothing after it can fit either. Back up one level, and the last 2 is popped off.

@30-38
The path is 2, 2 with 3 remaining. The next candidate is 3, which fits exactly. Remaining hits zero, and we record a copy of 2, 2, 3. A copy, because the path keeps changing after this.

@39-46
Pop the 3. The next candidate, 6, is bigger than 3, so break. Back up again: the path is 2, with 5 remaining.

@47-62
From position 1, try 3: the path is 2, 3 with 2 remaining. One level down, the loop starts at position 1, not position zero. That is the canonical order at work: after choosing a 3, we may not go back to a 2, because 2, 3, 2 would just be 2, 2, 3 again. The 3 is too big for 2, so break. Back at the path of 2, the 6 is too big for 5, so this branch is finished.

@63-86
Back at the top, with an empty path. Now try starting with 3: 4 remaining. Another 3 leaves 1, and nothing fits. Then 6 is too big for 4. Nothing starting with 3 works.

@87-99
Start with 6: 1 remaining, and the 6 cannot repeat into that. Nothing.

@100-111
Start with 7: zero remaining. Record 7.

@112-113
Two combinations: 2, 2, 3, and 7. The recursion depth is at most the target divided by the smallest candidate, and the sort-and-break pruning cuts most branches. The one-character mistakes are the ones to remember. Recurse from i plus 1, and you forbid reuse: that is the follow-on problem where each candidate is used once. Recurse from zero, and you allow reuse but produce every ordering of every combination.
