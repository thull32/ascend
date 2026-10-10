---
slug: fast-slow-pointers
title: "Fast and slow pointers: cycles, middles and implicit lists"
description: "Floyd's runner technique as an interview pattern: the signal and its near-misses, the meeting-point proof and why resetting to the head finds the entry, the off-by-one traps in start positions and loop guards, Linked List Cycle, Middle, Find the Duplicate and Happy Number traced step by step, and what pointer chasing costs on real hardware."
minutes: 45
difficulty: medium
tags: [pattern:fast-slow-pointers, linked-list, cycle-detection, floyd, runner-technique]
problems: [linked-list-cycle, find-duplicate-number, middle-of-linked-list, happy-number]
---
You are walking a sequence you cannot index and cannot see the end of: a linked list, or a function applied to its own output. You need to know whether it loops, where it loops, or where its middle is, and the interviewer has taken away the O(n) memory you would use to remember what you have visited. The obvious tool, a set of visited nodes, is off the table.

Two pointers moving at different speeds answer all of these with O(1) memory. The slow pointer moves one step per iteration and the fast pointer two. If the sequence ends, the fast pointer reaches the end first, and the slow pointer is then halfway. If the sequence loops, the fast pointer laps the slow one, and where they meet encodes where the loop starts. The mechanism fits in ten lines. What takes practice is recognising the problems that are linked lists in disguise, and writing the loop guard and start positions without an off-by-one.

## The signal

Three things together select the pattern:

1. **A sequence you can only follow forward.** A singly linked list, or anything of the form `x → f(x)`: an array read as "`nums[i]` is the next index", an integer under "sum of squared digits", a state machine's transition function. Every such chain is a linked list whose nodes each have exactly one outgoing edge.
2. **A question about position or repetition.** "Does it cycle", "where does the cycle begin", "how long is it", "find the middle", "does this process terminate", "which value is repeated".
3. **A space constraint.** "O(1) extra space", "do not modify the input". Without it a visited set is simpler, and saying so is part of a good answer.

The near-misses, each of which looks like this pattern on a first read:

| Statement says | Pattern | Why the runner is wrong |
|---|---|---|
| "Detect a cycle in a course prerequisite graph" | [Topological sort](/learn/interview-patterns/tree-and-graph-patterns/topological-sort-pattern) or DFS with three colours | A node has several outgoing edges; Floyd needs exactly one successor per node |
| "Where do two linked lists intersect?" | Length alignment, or two pointers that switch heads | The pointers move at the **same** speed; the trick is equalising path lengths (`a + c + b = b + c + a`) |
| "Find the duplicate" and the array **may be modified** | [Cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort) or sign-marking | Simpler to explain, same O(n) time and O(1) space, and it finds *every* duplicate |
| "Find all numbers that appear twice" | Sign-marking or cyclic sort | Floyd finds one cycle entry, so one duplicated value |
| "k-th node from the end" of a list with a stored length, or a doubly linked list | Arithmetic, or walk backwards | Nothing is unknown about the end |
| "Middle of an array" | Index arithmetic, `(lo + hi) // 2` | Random access makes the runner pointless |
| "Remove the n-th node from the end" | A fixed **gap** of `n`, not a speed ratio | Same family, different template (below) |

## The template

There are three shapes: detect and locate a cycle, find the middle, and keep a fixed gap. The data-structure mechanics are in [Cycle detection](/learn/data-structures/linked-lists/cycle-detection) and [Reversal and runner techniques](/learn/data-structures/linked-lists/reversal-and-runner-techniques); here they are the skeletons you type from memory, with the lines that carry the bugs annotated.

### Cycle detection and entry

```python
def cycle_entry(head):
    slow = fast = head
    while fast and fast.next:        # fast.next guards the second hop
        slow = slow.next
        fast = fast.next.next
        if slow is fast:             # identity, never .val
            break
    else:                            # runs only if the loop ended without break
        return None                  # fast fell off the end: no cycle
    ptr = head                       # phase 2: one pointer from the head,
    while ptr is not slow:           # one from the meeting point, same speed
        ptr = ptr.next
        slow = slow.next
    return ptr                       # the first node of the cycle
```

