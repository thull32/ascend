---
problem: longest-repeating-replacement
args: ["AABABBA", 1]
frames: 48
source: c851af2fead39d38
---
@0-4
The string A A B A B B A, and you may change one letter. What is the longest run of a single letter you can make? A window can be made uniform when the letters that are not its most common letter number at most k. In other words, the window's length minus its top count must be at most one. So we slide a window: grow the right edge, and when the window breaks that rule, move the left edge. We keep a count per letter, and max count, the highest count we have seen.

@5-14
The first two letters are A. The window A A has a top count of two and nothing to replace. Best is two.

@15-19
B arrives. The window A A B is three long, the top count is two, so one letter needs replacing. One is allowed. Best is three.

@20-24
Another A. Now A has three, so max count is three. The window A A B A needs one replacement, the B. Best is four.

@25-30
B arrives. The window is five long, with three A's and two B's: two replacements needed, one too many. So we shrink, but only by one: the A at the left leaves, and the window is A B A B, still four long. Notice the if, not a while. The window never gets smaller than the best we have found. It only grows or slides.

@31-37
B again, at position five. B now has three, max count stays three. The window A B A B B is five long and needs two replacements. Slide once more: the A at position one leaves, and the window is B A B B.

@38-44
The last letter, A. Window B A B B A: five long, needs two. Slide: the B at position two leaves. The window is A B B A, with two A's and two B's. But look at max count: it still says three. It is stale. The true top count in this window is two. The code never lowers max count as the window shrinks, because rescanning every count would cost time, and it does not need to.

@45-47
We return four. Here is why the stale value is safe. It is an upper bound on the true count, so the most it can do is keep a window from shrinking, never let a too-long window count as an answer the string cannot back up. Some earlier window really did hold three A's, and with one replacement that gives a real window of four, which is exactly what we report. A A B A, changing the B, is one.

Every step moves each edge at most once, so time is linear, and the counts take constant space, one per letter. The classic mistakes: recomputing the maximum of all counts on every step, which is correct but shows you missed the argument; counting the minority letters as the ones to keep; and an off by one in the window length, which is right minus left plus one.
