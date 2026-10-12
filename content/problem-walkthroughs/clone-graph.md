---
problem: clone-graph
args: [{"$graph": [[2, 4], [1, 3], [2, 4], [1, 3]]}]
frames: 48
source: 4a5eed2d4387f6cc
---
@0-3
Four nodes in a square: 1 joins 2 and 4, 2 joins 1 and 3, 3 joins 2 and 4, and 4 joins 1 and 3. We must build a copy with new node objects. Copying neighbours blindly never ends: 1 copies 2, which copies 1 again, around the cycle forever. The fix is one map, from each original node to its copy. It does two jobs. It is the visited set, so cycles stop. And it is the wiring table: when a copy needs its neighbour, the map hands over the one copy that already exists. We clone node 1, put the pair in the map, and push node 1 onto the stack.

@4-9
Pop node 1. Its first neighbour, 2, is not in the map, so we clone it now, at the moment we discover it, and push it. Then we wire the copy of 1 to the copy of 2. Not to the original 2: that is the classic bug, a copy whose edges lead straight back into the input graph.

@10-15
The next neighbour of 1 is node 4. Also new: clone it, push it, and wire the copy of 1 to it. The copy of 1 now has both its neighbours, and the stack holds 2 and 4.

@16-20
Pop node 4, the last one pushed. Its first neighbour is 1, which is already in the map. We do not clone it again and do not push it. We just wire the copy of 4 to the existing copy of 1. That is the cycle being closed rather than chased.

@21-26
The other neighbour of 4 is 3, which is new. Clone it, push it, wire it. Now every node has a copy, and the stack holds 2 and 3.

@27-35
Pop node 3. Its neighbours, 2 and 4, are both in the map, so we only wire: the copy of 3 points at the copies of 2 and 4.

@36-44
Pop node 2. Its neighbours, 1 and 3, are both known. Wire the copy of 2 to the copies of 1 and 3. The stack is empty.

@45-47
We return the copy of node 1. Four clones and eight neighbour entries, the same shape as the original, sharing no objects with it. Each node is cloned once and popped once, and each neighbour entry is read once, so the time is linear in nodes plus edges, and the extra space is the map and the stack.

Two traps. Cloning when a node is popped rather than when it is discovered lets the same node be pushed several times and cloned twice. And keying the map by value instead of by the node itself works only while values are unique, which is exactly the follow-up question. In a recursive version, a long path-shaped graph will also blow the recursion limit, which is why this one uses an explicit stack.