```javascript
function cycleEntry(head) {
  let slow = head, fast = head, met = false;
  while (fast && fast.next) {        // both checks, or an even-length list throws
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) { met = true; break; }   // reference equality on nodes
  }
  if (!met) return null;
  let ptr = head;
  while (ptr !== slow) {
    ptr = ptr.next;
    slow = slow.next;
  }
  return ptr;
}
```

Python's `while … else` is the one unusual construct: the `else` block runs when the loop condition becomes false, and is skipped when the loop exits by `break`. Both pointers start at the head and **move before they compare**; a `while slow is not fast` loop would never run.

### Middle, and a fixed gap

```python
def middle(head):
    slow = fast = head
    while fast and fast.next:        # returns the SECOND middle on even length
        slow = slow.next
        fast = fast.next.next
    return slow

def kth_from_end(head, k):
    fast = head
    for _ in range(k):               # open a gap of k nodes
        if fast is None:
            return None              # fewer than k nodes
        fast = fast.next
    slow = head
    while fast:                      # when fast falls off, slow is k from the end
        slow = slow.next
        fast = fast.next
    return slow
```

```javascript
function middle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow;
}

function kthFromEnd(head, k) {
  let fast = head;
  for (let i = 0; i < k; i++) {
    if (!fast) return null;
    fast = fast.next;
  }
  let slow = head;
  while (fast) { slow = slow.next; fast = fast.next; }
  return slow;
}
```

The invariant for the speed templates: **after `t` iterations, `slow` is `t` steps from the head and `fast` is `2t` steps from the head.** For the gap template: **`fast` is always exactly `k` nodes ahead of `slow`**, so when `fast` is one past the last node, `slow` is `k` nodes before that. Watch the cycle case close its gap:

```viz
{"type": "linked-list", "algorithm": "cycle-detect", "values": [1, 2, 3, 4, 5, 6], "cycleAt": 2, "title": "Floyd on six nodes, with 6 linking back to 3", "caption": "Phase one: fast closes the gap by one node per step and meets slow on 5. Phase two: slow restarts at the head, both move one node per step, and they meet on the entry, 3."}
```

## Why they meet, and why the reset finds the entry

Name three quantities: `a` is the number of steps from the head to the cycle's first node (the entry), `c` is the cycle length, and `b` is how far past the entry, along the cycle, the pointers meet.

**They must meet.** When `slow` reaches the entry, after `a` iterations, `fast` is somewhere in the cycle. Measure the distance forward from `fast` to `slow` along the cycle: it is some `d` with `0 ≤ d < c`. Each iteration `slow` moves 1 and `fast` moves 2, so the distance shrinks by exactly 1. A quantity that falls by exactly 1 per step cannot jump over 0, so after `d` more iterations they are on the same node. Total iterations: `a + d < a + c`, which is at most `n`, the number of nodes. Without a cycle, `fast` hits `null` after about `n/2` iterations.

**Reset to the head finds the entry.** At the meeting, `slow` has walked `a + b` steps and `fast` has walked `2(a + b)`. Both stand on the same node, so the extra distance `fast` covered is a whole number of laps: `2(a + b) − (a + b) = a + b = k·c` for some integer `k ≥ 1`. Rearranged, **`a = k·c − b`**. Now put one pointer on the head and leave the other on the meeting point, and move both one step at a time. After `a` steps the first pointer is on the entry. The second started `b` past the entry and moved `k·c − b`, so it is `b + k·c − b = k·c` past the entry: whole laps, which is the entry itself. They cannot coincide earlier, because until step `a` the first pointer is still on the tail, outside the cycle.

That paragraph is the answer to "why does resetting to the head work?", and the question is asked because most candidates have memorised the reset without the reason. The modular-arithmetic version, the exact meeting time `c·⌈a/c⌉`, and why a speed of 3 still detects but breaks the reset, are in [Cycle detection](/learn/data-structures/linked-lists/cycle-detection).

## Worked problems

### Linked List Cycle, with repeated values

[Linked List Cycle](/practice/linked-list-cycle): return whether a list has a cycle; the follow-up asks for the node where it begins.

Take values `3 → 1 → 4 → 1 → 5 → 9 → 2` at indices 0–6, with the tail (index 6) pointing back to index 3. So `a = 3` and `c = 4` (indices 3, 4, 5, 6). Two nodes hold the value 1, which is the point. Phase one, pointers shown as index (value):

