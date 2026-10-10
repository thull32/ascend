---
lesson: a-star-and-heuristic-search
source: 4348cb78a4890813
fit: partial
desk:
  - "The A-star code, and the five-by-five grid trace with g, h and f for each expansion"
  - "The admissibility proof and the reduced-cost view of consistency, written out"
  - "The four-node inconsistent-heuristic table, closed set against reopening"
  - "The heuristic-per-graph table and the search trade-offs table"
  - "Exercises: A-star on a grid with Manhattan distance, and checking whether a heuristic is admissible and consistent"
---
## Introduction

Run Dijkstra from Berlin to find a route to Munich, about 585 kilometres by road, and it settles every node closer than that before it pops Munich: Hamburg, Rostock, and Poland as far as Warsaw. It has no idea which direction the goal is in, because the only thing it knows is distance from the start. Every one of those northern and eastern nodes is wasted work.

A-star fixes this with one extra number per node: an estimate of the distance to the goal, called h. The priority queue orders nodes by distance so far, called g, plus that estimate. Nodes heading the wrong way sink to the bottom of the queue, and the search expands a corridor towards the goal instead of a circle around the start. The remarkable part: with the right kind of estimate, this is not an approximation. A-star returns exactly the optimal path.

Three ideas, then. Admissible, which keeps the answer optimal. Consistent, which lets you settle each node once. And when A-star is the wrong tool.

## The mechanism

A-star is Dijkstra with one change: the heap key goes from g to g plus h. Everything else stays: tentative distances, relaxation, lazy deletion, settling on pop.

Two details. Return when the goal is popped, not when it is first pushed; a pushed entry only carries a tentative distance, and returning early gives distances that are sometimes one edge too long. And h is computed for every relaxed neighbour, so it must be cheap. Manhattan distance is two subtractions. A heuristic that runs its own search, or a database lookup per node, is usually a net loss.

Two reference points. If h is always zero, A-star is Dijkstra: no pruning, no risk. If h is the exact remaining cost, A-star expands only the nodes on the optimal path. Real heuristics sit in between, and the tighter they are, the fewer nodes it expands.

Here is the size of the win. A 9 by 9 empty grid, start in the centre, goal in a corner, moving in four directions, so the goal is 8 steps away. Dijkstra settles every cell closer than 8 before it pops the goal: 77 of the 81 cells, all but the four corners. A-star with Manhattan distance only expands cells in the rectangle between the centre and the corner: 25 cells at most, and only 9 if it breaks ties towards the larger g. Nine or 25, against 77.

That tie-break deserves its own sentence. Near the goal, many nodes share the same g plus h. Prefer the one with the larger g, which means the smaller remaining estimate, and the search keeps walking along one path instead of fanning out. It can halve the expansions on an open grid.

## Admissible: never overestimate

A heuristic is admissible if it never overestimates the true remaining cost, at any node. Zero is admissible. Straight-line distance on a road network is admissible, because no road is shorter than the straight line. Manhattan distance on a four-direction grid is admissible.

The claim: with an admissible heuristic, the first time the goal is popped, its distance is optimal. The proof in words. Suppose a cheaper path to the goal exists. Look at the first node on it that has not been expanded yet. Its g is at most the cost of the path up to it, and its h is at most the true cost from it, so its g plus h is at most the cheaper path's cost, which is less than the goal's. So it would have been popped before the goal. Contradiction.

Notice what that proof does not say: anything about how many times an ordinary node might be expanded. That is the job of the stronger property.

## Consistent: the triangle inequality

A heuristic is consistent if, for every edge from u to v, the estimate at u is at most the edge weight plus the estimate at v. It is a triangle inequality: the estimate from u cannot exceed one step to v plus the estimate from there. Consistency implies admissibility. Manhattan, Euclidean and Chebyshev distances are all consistent, because each is a true metric.

What it buys: g plus h never decreases along a path. That means when a node is popped, its g is already final, exactly as in Dijkstra, and the closed set, "never expand this node again", is correct. The cleanest way to see it: A-star is Dijkstra on reduced edge costs, the weight minus h at the tail plus h at the head. Consistency says precisely that no reduced cost is negative, which is the one thing Dijkstra's proof needs.

