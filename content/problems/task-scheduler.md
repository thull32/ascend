---
slug: task-scheduler
title: Task Scheduler
difficulty: medium
patterns: [heap]
lists: [ascend-150]
companies: [meta, amazon, uber, microsoft]
order: 5
lesson: interview-patterns/sequence-patterns/top-k-elements
hints:
  - "The task with the highest remaining count is the one that forces idle time. Which task should run whenever you have a choice?"
  - "Simulate with a max-heap of remaining counts: each cycle of `n + 1` slots pops up to `n + 1` distinct tasks, runs them, and pushes back any that still have work. If the heap empties mid-cycle and tasks remain, the rest of the cycle is idle."
  - "There is a closed form: with the most frequent task appearing `f` times and `m` tasks tied at that frequency, the answer is `max(len(tasks), (f - 1) · (n + 1) + m)`."
signatures:
  python:
    name: least_interval
    starter: |
      def least_interval(tasks: list[str], n: int) -> int:
          pass
  javascript:
    name: least_interval
    starter: |
      class MinHeap {
        constructor(compare = (a, b) => a - b) { this.a = []; this.cmp = compare; }
        size() { return this.a.length; }
        peek() { return this.a[0]; }
        push(x) {
          const a = this.a; a.push(x);
          let i = a.length - 1;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.cmp(a[i], a[p]) >= 0) break;
            [a[i], a[p]] = [a[p], a[i]]; i = p;
          }
        }
        pop() {
          const a = this.a; const top = a[0]; const last = a.pop();
          if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
              const l = 2 * i + 1, r = l + 1; let m = i;
              if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
              if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
              if (m === i) break;
              [a[i], a[m]] = [a[m], a[i]]; i = m;
            }
          }
          return top;
        }
      }

      function least_interval(tasks, n) {
      }
tests:
  - args: [["A", "A", "A", "B", "B", "B"], 2]
    expected: 8
  - args: [["A", "A", "A", "B", "B", "B"], 0]
    expected: 6
    label: no cooldown
  - args: [["A", "A", "A", "A", "A", "A", "B", "C", "D", "E", "F", "G"], 2]
    expected: 16
  - args: [["A"], 5]
    expected: 1
    label: single task
  - args: [["A", "B", "C"], 3]
    expected: 3
    label: all distinct
  - args: [["A", "A", "B", "B"], 1]
    expected: 4
  - args: [["A", "A", "A", "B", "B", "C"], 1]
    expected: 6
    hidden: true
    label: enough filler to avoid idling
  - args: [["A", "A", "A", "B", "B", "B", "C", "C", "C"], 2]
    expected: 9
    hidden: true
    label: three tasks tied at the top
  - args: [["A", "A", "A", "A", "B", "B", "C"], 3]
    expected: 13
    hidden: true
  - args: [["A", "A", "B"], 2]
    expected: 4
time_limit_ms: 4000
---
A CPU must run a list of `tasks`, each named by an uppercase letter and each taking exactly one time unit. Two runs of the *same* task must be separated by at least `n` time units of other tasks or idle time. Tasks may be run in any order. Return the minimum total time, including idle units, needed to complete every task.

### Examples

| Input | Output | Why |
|---|---|---|
| `["A","A","A","B","B","B"]`, `n = 2` | `8` | `A B _ A B _ A B` |
| `["A","A","A","B","B","C"]`, `n = 1` | `6` | `A B A C A B`: enough other tasks to fill every gap |
| `["A","A","A","A","B","B","C"]`, `n = 3` | `13` | `A B C _ A B _ _ A _ _ _ A`: the four `A`s pin the schedule |

### Constraints

- `1 ≤ len(tasks) ≤ 10⁴`
- `0 ≤ n ≤ 100`
- Task names are uppercase letters `A` to `Z`

### Follow-up

The interviewer asks: "Return the actual schedule, not just its length." Then: "Tasks now arrive over time with a release timestamp, and the cooldown differs per task. Does the formula survive? Does the heap?"

## Solution

### The naive approach

Try every ordering. There are `len(tasks)!` of them, so this is not a real option; it is worth one sentence to establish that the problem is about choosing a *greedy* order and proving it is optimal.

### The insight

The most frequent task is the bottleneck. If `A` appears `f` times, its runs must be at least `n + 1` apart, so the schedule is at least `(f - 1) · (n + 1) + 1` long: `f - 1` full gaps plus the final `A`. Any other task tied at frequency `f` needs one extra slot at the very end, so with `m` tasks at the maximum frequency the bound is `(f - 1) · (n + 1) + m`. All other tasks fit into the gaps without extending the schedule, *unless* there are so many of them that the gaps overflow, in which case there is no idle time and the answer is simply `len(tasks)`.

The greedy that achieves this bound: at every step, run the available task with the most remaining work. Running the heaviest task first spreads it out as early as possible, so it never forces idle time that a lighter task could have filled.

### The optimal approach

The closed form:

```python
def least_interval(tasks: list[str], n: int) -> int:
    counts = collections.Counter(tasks)
    f = max(counts.values())
    m = sum(1 for c in counts.values() if c == f)
    return max(len(tasks), (f - 1) * (n + 1) + m)
```

`O(len(tasks))` time, `O(26)` space.

The heap simulation, which is the version that generalises and the one to write when asked for the schedule:

```python
def least_interval_simulated(tasks: list[str], n: int) -> int:
    heap = [-c for c in collections.Counter(tasks).values()]
    heapq.heapify(heap)
    time = 0
    while heap:
        cycle: list[int] = []
        for _ in range(n + 1):
            if heap:
                cycle.append(heapq.heappop(heap) + 1)  # one unit of work done
        for remaining in cycle:
            if remaining < 0:
                heapq.heappush(heap, remaining)
        time += (n + 1) if heap else len(cycle)
    return time
```

Each cycle of `n + 1` slots runs up to `n + 1` distinct tasks, heaviest first. If tasks remain after the cycle, the whole cycle counts (unfilled slots are idle); on the last cycle only the slots actually used count. `O(len(tasks) · log 26)` time.

### Common mistakes

- Forgetting the `max` with `len(tasks)`: `["A","A","A","B","B","C"]` with `n = 1` gives the formula `5` but six tasks must run.
- Counting the last cycle as full `n + 1` units, which adds phantom idle time at the end.
- Pushing tasks back into the heap *during* the cycle instead of after it, which lets a task run twice within its cooldown.

### How to discuss it

Explain the lower bound from the most frequent task, then the greedy that meets it, then the `len(tasks)` case. Write the formula and offer the simulation as "what I would actually ship, because it can emit the schedule and it is obviously correct." For the schedule follow-up, record the task letter alongside the count in the heap. For per-task cooldowns with release times, the formula is gone: the problem becomes a priority queue of ready tasks plus a second queue (or a heap keyed by "available at" time) of cooling tasks, which is the shape of a real OS scheduler, and saying "the simulation survives, the formula does not" is the answer they want.
