---
lesson: k-way-merge
source: b73a4fa3e96c1418
fit: partial
desk:
  - "The merge template for arrays and linked lists in Python, and the JavaScript version"
  - "Heap-array traces: Merge K Sorted Lists, Kth Smallest in a Sorted Matrix, Smallest Range"
  - "The staircase-count binary search on the same matrix, and the smallest-range optimality proof"
  - "The near-miss, variants and complexity tables, and the measured timing table"
  - "How heapq.merge works line by line"
  - "Exercises: merge k sorted arrays with a heap, and the k pairs with the smallest sums"
---
## Introduction

Twelve shards each return their results sorted by timestamp, and you need one sorted page. A log shipper receives ordered streams from two hundred hosts and must emit one ordered stream. A database sorts a table larger than memory by writing sorted runs to disk and merging them back. Each time the inputs are already sorted, and re-sorting everything throws that work away.

The naive merge goes pairwise: list one with list two, the result with list three, and so on. That re-copies early elements on every merge, so it is N times k for N total elements. Merging 100 sorted lists of a thousand elements that way took 146 milliseconds. A heap of the 100 current heads took 15.

The heap works because at any moment you need exactly one fact: the smallest of the k current heads. A heap of size k answers that in log k.

Three ideas, then. The invariant that makes the root safe to emit. The bookkeeping that crashes. And the judgment call the interviewer is really testing, because, measured, when every input is an array in memory, concatenating and sorting beats the heap.

## The signal

Reach for k-way merge when you see k sorted lists, arrays or streams, and the word merge. Or "kth smallest across several sorted inputs", including a matrix whose rows and columns are sorted, where each row is a sorted input. Or "the smallest range that includes an element from each of k lists". Or "the 10 newest posts from everyone I follow": one head per followee, stop after 10.

The disguised version is an implicit sorted sequence. "The k pairs with the smallest sums from two sorted arrays" is a merge where row i is a of i plus each element of b, in order. Nothing is stored; the next element of each row is computed.

The test is three questions. Are the inputs sorted? Is k at least 3? Do you need the merged order, or a prefix of it? Three yeses mean k-way merge. Then ask a fourth: are the inputs streams, or arrays already in memory?

The near-misses. Merge two sorted lists: two pointers; with k equal to 2 the heap adds a log factor and an allocation per element for nothing. "Is x in any of them" or "which values appear in all": a hash set, because order is irrelevant to membership. Median of two sorted arrays: binary search on a partition. Merge k unsorted lists: just sort, because the heap merge produces garbage without complaint. And kth smallest in a sorted matrix with k near half the cells: binary search on the value, which comes up again in a moment.

## The invariant

The heap holds exactly one entry for each input that is not exhausted: that input's smallest unemitted element.

Why is the root safe to emit? Take any unemitted element, from some input. That input has an entry in the heap, and since the input is sorted, its entry is no larger than our element. The heap's root is no larger than any entry. So the root is no larger than anything left anywhere, and emitting it keeps the output sorted.

Then refill. The emitted input's next element is now its smallest unemitted one, so push it. If there is no next element, the input is exhausted, and you just pop. Each iteration emits one element, so the loop runs exactly N times.

Notice what the proof leans on: each input is sorted. If one input is not, the step "its entry is no larger than our element" is false, and nothing checks it. The output comes out mostly sorted with local inversions, and no error anywhere. In production that is an audit log merged on ingest time when the inputs were sorted by event time. Assert each input is non-decreasing as you consume it.

Here is a tiny example from the lesson. Three lists: A starts 2, 7; B starts 1, 5; C starts 3, 4. The heap holds the heads 2, 1 and 3. Emit 1, from B, and B's next, 5, takes its place. Now the heads are 2, 5 and 3. Emit 2, from A, and 7 comes in. Heads 7, 5, 3. Emit 3, from C, and C's 4 comes in, and it is the smallest again. C emits twice in a row; the heap does not care which input the minimum comes from.

Complexity: seeding with heapify is order k. Each of the N elements costs one sift on a heap of at most k entries. So k plus N log k time, and order k extra space. One sift, not two: peek at the root, and replace it with the next element in a single operation, rather than a pop followed by a push.

## The bookkeeping that crashes

Three bugs fail hidden tests, and they are all about edges.

