---
lesson: fast-slow-pointers
source: db13f67c92eeef98
fit: partial
desk:
  - "The cycle-entry, middle and k-th-from-end templates, with the bug-carrying lines annotated"
  - "The Linked List Cycle trace, both phases, and the false cycle from comparing values"
  - "The middle-guard table on four and five nodes"
  - "The Find the Duplicate Number and Happy Number traces and code"
  - "The variants table, the Floyd against visited-set measurements, and the approaches compared"
  - "Exercises: find the cycle in an implicit list, and delete the middle node"
---
## Introduction

You are walking a sequence you cannot index and cannot see the end of. A linked list, or a function applied to its own output, over and over. You need to know whether it loops, where it loops, or where its middle is. And the interviewer has taken away the memory you would use to remember where you have been. The obvious tool, a set of visited nodes, is off the table.

Two pointers moving at different speeds answer all of these in constant memory. The slow pointer moves one step per iteration and the fast pointer two. If the sequence ends, the fast pointer gets there first, and the slow pointer is then halfway. If the sequence loops, the fast pointer laps the slow one, and where they meet encodes where the loop starts.

The mechanism fits in ten lines. What takes practice is three things: recognising the problems that are linked lists in disguise, proving why it works when the interviewer asks, and writing the loop guard and start positions without an off-by-one.

## The signal

Three things together select the pattern. First, a sequence you can only follow forward. A singly linked list, or anything where x leads to f of x: an array read as "the value here is the next index", an integer under "sum of the squares of its digits", a state machine's transition function. Every such chain is a linked list where each node has exactly one way out.

Second, a question about position or repetition. Does it cycle, where does the cycle begin, how long is it, where is the middle, does this process terminate, which value is repeated.

Third, a space constraint. Constant extra space, or do not modify the input. Without it, a visited set is simpler, and saying so is part of a good answer.

Now the near-misses. A cycle in a course prerequisite graph is not this pattern: a node there has several outgoing edges, and Floyd needs exactly one. That is topological sort, or depth-first search with three colours. Where two linked lists intersect looks similar, but the pointers move at the same speed, and the trick is switching each pointer to the other list's head so both travel the same total distance. Find the duplicate, when the array may be modified, is better done with cyclic sort or sign-marking: simpler to explain, same cost, and it finds every duplicate, while Floyd finds one. The middle of an array is index arithmetic. And removing the n-th node from the end uses a fixed gap of n between the pointers, not a speed ratio: same family, different template.

## The invariants and the three traps

There are three shapes: detect and locate a cycle, find the middle, and keep a fixed gap. The invariant for the speed shapes: after t iterations, slow is t steps from the head and fast is 2 t steps from the head. For the gap shape: fast is always exactly k nodes ahead of slow, so when fast falls off the end, slow is k from the end.

Three lines carry almost all the bugs. Both pointers start at the head, so they must move before they compare; a loop that runs "while slow is not fast" would never start. The loop guard must check both fast and fast's next, or the second hop dereferences null, and that crash only happens on even-length lists, which the odd-length sample never shows. And the comparison must be identity, the same node, never the same value.

Here is why the last one matters. Take the list 1, 2, 1, 3, 1, with no cycle at all. After two iterations, slow is on the third node and fast on the fifth. Both hold a 1. A value check reports a cycle that does not exist. In Python, there is a subtler version: a dataclass node compares with double equals by its fields, so two different nodes holding the same value compare equal, and on a real cycle the comparison can recurse forever. Use "is" in Python and triple equals in JavaScript.

## Why they meet, and why the reset finds the entry

This is the question that separates people who memorised the trick from people who understand it. Name three quantities. a is the number of steps from the head to the cycle's first node, the entry. c is the cycle length. And b is how far past the entry the two pointers meet.

First, they must meet. When slow reaches the entry, fast is already somewhere in the cycle, some distance d behind it, going forward, where d is less than c. Every iteration slow moves one and fast moves two, so the gap shrinks by exactly one. A gap that falls by exactly one per step cannot jump over zero. So they land on the same node after d more iterations, fewer than a plus c in total, which is at most the number of nodes.

Second, the reset. Phase two puts one pointer back on the head, leaves the other at the meeting point, and moves both one step at a time. They meet at the entry. Why?

[pause]

At the meeting, slow has walked a plus b steps and fast has walked twice that. They stand on the same node, so the extra distance fast covered is a whole number of laps. a plus b is k times c, for some whole number k. Rearranged, a equals k laps minus b. Now the pointer from the head reaches the entry after a steps. The other one started b past the entry and also moved a steps, which is k laps minus b, so it ends k whole laps past the entry: on the entry itself. And they cannot coincide earlier, because until then the first pointer is still on the tail, outside the cycle.

