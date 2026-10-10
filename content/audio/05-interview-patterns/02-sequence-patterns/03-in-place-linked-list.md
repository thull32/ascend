---
lesson: in-place-linked-list
source: d813b48adb7ed938
fit: partial
desk:
  - "The reverse, split and merge primitives in Python and JavaScript, and the dummy-head and save-next habits"
  - "The Reverse Nodes in k-Group trace, inner loop and group level, and its code"
  - "The weave, randoms and unweave table for Copy List with Random Pointer"
  - "The Add Two Numbers carry trace and the LRU cache code with its capacity-2 trace"
  - "The variants table, the in-place against array-fallback measurements, and the approaches compared"
  - "Exercises: reverse a sublist in place, and rotate a list to the right by k"
---
## Introduction

Linked-list problems are rarely about the algorithm. The algorithm fits in one sentence: reverse it, merge them, move the last node to the front. What the interviewer watches is whether you can rewire pointers without losing a node, creating a cycle, or dereferencing null, while talking.

Here is how small the margin is. In a reversal, if you write "current's next becomes previous" before you have saved current's next, you have overwritten the only link to the rest of the list. It is gone. And nothing raises an error to tell you.

The constraint that makes these problems worth asking is "in place": constant extra space, no copying values into an array and back. The array fallback is always available, costs linear memory, and is often the faster code on real hardware. Say so, with a number, and then do it in place.

So: the two habits that make rewiring safe, the three primitives and how they compose, the harder problems built from them, and the honest numbers.

## The signal

You are in this pattern when the input is a singly linked list and the statement says "in place", "constant extra space", "reverse", "reorder", "rotate", "swap nodes", "remove the node", "merge", "partition", "copy", or "without modifying node values". That last phrase is a tell. It forbids rewriting values, so you have to move nodes.

The near-misses. Finding the middle, detecting a cycle, or the k-th node from the end is fast and slow pointers: finding where to cut is a runner problem, and the cut and everything after it is this pattern. Merging k sorted lists is k-way merge: a heap chooses the next node, but the splice is identical. Reversing or rotating an array is two pointers, because random access makes it an index problem. Get and put in constant time with least-recently-used eviction is a hash map plus a doubly linked list: the list gives order, the map gives the handle. Sorting a list with no space constraint is copy to an array, sort, relink. And adding two numbers stored most significant digit first means reversing both, or a stack of digits, because carries flow from the least significant end.

## Two habits and three primitives

Habit one: the dummy head. A sentinel node in front of the real head means the first node is never special. Removing the head, inserting before it, reversing a group that starts at it, building a result from nothing: all become the general case, and the answer is the dummy's next.

Habit two: save next before you rewire. The first line inside the loop remembers where you are going. Only then is it safe to overwrite the link.

Primitive one is reverse, with three names: previous, current, and next. Here is the invariant to say aloud. At the top of each iteration, previous heads a fully reversed list of the nodes already visited, current heads the untouched remainder, and no node is reachable from both. One node crosses from the remainder to the reversed side per iteration, so after n iterations every node has crossed and none was lost.

Picture it on 1, 2, 3. Start with previous empty and current on 1. Save 2, point 1 at nothing, previous is now 1, current is 2. Save 3, point 2 back at 1, previous is 2. Save nothing, point 3 back at 2, previous is 3, and current falls off the end. Return previous, which is 3, the new head. Return the old head instead, and the caller gets a one-node list, because the old head is now the tail.

Primitive two is split at the first middle. A slow and a fast pointer, with fast starting one node ahead, so slow stops on the first middle. Then the cut: slow's next becomes null. One, 2, 3, 4 splits into 1, 2 and 3, 4. Five nodes split into three and two. The first half is never shorter. Forget the cut, and the halves stay joined.

Primitive three is merge behind a dummy tail. Compare the two fronts, attach the winner to the tail, advance. When one list runs out, attach whatever is left of the other in one step. With "less than or equal" as the comparison, that is Merge Two Sorted Lists, and the "or equal" keeps it stable. With the choice alternating, it is the interleave in Reorder List.

The composition rule is the real lesson. Split, reverse and merge, in some order, solve most of the list. Reorder List is split, reverse the second half, then alternate. Palindrome List is split, reverse the second half, compare, and reverse it back. Merge sort on a list is split, recurse, merge. Before writing any loop, draw four boxes and the names previous, current and next, and read the assignments off the drawing.

## Harder problems built from the primitives

