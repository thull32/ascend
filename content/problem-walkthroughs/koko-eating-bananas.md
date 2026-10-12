---
problem: koko-eating-bananas
args: [[3, 6, 7, 11], 8]
frames: 69
source: 39030d3948889beb
---
@0-2
Four piles of bananas: three, six, seven and eleven, and eight hours. Koko eats at a fixed speed, k bananas an hour, one pile at a time, and an hour never spills into the next pile. What is the slowest speed that finishes in time? The insight is to binary search on the answer, not on the input. Ask a yes or no question: does speed k finish within eight hours? Eating faster never takes longer, so the answers run no, no, no, then yes, yes, yes. We want the first yes. The speeds worth trying run from one up to the biggest pile, eleven, because at eleven every pile takes one hour.

@3-4
The middle of one and eleven is six. Does six work?

@5-16
The helper adds up the hours, pile by pile, rounding each one up. Three bananas at six an hour is one hour. Six is one hour. Seven needs two, because the last banana takes a whole hour of its own. Eleven needs two. Total: six hours.

@17-18
Six hours is within eight, so six works. The answer is six or slower, so the high end moves down to six. We keep six in the range, because it might be the answer.

@19-32
The middle of one and six is three. At three an hour: three takes one hour, six takes two, seven takes three, eleven takes four. Total: ten hours.

@33-34
Ten is more than eight, so three is too slow, and so is everything below it. The low end moves to four. This time mid leaves the range, because we know it fails.

@35-48
Between four and six, the middle is five. Hours: one, two, two and three. Exactly eight. It works, so the high end comes down to five.

@49-64
Between four and five, the middle is four, because the division rounds down. Hours: one, two, two, three. Eight again. Four works too, so the high end comes down to four.

@65-68
Now low and high are both four, the loop ends, and we return four. We never stopped early when a speed worked; we kept narrowing until only one candidate was left. That is the first-true template: high becomes mid on success, low becomes mid plus one on failure, and return low.

Each probe costs a pass over the piles, and there are about log of the biggest pile probes, around thirty for a billion. So time is n log M, and space is constant. The classic mistakes: starting low at zero, which divides by zero; setting high to mid minus one on success, which can skip the answer; and rounding up with floating point division, when adding k minus one and dividing as integers is exact.