Try it with the lesson's list: seven nodes, where the tail points back to the fourth node. So a is 3 and c is 4. The pointers meet one node past the entry, so b is 1, and a plus b is 4, exactly one lap, as the proof requires. Phase two then takes exactly 3 steps to reach the entry.

The common wrong answer is "because fast is twice as fast". That restates the setup and proves nothing.

## Middles, duplicates and happy numbers

Middle of a list has a quiet trap. On an even length there are two middles. The standard guard, "fast and fast's next", stops on the second one. But Palindrome List, Reorder List and merge sort on lists need the first middle, so that the node after it starts the second half. The guard "fast's next and fast's next's next" gives you the first. On odd lengths the two guards agree. So decide which middle the next phase needs before you write the guard, and trace a four-node list, not a five-node one, because five hides the difference.

Find the Duplicate Number is the best disguise in this family. You get n plus 1 integers, each between 1 and n, with one value repeated. Find it without modifying the array, in constant space. Read the array as a function: from index i, go to the index stored there. Every value is a valid index, so the walk never leaves the array and must eventually repeat. No value is 0, so nothing points at index 0: it is the head of a tail that leads into a cycle. And the cycle's entry is the one node with two incoming edges, one from the tail and one from inside the cycle. Two incoming edges means two indices hold that value. The entry is the duplicate, and Floyd's phase two finds it.

Name the alternatives so the interviewer knows the choice is deliberate. A set is linear space. Sorting and sign-marking modify the input. Binary search on the value range, counting how many elements are at most the midpoint, is n log n time, constant space, read-only, and a valid answer too.

Happy Number: replace a number by the sum of the squares of its digits, repeatedly, and decide whether it reaches 1. That is again x leading to f of x, an implicit list. It must either reach 1 or cycle, because it is bounded: a number with four or more digits maps to something with fewer digits, and anything below a thousand maps to at most 243. Seven is happy: 49, 97, 130, 10, then 1. Twelve is not: it falls into an eight-number cycle through 89, and the pointers meet at 20. The visited set is equally correct and most candidates give it first; the runner is the answer to "can you do it in constant space?".

## What it costs, honestly

Phase one runs fewer than a plus c iterations, phase two exactly a, so linear time and constant space.

Here is the claim to avoid. For the middle, the runner touches about one and a half n nodes: fast visits n, slow visits half that. Counting the length and then walking to the middle also touches one and a half n. The runner is not less work. It is one pass instead of two, which matters when the list is an iterator you cannot restart.

The lesson measured a million-node list whose tail points back to its middle. In CPython, with nodes allocated in list order, Floyd took 8 milliseconds and a visited set took 34, peaking at 50 megabytes. Floyd wins because it neither hashes nor allocates. But the bigger effect was layout. Linking the same nodes in shuffled order made Floyd ten times slower in CPython and fifty times slower in V8. Each step is a load whose address comes from the previous load, so the CPU cannot overlap them, and when nodes are scattered every hop goes to main memory. Memory layout, not the algorithm, decides the speed.

One failure mode is worth knowing by name. Someone starts fast one node ahead, so the loop can compare before moving, and keeps the reset to the head unchanged. The meeting point is then off by one from what the proof assumes. Checked on every list of length 1 to 11 with every entry position, that combination returned the wrong node or looped forever in 55 of 66 cases. The fix: start both at the head, or, with the offset start, begin phase two from the node after slow.

## In the interview

The array can be modified. Would you still use Floyd for the duplicate?

[pause]

No. Negate the entry each value points at and report the first one already negative, or cyclic-sort. Both are linear time and constant space, and easier to verify. Floyd earns its place only because the input is read-only. Floyd regardless, or a set, both miss the point.

And: detect a cycle in a dependency graph. A node can have several successors, so there is no single next node to chase. Use depth-first search with white, grey and black colours, or Kahn's algorithm. Running Floyd from each node silently follows one arbitrary edge and misses cycles through the others.

## Recap

Four things to remember. The signal is a forward-only sequence, a question about cycles or position, and a space constraint; arrays of indices and functions on integers are linked lists in disguise. They must meet because the gap shrinks by exactly one; the reset works because a plus b is a whole number of laps. Move before comparing, guard fast's next, compare identity, and choose the first or second middle deliberately. And the runner is one pass and constant space, not less work.

At your desk: the three templates, the cycle, middle, duplicate and happy-number traces, the measurements table, and the two exercises.
