---
problem: course-schedule
args: [4, [[1, 0], [2, 1], [3, 2], [1, 3]]]
frames: 38
source: a43e3b27159dea13
---
@0-6
Four courses. Course 1 needs 0, course 2 needs 1, course 3 needs 2, and course 1 also needs 3. Can a student finish them all? Picture the courses as a directed graph, with an edge from each prerequisite to the course it unlocks. An order exists exactly when that graph has no cycle. If there is a cycle, every course on it waits for another course on it, so none of them can ever go first. Kahn's algorithm tests this by doing the schedule: count each course's unfinished prerequisites, its in-degree, take any course at zero, and let each course you take release the courses it unlocks. We start by building the unlock lists and the in-degrees, all zero.

@7-18
Each pair reads: the first course needs the second. So 0 unlocks 1, 1 unlocks 2, 2 unlocks 3, and 3 unlocks 1. In-degrees: course 0 needs nothing, course 1 needs two courses, and courses 2 and 3 need one each. Notice the loop already: 1 unlocks 2, 2 unlocks 3, and 3 unlocks 1.

@19-28
The queue starts with every course whose in-degree is zero. Only course 0. The count of courses taken starts at zero.

@29-34
Take course 0. One course taken. It unlocks course 1, whose in-degree drops from two to one. Course 1 is still waiting for course 3, so it does not join the queue.

@35
And now the queue is empty. Course 1 waits for 3, which waits for 2, which waits for 1. None of them will ever reach zero, because each is waiting on another member of the same loop. That is what a cycle looks like to this algorithm: not an error, just a queue that runs dry early.

@36-37
We took one course out of four, so the answer is false. The courses left behind with nonzero in-degree, 1, 2 and 3, are exactly the ones on or behind the cycle, which answers the follow-up about telling the student what went wrong. Each course is queued at most once and each prerequisite is decremented once, so time and space are linear in courses plus prerequisites.

Mistakes to know: a depth-first search with only visited and unvisited states reports false cycles on a diamond, where one course is reachable two ways; you need a third state for nodes on the current path. A search that starts only from course 0 misses cycles in a separate part of the graph. Kahn's algorithm avoids both, and handles a course that requires itself without special code.
