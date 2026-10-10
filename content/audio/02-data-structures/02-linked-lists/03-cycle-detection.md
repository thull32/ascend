---
lesson: cycle-detection
source: c02fed94fd8d77cd
fit: partial
desk:
  - "The meeting-time and cycle-start proofs, written out with the modular arithmetic"
  - "The Floyd trace on the six-node list, and both phases of the code"
  - "Brent's code and its read-by-read trace"
  - "The find-the-duplicate functional graph, visualiser and trace"
  - "The happy-number, generator and Pollard's rho examples, and the trade-off table"
  - "Exercises: find the duplicate with Floyd, and happy number without a set"
---
## Introduction

A traversal that should take microseconds is still running an hour later, pinned at 100 percent CPU. Somewhere a next pointer points backwards, and a loop that waits for null will never see one. The corrupted list is the symptom. The real question is how to detect that a sequence of "follow the pointer" steps has entered a loop, using no memory, when the sequence might be a linked list, a chain of array indices, a random number generator or a state machine.

The obvious answer is a hash set of visited nodes. Linear time, linear space, and the space is not small: on CPython, a set of a million node ids is about 66 megabytes. Say it first in an interview; it is the right answer when memory is not a constraint. Then the interviewer will ask for constant space.

Three ideas. Floyd's tortoise and hare, with a proof short enough to give out loud. Brent's variant, which does the same work with fewer steps. And the realisation that none of this needs a linked list at all.

## Floyd's algorithm

Two pointers start at the head. Slow moves one step per iteration, fast moves two. If fast, or fast's next, reaches null, there is no cycle. If there is a cycle, the two eventually point at the same node.

Two details carry most of the bugs. The loop guard must check both fast and fast's next, or you crash on one parity of list length. And the comparison must be identity, the same node, never the same value. A list with repeated values gives false positives under a value check. In Python that means "is"; in JavaScript, triple equals on the objects.

## Why they must meet

"Fast laps slow" is the intuition. Here is the argument. Say there are F nodes before the cycle, the tail, and the cycle has length C. Once slow enters the cycle, fast is somewhere ahead of it. Every iteration, fast moves two and slow moves one, so the gap between them grows by exactly one. A gap that changes by exactly one cannot skip over zero. Within at most C iterations, it reaches a multiple of C, and they are on the same node.

Make it precise with positions. After t iterations, slow has taken t steps and fast has taken 2t. Measured around the cycle, they coincide exactly when the difference, t, is a multiple of C. So they meet at the first multiple of C that is at least F, which is always less than F plus C. Linear time, two pointers.

Here is the tiny example. The list is 1, 2, 3, 4, 5, 6, and 6 points back to 3. The tail is 1 and 2, so F is 2. The cycle is 3, 4, 5, 6, so C is 4. Before I trace it, predict when they meet.

[pause]

At iteration 4: the smallest multiple of 4 that is at least 2. Slow walks 2, 3, 4, 5. Fast walks 3, 5, 3, 5. Both are on node 5.

## Finding where the cycle starts

This is the step interviewers ask for, because most candidates cannot derive it.

At the meeting, slow has taken a multiple of C steps. Since it spent F of those in the tail, its position inside the cycle is minus F, wrapped around the cycle. Walk F more steps from there and it is at position zero: the cycle start. Read that as a statement about distances. The distance from the head to the cycle start is the same, modulo the cycle length, as the distance from the meeting point forward to the cycle start.

So put a new pointer at the head, leave slow at the meeting point, and advance both one step at a time. They arrive at the cycle start on the same step. In the example: one pointer starts on 1, slow is on 5. One step: 2 and 6. Another: 3 and 3. They meet on node 3, the cycle start, after F equals 2 steps.

And that is why the speeds are one and two. With speeds one and three, the pointers still meet, but possibly earlier, at a time that is not a multiple of C. With no tail and a cycle of 4, speed three meets at iteration 2. Then slow is not at minus F, and the second phase never lands on the start. Speed two is the choice that guarantees the meeting time is a multiple of C.

To get the cycle length, advance one pointer from the meeting point until it returns, counting steps. With the start and length known, you can find the last node of the cycle and set its next to null. That is a recovery step for an incident, not a fix. The writer that created the cycle is the bug, and the same race will do it again.

## Brent's algorithm

