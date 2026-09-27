---
slug: course-schedule-ii
title: Course Schedule II
difficulty: medium
patterns: [topological-sort]
lists: [ascend-150]
companies: [amazon, google, meta, microsoft, airbnb]
order: 2
lesson: interview-patterns/tree-and-graph-patterns/topological-sort-pattern
hints:
  - "This is Course Schedule, but you must return the order instead of a yes/no. Which algorithm naturally produces an order as it runs?"
  - "In Kahn's algorithm, the order in which courses leave the ready queue is a valid order. Append each course as you pop it."
  - "If the order you built has fewer than num_courses entries, some courses were stuck behind a cycle: return an empty list."
signatures:
  python:
    name: find_order
    starter: |
      def find_order(num_courses: int, prerequisites: list[list[int]]) -> list[int]:
          pass
  javascript:
    name: find_order
    starter: |
      function find_order(num_courses, prerequisites) {
      }
tests:
  - args: [4, [[1, 0], [2, 1], [3, 2]]]
    expected: [0, 1, 2, 3]
    label: a simple chain
  - args: [3, [[0, 1], [0, 2], [1, 2]]]
    expected: [2, 1, 0]
    label: the order runs from high labels to low
  - args: [1, []]
    expected: [0]
    label: one course
  - args: [2, [[0, 1], [1, 0]]]
    expected: []
    label: two courses that require each other
  - args: [4, [[1, 0], [2, 0], [3, 1], [3, 2], [2, 1]]]
    expected: [0, 1, 2, 3]
    label: extra edges pin the order down
  - args: [3, [[0, 1], [1, 2], [2, 0]]]
    expected: []
    label: three-course cycle
  - args: [5, [[4, 3], [3, 2], [2, 1], [1, 0], [4, 0]]]
    expected: [0, 1, 2, 3, 4]
    hidden: true
  - args: [5, [[0, 3], [4, 0], [1, 4], [2, 1], [2, 3]]]
    expected: [3, 0, 4, 1, 2]
    hidden: true
    label: labels shuffled along the chain
  - args: [4, [[1, 0], [2, 1], [3, 2], [2, 3]]]
    expected: []
    hidden: true
    label: a cycle after a valid prefix
  - args: [3, [[1, 1]]]
    expected: []
    hidden: true
    label: a course that requires itself
time_limit_ms: 4000
---
There are `num_courses` courses labelled `0` to `num_courses - 1`. Each entry `[a, b]` in `prerequisites` means course `b` must be completed before course `a` can start. Return an order in which you can take all the courses, one at a time, respecting every prerequisite. If no such order exists, return an empty list.

In general several orders can be valid. The inputs here are chosen so that whenever an order exists it is **unique**, so there is exactly one correct answer to return.

### Examples

| Input | Output | Why |
|---|---|---|
| `4`, `[[1,0],[2,1],[3,2]]` | `[0,1,2,3]` | Each course unlocks the next |
| `3`, `[[0,1],[0,2],[1,2]]` | `[2,1,0]` | 2 comes before both others, and 1 before 0 |
| `2`, `[[0,1],[1,0]]` | `[]` | A cycle: neither course can go first |

### Constraints

- `1 ≤ num_courses ≤ 2000`
- `0 ≤ len(prerequisites) ≤ 5000`
- `0 ≤ a, b < num_courses`

### Follow-up

The interviewer asks: "Without the uniqueness guarantee, how would you *check* whether the order is unique?" And then: "Students can take up to `k` courses per term. What is the minimum number of terms if `k` is unlimited? What if `k = 2`?"

## Solution

### The naive approach

Generate orderings and test each one against the prerequisites. There are `n!` orderings, so this is hopeless beyond a dozen courses. A smarter-sounding version, "repeatedly scan for any course whose prerequisites are done", is correct but rescans the whole graph after every pick, `O(V·(V + E))`.

### The insight

A valid order of a directed graph's nodes, where every edge goes from earlier to later, is a **topological order**. It exists exactly when the graph has no directed cycle. Kahn's algorithm builds one directly: keep the in-degree (number of unfinished prerequisites) of every course, start with the courses at in-degree 0, and each time you take a course, decrement its dependants and release any that hit 0. The sequence of courses you take **is** the topological order. If a cycle exists, the courses on it never reach in-degree 0, the queue runs dry early, and the order is short.

Why is the popped sequence valid? A course is only enqueued after every prerequisite has been popped (that is what in-degree 0 means), so each prerequisite appears before it.

### The optimal approach

The code is [Course Schedule](/practice/course-schedule) with one extra line: append each popped course to `order`. At the end, return `order` if it contains every course, else `[]`.

Trace `3, [[0,1],[0,2],[1,2]]`. Edges: `1→0`, `2→0`, `2→1`. In-degrees: 0:2, 1:1, 2:0. Queue `[2]`. Pop 2, order `[2]`; course 0 drops to 1, course 1 drops to 0 and is enqueued. Pop 1, order `[2,1]`; course 0 drops to 0 and is enqueued. Pop 0, order `[2,1,0]`. Three of three, so return it.

```python
from collections import deque

def find_order(num_courses: int, prerequisites: list[list[int]]) -> list[int]:
    unlocks: list[list[int]] = [[] for _ in range(num_courses)]
    indegree = [0] * num_courses
    for course, pre in prerequisites:
        unlocks[pre].append(course)
        indegree[course] += 1

    ready = deque(c for c in range(num_courses) if indegree[c] == 0)
    order: list[int] = []
    while ready:
        c = ready.popleft()
        order.append(c)
        for nxt in unlocks[c]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
    return order if len(order) == num_courses else []
```

Time `O(V + E)`, space `O(V + E)`.

The DFS alternative produces the order in **reverse**: a course is finished (appended) only after everything it unlocks has been finished, so the post-order lists dependants before prerequisites, and you reverse it at the end. Forgetting that reversal is the classic DFS bug.

### Common mistakes

- **Edge direction.** `[a, b]` means `b → a`. Reversing it gives the order backwards: `[0,1,2,3]` comes out as `[3,2,1,0]`. Unlike the yes/no version, this problem exposes the mistake.
- **Returning a partial order.** If a cycle stops the queue early, `order` holds the courses that *could* be taken. The prompt wants `[]`, not a partial plan.
- **Appending on push instead of on pop.** With a FIFO queue this happens to give the same sequence, but with a stack or heap it does not, and it hides the invariant (a course is placed when it is taken).
- **Forgetting the DFS reversal** if you go that route.

### How to discuss it

Say "topological order, Kahn's algorithm, the pop order is the answer, and a short order means a cycle." Then address uniqueness, because a senior interviewer will ask: the topological order is unique **exactly when the ready queue never holds more than one course**. If it ever holds two, either could go first, and both choices lead to valid orders. Equivalently, the order is unique when every consecutive pair in it is joined by an edge (the order is a Hamiltonian path). That is how the tests here were constructed.

For the terms follow-up with unlimited `k`, process Kahn's algorithm level by level: everything in the queue at the start of a term can be taken together, and the number of levels is the length of the longest prerequisite chain. With a cap of `k` per term it becomes precedence-constrained scheduling, and taking courses greedily level by level is no longer optimal. Its complexity is subtle: `k = 2` has a clever polynomial algorithm (Coffman–Graham), fixed `k ≥ 3` is a well-known open problem, and with `k` part of the input it is NP-hard. In an interview with small `n`, a bitmask DP over the set of completed courses is the honest answer, and naming why greedy fails earns more credit than the DP itself.
