---
lesson: grid-and-two-dimensional-dp
source: a4fc5ac4b8c4d968
fit: partial
desk:
  - "The grid fills: unique paths on 3 by 4, obstacles on 4 by 4, and min path sum with its walk-back table"
  - "The rolling-row code, the wrong-direction trace, and the LCS diagonal-variable version"
  - "Under the hood: bytes and nanoseconds per cell, cache behaviour, and the overflow table"
  - "The trade-offs table and the inclusion-exclusion formula for huge sparse grids"
  - "Exercises: unique paths with obstacles, and min path sum with one rolling row"
---
## Introduction

A robot sits in the top-left corner of a grid and can only move right or down. How many routes reach the bottom-right corner? On a 3 by 7 grid there are 28, and you could list them. On a 20 by 20 grid there are about 35 billion, and a search that visits every route will not finish today.

Yet the answer for any cell depends only on the answers for two neighbours, and there are only rows times columns cells. A 20 by 20 grid is 400 cells. That is a two-dimensional table, and it is the most visual family there is: you can watch it fill.

Grid tables are also where memory first matters, and where a table first goes silently wrong. So: the state and the recurrence, why it is correct, obstacles and minimum costs, the rolling row and its forced direction, what the table really costs, and when row by row is the wrong order.

## Unique paths

The state: the number of distinct paths from the top-left to cell r, c.

The transition: the last move into the cell came from above or from the left. Those two sets of paths are disjoint, because a path's last move is one or the other, and together they are all the paths. So the count is the cell above plus the cell to the left.

Base cases: every cell in the first row and first column has exactly one path, all right or all down. Then fill row by row, left to right. By the time you reach a cell, the one above was filled in the previous row and the one to the left a moment ago.

Say it on a 3 by 4 grid. The first row is 1, 1, 1, 1. The second row starts with 1, then 1 plus 1 is 2, then 1 plus 2 is 3, then 1 plus 3 is 4. The third row: 1, then 2 plus 1 is 3, then 3 plus 3 is 6, then 4 plus 6 is 10. Ten paths.

That is Pascal's triangle, tilted. A path is a choice of which of the moves are downs, so there is a closed form with a binomial coefficient. But the table is still the better answer as soon as obstacles or weights appear.

## Why it is correct

An interviewer who asks "why can you add those two numbers?" wants three things stated.

First, the state is sufficient. Everything a path does after reaching a cell depends only on the cell. The moves and cells ahead are the same whichever route arrived. So all the paths to a cell can be summarised by one number.

Second, for counting, the partition. Paths from above end with a down move, paths from the left end with a right move, so each is counted exactly once. The check is always: does every object land in exactly one branch?

Third, for minimisation, cut and paste. Take a cheapest path to a cell and cut off its last step. The prefix must be a cheapest path to its own cell, or pasting the last step onto a cheaper prefix would beat the optimum.

And the fill order must respect the dependencies. Think of cells as nodes and transitions as edges pointing up and left. Row by row is a topological order of that graph. Every fill order is a topological order of its dependency graph; row by row is just the one that happens to work here.

## Obstacles and minimum cost

Now some cells are blocked. The state does not change. The transition gains one condition: a blocked cell has zero paths through it. The subtle part is the border. Once the first row hits an obstacle, every cell after it in that row is unreachable, so the base-case ones must stop.

The clean fix is to pad the table with an extra row of zeros on top and a column of zeros on the left, seed the start cell with 1, and let the transition compute the borders itself. Padding with an identity value, zero for sums, infinity for minimums, removes a whole class of off-by-one bugs.

Minimum path sum is the same shape with minimum instead of plus. Each cell has a cost, and the state is the cheapest path to that cell, both ends included. The transition: this cell's cost, plus the cheaper of above and left.

The table holds costs, not moves, but the route is recoverable. From the end cell, step to whichever neighbour explains the value, and repeat. On the lesson's 3 by 3 example the cheapest route runs along the top and down the right edge, through costs 1, 3, 1, 1 and 1, for a total of 7. Or keep a parent table as you fill: two bits a cell.

## The rolling row

Look at what the transition reads: the cell above, from the previous row, and the cell to the left, from the current row. Nothing older. So one array the width of the grid is enough.