Floyd reads three pointers per iteration: one for slow, two for fast. Brent's variant moves only the hare, one read per step, and parks the tortoise. Whenever the hare has taken a power-of-two number of steps without meeting the tortoise, the tortoise teleports to the hare, and the window doubles. When they meet, the number of steps taken in the current window is the cycle length, directly.

On the same six-node list, Brent learns that the cycle length is 4 after seven reads, where Floyd needed twelve just to meet. The full job, finding both the tail length and the cycle length, took 15 reads against Floyd's 20. Measured across many list shapes, Brent's full locate used about a quarter fewer evaluations, and Brent's own 1980 paper reports his algorithm about 36 percent faster than Floyd's on average.

That matters when one step is expensive: a modular squaring when factoring, or a workflow step that touches a database. In interviews, Floyd is the expected answer. Give Brent when they ask "can you do better?"

## Beyond linked lists

Floyd never uses the fact that the sequence is a linked list. It uses only that there is a deterministic next step: x goes to f of x. Every node has exactly one way out. Any such sequence over a finite set must repeat, and the picture is always the same shape, like the Greek letter rho: a tail of distinct values, then a cycle.

The famous interview disguise is an array. You have n plus one integers, each between 1 and n, with one value repeated. Find it in constant space without modifying the array. Treat each index as a node whose next is the value stored there. No value is zero, so index zero has no incoming edge and sits in the tail. There are n plus one indices but only n possible targets, so some target has two incoming edges, and that node is both the start of the cycle and the duplicated value. Run both phases of Floyd from index zero. On the array 1, 3, 4, 2, 2, the walk from index zero goes to 1, then 3, then 2, then 4, then back to 2, and phase two lands on 2, the duplicate.

The precondition is load-bearing. Allow values from zero to n minus one instead, and index zero can sit on the cycle, so starting there can return the wrong node. Start instead from index n, which no value points to.

Happy numbers are another disguise. Replace a number by the sum of the squares of its digits, repeatedly. Happy numbers reach 1; the rest loop forever. From 2, the sequence goes 2, 4, 16, 37, 58, 89, 145, 42, 20, and back to 4: a tail of one and a cycle of eight. Every unhappy number falls into that same cycle.

And the same shape appears in systems. A home-made random generator with a short period: running Brent over it in a test reports the period. Pollard's rho factoring is this algorithm. A workflow or retry policy whose transition function loops forever can be caught by running two simulators at speeds one and two, without hashing large states.

## What production does instead

Most production code that must survive cyclic input does not use Floyd. Python's json dumps keeps a record of every container on the current path and raises "circular reference detected". V8's JSON stringify keeps a stack and throws. Linux follows at most 40 nested symlinks, then gives up; curl stops after 50 redirects. The input there is a general object graph, where a node can have many successors, and Floyd needs exactly one.

So for a general directed graph, the answer is depth-first search with three colours, white, grey and black, reporting an edge back to a grey node. Running fast and slow pointers along the first edge of each node only finds cycles along that one path.

The cheapest production use of Floyd is a debug assertion. An LRU list whose pointers were updated in the wrong order forms a cycle, and a Floyd check after each operation in your tests catches it for the price of two pointers.

## In the interview

A follow-up the lesson expects. You found a cycle in a production LRU list. Do you repair it in place?

[pause]

Find the start and the length, set the last cycle node's next to null, and treat that as a recovery step for the incident. Then find the writer that created it, because the same race will do it again. The wrong answer is shipping the repair as the fix.

And the classic: why compare identity and not value? Because a list can hold duplicate values, and equal values do not mean the same node. Comparing the ids of the values is wrong too, because CPython shares small integer objects, so distinct nodes holding the same small number have values with the same id.

## Recap

Four things to remember. Give the hash set first, at about 66 megabytes per million nodes in Python, then Floyd for constant space. The proof is two steps: the gap grows by exactly one, so they meet at a multiple of the cycle length; and then the head and the meeting point are the same distance from the cycle start, so walk them together. Speed two is what makes that second step work, and the comparison is always identity. And Floyd works on any function with one successor per value, from the duplicate-number array to happy numbers to state machines, but not on general graphs, where you use depth-first search.

At your desk: the proofs written out, the Floyd and Brent traces, the duplicate-number graph, the generator and factoring examples, and the two exercises, find the duplicate and happy number without a set.
