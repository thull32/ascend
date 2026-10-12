---
problem: minimum-interval-query
args: [[[5, 6], [1, 4], [2, 2]], [6, 2, 9]]
frames: 55
source: 23002516285a109c
---
@0
Three intervals: 5 to 6, 1 to 4, and 2 to 2. Three queries: 6, 2 and 9. For each query we want the size of the smallest interval that contains it, or minus one. The insight is to answer the queries in increasing order. As the query point moves right, an interval becomes a candidate once its left end is reached, and once its right end is passed it can never be a candidate again. So intervals enter in order of their left ends, and a min-heap ordered by size hands us the smallest live candidate.

@1-7
Sort the intervals by left end: 1 to 4, 2 to 2, 5 to 6.

@8-14
Now sort the queries, but sort their positions, not their values, so each answer can go back where it belongs. The values are 6, 2 and 9, so the order of positions is 1, 0, 2.

@15-19
Every answer starts as minus one, the heap is empty, and i points at the first interval. The first query handled is position 1, the value 2.

@20-27
Every interval whose left end is at most 2 becomes a candidate. 1 to 4 has size 4, so we push the pair size 4, right end 4. 2 to 2 has size 1: closed intervals, so right minus left plus one. We push size 1, right end 2. The next interval starts at 5, past the query, so it waits.

@28-31
The top of the heap is size 1, ending at 2. It has not expired, since 2 is not less than 2. So query 2 gets the answer 1, stored at position 1.

@32-37
Next, position 0, the value 6. The interval 5 to 6 enters, with size 2.

@38-40
Now the lazy expiry. The top is size 1, ending at 2, which is before 6, so it is popped. The new top is size 2, ending at 6: alive. But look at the heap: the interval 1 to 4 is still in there, expired. That is fine. It is not on top, so it is never reported, and it will be cleaned up when it reaches the top.

@41-43
Query 6 gets 2, stored at position 0.

@44-51
Last, the value 9. No intervals are left to enter. The top, ending at 6, has expired, so it goes. Then the stale 1 to 4 reaches the top and goes too. The heap is empty.

@52-54
Nothing contains 9, so its answer stays minus one. We return 2, 1, minus 1, in the original query order. Each interval is pushed once and popped at most once, so the total is n log n for the intervals plus q log q for sorting the queries. Two classic mistakes: answering in sorted order and forgetting to map back, which is why we sorted positions; and computing the size as right minus left, which makes the interval 2 to 2 size zero.
