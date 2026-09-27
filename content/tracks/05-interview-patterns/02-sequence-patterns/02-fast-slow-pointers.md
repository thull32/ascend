---
slug: fast-slow-pointers
title: "Fast and slow pointers: cycles, middles and implicit lists"
description: "Floyd's runner technique as an interview pattern: the signal that selects it, why the two pointers must meet, how to find the cycle entry, and how arrays and integer sequences become linked lists in disguise."
minutes: 31
difficulty: medium
tags: [pattern:fast-slow-pointers, linked-list, cycle-detection, floyd, runner-technique]
problems: [linked-list-cycle, find-duplicate-number, middle-of-linked-list, happy-number]
---
You are walking a sequence you cannot index and cannot see the end of: a linked list, or a function applied to its own output. You need to know whether it loops, where it loops, or where its middle is, and the interviewer has taken away the O(n) memory you would use to remember what you have visited. The obvious tool, a seen-set, is off the table.

Two pointers moving at different speeds solve all of these with O(1) memory. The slow pointer moves one step per iteration, the fast pointer two. If the sequence ends, the fast pointer finds the end first and you learn something from where the slow pointer is. If the sequence loops, the fast pointer laps the slow one, and you learn something from where they meet. The mechanism is short; what takes practice is recognising the problems that are secretly linked lists.

## The signal

The pattern is selected by three things together:

1. **A sequence you can only follow forward.** A singly linked list is the obvious case. Less obvious: an array where `nums[i]` is interpreted as "the next index", or an integer where "apply this function" gives the next integer. Any `x → f(x)` chain is a linked list.
2. **A question about position or repetition.** "Does it contain a cycle", "where does the cycle begin", "find the middle", "find the k-th from the end", "does this process terminate", "which value is repeated".
3. **A space constraint.** "O(1) extra space", "do not modify the input", "constant memory". Without this constraint a seen-set is simpler and just as fast, and saying so is part of a good answer.

What rules it out. If you need to visit nodes in arbitrary order, you need an array. If the list is doubly linked or you have a length, the k-th from the end is arithmetic. If you may modify the input and values are in `1..n`, marking (negation or [cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort)) is an alternative for duplicate-finding. The nearest confusable pattern is plain two-pointers on an array, which also uses two indices but relies on random access and usually on sorted order; the runner technique never indexes and never assumes order.

## The template

There are two shapes: **detect and locate a cycle**, and **find a position relative to the end**. The mechanics for linked lists are covered in [Cycle detection](/learn/data-structures/linked-lists/cycle-detection) and [Reversal and runner techniques](/learn/data-structures/linked-lists/reversal-and-runner-techniques); here they are written as the skeleton you type from memory.

### Cycle detection with entry point

```python
def cycle_entry(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            break
    else:
        return None                 # fast hit the end: no cycle
    ptr = head
    while ptr is not slow:          # phase 2: walk to the entry
        ptr = ptr.next
        slow = slow.next
    return ptr
```

