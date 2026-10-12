---
problem: linked-list-cycle
args: [[3, 2, 0, -4], 1]
frames: 30
source: d437cbe1246a8f5d
---
@0-14
A list of four nodes, three, two, zero and minus four, and the last node points back to the node at position one, the two. So the list never ends: after minus four comes two again. The first lines are scaffolding. They build the nodes, link each to the next, and then close the cycle by pointing minus four back at two. On screen, each node now reads as a chain that ends in "back to an earlier node".

@15-16
Now the detection, Floyd's tortoise and hare. Hold onto one idea, because it is the whole proof. Slow moves one step per turn, fast moves two. If the list ends, fast falls off it first. If there is a cycle, both end up inside it, and from then on fast gains exactly one node on slow every turn. A gap that shrinks by one each turn must hit zero, so they meet. Both pointers start at the head, three.

@17-19
Turn one. Slow steps to two. Fast steps twice, past two, to zero. They are different nodes, so we go on. Notice we check after moving, not before. Before moving, they always start together.

@20-23
Turn two. Slow steps to zero. Fast steps from zero to minus four, then follows the back link to two. Fast has gone round the loop once and is now behind slow inside the cycle. Still different nodes.

@24-27
Turn three. Slow steps to minus four. Fast steps from two to zero, then to minus four. Both pointers are on minus four, and the check asks whether they are the same node, not merely equal values.

@28-29
They are the same node, so we return true. There is a cycle.

Detection takes linear time: slow needs at most n steps to enter the cycle, and at most one lap more before fast catches it. Space is two pointers. Fast cannot jump over slow, because the gap between them shrinks by exactly one per turn and so passes through zero rather than skipping it. The classic mistakes: comparing values instead of node identity, which duplicate values break; checking for a meeting before moving, which is true at the start for every list; and guarding only fast, then reading fast's next's next when fast's next is empty.
