---
lesson: tree-bfs
source: 1c407ff8420f2860
fit: partial
desk:
  - "The level-loop template in Python and in the JavaScript swap-a-level form"
  - "The Level Order, Right Side View and Minimum Depth traces, queue by queue"
  - "The serialiser and deserialiser code, and the level-order serialisation visualisation"
  - "The near-misses table and the variations table"
  - "Exercise: largest value in each row"
---
## Introduction

You are handed a binary tree and asked something about its rows. The values grouped by depth. The last node you can see from the right. The shallowest leaf. The widest level. A recursive traversal visits every node, so it can answer these too, but it visits them in the wrong order. It runs all the way down to a leaf before it has seen the second node of level 1, and you end up carrying a depth parameter and a dictionary from depth to list, just to reassemble the rows the recursion tore apart.

Breadth-first search visits the tree in exactly the order the question is asked. A queue holds the current level. You drain it, and while you drain it you add the next level. The whole pattern comes down to one extra line: read the queue's size at the top of the outer loop. That line separates candidates who fumble the per-level bookkeeping from those who write the solution in three minutes and spend the rest of the round on follow-ups.

Coming up: the words that select the pattern, the invariant behind that one line, four classic problems said in words, and the traps that fail candidates on the second test case.

## The signal

Listen for four kinds of words in the problem statement. First, "level", "row", "depth d", "per level": level-order traversal, level averages, largest value per row, zigzag order. The output is grouped by depth, and breadth-first search produces it grouped for free.

Second, "nearest", "closest", "minimum depth", "shortest". The first leaf a breadth-first search reaches is the shallowest one. A depth-first search has to explore the whole tree to be sure; breadth-first can stop.

Third, "seen from the side", "rightmost", "leftmost": the last or first node of each level. And fourth, anything about which nodes share a level: connecting each node to its neighbour on the right, the width of the tree, cousins, meaning the same depth with different parents.

What rules it out? If the answer is a property of subtrees, like height, diameter, path sum, whether it is balanced or a valid search tree, that is a post-order return value, and it belongs to depth-first search. If the order you need is in-order or pre-order, breadth-first does not produce it. And if memory is tight and the tree is wide, be careful, because the queue holds an entire level.

A few near misses worth knowing by name. "All nodes at distance k from a target node" sounds like breadth-first because of the word distance, but distance runs through the parent too, and tree nodes have no upward pointer. That is graph search. "Check whether two trees are identical" looks like comparing level lists, but two trees can have identical level lists and different shapes: a root of 1 with a child 2 on the left, versus the same child on the right. That one is a lockstep depth-first walk.

## The invariant

Here is the template in words. Put the root in a queue. While the queue is not empty, read its size and fix it. Then dequeue exactly that many nodes, and for each one, record its value and enqueue its left child, then its right child. When the inner loop ends, the level is complete, and that is where per-level work happens.

The invariant to say out loud: at the top of the outer loop, the queue holds exactly the nodes of one level, in left-to-right order. The inner loop consumes those nodes and appends their children, so at the bottom, the queue holds exactly the next level, again left to right. It is an induction on depth, and the code never mentions depth at all. Nothing from the next level sneaks into the current one, because the size was fixed before any child arrived.

Take the smallest example. The root is 3. Its children are 9 and 20. Node 9 is a leaf, and 20 has two children, 15 and 7. The first pass: size 1, dequeue 3, enqueue 9 and 20. Second pass: size 2. Dequeue 9, which adds nothing. Dequeue 20, which adds 15 and 7. The queue is not empty, but the inner loop stops anyway, because it was told 2. That stop is the level boundary. Third pass: 15 and 7, and the queue empties. Three levels: 3, then 9 and 20, then 15 and 7.

Every node is enqueued once and dequeued once with constant work, so time is linear. Space is the widest level plus the output. On a complete tree, the bottom level holds half the nodes, so the queue peaks at about half of n. On a chain, it peaks at 1. Here is the number to remember: for a complete tree of about a million nodes, the queue holds up to roughly 524 thousand references at once, while a recursive depth-first search on the same tree is only 20 frames deep. On a chain of a million nodes, it flips: the queue holds one entry, and the recursion needs a million frames, which no default stack allows.

## Right side view and minimum depth

Right Side View asks for the values you would see standing to the right of the tree, top to bottom. The trap the problem is built around: it is not the rightmost path. What you see from the right is the last node of each level.

Picture root 1 with children 2 and 3. Node 3 is a leaf. Node 2 has a left child 4, and 4 has a left child 5. Before I tell you: what does the right side view return?

[pause]

1, 3, 4, 5. Levels 2 and 3 only have nodes in the left subtree, and nothing on those levels blocks them. A candidate who keeps walking to the right child returns 1, 3, and fails the second test case. With the level boundary pinned, the answer is simply the node you dequeue last in each level. A depth-first version, visiting right before left and recording the first node at each new depth, also works, but you have to argue it is the rightmost. The breadth-first version is correct by inspection.