```javascript
function cycleEntry(head) {
  let slow = head, fast = head;
  let met = false;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) { met = true; break; }
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

### Middle of the list

```python
def middle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow                     # second middle for even length
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
```

The invariant for both: **after `t` iterations, `slow` is `t` steps from the head and `fast` is `2t` steps from the head.** For the middle, the loop stops when `fast` cannot take two more steps, which is when `2t` is at or past the last node, so `t` is at or just past the halfway point. For cycle detection, once both pointers are inside the cycle, the distance from `slow` forward to `fast` shrinks by exactly one each iteration (fast gains one on slow per step), so it reaches zero within one cycle length. That is why the loop terminates without any counter.

Watch the gap close:

```viz
{"type": "linked-list", "algorithm": "cycle-detect", "values": [1, 2, 3, 4, 5, 6], "cycleAt": 2}
```

### Why phase two finds the entry

Let `a` be the number of steps from the head to the cycle entry, `c` the cycle length, and `b` the number of steps from the entry to the meeting point, measured along the cycle. When they meet, slow has walked `a + b` and fast has walked `2(a + b)`. Fast's extra distance is a whole number of laps: `2(a + b) - (a + b) = a + b = k·c` for some integer `k ≥ 1`. Rearranged, `a = k·c - b`.

Now start one pointer at the head and leave the other at the meeting point, both moving one step per iteration. After `a` steps the first is at the entry. The second has moved `a = k·c - b` steps from a point that was `b` past the entry, so it is `b + k·c - b = k·c` steps past the entry along the cycle, which is the entry itself. They coincide at the entry, and they cannot coincide earlier because one of them is outside the cycle until step `a`.

That paragraph is the answer to the follow-up "why does resetting to the head work?", and interviewers ask it because most candidates have memorised the reset without the reason.

## Worked problems

### Linked List Cycle

[Linked List Cycle](/practice/linked-list-cycle): given the head of a singly linked list, return whether it contains a cycle. Follow-up: return the node where the cycle begins.

Insight: a seen-set is O(n) space; the runner is O(1). Take the list `1 → 2 → 3 → 4 → 5 → 6` with `6.next = 3` (so `a = 2`, `c = 4`). Phase one, one row per iteration:

| Iteration | `slow` | `fast` | Met? |
|---|---|---|---|
| 0 | 1 | 1 | start (not checked) |
| 1 | 2 | 3 | no |
| 2 | 3 | 5 | no |
| 3 | 4 | 3 | no |
| 4 | 5 | 5 | yes |

They meet at node 5. In the notation above, `b = 2` (entry 3 → 4 → 5), `a + b = 4 = 1·c`. Phase two, `ptr` from the head and `slow` from node 5:

| Step | `ptr` | `slow` |
|---|---|---|
| 0 | 1 | 5 |
| 1 | 2 | 6 |
| 2 | 3 | 3 |

They coincide at node 3, the entry, after exactly `a = 2` steps.

Time O(n): phase one takes at most `a + c` iterations, phase two exactly `a`. Space O(1). If the interviewer asks for the cycle length, hold one pointer at the meeting point and walk the other around until it returns, counting; that is `c` steps.

### Find the Duplicate Number

[Find the Duplicate Number](/practice/find-duplicate-number): an array of `n + 1` integers, each in `1..n`, contains exactly one repeated value (possibly repeated more than once). Find it without modifying the array and in O(1) extra space.

Insight: interpret the array as a function `i → nums[i]`. Because every value is in `1..n`, every index maps to a valid index, so following the function from index 0 never falls off the end; it must eventually loop. Index 0 is never a target (no value is 0), so 0 is the head of a chain that leads into a cycle. The cycle entry is a node with two incoming edges, and two incoming edges mean two indices hold that value: the entry *is* the duplicate. The problem is Linked List Cycle with the cycle entry as the answer.

Trace with `nums = [1, 3, 4, 2, 2]`. The implicit list from index 0: `0 → 1 → 3 → 2 → 4 → 2 → 4 → …`, so the cycle is `2 ⇄ 4` and the entry is 2.

Phase one, starting `slow = fast = 0`, with `slow = nums[slow]` and `fast = nums[nums[fast]]`:

| Iteration | `slow` | `fast` | Met? |
|---|---|---|---|
| 1 | `nums[0]` = 1 | `nums[nums[0]]` = `nums[1]` = 3 | no |
| 2 | `nums[1]` = 3 | `nums[nums[3]]` = `nums[2]` = 4 | no |
| 3 | `nums[3]` = 2 | `nums[nums[4]]` = `nums[2]` = 4 | no |
| 4 | `nums[2]` = 4 | `nums[nums[4]]` = 4 | yes |

Phase two, `slow2 = 0`, `slow = 4`:

| Step | `slow2` | `slow` |
|---|---|---|
| 1 | `nums[0]` = 1 | `nums[4]` = 2 |
| 2 | `nums[1]` = 3 | `nums[2]` = 4 |
| 3 | `nums[3]` = 2 | `nums[4]` = 2 |

They meet at 2, which is the duplicate.

```python
def find_duplicate(nums):
    slow = fast = 0
    while True:
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    slow2 = 0
    while slow != slow2:
        slow = nums[slow]
        slow2 = nums[slow2]
    return slow
