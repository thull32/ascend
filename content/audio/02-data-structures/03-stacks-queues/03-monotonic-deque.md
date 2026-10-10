---
lesson: monotonic-deque
source: d7727f416e1529a4
fit: partial
desk:
  - "The sliding-window-maximum code, and the two full traces: the classic input, and the expiry-only input"
  - "The deque against heap, two heaps and sparse table comparison table"
  - "The time-based window trace, and the kernel's three-sample tracker with its counter-example"
  - "The two-deque max-and-min trace, and the shortest-subarray code with its prefix-sum trace"
  - "The windowed DP trace, jump at most two cells"
  - "Exercises: sliding window maximum, and shortest subarray with sum at least k"
---
## Introduction

A metrics pipeline reports the maximum request latency over the last 60 seconds, updated every second. The naive version rescans the window every second. At one sample per millisecond, that is 60 thousand comparisons per update, and a 99th percentile that jumps every time a garbage collection lands mid-scan.

A heap gets each sample down to logarithmic time, but it has to cope with samples that expire while buried somewhere in the middle of the heap. The right structure does it in constant amortised time per sample, with a handful of comparisons. It is the monotonic stack with one addition: the window's left edge can now evict too.

Three ideas: the two eviction rules and why you need both, when the deque beats a heap and when it cannot, and what changes when the window is measured in seconds instead of samples.

## Two ways to leave

Given an array and a window of size k, report the maximum of every window. Brute force is n times k. The target is linear.

Start from the domination argument. When a new element arrives, any earlier element smaller than or equal to it can never again be the maximum of any window. Why? Because windows are contiguous. Any future window that still contains the older element also contains the newer, larger one. So the older one is dead, and you discard it from the back. What survives, front to back, is decreasing. That part is exactly the monotonic stack.

The new ingredient is expiry. The element at the front, the current maximum, eventually falls out of the window because it is too old, not because anything bigger arrived. A stack cannot remove from its bottom. A deque can. So: pop from the back to keep it decreasing, pop from the front to throw out expired indices, and read the maximum at the front.

Here is the input that proves you need both rules. The values are 5, 1, 1, 1, 1, with a window of two. Before I tell you: if you only implement the back-pops, what does the window maximum say forever?

[pause]

Five. Nothing bigger than 5 ever arrives, so nothing ever pops it from the back. But by the third element, the window holds two 1s and no 5 at all. The correct output is 5, then 1, 1, 1. The 5 has to leave from the front because of its age. The standard test data, 1, 3, minus 1, minus 3, 5, 3, 6, 7, never exercises expiry, which is exactly why this bug ships.

## The invariant, and why it is linear

The deque holds indices in the current window, increasing front to back because they arrived in order, with values strictly decreasing front to back. So the front is the window maximum, and the front is also the oldest survivor, which is why expiry only ever removes from the front. Store indices, not values. Without the index you cannot tell that something has expired.

For a count-based window, one if-statement at the front is enough, not a loop. One index enters per step and the window slides by one per step, so at most one index can cross the edge each time.

Linear time follows from the same accounting as the stack. Each index is appended once and removed at most once, from either end. At most 2n operations. Space is at most k indices. For a 60-second window at a sample per millisecond, that is 60 thousand indices, 480 kilobytes, at worst. The worst case is a strictly decreasing input, where nothing is ever dominated. In a typical latency series, the deque holds a few dozen, because each new high evicts everything behind it.

The constant depends on your deque. Python's deque does each end operation in about 30 to 35 nanoseconds. But a Python list with a pop at the front costs time proportional to k per expiry, and quietly turns the algorithm into n times k. In JavaScript, shift is the same trap: keep a head index instead.

## Deque or heap

The heap solution keeps value and index pairs in a max-heap. For each window, pop the top while its index has expired, which is called lazy deletion, then report the top. That is n log n time, and up to n space, because expired entries linger until they reach the top.

