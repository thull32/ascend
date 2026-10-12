---
problem: largest-rectangle-histogram
args: [[2, 1, 5, 6, 2, 3]]
frames: 63
source: f24e4a7e9a454aba
---
@0-3
Six bars, with heights two, one, five, six, two and three. What is the largest rectangle that fits under them? Change what you enumerate. Instead of trying every pair of edges, ask, for each bar, how wide a rectangle of exactly that bar's height can be. It stretches left and right until it meets a shorter bar. The largest rectangle overall is limited by some bar, so the best of those answers wins. A stack finds both boundaries in one pass. It holds positions of bars whose heights rise from bottom to top. We also add a bar of height zero at the end, a sentinel that forces every bar to be resolved.

@4-6
Position zero, height two. The stack is empty, so we push it.

@7-14
Position one, height one. It is shorter than the bar on top of the stack, height two. So the two-bar has just found its right boundary: position one. We pop it. Beneath it the stack is empty, so its left boundary is off the edge, at minus one. Width is one minus minus one minus one, which is one. Area two. Best is two. Then we push position one.

@15-21
Heights five and six are taller than the top, so they just get pushed. The stack holds positions one, two and three, with heights one, five and six, rising.

@22-28
Position four, height two. That is shorter than six, so the six-bar, at position three, is resolved. Its right boundary is four, and its left boundary is whatever is now beneath it on the stack: position two. Width is four minus two minus one: one. Area six. Best is six.

@29-34
Two is still shorter than the new top, the five at position two. Pop it. Now the bar beneath is position one, so the left boundary is one, and the width is four minus one minus one: two. The five-high rectangle spans the five and the six. Area ten. Best is ten. This is why width uses the new stack top rather than the popped position: a rectangle stretches back past bars that were already popped, because they were taller.

@35-39
The one at position one is not taller than two, so we stop popping and push position four. Then three is taller than two, so position five is pushed too. The stack is one, four, five.

@40-45
Now the sentinel, height zero, at position six. It is shorter than everything, so it resolves every bar still waiting. First the three at position five: left boundary four, width one, area three.

@46-51
Then the two at position four. The bar beneath it is position one, so the width is six minus one minus one: four. This rectangle runs from position two to position five, at height two. Area eight. Not better than ten.

@52-58
Then the one at position one. The stack beneath it is empty, so the left boundary is minus one and the width is six: the whole histogram, at height one. Area six.

@59-62
The sentinel is pushed and the loop ends. We return ten: height five, across the bars of five and six.

Each position is pushed once and popped once, so time is linear, and the stack is linear space. The classic mistake is computing the width from the popped position instead of the new stack top, which forgets that a rectangle extends left past bars that were already popped. The other is leaving out the sentinel and draining the stack in a second loop, which doubles the chances of an off by one.