| `t` | `slow` | `fast` | Same node? |
|---|---|---|---|
| 0 | 0 (3) | 0 (3) | start, not compared |
| 1 | 1 (1) | 2 (4) | no |
| 2 | 2 (4) | 4 (5) | no |
| 3 | 3 (1) | 6 (2) | no |
| 4 | 4 (5) | 4 (5) | **yes** |

They meet at index 4, so `b = 1`, and `a + b = 4 = 1·c` as the proof requires. Phase two, `ptr` from the head:

| Step | `ptr` | `slow` |
|---|---|---|
| 0 | 0 | 4 |
| 1 | 1 | 5 |
| 2 | 2 | 6 |
| 3 | 3 | 3 |

They coincide at index 3 after exactly `a = 3` steps. Now run the same loop comparing `slow.val == fast.val` on the **acyclic** list `1 → 2 → 1 → 3 → 1`: at `t = 2`, `slow` is on index 2 (value 1) and `fast` on index 4 (value 1), and the value check reports a cycle that does not exist. Identity is the only correct comparison.

Time O(n): at most `a + c` iterations in phase one and exactly `a` in phase two. Space O(1). For the cycle length, freeze one pointer at the meeting point and walk the other around, counting, until it returns: `c` steps.

### Middle of the Linked List: four cases, two guards

[Middle of the Linked List](/practice/middle-of-linked-list) returns the second middle on even length. It is also the first step of Palindrome List, Reorder List and merge sort on lists, and those need the **first** middle so that `second = slow.next` splits the list in two. Trace both guards on four and five nodes (values 1..n):

| Length | Guard | `t = 1` (slow, fast) | `t = 2` | Stops because | Returns |
|---|---|---|---|---|---|
| 4 | `fast and fast.next` | (2, 3) | (3, null) | `fast` is null | 3, second middle |
| 4 | `fast.next and fast.next.next` | (2, 3) | | `3.next.next` is null | 2, first middle |
| 5 | `fast and fast.next` | (2, 3) | (3, 5) | `5.next` is null | 3 |
| 5 | `fast.next and fast.next.next` | (2, 3) | (3, 5) | `5.next` is null | 3 |

Odd lengths agree; even lengths differ by one node. Decide which middle the next phase needs before you write the guard, and trace a four-node list, not a five-node one, because five hides the difference. The second guard dereferences `fast.next` unconditionally, so it needs `head` to be non-null first.

```viz
{"type": "linked-list", "algorithm": "middle", "values": [1, 2, 3, 4, 5, 6], "title": "Middle of six nodes: the fast and fast.next guard", "caption": "fast runs off the end after three steps, leaving slow on 4, the second of the two middles. The first-middle guard would stop one step earlier, on 3."}
```

### Find the Duplicate Number: an array that is a linked list

[Find the Duplicate Number](/practice/find-duplicate-number): `n + 1` integers, each in `1..n`, one value repeated (possibly more than twice). Find it without modifying the array, in O(1) extra space.

Read the array as a function `i → nums[i]`. Every value is a valid index, so following it from index 0 never leaves the array and must eventually repeat. No value is 0, so nothing points at index 0: it is the head of a tail that leads into a cycle. The cycle's entry is the one node with **two incoming edges**, one from the tail and one from inside the cycle, and two incoming edges means two indices hold that value. The entry is the duplicate.

Trace `nums = [2, 5, 9, 6, 9, 3, 8, 9, 7, 1]` (`n = 9`; the value 9 appears at indices 2, 4 and 7). The chain from 0 is `0 → 2 → 9 → 1 → 5 → 3 → 6 → 8 → 7 → 9 → …`, so `a = 2` and the cycle `9, 1, 5, 3, 6, 8, 7` has `c = 7`. Index 4 is never reached. Phase one, with `slow = nums[slow]` and `fast = nums[nums[fast]]`:

| `t` | `slow` | `fast` | Equal? |
|---|---|---|---|
| 1 | 2 | 9 | no |
| 2 | 9 | 5 | no |
| 3 | 1 | 6 | no |
| 4 | 5 | 7 | no |
| 5 | 3 | 1 | no |
| 6 | 6 | 3 | no |
| 7 | 8 | 8 | yes |