```

Note the `while True` with the check after moving: `slow` and `fast` start equal, so a `while slow != fast` guard would never enter the loop. Time O(n), space O(1), input untouched. The alternatives, sorting (modifies input), a set (O(n) space), and binary search on the value range (O(n log n), constant space, also valid), are worth naming so the interviewer knows you chose this one deliberately.

### Happy Number

[Happy Number](/practice/happy-number): repeatedly replace a positive integer by the sum of the squares of its digits. It is happy if the process reaches 1, and unhappy if it loops forever without reaching 1. Decide which.

Insight: `x → sum_of_squared_digits(x)` is a function, so the sequence is an implicit linked list. Any sequence of positive integers under this map is bounded (a number with `d` digits maps to at most `81d`, which is smaller than the number once `d ≥ 4`), so it must either hit 1 (which maps to itself, a cycle of length one) or enter some other cycle. Run the runner; when the pointers meet, check whether they met at 1.

Trace for `n = 19`, with `f(19) = 1 + 81 = 82`, `f(82) = 64 + 4 = 68`, `f(68) = 36 + 64 = 100`, `f(100) = 1`:

| Iteration | `slow` | `fast` | Stop? |
|---|---|---|---|
| 0 | 19 | 19 | |
| 1 | 82 | 68 | |
| 2 | 68 | 1 | fast reached 1 → happy |

Trace for `n = 2`, which enters the cycle `4 → 16 → 37 → 58 → 89 → 145 → 42 → 20 → 4`:

| Iteration | `slow` | `fast` |
|---|---|---|
| 1 | 4 | 16 |
| 2 | 16 | 58 |
| 3 | 37 | 145 |
| 4 | 58 | 20 |
| 5 | 89 | 16 |
| 6 | 145 | 58 |
| 7 | 42 | 145 |
| 8 | 20 | 20 |

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
        if fast == 1:
            return True
        if slow == fast:
            return False
```

The seen-set solution is equally correct here and most candidates give it; the runner is the answer to "can you do it in constant space?". Time is O(log n) per step and a bounded number of steps, so effectively constant for machine integers.

### Middle of the Linked List

[Middle of the Linked List](/practice/middle-of-linked-list) is the smallest instance and the one you will use as a sub-step elsewhere (reorder list, palindrome list, merge sort on lists). With `1 → 2 → 3 → 4 → 5 → 6`:

| Iteration | `slow` | `fast` | `fast.next`? |
|---|---|---|---|
| 0 | 1 | 1 | 2 |
| 1 | 2 | 3 | 4 |
| 2 | 3 | 5 | 6 |
| 3 | 4 | null | stop |

`slow` ends on 4, the second of the two middles. For the first middle (node 3) loop `while fast.next and fast.next.next`. Decide which one you want before you write the loop; the choice matters when the next phase splits the list.

```viz
{"type": "linked-list", "algorithm": "middle", "values": [1, 2, 3, 4, 5, 6]}
```

## Variations

- **k-th node from the end.** Move `fast` k steps ahead first, then move both one step at a time until `fast` reaches the end; `slow` is on the k-th from the end. Same idea with a fixed gap instead of a speed ratio. To *remove* that node you want `slow` one before it, which a dummy head makes painless; see the [in-place linked list](/learn/interview-patterns/sequence-patterns/in-place-linked-list) lesson.
- **Cycle length.** After the meeting, freeze one pointer and step the other until they coincide again, counting. Combined with the entry, you can also break the cycle by setting `entry_predecessor.next = None`.
- **Palindrome list in O(1) space.** Find the middle, reverse the second half in place, compare the halves, then reverse it back so the input is unchanged. That is three patterns chained, and restoring the list is the detail that shows care.
- **Duplicates with a modifiable array.** If mutation is allowed and values are in `1..n`, negate `nums[abs(x) - 1]` as a visited mark, or use cyclic sort. Both are O(n) time, O(1) space, and simpler to explain than Floyd; choose the runner only when the input must stay intact.
- **A speed ratio other than 2.** Any ratio works for detection (the gap still shrinks each step), but the entry-finding argument depends on fast walking exactly twice as far. Stick to 1:2 unless the interviewer sets up the math differently.

## Pitfalls

