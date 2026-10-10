---
lesson: graph-traversal
source: 6c948a4fa4d049f0
fit: partial
desk:
  - "The grid BFS and component DFS templates in Python and JavaScript"
  - "The Number of Islands, Rotting Oranges, Pacific Atlantic and Word Ladder traces"
  - "The flood-fill and grid BFS visualisations"
  - "The BFS against DFS comparison table, the near-misses table and the variations table"
  - "Exercise: largest island"
---
## Introduction

The problem gives you a grid of land and water. Or a dictionary of words. Or a list of accounts with shared emails. It asks how many groups there are, how far something spreads, or what the fewest steps are from here to there. Nothing in the statement says graph. But every one of these is a set of things with a neighbour relation, and every question is either "what is reachable" or "how far", which are the two questions graph traversal answers.

The skill is seeing the graph: naming the nodes, naming the edges, and then choosing a traversal by what the question asks. Breadth-first when the question involves distance or fewest steps. Either one when it involves reachability, components, or filling a region. Once the graph is named, the code is the same twenty lines every time, and the only thing left to get right is the visited set.

Coming up: the signal words, the one line where the visited mark goes, four classic problems, and the follow-ups that quietly change the pattern.

## The signal

Listen for these. "Connected", "groups", "regions", "islands", "components", "provinces": run one traversal per unvisited start node, and the number of traversals is the number of components. "Spreads", "rots", "infects" over time, or "nearest exit" or "nearest gate": that is multi-source breadth-first search, where every source starts in the queue at distance zero and each level is a time step. "Fewest steps", "shortest transformation", "minimum moves" on unweighted moves: breadth-first from the start, and often the nodes are states, like a word or a board position, and the edges are legal moves. "Surrounded", "enclosed", "can reach the border": traverse from the border inward. "Clone the structure": traverse once with a map from original to copy.

What rules it out. If the edges have weights and you want minimum total cost, breadth-first counts edges, not weight, so that is a shortest-path problem. If the edges are "must come before" dependencies and you need an ordering, that is topological sort. And if edges arrive over time, or the only question is "same group?" for many pairs, union-find does it without traversing.

Choosing between the two traversals: if the answer involves a distance or the first time something happens, breadth-first. If it involves everything reachable, either works. Recursive depth-first is shorter to write. Breadth-first avoids recursion-depth problems on a thousand by thousand grid, where a snake-shaped island can recurse a million frames deep. Say that trade-off out loud and pick.

## The visited mark

The line that matters most is where you set visited. In breadth-first search, mark a node visited when you enqueue it, not when you dequeue it.

Picture a tiny square: four cells, A in the top left, B to its right, C below A, and D diagonally opposite, touching both B and C. Start at A. You enqueue B and C. If you only mark on dequeue, then B enqueues D, and C, which is still waiting, enqueues D again. Now D is in the queue twice, and both copies fan out to their neighbours. Mark on enqueue, and D goes in once.

The answers stay correct when you mark late, because the first copy still carries the right distance. But the queue can hold a copy of every node for each of its neighbours, and every copy is expanded. On a grid that is up to four times the work and memory. On a dense adjacency list it can be a factor of the whole graph.

Why is this the invariant and not a micro-optimisation? Breadth-first correctness rests on one claim: when a node is dequeued, its recorded distance is the shortest. The proof needs every node to enter the queue exactly once, at the moment its first, and therefore shortest, path is found.

The cost is linear in nodes plus edges. Each node is enqueued at most once because it is marked when enqueued. Each dequeue examines that node's edges, so summed over everything, each edge is seen once from each end. On a grid every cell has at most four edges, so it is linear in the number of cells.

The visited structure is where the constant factors live. Measured in CPython on a thousand by thousand grid: a set of row-and-column pairs costs about 121 megabytes. A list of lists of booleans, about 8. A byte array, about 1. Writing the mark into the input grid itself costs nothing. None of this changes the big-O, but all of it decides whether a million-cell test fits a 256 megabyte limit.

## Islands and oranges

Number of Islands: count groups of land cells connected up, down, left and right. Nodes are land cells; edges join neighbouring land. Every traversal from an unvisited land cell marks exactly one island, so the count is the number of traversals started. The memory trick is to sink visited land, overwriting it with water instead of keeping a separate set. Ask whether mutating the input is acceptable. The lesson's four by five grid has four islands.

Recursion depth is the practical concern. A 32 by 32 grid of all land already passes CPython's default of 1,000 frames. The iterative version pushes cells onto an explicit stack, marks them on push, and pops in a loop.