Meeting point 8 is `b = 5` steps past the entry 9 (`9 → 1 → 5 → 3 → 6 → 8`), and `a + b = 7 = c`. Phase two from index 0 and index 8:

| Step | `p` | `slow` |
|---|---|---|
| 1 | 2 | 7 |
| 2 | 9 | 9 |

They meet at 9, the duplicate, after `a = 2` steps. The third copy of 9 at index 4 is unreachable and irrelevant: one extra incoming edge is enough.

```python
def find_duplicate(nums):
    slow = fast = 0
    while True:                      # move first: both start at 0
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:             # ints are node ids here, so == is identity
            break
    p = 0
    while p != slow:
        p = nums[p]
        slow = nums[slow]
    return p
```

Name the alternatives so the interviewer knows the choice is deliberate: a set (O(n) space), sorting (modifies the input), sign-marking (modifies it), and binary search on the value range counting elements `≤ mid` (O(n log n) time, O(1) space, read-only, and a valid answer).

### Happy Number: a function as a list

[Happy Number](/practice/happy-number): replace a positive integer by the sum of the squares of its digits, repeatedly. It is happy if this reaches 1. Decide.

`x → f(x)` is a function, so the sequence is an implicit list. It is bounded: a number with `d ≥ 4` digits maps to at most `81d`, which has fewer digits, and every number below 1,000 maps to at most `81 × 3 = 243`. So the sequence enters `1..999` and stays there, and must reach 1 (which maps to itself) or cycle elsewhere. Run the runner; stop when `fast` reaches 1 or the pointers meet.

Trace `n = 7`, where `7 → 49 → 97 → 130 → 10 → 1`:

| `t` | `slow` | `fast` | Stop? |
|---|---|---|---|
| 1 | 49 | 97 | |
| 2 | 97 | 10 | |
| 3 | 130 | 1 | `fast == 1`: happy |

Trace `n = 12`, where `12 → 5 → 25 → 29 → 85 → 89 → 145 → 42 → 20 → 4 → 16 → 37 → 58 → 89`, a tail of five and the eight-cycle through 89:

| `t` | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| `slow` | 5 | 25 | 29 | 85 | 89 | 145 | 42 | **20** |
| `fast` | 25 | 85 | 145 | 20 | 16 | 58 | 145 | **20** |

They meet at 20, not 1: unhappy.

```python
def is_happy(n):
    def f(x):
        s = 0
        while x:
            x, d = divmod(x, 10)
            s += d * d
        return s
    slow = fast = n
    while True:
        slow = f(slow)
        fast = f(f(fast))
        if fast == 1:                # 1 is a fixed point; fast gets there first
            return True
        if slow == fast:
            return False
```

The visited-set answer is equally correct and most candidates give it first. The runner is the answer to "can you do it in constant space?".

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| **k-th from end** | Gap of `k`, both move 1 | O(n), one pass |
| **Remove n-th from end** | Gap of `n` from a **dummy** node, so `slow` stops on the predecessor and removing the head needs no special case; see [In-place linked list](/learn/interview-patterns/sequence-patterns/in-place-linked-list) | O(n) |
| **Delete the middle** | `slow` starts at a dummy and `fast` at the head, so `slow` stops one before the second middle (see the exercise) | O(n) |
| **Cycle length** | After the meeting, walk one pointer around until it returns | `+c` steps |
| **Break the cycle** | Walk from the entry until `node.next is entry`, then set it to `None` | `+c` steps |
| **Palindrome list** | First middle, reverse the second half, compare, reverse it back | O(n), O(1) space |
| **Reorder list** | First middle, reverse the second half, interleave | O(n) |
| **Expensive `f`** | Brent's algorithm: fewer evaluations of `f` for the same answer | O(a + c) |
| **Read-only duplicate** | Treat `i → nums[i]` as the list, start at index 0 | O(n), O(1) |

## Complexity, derived

Phase one runs fewer than `a + c ≤ n` iterations (the meeting argument above), phase two exactly `a`, and each iteration moves a constant number of pointers, so O(n) time and O(1) space. Counting node visits: `fast` visits `2t` nodes and `slow` visits `t`, so phase one touches at most `3(a + c)` nodes and phase two `2a`.

