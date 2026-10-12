---
problem: last-stone-weight
args: [[2, 7, 4, 1, 8, 1]]
frames: 30
source: 1a5b5b404513350c
---
@0-8
Six stones, weighing two, seven, four, one, eight and one. Each round, smash the two heaviest together. If they weigh the same, both vanish; otherwise the lighter one vanishes and the heavier one shrinks by the lighter one's weight. What is left at the end? The rule only ever touches the two largest stones, and the pile changes by one stone at most per round. Repeatedly take the maximum, sometimes insert: that is exactly a priority queue. Python's heap is a min heap, so we store every weight negated. Then the heaviest stone, eight, has the smallest key, minus eight, and heapify puts it at the root.

@9-12
Round one. Pop the heaviest, eight, and negate it back. Pop the next, seven. They differ, so a stone of eight minus seven, one, goes back in, stored as minus one. The heap now holds four, two, and three ones.

@13-17
Round two. The heaviest are four and two. Four minus two is two, which goes back in. Now the pile is two and three ones.

@18-22
Round three. Two and one: the difference is one, which goes back. Three ones remain. Notice that we never sort the pile. The heap only keeps the heaviest at the root, and that is all the rule needs.

@23-26
Round four. One and one weigh the same, so both vanish, and nothing is pushed back. Pushing a zero would be harmless here, but pointless. One stone is left.

@27-29
One stone means the loop stops: you cannot smash a stone with nothing. We negate the root back and return one. Had the last two cancelled, the heap would be empty and we would return zero.

Heapify is linear, and each of at most n minus one rounds does two pops and at most one push, each costing log n. So the total is n log n, against n squared log n for re-sorting every round. Space is the heap. The common mistakes: looping until the heap is empty and then reading a stone that is not there; and negating on push but forgetting on pop, or the other way round.
