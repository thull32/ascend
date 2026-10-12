---
problem: minimum-height-trees
args: [6, [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5]]]
frames: 93
source: e1ecfbe2514083b6
---
@0
Six nodes. Picture a spine, 0, 1, 3, 4, 5, with node 2 hanging off node 1. Which roots give the shortest tree? The height from a root is the distance to the node farthest from it, so the best root sits in the middle of the longest path. Here that path is 0, 1, 3, 4, 5, and its middle is node 3. You can find the middle without finding the path: peel off every leaf at once, and repeat until one or two nodes remain. Each round trims both ends of every longest path, so the centre never moves.

@1-34
First the bookkeeping. With more than two nodes, we build an adjacency list and count each node's degree, one edge at a time. At the end, node 1 has three neighbours, nodes 3 and 4 have two each, and nodes 0, 2 and 5 have one.

@35-43
The first layer is every leaf, every node of degree one: 0, 2 and 5. Six nodes remain.

@44-46
While more than two remain, we remove the whole layer at once. Six minus three leaves three.

@47-51
Peel leaf 0. Its neighbour, node 1, drops from degree three to two. Not a leaf yet.

@52-57
Peel leaf 2. Node 1 drops to one, so it has become a leaf of what is left, and it joins the next layer.

@58-63
Peel leaf 5. Node 4 drops from two to one, and joins the next layer too.

@64-67
The next layer is 1 and 4, the two ends of what remains. Three nodes are left, still more than two, so we peel again: three minus two leaves one.

@68-80
Peel node 1. Its neighbours 0 and 2 are already gone, so their degrees just fall to zero and nobody cares. Its neighbour 3 drops from two to one, and joins the next layer.

@81-88
Peel node 4. Node 3 loses its other neighbour and drops to zero, and node 5 is already gone. Notice that the test is equals one, not at most one, so node 3 is added once, not twice.

@89-92
The next layer is just node 3, and one node remains, so the loop stops. We return node 3, the centre. Every node is peeled once and every edge looked at twice, so the time is linear. The mistake to avoid is checking the stop condition after each leaf instead of after each layer. A layer only makes sense as a whole, because it trims both ends of every longest path at the same time. Peel a star one leaf at a time and you stop with a leaf in your answer.
