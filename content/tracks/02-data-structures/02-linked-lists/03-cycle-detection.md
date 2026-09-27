---
slug: cycle-detection
title: Cycle detection
description: Floyd's tortoise and hare with a real proof, finding the cycle's start and length with modular arithmetic, and the same algorithm applied to arrays, number sequences and state machines.
minutes: 40
difficulty: medium
tags: [linked-list, cycle-detection, floyd, fast-slow, two-pointers, proof]
problems: [linked-list-cycle, find-duplicate-number, happy-number]
---
A traversal that should take microseconds is still running an hour later, pinned at 100% CPU. Somewhere a `next` pointer points backwards, and `while node:` will never see a null. The corrupted list is a symptom; the real question is how to *detect* that a sequence of "follow the pointer" steps has entered a loop, using no memory, when the sequence may be a linked list, a chain of array indices, an iterated function or a state machine.

The obvious answer is a hash set of visited nodes: O(n) time, O(n) space. Floyd's algorithm does it in O(n) time and O(1) space with two pointers, and its proof is short enough to give in an interview, which is why interviewers ask for it.

## The hash-set baseline

```python
def has_cycle_set(head):
    seen = set()
    node = head
    while node is not None:
        if id(node) in seen:       # or `node in seen` with identity-hashed nodes
            return True
        seen.add(id(node))
        node = node.next
    return False
```

Correct, simple, O(n) space. Say it first; it is the right answer when memory is not a constraint and the nodes are hashable. The interviewer will then ask for O(1) space.

## Floyd's algorithm: the tortoise and the hare

Two pointers start at the head. `slow` moves one step per iteration, `fast` moves two. If `fast` (or `fast.next`) reaches null, there is no cycle. If there is a cycle, the two pointers eventually point at the same node.

```python
def has_cycle(head):
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False
```

```viz
{"type": "linked-list", "algorithm": "cycle-detect", "values": [1, 2, 3, 4, 5, 6], "cycleAt": 2, "title": "Tortoise and hare: node 6 points back to node 3"}
```

### Why they must meet

The intuition "fast laps slow" is right but not a proof. Here is the argument.

Let the list have `F` nodes before the cycle (the "tail") and a cycle of length `C`. After `F` steps, `slow` enters the cycle at its first node. `fast` has taken `2F` steps and is somewhere in the cycle, say `d` positions ahead of `slow` measured along the cycle, with `0 ≤ d < C`.

From now on, both pointers are on the cycle. Each iteration, `slow` moves one and `fast` moves two, so the gap from `slow` forward to `fast` *shrinks by exactly one* per iteration (equivalently, the gap from `fast` forward to `slow` is `C − d` and shrinks by one). A gap that starts below `C` and shrinks by one each step hits zero within `C − d ≤ C` iterations, and the pointers coincide. The reason the speeds 1 and 2 matter is that the gap changes by 1, so it cannot skip over zero; with speeds 1 and 3 the gap would change by 2 and could jump past zero if `C` were even and the initial gap odd (the pointers would still meet eventually, but the simple argument breaks).

Total iterations: at most `F + C`, so O(n) time. Two pointers: O(1) space.

### Worked trace

List `1 → 2 → 3 → 4 → 5 → 6 → (back to 3)`. So `F = 2` (nodes 1, 2), `C = 4` (nodes 3, 4, 5, 6).

| iteration | slow | fast |
|---|---|---|
| 0 | 1 | 1 |
| 1 | 2 | 3 |
| 2 | 3 | 5 |
| 3 | 4 | 3 |
| 4 | 5 | 5 |

They meet at node 5 after 4 iterations. Check against the proof: after `F = 2` iterations `slow` is at 3 (cycle start) and `fast` is at 5, `d = 2` ahead. Gap shrinks by one per step: 2, 1, 0. Meeting after two more iterations, at iteration 4. Matches.

## Finding where the cycle starts

Once the pointers meet, you can locate the first node of the cycle with one more walk, and the reason it works is modular arithmetic.

At the meeting point, `slow` has taken `s` steps and `fast` has taken `2s`. Both are in the cycle, and `fast` has gone around some whole number `k ≥ 1` of extra times:

$$2s = s + kC \quad\Rightarrow\quad s = kC$$

`slow` is `s − F = kC − F` steps into the cycle from its start. Now put a new pointer `p` at the head and advance `p` and `slow` one step at a time. After `F` steps, `p` reaches the cycle start. `slow`, meanwhile, has moved `F` more steps from position `kC − F`, landing at position `kC`, which is `0 mod C`: the cycle start. They meet exactly there.

```python
def cycle_start(head):
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            p = head
            while p is not slow:
                p = p.next
                slow = slow.next
            return p
    return None
```

Continue the trace: meeting at node 5. `p = 1`, `slow = 5`. Step 1: `p = 2`, `slow = 6`. Step 2: `p = 3`, `slow = 3`. Meet at node 3, the cycle start. `F = 2` steps, as predicted.

### Cycle length

From the meeting point, advance one pointer until it returns to the meeting node, counting steps. That count is `C`. Alternatively, freeze `slow` and count how many steps `fast` takes to come back around.