The deque wins whenever elements leave in the same order they arrived, which is exactly what "window" means. The heap is the fallback when they do not. If samples have individual deadlines, or a caller can cancel a sample in the middle of the window, the deque cannot delete from its middle. And if you need the median or the k-th largest, the deque only tracks extremes; you need two heaps or a balanced tree.

The lesson's senior answer to "sliding window maximum" is this: n log n with a heap and lazy deletion is the safe first answer; the linear deque exists because expiry is in arrival order, so you never need to delete from the middle.

## Time-based windows

Production windows are measured in seconds, and samples arrive irregularly. Two things change. Expiry compares timestamps: pop the front while its timestamp is at or before now minus the window. And that becomes a while loop, not an if.

Here is the lesson's example, a three-second window. Latency 40 at time zero, 25 at time one, 30 at time two. The 30 pops the 25 from the back, so the deque holds 40 and 30. Then nothing arrives until time five, latency 10. Now both the 40 and the 30 are too old, and both must leave in one step. With an if, you drop the 40, leave the 30 at the front, and report 30 for a window that contains only the sample at time five. That is the dashboard showing a spike from minutes ago.

Use a monotonic clock, too. If wall-clock time jumps backwards, newer samples can expire older ones incorrectly.

The Linux kernel runs a bounded approximation of this in its TCP stack. Instead of a deque that can grow to k, it keeps exactly three samples, the best, second best and third best in the window, with their timestamps. BBR uses it for its windowed maximum delivery rate, and the stack uses it for the windowed minimum round-trip time. Three slots means it can forget a value the deque would have kept, so occasionally it reports a smaller maximum than the true one. The kernel accepts that error for constant memory and constant time per socket, on millions of sockets.

## The same idea, extended

Two deques at once. "Longest subarray in which the maximum minus the minimum is at most some limit" needs both extremes of the window. Keep a decreasing deque for the maximum, an increasing deque for the minimum, and a left pointer that moves only when the constraint breaks. Expiry is now "index before the left pointer", and it can hit either deque.

Prefix sums. "Shortest subarray with sum at least k" is easy with two pointers when every number is non-negative. With negatives, two pointers fail, because extending the window no longer guarantees the sum grows. Work with prefix sums instead, and keep a deque of candidate left endpoints whose prefix values are increasing. An older candidate with a larger-or-equal prefix is useless, because a newer one is closer and at least as good, so pop it from the back. And once the front candidate works for the current right end, record the length and pop it, since any later right end would only give a longer subarray. Each index enters and leaves once: linear.

Dynamic programming. If each state is its own value plus the maximum of the previous k states, the transition is a sliding window maximum over the DP array as you fill it in. That turns n times k into linear. Order matters inside each step: expire the front, read the front to compute the new state, and only then push the new index.

## In the interview

The lesson's follow-ups. Make it a 60-second window with irregular samples.

[pause]

Store timestamp and value pairs, expire from the front with a while loop on timestamps, and use a monotonic clock. The deque holds as many entries as there are still-relevant local maxima, not one per second. The common wrong answer keeps the if, which breaks after any gap.

Next: the caller can now cancel a sample that is still in the window. The deque cannot delete from the middle, so switch to a heap with lazy deletion, a set of cancelled ids checked when an entry reaches the top, or a balanced tree, at log n per operation. The wrong answer scans the deque for the id, which is linear in k per cancellation.

And: what is the space bound, and when is it reached? At most k, reached on a strictly decreasing input. Not n.

## Recap

Four things to remember. Two eviction rules: dominated elements leave from the back, expired ones from the front, and the input 5, 1, 1, 1, 1 with a window of two proves you need both. It is linear because each index enters and leaves once, with at most k stored, provided your front removal is genuinely constant time. The deque beats a heap because a window expires in arrival order; cancellations, deadlines or a median send you back to heaps. And in a time-based window, front expiry is a while loop on a monotonic clock.

At your desk: the code and both traces, the comparison table, the time-window and kernel examples, the prefix-sum and DP traces, and the two exercises.
