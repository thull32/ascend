---
slug: car-fleet
title: Car Fleet
difficulty: medium
patterns: [stack]
lists: [ascend-150]
companies: [google, amazon, uber]
order: 6
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - A car can only be slowed by the car directly ahead of it. Sort by starting position so "ahead" means "previous in the sorted order".
  - What matters about each car is the time it would take to reach the target *unobstructed*. If a car behind would arrive sooner than the car ahead, it catches up and joins that fleet; its own arrival time is then irrelevant.
  - Process cars from the one nearest the target backwards, keeping a stack of fleet arrival times. Push a new fleet only when the car's time exceeds the time on top of the stack.
signatures:
  python:
    name: car_fleet
    starter: |
      def car_fleet(target: int, position: list[int], speed: list[int]) -> int:
          pass
  javascript:
    name: car_fleet
    starter: |
      function car_fleet(target, position, speed) {
      }
tests:
  - args: [12, [10, 8, 0, 5, 3], [2, 4, 1, 1, 3]]
    expected: 3
  - args: [10, [3], [3]]
    expected: 1
    label: single car
  - args: [100, [0, 2, 4], [4, 2, 1]]
    expected: 1
    label: everyone catches the slow leader
  - args: [10, [6, 8], [3, 2]]
    expected: 2
    label: faster car behind would only catch up after the target
  - args: [5, [], []]
    expected: 0
    label: no cars
  - args: [10, [0, 4, 2], [2, 1, 3]]
    expected: 1
    hidden: true
    label: unsorted input positions
  - args: [20, [1, 5, 10, 15], [10, 1, 1, 1]]
    expected: 3
    hidden: true
  - args: [10, [5, 3], [1, 1]]
    expected: 2
    hidden: true
    label: same speed never meets
time_limit_ms: 4000
---
`n` cars are driving along a single-lane road toward a destination at mile `target`. Car `i` starts at mile `position[i]` (all distinct, all less than `target`) and drives at `speed[i]` miles per hour. A car can never overtake. If it catches up to the car ahead, it slows to that car's speed and the two travel on together as one *fleet* (a fleet can be a single car). A car that catches another exactly at the target still joins its fleet.

Return the number of fleets that arrive at the destination.

### Examples

| Input | Output | Why |
|---|---|---|
| `target = 12`, `position = [10, 8, 0, 5, 3]`, `speed = [2, 4, 1, 1, 3]` | `3` | The car at 10 and the car at 8 meet exactly at 12; the cars at 5 and 3 meet at 6; the car at 0 is alone |
| `target = 100`, `position = [0, 2, 4]`, `speed = [4, 2, 1]` | `1` | The leader at 4 is slowest; both others catch it before mile 100 |
| `target = 10`, `position = [6, 8]`, `speed = [3, 2]` | `2` | The car at 6 gains a mile per hour, but the 2-mile gap closes at mile 12, past the target |

### Constraints

- `0 ≤ n ≤ 10⁵`
- `0 ≤ position[i] < target ≤ 10⁶`, all positions distinct
- `1 ≤ speed[i] ≤ 10⁶`

### Follow-up

The interviewer asks: "Instead of the count, return the time at which each car reaches the target, accounting for slowdowns." Then: "What if the road forks and cars have different targets?"

## Solution

### The naive approach

Simulate: advance time in small steps, check for catch-ups, merge. It is both slow and wrong in subtle ways (floating-point step sizes, cars that meet exactly at the target). Simulation is a red flag in this problem; the whole trick is that you never need to simulate.

### The insight

Two facts collapse the problem. First, a car is only ever affected by the car *directly ahead* of it, so sort by position and think in terms of neighbours. Second, whether car `B` catches car `A` (ahead) before the target depends only on their unobstructed arrival times, `(target - pos) / speed`: if `B` would arrive no later than `A`, it must catch `A` on the way (it starts behind and finishes at or before `A`, so the paths cross). Once merged, `B` moves at `A`'s pace, so the fleet's arrival time is `A`'s time, and `B`'s own time is irrelevant to anything behind it.

That is a stack. Process cars from nearest-to-target backwards. The stack top is the arrival time of the fleet directly ahead. If the current car's time is `≤` the top, it joins that fleet (do nothing). Otherwise it is a new fleet: push its time.

### The optimal approach

```python
def car_fleet(target: int, position: list[int], speed: list[int]) -> int:
    cars = sorted(zip(position, speed), reverse=True)  # nearest to target first
    fleet_times: list[float] = []
    for pos, spd in cars:
        time = (target - pos) / spd
        if not fleet_times or time > fleet_times[-1]:
            fleet_times.append(time)
    return len(fleet_times)
```

Time `O(n log n)` for the sort; the scan is `O(n)`. Space `O(n)`.

Notice that the stack never pops. Once a fleet is on the stack, nothing behind it can remove it, because later cars are further away and either join it or form a slower fleet behind it. Since only the top is ever read, the "stack" is really just the arrival time of the most recent fleet, and the count is a counter. Recognising that the stack degenerates to one variable is a small but real signal.

### Common mistakes

- Forgetting to sort, or sorting ascending and processing front-to-back, which makes "the car ahead" the wrong neighbour.
- Using `>=` instead of `>` when deciding on a new fleet, so a car that meets the leader exactly at the target is counted separately.
- Comparing speeds instead of arrival times. A faster car behind does not necessarily catch up (`[6, 8]` with speeds `[3, 2]` above).
- Integer division for the time. `(12 - 10) // 2` happens to be exact here; `(12 - 5) // 1` versus `(12 - 3) // 3` is not.

### How to discuss it

Open with "a car only interacts with the car in front, so I'll sort by position; and whether it catches that car depends only on unobstructed arrival times." Then trace the first example from the front: `10 → 1.0h`, `8 → 1.0h` joins, `5 → 7.0h` new fleet, `3 → 3.0h` joins, `0 → 12.0h` new fleet. For the per-car arrival time follow-up, the fleet time on the stack top when the car is processed *is* its arrival time; record it. For different targets, the pairwise "catches" test still works between neighbours but a merged fleet may split when the leader exits, which turns it into event simulation; say that is a different problem and estimate its cost rather than hand-waving.