With `F` and `C` known you can describe the entire structure of the list, which is what you need to *repair* one: the last node of the cycle is `C − 1` steps after the start, and setting its `next` to null breaks the loop.

## Beyond linked lists: any iterated function

Floyd's algorithm never uses the fact that the sequence is a linked list. It uses only that there is a deterministic "next" step: `x → f(x)`. Any sequence `x₀, f(x₀), f(f(x₀)), …` over a finite set must eventually repeat, and the picture is always the same "ρ" shape: a tail of `F` distinct values, then a cycle of length `C`.

**Arrays as functions.** An array `nums` of `n + 1` integers each in `1..n` defines `f(i) = nums[i]`. Start at index 0 and follow `i → nums[i]`. Since there are `n + 1` indices and only `n` possible values, some value is reached from two different indices, which is exactly a node with two incoming edges: the cycle start. Floyd finds it in O(n) time and O(1) space without modifying the array. That is the trick behind [Find the Duplicate Number](/practice/find-duplicate-number), and it is the first exercise below.

For `nums = [1, 3, 4, 2, 2]`: `0 → 1 → 3 → 2 → 4 → 2 → 4 → …`. Tail `0, 1, 3` (`F = 3`), cycle `2, 4` (`C = 2`). The cycle start is the value 2, and 2 is the duplicate: two indices (3 and 4) map to it.

**Number sequences.** "Happy number": repeatedly replace `n` by the sum of the squares of its digits; it either reaches 1 or loops. Every number above 243 shrinks under the map (999 → 243), so the sequence lives in a finite set and must cycle; running slow and fast pointers over `f(n)` detects the loop with no set. [Happy Number](/practice/happy-number) is the second exercise.

**Pseudo-random generators.** A linear congruential generator `x → (ax + c) mod m` is a function on a finite set; its period is a cycle length, and Floyd's algorithm measures it. Pollard's rho factoring algorithm runs Floyd (or Brent) over `x → x² + c mod N` and uses the cycle to extract a factor of `N`.

**State machines and workflows.** A build system, a retry policy or a saga that transitions deterministically between states can loop forever. Running two "simulators" at speeds 1 and 2 over the transition function detects it with O(1) memory, which matters when states are large objects you would rather not hash.

**Persistent data structure corruption.** A doubly linked LRU list whose `prev`/`next` pointers were updated in the wrong order can form a cycle. A debug assertion that runs Floyd over the list is cheap and catches it.

## Brent's algorithm

Floyd moves three pointers per iteration (slow once, fast twice). Brent's variant keeps `slow` fixed at a "teleport" point and moves `fast` alone, doubling the search window each time `fast` fails to return: check after 1 step, then 2, then 4, …. It makes fewer function evaluations (about 36% fewer on average) and finds `C` directly as a by-product. When `f` is expensive (a hash computation in Pollard's rho, a database call in a workflow simulator), that matters. In interviews, Floyd is the expected answer; mention Brent if the interviewer asks "can you do better?".

## What the interviewer is checking

1. That you say the hash-set version first and know its cost.
2. That the loop condition is `while fast and fast.next`, and you can explain why both checks are needed.
3. That you compare pointers by identity, not value (`is` in Python, `===` on objects in JavaScript). Two different nodes can hold the same value.
4. That you can give the gap-shrinks-by-one argument for meeting, and the `s = kC` argument for the cycle start, without hand-waving.
5. That you recognise the array-as-function reduction when a problem says "n + 1 numbers in the range 1..n, O(1) space, do not modify the array".

## Exercises

```exercise
id: find-duplicate
title: Find the duplicate with Floyd's algorithm
prompt: |
  `nums` has `n + 1` integers, each in the range `1..n`, and exactly one
  value appears two or more times. Return that value using O(1) extra
  space without modifying the array, by treating `i -> nums[i]` as a
  linked list starting at index 0 and finding the start of its cycle.
languages: [python, javascript]
entry: find_duplicate
starter:
  python: |
    def find_duplicate(nums):
        # your code here
        return -1
  javascript: |
    function find_duplicate(nums) {
      // your code here
      return -1;
    }
tests:
  - args: [[1, 3, 4, 2, 2]]
    expected: 2
  - args: [[3, 1, 3, 4, 2]]
    expected: 3
  - args: [[1, 1]]
    expected: 1
    label: smallest input
  - args: [[2, 2, 2, 2]]
    expected: 2
    label: value repeated many times
  - args: [[1, 4, 6, 3, 2, 5, 6]]
    expected: 6
    hidden: true
  - args: [[4, 3, 1, 4, 2]]
    expected: 4
    hidden: true
hints:
  - "Phase 1: `slow = nums[slow]`, `fast = nums[nums[fast]]` until they are equal (use a do-while shape: step once before comparing)."
  - "Phase 2: reset one pointer to 0 and advance both by one step until they meet; that index value is the duplicate."
```

