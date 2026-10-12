---
problem: graph-valid-tree
args: [4, [[0, 1], [1, 2], [2, 0]]]
frames: 46
source: cc8b99bebb90df9d
---
@0
Four nodes, numbered zero to three, and three edges: zero to one, one to two, and two back to zero. Hold onto one fact, because it is the whole solution. A graph with n nodes is a tree when it has exactly n minus one edges and is connected. You never hunt for a cycle; a cycle shows up on its own, as a node the traversal cannot reach. The first line checks the count. We have three edges and four nodes, and three is four minus one, so this example passes the cheap test. That is why it is interesting.

@1-5
Next we build an adjacency list: one empty list per node, four of them.

@6-15
Each edge goes in both directions, because the graph is undirected. Zero to one puts one in zero's list and zero in one's list. One to two links those two. Two to zero closes the triangle. When the loop ends, zero's neighbours are one and two, one's are zero and two, two's are one and zero, and node three's list is empty. Nothing touches node three.

@16-18
The traversal starts at node zero. The seen set holds zero, and the stack holds zero. We mark a node as seen when we push it, not when we pop it, so no node is ever pushed twice.

@19-28
We pop zero and look at its neighbours. One is not seen, so we mark it and push it. Two is not seen either, so we mark it and push it. Seen is now zero, one and two, and the stack holds one and two.

@29-35
The stack is last in, first out, so we pop two next. Its neighbours are one and zero, and both are already seen, so nothing is pushed. This is where a cycle-hunting search would get confused: zero is two's parent, but one was reached by a different path. Here, neither matters. Already seen means skip.

@36-42
We pop one. Its neighbours, zero and two, are both seen. Nothing new.

@43
The stack is empty, so the traversal is over. Three nodes reached.

@44-45
The answer is whether we reached all four nodes. Seen holds three, n is four, so we return false. Notice what happened. The edge count was right, but the edge from two back to zero closed a triangle instead of connecting a new node, and node three was left stranded. The cycle spent an edge that node three needed. Count, then one traversal, catches both failures.

The cost is linear: building the list and the traversal each touch every node and edge once, and the early count check means the edges are never more than the nodes. The classic mistake is checking only one property. No cycles alone accepts two separate trees; connected alone accepts a square with an extra edge.