- **Checking equality before the first move.** `slow = fast = head; while slow != fast: …` never enters the loop. Either move first and then compare (a `while True` with a `break`, or a do-while in JavaScript), or start `fast` one step ahead and accept that the meeting point is then off by one for the entry argument.
- **Null-checking only `fast`.** `fast.next.next` dereferences `fast.next`. The guard is `while fast and fast.next`; in JavaScript, `while (fast && fast.next)`. Miss it and a list of even length crashes at the end.
- **Comparing values instead of nodes.** Lists can contain repeated values; a cycle check that compares `slow.val == fast.val` reports false cycles. Compare identity (`is` in Python, `===` on the node objects in JavaScript).
- **Starting the array version from the wrong index.** The Find the Duplicate argument needs a head with no incoming edge, which is index 0 because values are `1..n`. Starting from index 1 can put you inside the cycle from the outset, and the entry you find is then just your starting point.
- **Picking the wrong middle.** On even-length lists `while fast and fast.next` returns the second middle; `while fast.next and fast.next.next` returns the first. If the next phase does `second_half = slow.next` you want the first middle. Trace a 4-node list before committing.
- **Forgetting the runner is a slow-down.** On a list that fits in cache, the seen-set version and the runner take similar time; the runner's advantage is memory, not speed. Do not claim a speed-up you cannot justify.

## Exercise

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

## Senior signals

- You give the **seen-set answer first**, then the runner as the response to the space constraint, and you say which you would ship (usually the set, for readability, unless memory is the point).
- You can **prove** the entry-finding reset with the `a = k·c − b` argument, not just perform it.
- You see a **function or an index array as a linked list** and say so explicitly: "`nums[i]` is a `next` pointer, so this is cycle detection".
- You state the **in-degree argument** for why the cycle entry is the duplicate.
- You know which **middle** the loop returns on even length and choose the guard accordingly, before tracing catches it.
- You compare **nodes by identity**, guard `fast.next`, and move before comparing, without being reminded.

## Check yourself

```quiz
- q: >-
    Both pointers are inside a cycle of length c, and fast is currently d steps behind slow (measured forward from fast to slow). After how many more iterations do they meet?
  options: ["Exactly d iterations", "Exactly c - d iterations", "Exactly c iterations", "It depends on the entry"]
  answer: 0
  explanation: >-
    Each iteration fast gains exactly one step on slow, so the forward gap from fast to slow shrinks from d to 0 in d iterations. The entry position affects when they enter the cycle, not the closing speed.
- q: >-
    In Find the Duplicate Number the array is treated as a function i -> nums[i]. Why is the cycle entry guaranteed to be the duplicated value?
  options: ["Because phase one always meets exactly at the duplicate", "Because the entry holds the largest value in the array", "Because the entry has two incoming edges from two indices", "Because index 0 lies inside the cycle and points to it"]
  answer: 2
  explanation: >-
    Two indices pointing to the same next index means two positions store the same value, so the node with two incoming edges is the duplicate. Index 0 is never a target (values are 1..n), so 0 is a head outside the cycle, and the meeting point of phase one is generally not the entry.
- q: >-
    You write `slow = fast = head` and then `while slow != fast: advance both`. What happens?
  options: ["It crashes with a null dereference on an empty list", "It finds the cycle correctly, just one step later", "It loops forever on lists that have no cycle", "The body never runs, because they start equal"]
  answer: 3
  explanation: >-
    The condition is false on entry. Either advance before comparing, or begin fast one step ahead, remembering that the latter changes the meeting point used by the entry argument.
- q: >-
    Which constraint most strongly indicates the runner technique over a seen-set?
  options: ["The node values may repeat", "Extra space must be O(1)", "The node values are sorted", "The list may be very long"]
  answer: 1
  explanation: >-
    Both approaches are O(n) time; the runner's advantage is constant memory. Repeated values are irrelevant because the runner compares node identity, and sorted order plays no role.
- q: >-
    Happy Number can be decided with the runner because the sequence of digit-square sums is:
  options: ["Random, so a repeat is likely but not certain", "Strictly decreasing, so it must reach 1", "Bounded, so it must eventually revisit a value", "Certain to reach 1 within about 20 steps"]
  answer: 2
  explanation: >-
    A number with d digits maps to at most 81d, which is below the number itself for d >= 4, so the sequence stays within a finite range and must repeat, either at the fixed point 1 or in another cycle. It is not monotone; 2 -> 4 -> 16 increases.
```
