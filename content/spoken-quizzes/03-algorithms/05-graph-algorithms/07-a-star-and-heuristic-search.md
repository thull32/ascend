---
lesson: a-star-and-heuristic-search
source: 8308d0790e19f958
---
## 1

A star, with an admissible but inconsistent heuristic, pops node X with a path cost of 10 and closes it. Later it finds a path to X costing 8. What is true?

A, it can happen; X must be reopened to keep A star optimal. B, it can happen only if the heuristic overestimates at some node. C, it is impossible; admissibility makes every popped cost optimal. D, it is harmless, since X cannot lie on the optimal path.

[think]

The answer is A: it can happen; X must be reopened to keep A star optimal.

Admissibility guarantees that the goal's cost is optimal when it is popped, not every node's. Without consistency, the estimated total is not monotone along paths, so a node can be popped early with a suboptimal cost, even though the heuristic never overestimates. Reopening restores optimality at the cost of the runtime guarantee, which is why consistency is preferred: it avoids the problem entirely.

## 2

On an 8-directional grid where diagonal moves cost 1, which heuristic is both admissible and the tightest?

A, octile distance, which charges root 2 for each diagonal. B, Manhattan distance, the sum of the x and y differences. C, Euclidean distance, the straight line. D, Chebyshev distance, the larger of the x and y differences.

[think]

The answer is D: Chebyshev distance, the larger of the two differences.

With diagonal moves costing 1, you cover the shorter axis for free while moving along the longer one, so the true distance is exactly the larger difference. Manhattan overestimates, so it is inadmissible, and so does octile, which assumes diagonals cost root 2. Euclidean underestimates more than it needs to.

## 3

You multiply a consistent heuristic by 1.5. What do you get?

A, a faster search whose path is within 1.5 times the optimum. B, greedy best-first search, with no bound on path cost. C, a slower search, since inflated estimates delay the goal. D, a faster search whose path is still guaranteed optimal.

[think]

The answer is A: a faster search whose path is within 1.5 times the optimum.

Scaling above 1 can overestimate, so admissibility is lost, and optimality with it, but weighted A star is suboptimal by at most the scale factor. It usually expands far fewer nodes, which is a legitimate trade-off when you state it. Only pure greedy best-first, which uses the heuristic alone, gives up the bound entirely.

## 4

Which task is a poor fit for A star?

A, routing one vehicle from a depot to one customer on a road map. B, computing delivery times from one depot to all 5,000 customers. C, moving a game character to the spot the player clicked. D, solving one 15-puzzle from a scrambled start.

[think]

The answer is B: delivery times from one depot to all 5,000 customers.

A star needs a single goal to aim its heuristic at. One-to-all is exactly Dijkstra's shape, and running A star 5,000 times would repeat most of the work. The other three are single-goal searches with good heuristics available.

## 5

Two candidate nodes have the same estimated total. Which should A star prefer, to reduce expansions, and why?

A, the smaller path cost so far, since a shorter known path is more reliable. B, the one discovered first, since first-in first-out order is stable. C, the larger path cost so far, since its smaller heuristic puts it nearer the goal. D, neither, since an equal total means equal work remaining.

[think]

The answer is C: the larger path cost so far, since its smaller heuristic puts it nearer the goal.

Among equal totals, a larger cost so far means a smaller remaining estimate, so the search is deeper along a promising path and finishes sooner. On the lesson's 9 by 9 example, it is the difference between 9 and 25 expansions. An equal total does not mean equal work remaining.

## 6

The graph has edges S to A costing 1, A to B costing 1, S to B costing 3, and B to G costing 2. The heuristic is 3 at A and 0 elsewhere. A star with a closed set returns 5, although the true distance is 4. Which statement explains it?

A, the heuristic overestimates at A, because 3 exceeds the direct edge from S to A. B, the heuristic is admissible but not consistent: the edge from A to B has a reduced cost of minus 2, so B closes with a suboptimal cost. C, ties were broken towards the smaller cost so far, so A was expanded after G. D, the closed set is checked at push time instead of pop time, which discards improvements.

[think]

The answer is B: admissible but not consistent, so B closes with a suboptimal cost.

The heuristic at A, 3, equals the true remaining cost from A, so admissibility holds; what fails is the triangle inequality on the edge from A to B. B pops early with a cost of 3, and when A later reaches B with a cost of 2, the closed set refuses the update, so G inherits the bad value. Reopening, or a consistent heuristic, gives 4.