For the middle, the runner touches about `1.5n` nodes (`fast` visits `n`, `slow` visits `n/2`). Counting the length and then walking to `n/2` also touches `1.5n` nodes. The runner is **not** less work; it is one pass instead of two, which matters when the list is an iterator you cannot restart, and it keeps `slow` on nodes `fast` touched recently.

Measured on a 10⁶-node list whose tail points back to its middle (`a = c = 500,000`), best of three runs on one development machine:

| Runtime | Node layout | Floyd | Visited set |
|---|---|---|---|
| CPython 3.14 | allocated in list order | 8 ms | 34 ms (peak 50 MB) |
| CPython 3.14 | linked in shuffled order | 79 ms | 133 ms |
| Node 24 | allocated in list order | 1.3 ms | 38 ms |
| Node 24 | linked in shuffled order | 65 ms | 148 ms |

Floyd wins in both runtimes because it neither hashes nor allocates. The larger effect is layout: linking the same nodes in shuffled order makes Floyd 10× slower in CPython and 50× slower in V8, because each `next` is a dependent load that misses the cache when consecutive nodes are far apart in memory.

| Approach | Time | Extra space | Finds entry | Modifies input | Works on implicit `f` |
|---|---|---|---|---|---|
| Visited set | O(n) | O(n), about 50 bytes per node in CPython | yes, first repeat | no | yes, if states hash |
| Floyd | O(n) | O(1) | yes, with phase two | no | yes |
| Brent | O(n), fewer `f` calls | O(1) | yes | no | yes |
| Mark visited nodes | O(n) | one bit or flag per node | yes | yes | no |
| Sign-marking (duplicates) | O(n) | O(1) | n/a | yes | no |

## Under the hood

### Pointer chasing is memory latency

Every step is `node = node.next`: the address of the next load comes from the result of this one, so the CPU cannot overlap them. When nodes were allocated in list order, CPython's allocator and V8's bump allocator placed them next to each other and the hardware prefetcher streamed them in; shuffled, each hop is close to a main-memory access. That is the whole 10× to 50× gap in the table, and it is why a "linked list of a million elements" in a latency-sensitive service is a smell before any algorithm question. [Linked list fundamentals](/learn/data-structures/linked-lists/linked-list-fundamentals) measures what a node and a pointer chase cost.

### What "the same node" means in each language

In Python, `is` compares object identity. `==` calls `__eq__`, and for a plain class that falls back to identity, but a `@dataclass` node generates `__eq__` from its fields. Measured on CPython 3.14: two distinct dataclass nodes holding 1 whose `next` is the same node compare equal with `==`, and on a cycle of three nodes all holding 1, `n1 == n2` raises `RecursionError` because the field comparison follows `next` around the cycle. In JavaScript, `===` on objects compares references, and there is no operator overloading to get wrong. For implicit lists over integers, the integer *is* the node's identity, so `==` is correct there.

### Implicit functions and number precision

For `x → f(x)` over integers, a wrong `f` produces a different sequence, and the runner will find a cycle in that sequence without complaint. In JavaScript, numbers are doubles with 53 bits of integer precision, so `(x * x + 1) % 1000000007` with `x = 999999999` evaluates `x * x ≈ 10¹⁸` inexactly: Node 24 gives 63, while `BigInt` gives the true 65. Keep intermediate products below 2⁵³ (about 9 × 10¹⁵) or use `BigInt`; Python integers are arbitrary precision and do not have this failure.

## Failure modes

**A false cycle on repeated values.** *Symptom:* `hasCycle` returns true for `1 → 2 → 1 → 3 → 1`. *Diagnosis:* the loop compares `slow.val == fast.val`, which matches at `t = 2` (index 2 and index 4 both hold 1), or compares dataclass nodes with `==`. *Fix:* `is` in Python, `===` on node objects in JavaScript.