Reverse Nodes in k-Group: reverse every consecutive group of k nodes, and leave a short final group alone. Three names keep it straight: the node before the group, the group's last node, and the node after the group. Look ahead k nodes before touching any pointer, so that a short final group is never half reversed. Then reverse the group with "previous" seeded to the node after the group instead of null. That way the group's old head, which becomes its tail, already points at the rest of the list when the loop ends. On 1 to 8 with k of 3, you get 3, 2, 1, then 6, 5, 4, then 7 and 8 untouched. The dummy matters because the first group changes the head of the whole list. Every node is visited twice, once in the lookahead and once in the reversal: linear time, constant space.

Copy List with Random Pointer: each node has a next and a random pointer to any node, and you must return a deep copy. The easy answer maps each original to its copy, which is linear space. The constant-space answer stores that map inside the list: put each copy directly after its original, so the copy of any node is simply its next. Three passes. Weave the copies in. Set each copy's random to the original's random's next. Then unweave, restoring the original.

Why can those passes not be merged?

[pause]

Set randoms during the weave, and a random that points forward lands on an original node, because its copy does not exist yet. Set them during the unweave, and some originals have already been restored, so their next is no longer the copy. Either way the copy points into the original list, and a test that only compares values still passes.

Add Two Numbers: digits stored least significant first; return the sum as a list. Build the result behind a dummy tail, and loop while either list or the carry remains. Take 999 plus 1. Three steps write three zeros, each with a carry of one. The fourth step exists only because the carry is in the loop condition. Leave it out, and 999 plus 1 returns 000.

LRU Cache: get and put in constant time, evicting the least recently used key at capacity. A dict maps each key to its node. A doubly linked list with two sentinels holds recency, most recent at the front. Unlinking a node is two pointer writes, pushing to the front is four, and the sentinels mean neither ever checks for null. The node stores its own key, for exactly one line: deleting the evicted entry from the dict.

The row that fails most often is a put on a key that already exists, when the cache is full. Code that checks capacity before checking whether the key exists evicts something it did not need to. The correct order: existing key first, update the value, move it to the front, evict nothing. Eviction only for a genuinely new key.

## The honest numbers

Every primitive visits each node a constant number of times, so compositions of a few primitives stay linear time and constant space. The exceptions are recursion, and anything that allocates: the copy, the sum, the cache's nodes.

Now the measurement. In CPython, reversing a million nodes in place took 50 milliseconds, against 67 for collecting the nodes into a list and relinking them backwards. In place wins there. But sorting 200 thousand nodes with merge sort on the nodes took 192 milliseconds, against 61 for collecting them, sorting with the built-in sort, and relinking. The fallback wins three times over, because the built-in sort runs in C and the merge loop runs in the interpreter. So "in place" is a space requirement, not a speed guarantee. When memory is free, the array route for sorting is the better engineering answer. When the interviewer says constant space, you owe them the in-place version, and you should not claim it is faster.

Two more traps from under the hood. Python's tuple assignment evaluates the right side first, then assigns left to right, so the one-line reversal step only works with the targets in one particular order; in the other order it writes the new node's next and cuts the list. Write the four explicit lines. And recursive reversal needs one stack frame per node. CPython's default limit is 1 thousand frames: 998 nodes succeed, a thousand fail. A production list of unknown length rules recursion out.

## In the interview

Here is a follow-up the lesson expects. Sort the list in constant extra space.

[pause]

Bottom-up merge sort. Merge runs of length 1, then 2, then 4, walking the list with a tail pointer, cutting and merging in place, with no recursion. That is n log n time and constant space. Top-down merge sort costs a logarithmic stack. And if memory is not constrained, say that the array fallback measured three times faster in CPython. The common wrong answer is quicksort on the list, whose partition needs random access to pick pivots well, and which degrades to quadratic on sorted input with a head pivot.

And the second: do it recursively, and would you ship it? The recursive reversal is the same algorithm with the call stack holding "previous". It is linear stack space, and it fails at about a thousand nodes under CPython's default limit, so no. The wrong answer is "recursion is constant space because there are no new nodes".

## Recap

Four things to remember. Two habits: a dummy head so the first node is never special, and save next before you rewire. Three primitives, reverse, split at the first middle, and merge behind a dummy tail, and most problems are those three in some order. Keep multi-phase algorithms in separate passes when a later phase reads state an earlier one is still building, as in the random-pointer copy. And in place is about space, not speed: the array fallback sorted three times faster, so say which you would ship.

At your desk: the primitive templates, the k-group and random-pointer traces, the carry and LRU traces with their code, the measurements table, and the two exercises on reversing a sublist and rotating a list.
