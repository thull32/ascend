---
problem: longest-substring-no-repeat
args: ["tmmzuxt"]
frames: 35
source: 9ffbec449a2bdb65
---
@0-3
The string t m m z u x t. What is the longest stretch with no repeated letter? The property "no repeats" survives shrinking: if a window has none, neither does any piece of it. That is exactly when a sliding window works. Grow the right edge one letter at a time, and when the new letter is already inside the window, move the left edge past its previous copy. Both edges only move forward, so it is one pass. We keep a dictionary of each letter's last position, a left edge at zero, and the best length.

@4-7
T, at position zero. We have never seen it, so we record its position, and the window is just t. Best is one.

@8-11
M, at position one. New as well. The window is t m, and best is two.

@12-16
M again, at position two. Its last position is one, which is inside the window, because one is at least left, zero. So the window jumps: left moves to one past the old m, position two. We record m's new position, and the window is just the second m. Length one; best stays two.

@17-27
Z, u and x are all new. The window grows from position two to five, m z u x, length four. Best is four.

@28-31
Now the moment the problem is built around. T arrives at position six, and the dictionary says t was last seen at position zero. But zero is less than left, which is two. That old t is already outside the window, so it is not a repeat at all, and the left edge stays put. The window becomes m z u x t, length five. Best is five.

@32-34
We return five.

Without that check, that the old position is at least left, the code would move left back to one, past the old t. The window would then run from one to six, which contains both m's, and the answer would come out as six, which is wrong. The test a b b a catches the same bug: at the final a, the left edge would move backwards. One pass, one lookup and one write per letter, so the time is linear, and the dictionary holds at most one entry per distinct letter. The other common mistakes: computing the length as right minus left, forgetting the plus one; and confusing substring with subsequence.