So what happens when a heuristic is admissible but not consistent? The lesson's four-node example. S to A costs 1. A to B costs 1. S to B costs 3. B to the goal G costs 2. The true distance from S to G is 4, through A and B. Now set h at A to 3 and h everywhere else to zero. That never overestimates: from A the true remaining cost is exactly 3. So it is admissible. But on the edge from A to B, 3 is more than 1 plus zero, so it is not consistent. What does A-star with a closed set return?

[pause]

It returns 5. From S, A gets pushed with g plus h equal to 4, and B with 3. B pops first, with g of 3, which is not yet optimal, and it is closed. It pushes G at 5. Then A pops and finds B at 2, but B is closed, so the improvement is thrown away. G pops at 5. The true answer is 4. With reopening allowed, B is pushed again at 2, and G comes out at 4, but the running time loses its guarantee. With any metric heuristic this cannot happen. When a heuristic is learned, cached or hand-tuned, check the triangle inequality on every edge: one linear pass.

## Choosing the heuristic

Match it to the movement. Four directions on a grid, unit cost: Manhattan. Eight directions where a diagonal also costs 1: Chebyshev, the larger of the two axis distances, because you cover the shorter axis for free while moving along the longer. Manhattan there overestimates, since one diagonal step covers two Manhattan units for a cost of one. On roads with costs in metres: straight-line distance. With costs in seconds: straight-line distance divided by the maximum speed limit. A heuristic in metres against a g in seconds is the other classic overestimate. And the larger of two consistent heuristics is still consistent, and stronger.

## When A-star is the wrong tool

Many goals, or all destinations. A-star needs one goal to aim at. "Delivery times from one depot to 5 thousand customers" is Dijkstra's shape; A-star would run 5 thousand times.

No usable heuristic. On a dependency graph or a social network there is often nothing that lower-bounds the remaining distance except zero, and then A-star is Dijkstra with a heavier heap key.

Overestimating on purpose. Multiply the heuristic by 1.5 and you get weighted A-star: often far fewer expansions, and a path guaranteed within 1.5 times optimal. Pure greedy search on h alone has no guarantee at all. That trade is legitimate when you say it out loud, and a bug when you do not.

Memory. A-star keeps every generated node. On huge puzzle state spaces that is the bottleneck, and iterative deepening on the g-plus-h bound trades time for memory proportional to depth.

And the surprise: continental road routing. Plain A-star with straight-line distance is only a few times faster than Dijkstra there, because road distance exceeds the straight line by a large and varying factor, so the corridor is still huge. Production engines use landmarks, precomputed exact distances from a few dozen well-spread nodes that give much tighter bounds, or contraction hierarchies, which preprocess shortcuts so a query touches a tiny fraction of the graph. A-star is the textbook answer, not the deployed one, and saying so is a useful thing in a design interview.

## In the interview

A follow-up from the lesson. Can A-star handle negative edge weights?

[pause]

No, for the same reason as Dijkstra. Settling on pop needs non-negative reduced costs, and a negative edge is a negative reduced cost whatever h is. Reweight first, with Johnson's potentials, which are themselves a consistent heuristic, or use Bellman-Ford. The wrong answer is "yes, if the heuristic is admissible".

And: how would you validate a heuristic someone hands you? Two checks, then a test. Admissibility: compare h with exact distances from Dijkstra on the reversed graph, for a sample of goals. Consistency: check the triangle inequality on every edge. Then run A-star against Dijkstra on random pairs and compare. "The paths look reasonable" is not a check.

## Recap

Four things to remember. A-star is Dijkstra keyed on g plus h; return on pop, and break ties towards larger g. Admissible, never overestimating, keeps the goal's answer optimal. Consistent, the triangle inequality on every edge, is what makes the closed set safe, because it means no reduced edge cost is negative; the four-node example returns 5 instead of 4 without it. And pick the heuristic for the movement model, Manhattan for four directions, Chebyshev for eight, distance over top speed for travel times, and know that one-to-all queries and continental routing are not plain A-star's job.

At your desk: the A-star code and the grid trace, the two proofs written out, the four-node table, the heuristic and trade-offs tables, and the two exercises.
