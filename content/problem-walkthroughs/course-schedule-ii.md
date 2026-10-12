---
problem: course-schedule-ii
args: [3, [[0, 1], [0, 2], [1, 2]]]
frames: 49
source: 4fcd6f359482a504
---
@0-5
Three courses and three prerequisites. Course 0 needs course 1. Course 0 also needs course 2. And course 1 needs course 2. We want an order to take them all. That is a topological order, and Kahn's algorithm builds one directly: count each course's unfinished prerequisites, its in-degree; start with the courses at zero; and every time you take a course, reduce the count of each course it unlocks, releasing any that reach zero. The order you take them in is the answer. First, we build the graph: for each course, the list of courses it unlocks, and every in-degree at zero.

@6-14
Read each pair carefully: the first number needs the second. So the second number unlocks the first. That direction is the classic bug. Course 1 unlocks 0, and 0's in-degree rises to one. Course 2 unlocks 0, so 0's in-degree is two. Course 2 unlocks 1, so 1's in-degree is one. Final in-degrees: course 0 needs two, course 1 needs one, course 2 needs none.

@15-23
The queue starts with every course that needs nothing. Only course 2. The order starts empty.

@24-33
Take course 2 and append it to the order. That one line is the only difference from the yes-or-no version of this problem. Course 2 unlocks 0 and 1. Course 0 drops to one: it still waits for course 1. Course 1 drops to zero, so it joins the queue.

@34-41
Take course 1, and the order is 2, 1. It unlocks course 0, which drops to zero and joins the queue. A course only enters the queue after all its prerequisites have been taken, which is exactly why the order is valid.

@42-46
Take course 0. The order is 2, 1, 0. Course 0 unlocks nothing, and the queue is empty.

@47-48
The last line is the cycle check. If the prerequisites formed a cycle, the courses on it would never reach zero, the queue would run dry early, and the order would be short. Then we must return an empty list, not the partial plan. Here all three courses made it, so we return 2, 1, 0. Every course and every prerequisite is handled once, so time and space are linear in courses plus prerequisites.

Two mistakes to watch for. Reverse the edge direction and this problem, unlike the yes-or-no version, gives you away: the order comes out backwards. And if you use depth-first search instead, a course is finished only after everything it unlocks, so that order is reversed and you must flip it at the end.