**Phase two never terminates.** *Symptom:* the entry finder hangs on some inputs and not others. *Diagnosis:* the author started `fast = head.next` (so the loop can compare before moving) and kept the head reset unchanged; the meeting point is then one node off from what the `a = k·c − b` argument assumes. Checking every list of length 1 to 11 with every entry position, that combination returned the wrong node or looped in 55 of 66 cases, including the 7-node example above. *Fix:* start both at the head and move before comparing; or, with the offset start, begin phase two from `slow.next`, which was correct in all 66 cases.

**`AttributeError: 'NoneType' object has no attribute 'next'`** or `TypeError: Cannot read properties of null`. *Symptom:* the runner crashes on even-length lists only. *Diagnosis:* the guard checks `fast` but not `fast.next`, so the second hop dereferences `null`. *Fix:* `while fast and fast.next`; for the first-middle guard, check `head` first.

**The array version returns the start index.** *Symptom:* Find the Duplicate returns a value that appears once. *Diagnosis:* the walk started at an index that is inside the cycle (starting at index 1, or an input containing 0, which puts index 0 on a cycle), so there is no tail and the "entry" is the starting point. *Fix:* start at index 0 and confirm the value range `1..n` that makes index 0 a pure head.

**A worker spins at 100% CPU inside a traversal.** *Symptom:* a thread dump shows the same list-walking frame on every sample. *Diagnosis:* a pointer update in the wrong order, or two threads relinking an LRU list without a lock, created a cycle in a structure that should be acyclic. *Fix:* hold the lock for every relink; in tests, assert acyclicity with Floyd after each mutation (O(1) memory, so it can run on large fixtures); in production, bound the walk by the known size.

## Interviewer follow-ups

**"Why does resetting one pointer to the head find the entry?"** Model answer: the `a + b = k·c` argument: `slow` walked `a + b`, `fast` walked twice that, the difference is whole laps, so `a = k·c − b`, and a pointer `b` past the entry that walks `a` steps lands on the entry. Common wrong answer: "because fast is twice as fast", which restates the setup and proves nothing.

**"The array can be modified. Would you still use Floyd?"** Model answer: no; negate `nums[abs(x) − 1]` and report the first index already negative, or cyclic-sort, both O(n) time and O(1) space and easier to verify; Floyd earns its place only because the input is read-only. Common wrong answer: Floyd regardless, or a set, which ignores the space constraint.

**"Find where two lists intersect, O(1) space."** Model answer: the pattern changes. Walk two pointers at the same speed and switch each to the other list's head when it runs out; both travel `a + c + b` and meet at the intersection or at `null` together. Common wrong answer: fast and slow pointers, which answer a question about one list.

**"Detect a cycle in a dependency graph."** Model answer: a node can have several successors, so there is no single "next" to chase; use DFS with white/grey/black colours or Kahn's algorithm, O(V + E). Common wrong answer: Floyd from each node.

**"`f` is an expensive hash function and you are finding its cycle."** Model answer: Brent's algorithm finds the same `a` and `c` with fewer evaluations of `f`, and in a distributed setting (Pollard's rho, hash collision search) you would use distinguished points rather than two pointers. Common wrong answer: cache `f` in a dictionary, which reintroduces the O(n) memory.

## What mid-level engineers get wrong

- **Comparing values, or dataclass nodes with `==`.** Consequence: false cycles on repeated values, or a `RecursionError` inside the comparison.
- **Changing the start position without changing phase two.** Consequence: an entry finder that hangs on most inputs.
- **Guarding only `fast`.** Consequence: a crash on every even-length list, which the odd-length sample does not catch.
- **Using the second middle to split a list.** Consequence: in Palindrome List and Reorder List the halves are uneven, and the comparison or interleave is off by one node.
- **Claiming the runner is faster than counting.** Consequence: an interviewer who counts node visits (1.5n either way) stops trusting the rest of the analysis. The honest claims are one pass and O(1) space.
- **Reaching for Floyd on a graph.** Consequence: an algorithm that silently follows one arbitrary edge per node and misses cycles through the others.

## Exercises

