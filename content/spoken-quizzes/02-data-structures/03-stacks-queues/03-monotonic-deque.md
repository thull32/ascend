---
lesson: monotonic-deque
source: 2f0fd2efe5fa2ec0
---
## 1

In the sliding window maximum deque, why can the front index be removed with a single if, rather than a while loop?

A, expired indexes are removed from the back, not the front. B, one index enters and the window slides by one each step. C, back pops have already removed every index older than the window. D, the front is the newest index, so it is the last to expire.

[think]

The answer is B: one index enters and the window slides by one each step.

Indexes enter one per step, the window's left edge moves by exactly one each iteration, and the deque's indexes are increasing, so at most one index, the front, can have crossed the edge in this step. Back pops remove dominated indexes, not old ones, so an old maximum can still sit at the front until it expires. In a time-based window with gaps, several entries can expire at once, and there a while loop is required.

## 2

In the sliding window maximum deque, an older element is popped from the back when a later element that is greater than or equal to it arrives. Why is it safe to forget the older element entirely?

A, it has already been reported as the maximum of its window. B, the deque must stay within k entries, so something must go. C, it can be recovered from the prefix maxima if it is needed again. D, every future window containing the older element also contains the larger, newer one.

[think]

The answer is D: every future window containing the older element also contains the larger, newer one.

Windows are contiguous, so a window that includes the older index and reaches the present includes the newer one, and its maximum is at least that newer value. This domination argument is the whole invariant. The older element may never have been reported at all, and nothing about capacity forces the pop.

## 3

Compared with a max-heap using lazy deletion, what is the monotonic deque's advantage for sliding window maximum?

A, it handles removals in any order, since each index is stored once. B, linear time and constant space, because only the front is ever read. C, it also reports the k-th largest, because the deque is sorted. D, linear time and order k space, because expiry happens in arrival order.

[think]

The answer is D: linear time and order k space, because expiry happens in arrival order.

The deque exploits the fact that elements leave in the order they arrived, so only the front ever expires, giving linear time with at most k indexes stored. It cannot handle out-of-order removals or the k-th largest. A heap, two heaps, or a balanced search tree is needed for those.

## 4

For shortest subarray with sum at least k, when negative numbers are allowed, why does a two-pointer sliding window fail?

A, the window sum must be recomputed from scratch after each move. B, extending the window no longer guarantees the sum grows. C, two pointers need the array sorted before the window slides. D, two pointers find the longest valid subarray, not the shortest.

[think]

The answer is B: extending the window no longer guarantees the sum grows.

The window technique relies on the sum rising as the right edge moves and falling as the left edge moves, so the decision to shrink or extend is monotone. Negatives break both directions. A running sum still updates in constant time; the problem is the decision rule, not the arithmetic. Prefix sums with a deque of increasing prefix values restore a usable monotone structure.

## 5

A DP sets each value to the input at that position, plus the maximum of the previous k DP values. What is the best way to compute it for large n and k?

A, memoised recursion that caches each value once: linear. B, recompute the maximum over the last k values at each step: n times k. C, a monotonic deque over the DP values, maintaining the window maximum: linear. D, sort the last k values at each step and take the top: n times k log k.

[think]

The answer is C: a monotonic deque over the DP values, maintaining the window maximum, which is linear.

The transition is exactly a sliding window maximum over the DP values as they are produced, and the deque gives amortised constant time per step. Memoisation only avoids recomputing a value; each state still scans k predecessors, so it is n times k. A heap with lazy deletion would also work, at n log k.

## 6

A rolling 60-second maximum, built on a monotonic deque of timestamp and value pairs, sometimes reports a spike from minutes ago. What is the most likely bug?

A, back pops use less-than-or-equal, so equal values evict the newer sample. B, the deque stores values only, so timestamps cannot be compared. C, the window is count-based, so 60 samples are kept instead of 60 seconds. D, front expiry uses an if, so after a gap in samples, stale entries remain.

[think]

The answer is D: front expiry uses an if, so after a gap in samples, stale entries remain.

With irregular samples, several front entries can cross the window edge between two arrivals. An if removes only one of them, and the next stale entry becomes the reported maximum. Expiry must loop. A count-based window would be wrong constantly, not sometimes, and a value-only deque could not expire at all.
