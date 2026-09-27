---
slug: course-schedule
title: Course Schedule
difficulty: medium
patterns: [topological-sort]
lists: [core-75, ascend-150]
companies: [amazon, google, meta, microsoft, uber]
order: 1
lesson: interview-patterns/tree-and-graph-patterns/topological-sort-pattern
hints:
  - "Draw each course as a node and each prerequisite as an arrow from the course you must take first to the course that needs it. When is it impossible to finish everything?"
  - "It is impossible exactly when the arrows contain a cycle: every course on the cycle waits for another course on the cycle."
  - "Kahn's algorithm: repeatedly take a course with no unfinished prerequisites (in-degree 0) and 'finish' it, lowering its dependants' in-degrees. If you finish all n courses, there was no cycle."
signatures:
  python:
    name: can_finish
    starter: |
      def can_finish(num_courses: int, prerequisites: list[list[int]]) -> bool:
          pass
  javascript:
    name: can_finish
    starter: |
      function can_finish(num_courses, prerequisites) {
      }
tests:
  - args: [3, [[1, 0], [2, 1]]]
    expected: true
    label: a simple chain
  - args: [2, [[0, 1], [1, 0]]]
    expected: false
    label: two courses that require each other
  - args: [1, []]
    expected: true
    label: one course
  - args: [3, []]
    expected: true
    label: no prerequisites at all
  - args: [2, [[1, 1]]]
    expected: false
    label: a course that requires itself
  - args: [4, [[1, 0], [2, 1], [3, 2], [1, 3]]]
    expected: false
    label: a cycle hanging off a valid start
  - args: [4, [[1, 0], [2, 0], [3, 1], [3, 2]]]
    expected: true
    hidden: true
    label: diamond
  - args: [6, [[1, 0], [2, 1], [4, 3], [5, 4], [3, 5]]]
    expected: false
    hidden: true
    label: the cycle is in a different component
  - args: [5, [[0, 1], [0, 2], [0, 3], [0, 4]]]
    expected: true
    hidden: true
    label: one course with four prerequisites
time_limit_ms: 4000
---
There are `num_courses` courses labelled `0` to `num_courses - 1`. Each entry `[a, b]` in `prerequisites` means you must complete course `b` before you can start course `a`. You can take courses in any order that respects these rules, one at a time.

Return `true` if it is possible to complete every course, and `false` otherwise.

### Examples

| Input | Output | Why |
|---|---|---|
| `3`, `[[1,0],[2,1]]` | `true` | Take 0, then 1, then 2 |
| `2`, `[[0,1],[1,0]]` | `false` | Each course waits for the other |
| `4`, `[[1,0],[2,1],[3,2],[1,3]]` | `false` | Course 0 is fine, but 1 needs 3, 3 needs 2 and 2 needs 1 |

### Constraints

- `1 ≤ num_courses ≤ 2000`
- `0 ≤ len(prerequisites) ≤ 5000`
- `0 ≤ a, b < num_courses`; a pair may name the same course twice (a course requiring itself)

### Follow-up

The interviewer asks: "If it is impossible, tell the student *which* courses form the problem, so they can take it to the registrar." And then: "This is a build system with 200,000 targets. What changes?"

## Solution

### The naive approach

Try to take courses greedily: repeatedly scan the whole list for a course whose prerequisites are all complete, take it, and repeat until no progress is made. Each scan is `O(V + E)` and you may need `V` scans, so `O(V·(V + E))`. The idea is right; the repeated scanning is the waste.

### The insight

Model the courses as a **directed graph**: an edge `b → a` for each pair `[a, b]` ("b unlocks a"). A valid order exists exactly when the graph is a **DAG**, that is, has no directed cycle. If there is a cycle, every course on it waits for another course on it, so none of them can ever be first. If there is no cycle, some course has no incoming edges (otherwise you could walk backwards forever and would eventually repeat a node, which is a cycle), so you can take it, remove it, and repeat.

That repeat step is **Kahn's algorithm**. Track each course's in-degree: the number of prerequisites not yet completed. Every course with in-degree 0 is ready. Take one, and decrement the in-degree of each course it unlocks; any that reach 0 become ready. You never rescan: a course becomes ready at the exact moment its last prerequisite is taken.

### The optimal approach

1. Build the adjacency list `unlocks[b]` and `indegree[a]` from each pair.
2. Put every course with in-degree 0 in a queue.
3. Pop a course, count it as taken, and decrement each dependant's in-degree, enqueuing those that reach 0.
4. Return whether the number taken equals `num_courses`.

Trace `4, [[1,0],[2,1],[3,2],[1,3]]`. Edges: `0→1`, `1→2`, `2→3`, `3→1`. In-degrees: 0:0, 1:2, 2:1, 3:1. Queue `[0]`. Take 0; course 1 drops to 1, not ready. Queue empty. Taken 1 of 4, so `false`. Courses 1, 2 and 3 are the ones stuck on the cycle.

```python
from collections import deque

def can_finish(num_courses: int, prerequisites: list[list[int]]) -> bool:
    unlocks: list[list[int]] = [[] for _ in range(num_courses)]
    indegree = [0] * num_courses
    for course, pre in prerequisites:
        unlocks[pre].append(course)
        indegree[course] += 1

    ready = deque(c for c in range(num_courses) if indegree[c] == 0)
    taken = 0
    while ready:
        c = ready.popleft()
        taken += 1
        for nxt in unlocks[c]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
    return taken == num_courses
```

Time `O(V + E)`: each course is enqueued once and each edge decremented once. Space `O(V + E)` for the adjacency list.

The DFS alternative uses three colours: white (unvisited), grey (on the current recursion path), black (finished). Meeting a grey node means you followed an edge back into your own path, which is a cycle. It is equally `O(V + E)` but needs care with recursion depth on long chains, and it is easier to get wrong with only two colours (a black node reached twice is fine; a grey one is not).

### Common mistakes

- **Reversing the edge.** `[a, b]` means `b` before `a`, so the edge is `b → a`. Getting it backwards still detects cycles correctly (a cycle is a cycle in either direction), which is why this bug survives into [Course Schedule II](/practice/course-schedule-ii), where it produces the order backwards.
- **Two-colour DFS.** Marking nodes simply "visited" and reporting a cycle whenever you meet a visited node gives false positives on the diamond: course 3 is reached from both 1 and 2 without any cycle.
- **Forgetting disconnected parts.** Starting a DFS only from course 0 misses a cycle in a separate component, like the hidden test with the cycle `3 → 4 → 5 → 3`. Kahn's algorithm handles this automatically.
- **Ignoring self-loops.** `[1, 1]` gives course 1 an in-degree it can never shed. Kahn's handles it; a DFS that skips `v == u` does not.

### How to discuss it

Say "possible to finish every course" is the same as "the prerequisite graph has no directed cycle", and give the one-line reason (a cycle has no first course). Then pick Kahn's and explain why the count works: a course on or downstream of a cycle can never reach in-degree 0.

For the follow-ups: to report the cycle, run the three-colour DFS and, when you hit a grey node, walk back along the current path to it; that path segment is the cycle. Reporting "courses that were never taken" from Kahn's is not the same thing, since it also includes innocent courses downstream of the cycle, and saying so is a good senior detail. For a 200,000-target build system, the algorithm is unchanged, but you add incremental recomputation (only targets downstream of a changed file are rebuilt), parallelism (everything in the ready queue can build at once, and the critical path bounds the wall-clock time), and caching keyed by input hashes.