```exercise
id: implicit-cycle-entry-and-length
title: Find the cycle in an implicit list
prompt: |
  You are given an array `nxt` where `nxt[i]` is the index that follows `i`
  (every value is a valid index into `nxt`), and a starting index `start`.
  Following `i -> nxt[i]` from `start` must eventually loop.

  Return a two-element list `[entry, length]` where `entry` is the index at
  which the cycle begins (the first index that is visited twice when walking
  from `start`) and `length` is the number of indices in the cycle.

  Do it in O(1) extra space using fast and slow pointers; do not build a set
  of visited indices.
languages: [python, javascript]
entry: find_cycle
starter:
  python: |
    def find_cycle(nxt, start):
        # your code here
        return [0, 0]
  javascript: |
    function find_cycle(nxt, start) {
      // your code here
      return [0, 0];
    }
tests:
  - args: [[1, 2, 3, 1], 0]
    expected: [1, 3]
  - args: [[0], 0]
    expected: [0, 1]
    label: single self-loop
  - args: [[1, 0], 0]
    expected: [0, 2]
    label: start is inside the cycle
  - args: [[1, 2, 3, 4, 2], 0]
    expected: [2, 3]
  - args: [[1, 2, 0, 0, 0], 3]
    expected: [0, 3]
    label: tail then cycle
  - args: [[2, 2, 2], 1]
    expected: [2, 1]
    hidden: true
  - args: [[3, 0, 1, 2], 2]
    expected: [2, 4]
    hidden: true
    label: whole array is one cycle
hints:
  - "Move slow one step and fast two steps until they are equal; move before you compare, since both start at the same index."
  - "Once they meet, reset one pointer to start and move both one step at a time; they meet again at the entry."
  - "From the entry, walk around the cycle counting steps until you return to it; that count is the length."
```

```exercise
id: delete-middle-node
title: Delete the middle node
prompt: |
  Given the head of a singly linked list with `n` nodes, delete the node at
  0-based index `n // 2` (for even `n` that is the second of the two middle
  nodes) and return the head. A one-node list becomes empty; an empty list
  stays empty.

  Use one pass with a slow and a fast pointer. To unlink a node you need its
  predecessor, so decide where each pointer starts: a dummy node in front of
  the head removes every special case.
languages: [python, javascript]
entry: delete_middle
starter:
  python: |
    def delete_middle(head):
        # ListNode(val, next) is provided by the harness
        return head
  javascript: |
    function delete_middle(head) {
      // ListNode(val, next) is provided by the harness
      return head;
    }
tests:
  - args: [{"$list": [1, 3, 4, 7, 1, 2, 6]}]
    expected: {"$list": [1, 3, 4, 1, 2, 6]}
  - args: [{"$list": [1, 2, 3, 4]}]
    expected: {"$list": [1, 2, 4]}
    label: even length removes the second middle
  - args: [{"$list": [2, 1]}]
    expected: {"$list": [2]}
  - args: [{"$list": [5]}]
    expected: {"$list": []}
    label: single node
  - args: [{"$list": []}]
    expected: {"$list": []}
    hidden: true
    label: empty list
  - args: [{"$list": [1, 2, 3]}]
    expected: {"$list": [1, 3]}
    hidden: true
  - args: [{"$list": [1, 1, 1, 1, 1, 1]}]
    expected: {"$list": [1, 1, 1, 1, 1]}
    hidden: true
    label: repeated values
  - args: [{"$list": [9, 8, 7, 6, 5]}]
    expected: {"$list": [9, 8, 6, 5]}
    hidden: true
hints:
  - "Start slow at a dummy node whose next is head, and fast at head. Run while fast and fast.next exist."
  - "With that offset, slow stops on the node just before index n // 2, so slow.next = slow.next.next unlinks it."
  - "Return dummy.next, which is None when the only node was deleted."
```

## Senior signals

- You give the **visited-set answer first**, then the runner as the response to the space constraint, and you say which you would ship.
- You **prove** the reset with `a + b = k·c`, and you can say why the pointers cannot skip past each other (the gap falls by exactly one per step).
- You see a **function or an index array as a linked list** and name the in-degree argument that makes the cycle entry the duplicate.
- You choose the **middle** (first or second) for what the next phase needs, and you trace a four-node list, not a five-node one.
- You know the runner does the **same number of node visits** as count-then-walk, and that memory layout, not the algorithm, decides its speed on real hardware.
- You compare **nodes by identity**, move before comparing, guard `fast.next`, and keep start positions and phase two consistent.
- You know where the pattern **stops**: graphs with several successors, intersection of two lists, modifiable arrays.

## Check yourself

```quiz
- q: >-
    Both pointers are inside a cycle of length c, and fast is d steps behind slow measured forward along the cycle. After how many more iterations do they meet?
  options: ["Exactly d iterations, one per step of gap", "Exactly c iterations, one full lap later", "Exactly c - d iterations, the rest of a lap", "It depends on where the cycle entry is"]
  answer: 0
  explanation: >-
    Each iteration fast gains exactly one step on slow, so the forward gap from fast to slow shrinks from d to 0 in d iterations, and a gap falling by one cannot skip zero. The entry position decides when they enter the cycle, not how fast the gap closes.
