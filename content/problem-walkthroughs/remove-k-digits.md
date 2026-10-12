---
problem: remove-k-digits
args: ["1432219", 3]
frames: 36
source: 7ad528ecd01e8748
---
@0
The number is 1, 4, 3, 2, 2, 1, 9, and we may remove three digits to make it as small as possible. Numbers of the same length compare from the left, so the leftmost digits matter most. A digit is worth removing exactly when the digit after it is smaller: deleting it promotes a smaller digit into a more significant place. So scan left to right with a stack of digits we intend to keep, and while the incoming digit is smaller than the top and removals remain, pop.

@1-7
The 1 goes on the stack. The 4 is bigger than 1, so nothing pops, and it goes on too. The stack is 1, 4.

@8-13
The 3 arrives, smaller than the 4 on top. Pop the 4: one removal used, two left. The top is now 1, which is not bigger than 3, so the 3 is pushed. The stack is 1, 3.

@14-19
The 2 arrives, smaller than the 3. Pop the 3, leaving one removal. The 2 is pushed: 1, 2.

@20-22
The next 2 equals the top. The test is strictly greater, so nothing pops, and the stack is 1, 2, 2. Removing an equal digit gains nothing now and wastes a removal that could matter later.

@23-28
The 1 arrives, smaller than the 2 on top. Pop it, and that is the last removal. The top is still a 2, bigger than 1, but with no removals left, the 1 is simply pushed: 1, 2, 1.

@29-31
The 9 is pushed. The stack is 1, 2, 1, 9, and every removal has been spent.

@32-35
No removals are left over, so nothing is cut from the end, and there are no leading zeros to strip. The answer is 1,219. Each digit is pushed once and popped at most once, so it is linear. Two classic mistakes: forgetting the leftover removals when the digits only ever increase, as in 1, 2, 3, 4, 5, 6, where they must come off the end; and returning an empty string instead of 0 when everything is removed or only zeros remain.