And one silent bug: a bounds check that tests the upper edges but forgets "at least zero". In Python, row minus one wraps around to the last row, so a traversal leaks across the top edge into the bottom row and you get wrong counts with no crash. In JavaScript the same bug crashes, which is the kinder failure.

Rotting Oranges: every minute, each fresh orange next to a rotten one rots. How many minutes until none are fresh, or minus one if that never happens? "Spreads from all rotten ones at once" is multi-source breadth-first search. Put every rotten orange in the queue at the start. Each level is one minute.

On the lesson's three by three grid the answer is 4. But a loop that simply runs while the queue is non-empty and counts levels returns 5. Why?

[pause]

The last orange rots at minute 4, and then it is dequeued in a fifth level that rots nothing new, but still increments the counter. Guard the loop with "while there are fresh oranges left", which also handles the case of no fresh oranges at the start by returning zero. Walls and Gates is the same pattern with gates as the sources: one pass gives every room its nearest gate, where a search from each room would be quadratic in the number of cells.

## Oceans and word ladders

Pacific Atlantic Water Flow gives you a height grid. Water flows to a neighbour of equal or lower height. The Pacific touches the top and left edges, the Atlantic the bottom and right. Which cells can drain to both?

The obvious approach traverses from every cell, which is quadratic in the number of cells. The insight is to reverse direction and start from the oceans, climbing to equal or higher neighbours. Reversing every edge preserves reachability between the same endpoints. So you run two traversals, one per ocean, each seeded with an entire edge, and the answer is where the two reached sets overlap. Linear in the cells. Surrounded Regions uses the same move: mark every open cell reachable from the border, then flip the rest.

Word Ladder: turn one word into another, one letter at a time, every step a dictionary word, and return the length of the shortest chain. There is no grid and no adjacency list, but there is a graph. Nodes are words; edges join words that differ in one letter. Shortest chain means breadth-first.

The trick is how you find neighbours. Comparing against every dictionary word costs the dictionary size times the word length for each word you dequeue. Instead, generate every one-letter edit, 26 times the word length of them, and look each up in a set. For 5,000 seven-letter words, that is under a million candidates, under a tenth of a second. Comparing every pair of words is about 175 million character comparisons, which is seconds in Python. In the lesson's example, hit becomes hot, dot, dog, and finally cog, a chain of five words.

## Variations and traps

Graph Valid Tree: given an undirected edge list, is it a tree? A tree on n nodes has exactly n minus 1 edges and is connected. Check the edge count, traverse from node zero, and check every node was reached. The trap: every undirected edge is seen from both ends. Take two nodes, 0 and 1, with one edge. When the search reaches node 1 and looks back, node 0 is already visited, and a naive check reports a cycle. Skip the node you arrived from. When parallel edges are allowed, skip the edge you arrived by instead, because two edges between the same pair really are a cycle.

Clone Graph: traverse with a map from original to copy. Create the copy when you first see a node, before enqueuing it, and the map is your visited set. Create it later and a node reached from two neighbours is copied twice.

Bipartite check: breadth-first with alternating colours, and an edge between two same-coloured nodes means an odd cycle. Zero-one breadth-first search: edges cost zero or one, like walking free and breaking a wall costing one. Use a double-ended queue, pushing zero-cost neighbours to the front and one-cost neighbours to the back. Same cost as breadth-first, and it is the bridge to Dijkstra.

And state-space search: the nodes are whole configurations, encoded as hashable keys, the edges are legal moves, and the visited set is what keeps the search finite.

## In the interview

Here is a follow-up that changes the pattern. Now you may knock down up to k walls. What changes?

[pause]

The state becomes the row, the column, and the number of removals left. Visited is per state, not per cell, because the same cell is worth revisiting with more removals remaining. Breadth-first over the expanded space costs cells times k. The wrong answer is a greedy that removes a wall whenever the direct route is blocked.

Two more. Return the actual path, not just its length: record each node's parent when you enqueue it, then walk back from the goal. Carrying the whole path in every queue entry copies a list on every enqueue. And cells become land one at a time, reporting the island count after each addition: that is union-find, near constant time per addition, against a full flood fill after every one.

## Recap

Four things to remember. Name the graph first: what is a node, what is an edge. Breadth-first for distance, either for reachability, and the iterative form when a component could be a million cells deep. Mark visited when you enqueue, so each node enters the queue once; and choose the visited structure deliberately, from 121 megabytes for a set of pairs down to 1 for a byte array. And recognise the moves: many sources at once for "nearest" and "spreads", reverse from the boundary for "can reach the edge", and add a dimension to the state when the problem adds a resource like wall removals.

At your desk: the two templates, the four traces, the comparison and variations tables, the two visualisations, and the largest-island exercise.