Exhausted inputs. Seeding reads the first element of an empty list, or the refill reads past the end, or the linked-list version pushes a next pointer that is null. Skip empty inputs when seeding, and refill only when there is a next element; otherwise pop.

Ties. Python's heap compares whole tuples. If two lists share a value and the next field is a list node, Python raises a type error, because nodes cannot be compared. Put the input's index between the value and the node. That index also makes equal values leave in input order, so the merge is stable.

And memory. Pushing every element of every input up front is not a merge, it is heap sort, with memory proportional to the data. One entry per input, refilled from whichever input was just emitted.

## Matrix, range, and when to stop

Kth smallest in a sorted matrix: each row is a sorted input, so run the merge and stop at the kth emit. You only need to seed the first k rows, because a row further down cannot hold one of the k smallest.

But when k is large, binary search on the value wins. Count how many cells are at most some value x by walking a staircase from the bottom-left corner: if a cell is at most x, the whole column above it is too, so count it and step right; otherwise step up. That is about 2n cell visits. Then binary search for the smallest x whose count reaches k. For a 300 by 300 matrix and a two-billion value range, that is about 31 rounds and some 19 thousand cell visits, against about 370 thousand heap comparisons at k of 45 thousand. The time does not depend on k at all.

Smallest Range Covering Elements from K Lists is the merge with a twist. The heap's root is the current minimum, and a variable holds the current maximum of the heads. The range from minimum to maximum covers every list. Always advance the list that owns the minimum, because moving any other list leaves the minimum where it is and can only raise the maximum. Stop as soon as the minimum's list is exhausted, because every later range would leave that list out.

The trap is the maximum. Update it only when you push, which is constant time. It never needs to fall. Recompute it by scanning the heap and each step costs k, turning N log k into N times k; that version passes small tests and times out at a few thousand lists.

## The judgment call

Here is the question that separates candidates. Everything is already in memory, as Python lists. Do you use the heap?

[pause]

No. Concatenate and call the built-in sort. Python's and JavaScript's built-in sorts both find each input list as an already-sorted run and merge the runs in native code, so on this input the sort is also N log k, with a far smaller constant. On a million integers in a thousand lists, the sort took 109 milliseconds and the hand-written heap 299. In Node, 89 against 119. "The heap is N log k so it must win" is the wrong answer, because the sort is N log k here too.

The heap earns its place in three cases. The inputs are streams, so you cannot read them all first. You stop early: the first 10 elements of a thousand-way merge took about a sixth of a millisecond, because only the heads were touched, while any sort must read all million elements. Or you must relink linked-list nodes in place, allocating nothing.

That early stop is also the Twitter feed: seed with each followee's newest tweet, pop 10 times, and the cost is the number of followees plus 10 log of that, regardless of how many tweets exist.

## In the interview

Here is a follow-up the lesson expects. The inputs are 200 unbounded streams, such as Kafka partitions ordered by timestamp.

[pause]

A lazy merge in order k memory, emitting as soon as every stream has offered a head. The catch: one silent stream blocks all output, because the merge cannot know the idle stream's next value is not the smallest. Stream processors bound that wait with watermarks and idle-source timeouts. The wrong answer is "buffer everything and sort every minute", which adds a minute of latency and still reorders late data wrongly.

Another: there are 100 thousand sorted runs on disk, and memory for a thousand read buffers. Merge in two passes: a hundred merges of a thousand runs each, then one merge of the hundred results. Each pass reads and writes the data once. Opening all 100 thousand files exhausts file descriptors and thrashes with tiny buffers.

And: merge k linked lists in constant extra memory. Bottom-up pairwise merging, pairs, then pairs of pairs, relinking nodes: still N log k time. The heap needs order k, and calling it constant space because "it only holds heads" is wrong.

## Recap

Four things to remember. The signal is sorted inputs, at least three of them, and a need for the merged order or a prefix of it. The invariant is one entry per live input, its smallest unemitted element, so the root is the global minimum; it silently assumes every input is sorted. Skip empty inputs, refill with a bounds check, and put an index in every tuple. And in memory, the built-in sort beats the heap; the heap wins on streams, early stops and in-place relinking, while binary search on the value wins for large k in a sorted matrix.

At your desk: the templates, the three heap-array traces, the staircase binary search and the range proof, the tables, the heapq merge internals, and the two exercises.