Minimum Depth asks for the number of nodes on the shortest path from the root to a leaf. The obvious recursion, one plus the minimum of the left and right depths, is wrong as written. A node with only a right child has a left depth of 0, so the minimum picks the missing side and returns 1 for a node that is not a leaf. Take a chain where 2 leads to 3 leads to 4 leads to 5, all right children. The correct answer is 4. The naive recursion returns 1, which is exactly the wrong answer the test suite is looking for.

Breadth-first search fixes it and adds something. The first leaf it dequeues is on the shallowest level, so it can stop. Picture a root whose left child is a leaf and whose right subtree has a thousand nodes. Breadth-first visits three nodes and returns 2. The recursion visits all thousand. For this problem, the lesson uses the other legitimate shape: carry each node's depth alongside it in the queue, instead of the size loop. Use that shape when you need each node's depth and do not need level boundaries. Both give the same visit order.

## Serialisation and the variations

The array format every test harness uses, 1, 2, 3, null, null, 4, 5, is a level-order listing. So the breadth-first serialiser is worth knowing: you can explain the encoding your tests already use. Serialise by emitting each node's value, and a marker for every missing child. Deserialise with a queue of parents waiting for children: each parent you dequeue consumes exactly the next two tokens.

The invariant: the queue holds, in order, exactly the nodes whose children have not yet been read. Output is two n plus one tokens, because every node emits itself and each of the n plus one missing children emits a marker. The classic bug is advancing the token index only once when a parent's first token is a marker. Every later child then attaches one node too late.

Every other variant is the same loop with one slot changed. Zigzag order: run the normal loop and reverse the level list on odd depths. Do not try to alternate the queue's direction; the reversal is a presentation step. Level averages, maxima and sums: replace the level list with an accumulator. Connecting next-right pointers: keep the previous node in the inner loop and link it, and the size boundary guarantees you never link across levels. Maximum width: give each node a heap-style index, twice the parent's index, or twice plus one, and take the last index minus the first plus one per level. Those indices grow exponentially, so in a fixed-width-integer language, re-base them per level. And breadth-first search on a graph is the same loop with a visited set added.

## Under the hood and the traps

The queue itself is a trap in two languages. Python's deque is a linked list of 64-slot blocks, so removing from the left is constant time and never moves elements. A plain list with pop from the front shifts every remaining pointer each time. For a level of 100 thousand nodes that is 5 billion pointer moves, turning a millisecond traversal into seconds.

In JavaScript, shift on an array can cost linear time, because it re-indexes. V8 sometimes avoids the copy, but only when more than 100 elements remain and some other conditions hold, so you cannot rely on it. The portable answers are a head index that you advance, or the swap-a-level form: hold the current level in one array, build the next level in another, then swap.

And there is a JavaScript-specific bug. If the inner loop's bound is the queue's length, read fresh on every pass, it grows as children are pushed, and every node ends up in one giant level. Python hides this, because looping over a range of the queue's length evaluates the length once. Capture the size explicitly in both languages, so the intent is visible.

Recursion limits are why breadth-first wins on chains. CPython's default limit is 1,000 frames, and Node's default stack allows on the order of 10 thousand. A tree given as a chain of 100 thousand nodes overflows every recursive traversal in both languages, while the breadth-first queue holds one node at a time.

Two smaller ones: handle the empty tree before you start, or the queue holds nothing usable and the first child lookup throws. And do not enqueue missing children in the level loop, but do enqueue them deliberately in the serialiser, because there you need a marker.

## In the interview

Here is a follow-up the lesson expects. The tree has 10 million nodes and is nearly complete. What is your memory?

[pause]

The queue peaks at the widest level, about 5 million references, roughly 40 megabytes of pointer slots before you count the node objects. Depth-first search would use about 24 frames. If memory is the constraint and you still need per-level output, depth-first search with a list indexed by depth gives the same output with stack proportional to height, at the cost of pre-order visiting. The wrong answer is "breadth-first is linear space, same as depth-first", which is only the worst case and misses that their shapes are opposite.

And the follow-up that changes the pattern: now return the nodes at distance k from a given node. Build a parent map with one depth-first pass. Then run breadth-first search from the target through left, right and parent, with a visited set, and collect the level at distance k. Linear time. A downward-only search misses every node reached through an ancestor.

## Recap

Four things to remember. Level, row, nearest, width and side view are the signal words; subtree properties and in-order questions are not. Capture the queue's size before the inner loop: at the top of every outer pass, the queue holds exactly one level, left to right. Right side view is the last node of each level, not the right spine, and minimum depth is the first leaf dequeued, which also lets you stop early. And state space by shape: breadth-first holds the widest level, about half the nodes on a complete tree; depth-first holds the height, which is the tree's full size on a chain.

At your desk: the template in both languages, the four traces, the serialiser code, the two tables, and the largest-value-per-row exercise.