```exercise
id: is-happy
title: Happy number without a set
prompt: |
  A number is happy if repeatedly replacing it by the sum of the squares of
  its decimal digits eventually reaches 1. Otherwise the process loops
  forever. Return `true`/`True` if `n` is happy. Detect the loop with slow
  and fast pointers over the digit-square-sum function, using no set or
  list of seen values.
languages: [python, javascript]
entry: is_happy
starter:
  python: |
    def is_happy(n):
        # your code here
        return False
  javascript: |
    function is_happy(n) {
      // your code here
      return false;
    }
tests:
  - args: [19]
    expected: true
  - args: [2]
    expected: false
  - args: [1]
    expected: true
    label: already 1
  - args: [7]
    expected: true
  - args: [4]
    expected: false
    hidden: true
    label: start of the unhappy cycle
  - args: [100]
    expected: true
    hidden: true
hints:
  - "Write `step(n)` that sums the squares of the digits. Then `slow = step(slow)`, `fast = step(step(fast))` until `fast == 1` or `slow == fast`."
  - "Return `fast == 1`: if the pointers met at 1 the number is happy; if they met elsewhere it is in the cycle."
```

## Senior signals

- You give the hash-set solution first, then Floyd for O(1) space, and you can prove both the meeting and the cycle-start step.
- You know why speeds 1 and 2 make the gap shrink by exactly one and why that matters for the proof.
- You compare nodes by identity, not value.
- You recognise the "n + 1 values in 1..n, read-only, O(1) space" phrasing as a cycle-detection problem on an implicit function.
- You can name uses beyond lists: happy numbers, PRNG periods, Pollard's rho, state-machine loop detection, list-corruption assertions.
- You know Brent's algorithm exists and when fewer function evaluations matter.

## Check yourself

```quiz
- q: >-
    In Floyd's algorithm, why is it guaranteed that the fast pointer does not "jump over" the slow pointer without landing on it?
  options: ["The cycle length is always even, so a jump of two lands on every node", "The list is finite, so fast must eventually visit every node in the cycle", "The gap between them shrinks by exactly one node each iteration", "The gap between them shrinks by two nodes each iteration, reaching zero"]
  answer: 2
  explanation: >-
    With speeds 1 and 2 the relative speed is 1, so the distance from slow to fast around the cycle decreases by one each iteration and must pass through zero within C steps. A gap that changed by two could skip zero on cycles of even length, and cycles can have any length.
- q: >-
    After the pointers meet, one pointer is reset to the head and both advance one step at a time. They meet at the cycle start because:
  options: ["The cycle length always equals the tail length, so both walks take F steps", "Both pointers move at the same speed, so they are bound to meet somewhere", "slow is kC − F steps into the cycle, so F more steps land it on the start", "The first meeting point is always the cycle start, so the walk just confirms it"]
  answer: 2
  explanation: >-
    Because fast took 2s steps and slow took s, the difference s = kC is a multiple of C. Slow's position in the cycle is s − F = kC − F; adding F gives a multiple of C, i.e. the start, exactly when the head pointer arrives there. Same speed alone does not guarantee meeting: two pointers at different cycle positions moving at equal speed never meet.
- q: >-
    Which of these lets you apply Floyd's algorithm to an array of n + 1 integers in the range 1..n?
  options: ["Sort the array first, so equal values become adjacent nodes in the chain", "Link index i to nums[i]; the duplicate is where slow and fast first meet", "Treat index i as a node whose next is nums[i]; the duplicate starts the cycle", "Use the array as a hash set, negating nums[v] to mark each value v seen"]
  answer: 2
  explanation: >-
    Values in 1..n are valid indices, so i → nums[i] defines a function on a finite set with n + 1 nodes and only n targets; by pigeonhole some target has two incoming edges, and that node is where the cycle begins. The first meeting point of slow and fast is somewhere inside the cycle, not necessarily its start, so the second phase (reset one pointer to the start) is still needed. Sorting and negation both modify the array.
- q: >-
    Which comparison correctly tests whether the two pointers have met in a linked list of node objects?
  options: ["slow is fast, since only identity proves they are the same node", "slow.val == fast.val, since meeting means reaching the same value", "id(slow.val) == id(fast.val), since ids are unique per node", "slow.next is fast.next, since equal successors mean the same node"]
  answer: 0
  explanation: >-
    Two distinct nodes may hold equal values, so value comparison gives false positives, and small ints share one object, so their ids match too. Identity comparison (`is` in Python, `===` on objects in JavaScript) checks that both references point at the same node. Equal successors do not prove it either: the cycle's first node has two predecessors.
- q: >-
    You need to know the period of a deterministic state machine whose step function is expensive and whose states are large. The most appropriate method is:
  options: ["Store every state in a hash set until the first repeated state appears", "Serialise every state to disk and compare checksums of each new one", "Run Floyd's or Brent's cycle detection over the step function", "Run for a fixed large number of steps, then scan the log for repeats"]
  answer: 2
  explanation: >-
    Cycle detection over an iterated function needs no storage of states: O(1) memory. Brent's variant minimises evaluations of the expensive step function and reports the cycle length directly. A hash set costs memory proportional to the tail plus cycle length and requires hashing large states.
```