- q: >-
    At the meeting point slow has walked a + b steps, where a is the tail length and b the distance past the entry. Why does a pointer from the head and a pointer from the meeting point, both at speed 1, meet at the entry?
  options: ["Because slow has completed exactly one lap when they meet", "Because the meeting point is always the node before the entry", "Because a + b is a multiple of c, so a = kc - b", "Because a always equals b when fast is twice as fast"]
  answer: 2
  explanation: >-
    Fast walked 2(a + b); the extra a + b is whole laps, so a + b = kc. After a steps the head pointer is on the entry, and the other has moved kc - b from b past the entry, landing kc past it, which is the entry. a equals b only when k = 1 and c = a + b, a special case, and slow may meet fast before or after completing a lap.
- q: >-
    On the four-node list 1 -> 2 -> 3 -> 4, the guard fast and fast.next leaves slow on node 3. Which change leaves slow on node 2, the node Palindrome List needs before splitting, with both pointers starting at the head?
  options: ["Check slow.next and fast.next before each move", "Check fast and fast.next, with slow starting one node ahead", "Check fast and fast.next, then advance slow once more", "Check fast.next and fast.next.next before each move"]
  answer: 3
  explanation: >-
    With fast.next and fast.next.next the loop runs once (slow 2, fast 3) and stops because 3.next.next is null, leaving slow on the first middle so that slow.next begins the second half. Starting slow ahead or advancing it afterwards lands on node 4, and checking slow.next and fast.next dereferences a null fast on the second test. Five-node lists return node 3 under both standard guards, which is why tracing an odd length hides the difference.
- q: >-
    In Find the Duplicate Number the array is read as i -> nums[i] starting at index 0. Why is the cycle entry the duplicated value?
  options: ["Because index 0 lies inside the cycle and points to it", "Because phase one always meets exactly at the duplicate", "Because the entry has two incoming edges from two indices", "Because the entry holds the largest value in the array"]
  answer: 2
  explanation: >-
    Two indices pointing at the same next index means two positions store the same value, and the entry is the node reached both from the tail and from inside the cycle. Index 0 is never a target when values are 1..n, so it is a head outside the cycle; the phase-one meeting point is generally somewhere else in the cycle.
- q: >-
    You measure Floyd against a visited set on a 10^6-node cyclic list, first with nodes allocated in list order, then with the same nodes linked in shuffled order. What does the lesson's measurement say dominates?
  options: ["Memory layout: each next is a dependent load that misses cache", "The number of iterations, which rises in shuffled order", "Garbage collection, triggered by the shuffled allocation order", "The hashing cost of the set, which grows with the shuffle"]
  answer: 0
  explanation: >-
    The algorithms do the same iterations in both layouts, yet Floyd slowed about 10x in CPython and 50x in Node when nodes were shuffled, because each hop depends on the previous load and far-apart nodes miss the cache. Floyd still beat the set in both layouts because it neither hashes nor allocates.
- q: >-
    An interviewer asks for the node where two singly linked lists intersect, in O(1) space. Which approach fits?
  options: ["Fast and slow pointers on the first list, then on the second", "A visited set of the first list's nodes, then walk the second", "Two same-speed pointers that switch to the other list's head", "Floyd on the joined list after linking the first tail to the second"]
  answer: 2
  explanation: >-
    Switching heads makes both pointers travel a + c + b steps, so they arrive at the intersection together, or at null together if there is none. Linking the tail and running Floyd also works but mutates the input and must be undone. The visited set is O(n) space, and fast and slow pointers on one list answer a question about that list only.
```