Here is the trick. Keep one row, and sweep left to right. At column c, that slot still holds the previous row's value, which is "above". The slot to its left has already been overwritten with this row's value, which is "left". Exactly the two things the transition needs.

Now, what happens if you sweep right to left instead?

[pause]

On the 3 by 4 grid it returns 4 instead of 10. Sweeping from the right, the left slot has not been updated yet, so each cell adds two values from the previous row instead of "above plus left". No exception, no warning, a plausible-looking number. The direction is not style: it is forced by what the transition reads.

The general rule, which the knapsack lesson makes its centrepiece: a value needed from the current row must already be overwritten when read, so sweep towards it. A value needed from the previous row must not be, so sweep away from it. When a transition needs both, as edit distance and longest common subsequence do with their diagonal, no direction works, so you save the old value in one extra variable before overwriting it.

Two cautions. Rolling rows destroy the table, so the walk back is gone; keep parent bits or checkpoints if the route is wanted. And min path sum can run in place on the input grid with no extra memory, but say out loud that you are mutating the input, because in production that is usually a bug.

## What the table really costs

In Python, a table is a list of row lists, and memory is dominated by what you do not see. Each slot is an 8-byte pointer, and each value is a separate integer object of 28 bytes or more. A million-cell min path sum table measured 40 megabytes. The same-size unique paths table measured 150, because its corner count has 600 digits. A NumPy array of 64-bit integers is exactly 8 megabytes. So the honest Python answer is 40 to 150 bytes a cell, not 8.

Time is similar. That million-cell loop took about 90 milliseconds in Python, about 90 nanoseconds a cell, nearly all interpreter overhead. A compiled language does a cell in a few nanoseconds. And fill along the contiguous dimension: row by row touches consecutive addresses, while column by column lands on a fresh cache line every time.

Path counts also overflow, silently. A 32-bit signed integer first overflows at the corner of an 18 by 18 grid and wraps negative. A JavaScript double first goes wrong at 32 by 32, off by 32, with no error. A 64-bit integer overflows at 35 by 35. That is why problems say "modulo a billion and seven": you reduce each cell as you fill it, and the table stays inside 32 bits.

## When the order is not row by row

Row by row works because every dependency has a smaller row or column. Longest increasing path breaks that: you may move in four directions to a strictly larger value, so a cell can depend on one below it or to its right.

The state and transition are easy: the longest path starting here is one plus the best over strictly larger neighbours. The order is the problem. Because values strictly increase, the dependencies form a directed acyclic graph, so an order exists. Memoised recursion finds it for you, but its depth can reach the whole path length and pass Python's 1,000-frame limit on a 40 by 40 grid. Or sort the cells by value and process smallest first, with no recursion at all.

And sometimes no table is right. A grid of a million by a million with 2,000 obstacles has a trillion cells; count paths with inclusion and exclusion over the sorted obstacles instead. If moves go in four directions with weights, the dependencies have cycles, and it is Dijkstra, not a table. And if the cost of a path is its highest cell rather than its sum, the best route may go up, and a right and down table gives the wrong answer.

## In the interview

A follow-up the lesson expects. The robot may now move in any of the four directions. Same table?

[pause]

No. The dependency graph now has cycles, so there is no fill order. Min path sum becomes Dijkstra on the grid graph. Unique paths is ill-defined unless paths are simple, which makes it a hard counting problem. The wrong answer is depth-first search with a visited set, which is exponential for counting and wrong for costs.

Another: give me the actual route in linear memory. Two bits of parent direction per cell is a quarter of a byte a cell, 250 kilobytes for a million cells, usually fine. If not, checkpoint every k-th row and recompute between checkpoints while walking back. "It is impossible once the rows are rolled" is the wrong answer.

## Recap

Four things to remember. A grid state is the count or cost to reach a cell, and the transition comes from which neighbours can enter it: a sum for counting, a minimum for cost, justified by partition and by cut and paste. Pad with an identity border instead of special-casing the edges. The rolling row's sweep direction is forced by what the transition reads, and the wrong direction returns a quiet wrong number. And a fill order is a topological order of the dependencies; when moves have cycles or the objective is a maximum, reach for Dijkstra or binary search, not a table.

At your desk: the grid fills and the walk back, the rolling-row code and the wrong-direction trace, the cost and overflow numbers, the trade-offs table, and the obstacles and min path sum exercises.
