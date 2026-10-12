---
problem: hand-of-straights
args: [[5, 1, 2, 3, 3, 4, 4, 5, 6], 3]
frames: 56
source: d17ee9f31ba7e02a
---
@0
Nine cards: five, one, two, three, three, four, four, five, six. Can we split them into straights of three consecutive values? Here is the fact that removes all the searching. The smallest card in the hand cannot sit in the middle of a straight, because that would need a smaller card, and there is none. So the smallest card must start a straight. Nothing to choose, so nothing to backtrack over. First, a free check: nine cards divide evenly into groups of three, so we carry on.

@1-2
We count each value. One, two and six appear once; three, four and five appear twice.

@3-5
We visit the distinct values in increasing order. The smallest is one, and there is one copy of it, so c is one. That single one must start a straight: one, two, three.

@6-14
For each value in that straight, we check there are at least c copies, then take them. One drops to zero, two drops to zero, and three drops from two to one. If any of those counts had been short, we would return false right there, because the straight was forced and cannot be built.

@15-18
Next value: two. Its count is already zero, used up by the first straight, so we skip it. This skip matters. A two with no copies left does not need a straight of its own.

@19-31
Next: three, with one copy left. Three is now the smallest card remaining, so it must start a straight: three, four, five. We take one of each. Three goes to zero, four to one, five to one.

@32-44
Next: four, with one copy. Same argument: it starts four, five, six. Four, five and six all drop to zero. Every count is now zero.

@45-53
Five and six both have count zero, so both are skipped.

@54-55
The loop finishes without ever finding a short count, so we return true: the straights were one to three, three to five, and four to six.

Notice that c was one every time in this hand, but the code takes c copies of each value in one go. If the smallest value appeared twice, both copies would be the smallest cards, so both would have to start straights, and we would subtract two from each value in the run at once.

The cost is the sort of the distinct values, so n log n overall; each card is consumed exactly once. The classic mistake is starting a straight from an arbitrary card, or the most frequent one. Only the smallest card's role is forced, and that is what makes greedy correct here rather than a guess.
