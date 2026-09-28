---
slug: in-place-linked-list
title: "In-place linked list rewiring: reverse, split, merge"
description: "The pointer discipline behind every linked-list interview problem: the dummy head, save-next-before-you-rewire, the three primitives and how they compose, with k-group reversal, O(1)-space random-pointer copy, Add Two Numbers and an LRU cache traced pointer by pointer, and what the array fallback, recursion and JavaScript's Map really cost."
minutes: 40
difficulty: medium
tags: [pattern:linked-list, linked-list, in-place, pointer-manipulation, dummy-head]
problems: [reverse-linked-list, merge-two-sorted-lists, reorder-list, remove-nth-from-end, copy-random-list, add-two-numbers, lru-cache, merge-k-sorted-lists, reverse-nodes-k-group, palindrome-linked-list]
---
Linked-list problems are rarely about the algorithm. The algorithm fits in one sentence: "reverse it", "merge them", "move the last node to the front". What the interviewer watches is whether you can rewire pointers without losing a node, creating a cycle or dereferencing null, while talking. A single `curr.next = prev` written before `nxt = curr.next` orphans the rest of the list, and nothing raises an error to tell you.

The constraint that makes these problems worth asking is **in place**: O(1) extra space, no copying values into an array and back. The array fallback is always available, costs O(n) memory, and is often the faster code on real hardware; say so, with the number, and then do it in place. This lesson gives the two habits that make rewiring safe (the dummy head, and save-next-first), the three primitives (reverse, split, merge), and the composition rules that turn them into the harder problems. The node-level mechanics and their first traces live in [Reversal and runner techniques](/learn/data-structures/linked-lists/reversal-and-runner-techniques) and [Merging and partitioning](/learn/data-structures/linked-lists/merging-and-partitioning); here the focus is executing them under interview pressure.

## The signal

You are in this pattern when the input is a singly linked list and the statement says any of: "in place", "O(1) extra space", "reverse", "reorder", "rotate", "swap nodes", "remove the node", "merge", "partition", "copy", or "without modifying node values". The last phrase is a tell: it forbids rewriting values and forces you to move nodes.

The near-misses:

| Statement says | Pattern | Why |
|---|---|---|
| "Find the middle", "detect a cycle", "k-th from the end" | [Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) | Finding *where* to cut is a runner problem; the cut and everything after it is this pattern |
| "Merge **k** sorted lists" | [K-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) | A heap chooses the next node; the splice is identical to two-list merge |
| "Reverse an **array**" or "rotate an array by k" | [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) swapping ends (three reversals for rotation) | Random access makes it an index problem, not a rewiring problem |
| "Get and put in O(1) with least-recently-used eviction" | Hash map plus doubly linked list ([LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache)) | The list gives order, the map gives the handle; neither alone is O(1) |
| "Sort a linked list", no space constraint | Copy to an array, sort, relink | Measured below at 3× faster than merge sort on the nodes in CPython |
| "Add two numbers stored **most**-significant digit first" | Reverse both, or a stack of digits | Carries flow from the least significant end, so you need to reach it first |

## The template

Two habits, three primitives. Each primitive takes a head and returns a head (or a pair), so they compose.

### Habit one: the dummy head

A sentinel node in front of the real head means the first node is never special. Removing the head, inserting before it, reversing a group that starts at it, building a result from nothing: all become the general case, and the answer is `dummy.next`.

```python
dummy = ListNode(0, head)
# ... every operation works on some node's .next, including dummy.next ...
return dummy.next
```

### Habit two: save next before you rewire

```python
nxt = curr.next        # 1. remember where you are going
curr.next = prev       # 2. now it is safe to overwrite the only link to it
```

### Primitive one: reverse

```python
def reverse(head):
    prev, curr = None, head
    while curr:
        nxt = curr.next          # save
        curr.next = prev         # rewire
        prev = curr              # advance the reversed side
        curr = nxt               # advance the remainder
    return prev                  # new head; the old head is now the tail
```

```javascript
function reverse(head) {
  let prev = null, curr = head;
  while (curr) {
    const nxt = curr.next;
    curr.next = prev;
    prev = curr;
    curr = nxt;
  }
  return prev;
}
```

The invariant to say aloud: **at the top of each iteration, `prev` heads a fully reversed list of the nodes already visited, `curr` heads the untouched remainder, and no node is reachable from both.** One node crosses from the remainder to the reversed side per iteration, so after `n` iterations every node has crossed and none was lost.

```viz
{"type": "linked-list", "algorithm": "reverse", "values": [1, 2, 3, 4, 5]}
```

### Primitive two: split at the first middle

```python
def split(head):
    slow, fast = head, head.next          # fast one ahead: slow stops on the FIRST middle
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    second = slow.next
    slow.next = None                      # the cut; without it the halves stay joined
    return head, second
```

```javascript
function split(head) {
  let slow = head, fast = head.next;
  while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }
  const second = slow.next;
  slow.next = null;
  return [head, second];
}
```

`1 → 2 → 3 → 4` splits into `1 → 2` and `3 → 4`; `1 → 2 → 3 → 4 → 5` into `1 → 2 → 3` and `4 → 5`. The first half is never shorter, which is what lets the interleave in Reorder List loop on the second half alone.

### Primitive three: merge behind a dummy tail

```python
def merge(a, b, take_a):
    dummy = tail = ListNode(0)
    while a and b:
        if take_a(a, b):
            tail.next, a = a, a.next
        else:
            tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b                    # splice whichever list is left, in O(1)
    return dummy.next
```

```javascript
function merge(a, b, takeA) {
  const dummy = new ListNode(0);
  let tail = dummy;
  while (a && b) {
    if (takeA(a, b)) { tail.next = a; a = a.next; }
    else             { tail.next = b; b = b.next; }
    tail = tail.next;
  }
  tail.next = a ?? b;
  return dummy.next;
}
```

With `take_a = lambda a, b: a.val <= b.val` this is [Merge Two Sorted Lists](/practice/merge-two-sorted-lists), and `<=` rather than `<` keeps it stable. With `take_a` alternating it is the interleave of [Reorder List](/practice/reorder-list), whose full trace is in [Merging and partitioning](/learn/data-structures/linked-lists/merging-and-partitioning).

```viz
{"type": "linked-list", "algorithm": "merge-sorted", "values": [1, 3, 5, 7], "values2": [2, 4, 6]}
```

The composition rule: **split, reverse, merge** in some order solves most of the list: Reorder List is split + reverse second + alternate merge; [Palindrome Linked List](/practice/palindrome-linked-list) is split + reverse second + compare + reverse back; merge sort on a list is split + recurse + merge. Draw four boxes and the names `prev`, `curr`, `nxt` before writing any loop, and read the assignments off the drawing.

## Worked problems

### Reverse Nodes in k-Group

[Reverse Nodes in k-Group](/practice/reverse-nodes-k-group): reverse every consecutive group of `k` nodes; a final group shorter than `k` stays as it is.

Three names keep it straight: `group_prev`, the node before the group (initially the dummy); `kth`, the group's last node; `group_next = kth.next`. Reverse the group with `prev` seeded to `group_next` instead of `None`, so the group's old head, which becomes its tail, already points at the rest of the list when the loop ends.

```python
def reverse_k_group(head, k):
    dummy = ListNode(0, head)
    group_prev = dummy
    while True:
        kth = group_prev
        for _ in range(k):                   # look ahead BEFORE touching a pointer
            kth = kth.next
            if kth is None:
                return dummy.next            # short final group stays as is
        group_next = kth.next
        prev, curr = group_next, group_prev.next
        while curr is not group_next:        # reverse exactly k nodes
            nxt = curr.next
            curr.next = prev
            prev, curr = curr, nxt
        old_head = group_prev.next           # becomes the group's tail
        group_prev.next = kth                # splice the new group head in
        group_prev = old_head
```

Trace `1 → 2 → … → 8` with `k = 3`. First the inner loop of group one (`group_prev` = dummy, `kth` = 3, `group_next` = 4):

| Step | `curr` | `nxt` saved | Write | `prev` after |
|---|---|---|---|---|
| 1 | 1 | 2 | `1.next = 4` | 1 |
| 2 | 2 | 3 | `2.next = 1` | 2 |
| 3 | 3 | 4 | `3.next = 2` | 3 |
| stop | 4 | | `curr is group_next` | |

Then the group-level view:

| Group | `group_prev` | `kth` | `group_next` | Splice | List after |
|---|---|---|---|---|---|
| 1 | dummy | 3 | 4 | `dummy.next = 3`; `group_prev = 1` | `3 → 2 → 1 → 4 → 5 → 6 → 7 → 8` |
| 2 | 1 | 6 | 7 | `1.next = 6`; `group_prev = 4` | `3 → 2 → 1 → 6 → 5 → 4 → 7 → 8` |
| 3 | 4 | lookahead reaches 7, 8, then `None` | | none | unchanged: `7 → 8` stays |

Each full group costs `k` rewires plus one splice, and every node is visited twice (lookahead and reversal), so about `2n` reads and `n + n/k` writes: O(n) time, O(1) space. The dummy matters because group one changes the head of the whole list.

### Copy List with Random Pointer, in O(1) extra space

[Copy List with Random Pointer](/practice/copy-random-list): each node has `next` and `random` (any node or null); return a deep copy. The O(n)-space answer maps each original to its copy. The O(1)-space answer stores that map *inside the list*: put each copy directly after its original, so "the copy of X" is `X.next`.

Take `A(3) → B(8) → C(5) → D(2)`, with `A.random = C`, `B.random = A`, `C.random = None`, `D.random = D`.

| Phase | Operation | State after |
|---|---|---|
| 1. weave | for each X: `X' = Node(X.val)`, `X'.next = X.next`, `X.next = X'` | `A → A' → B → B' → C → C' → D → D'` |
| 2. randoms | `A'.random = A.random.next = C'` | |
| | `B'.random = B.random.next = A'` | |
| | `C'.random = None` (C.random is null) | |
| | `D'.random = D.random.next = D'` | all copy randoms point at copies |
| 3. unweave | `A.next = B`, `A'.next = B'` | original and copy separating |
| | `B.next = C`, `B'.next = C'`; `C.next = D`, `C'.next = D'` | |
| | `D.next = None`, `D'.next = None` | original restored; copy is `A' → B' → C' → D'` |

The phases must stay separate. Setting randoms during the weave gives `A'.random = C.next`, which is still `D`, an *original* node, because `C'` does not exist yet. Setting randoms during the unweave gives `B'.random = A.next`, which was already restored to `B`. Both bugs produce a copy that points into the original list, and a test that only compares values passes.

```python
def copy_random_list(head):                   # RandomNode(val, next=None, random=None)
    x = head
    while x:                                  # 1. weave
        x.next = RandomNode(x.val, x.next)
        x = x.next.next
    x = head
    while x:                                  # 2. randoms, while X.next is X's copy
        x.next.random = x.random.next if x.random else None
        x = x.next.next
    copy_head = head.next if head else None
    x = head
    while x:                                  # 3. unweave, restoring the original
        cp = x.next
        x.next = cp.next
        cp.next = cp.next.next if cp.next else None
        x = x.next
    return copy_head
```

Three passes, O(n) time, O(1) space beyond the copy itself.

### Add Two Numbers: the carry that outlives both lists

[Add Two Numbers](/practice/add-two-numbers): two lists hold the digits of non-negative integers, least significant first; return their sum as a list. Build the result behind a dummy tail and loop while **either list or the carry** remains.

Trace `9 → 9 → 9` (999) plus `1` (1):

| Step | `l1` digit | `l2` digit | carry in | sum | digit written | carry out | result so far |
|---|---|---|---|---|---|---|---|
| 1 | 9 | 1 | 0 | 10 | 0 | 1 | `0` |
| 2 | 9 | (done) 0 | 1 | 10 | 0 | 1 | `0 → 0` |
| 3 | 9 | 0 | 1 | 10 | 0 | 1 | `0 → 0 → 0` |
| 4 | (done) 0 | 0 | 1 | 1 | 1 | 0 | `0 → 0 → 0 → 1` |

Step 4 exists only because the condition is `while l1 or l2 or carry`. The version that loops `while l1 or l2` returns 000 for 999 + 1.

```python
def add_two_numbers(l1, l2):
    dummy = tail = ListNode(0)
    carry = 0
    while l1 or l2 or carry:
        s = carry + (l1.val if l1 else 0) + (l2.val if l2 else 0)
        carry, digit = divmod(s, 10)
        tail.next = ListNode(digit)
        tail = tail.next
        l1 = l1.next if l1 else None
        l2 = l2.next if l2 else None
    return dummy.next
```

O(max(m, n)) time; the output is new nodes, so the only extra space is the output.

### LRU Cache: sentinels and a handle per key

[LRU Cache](/practice/lru-cache): `get` and `put` in O(1), evicting the least recently used key at capacity. A dict maps key → node; a doubly linked list with two sentinels `H` and `T` keeps recency, most recent after `H`. Unlink is 2 pointer writes, push-front is 4, and the sentinels mean neither ever checks for null.

```python
class Node:
    __slots__ = ("key", "val", "prev", "next")
    def __init__(self, key=0, val=0):
        self.key, self.val, self.prev, self.next = key, val, None, None

class LRUCache:
    def __init__(self, capacity):
        self.cap, self.map = capacity, {}
        self.head, self.tail = Node(), Node()            # sentinels
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, x):                               # 2 writes
        x.prev.next, x.next.prev = x.next, x.prev

    def _push_front(self, x):                           # 4 writes
        x.prev, x.next = self.head, self.head.next
        self.head.next.prev = x
        self.head.next = x

    def get(self, key):
        x = self.map.get(key)
        if x is None:
            return -1
        self._unlink(x)
        self._push_front(x)
        return x.val

    def put(self, key, value):
        x = self.map.get(key)
        if x is not None:                   # existing key: update and refresh, never evict
            x.val = value
            self._unlink(x)
            self._push_front(x)
            return
        if len(self.map) == self.cap:
            lru = self.tail.prev            # the node before the tail sentinel
            self._unlink(lru)
            del self.map[lru.key]           # the node stores its key for exactly this line
        x = Node(key, value)
        self.map[key] = x
        self._push_front(x)
```

Trace with capacity 2:

| Operation | Returns | List (H … T) | Map keys | Pointer writes |
|---|---|---|---|---|
| `put(1, 1)` | | `1` | {1} | 4 |
| `put(2, 2)` | | `2 1` | {1, 2} | 4 |
| `get(1)` | 1 | `1 2` | {1, 2} | 2 + 4 |
| `put(3, 3)` | | `3 1` (evict 2) | {1, 3} | 2 + 4 |
| `get(2)` | −1 | `3 1` | {1, 3} | 0 |
| `put(1, 10)` | | `1 3` (update, no eviction) | {1, 3} | 2 + 4 |
| `put(4, 4)` | | `4 1` (evict 3) | {1, 4} | 2 + 4 |
| `get(3)` | −1 | `4 1` | {1, 4} | 0 |
| `get(1)` | 10 | `1 4` | {1, 4} | 2 + 4 |

The `put(1, 10)` row is the one that fails most often: code that checks capacity before checking whether the key exists evicts 3 there, and `get(3)` later returns −1 for the wrong reason, so the test output even looks plausible.

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| **Remove n-th from end** | Dummy head, gap of `n` between two pointers, then one `slow.next = slow.next.next`; the dummy makes removing the head the same path | O(n), one pass |
| **Reverse a sublist** `left..right` | Walk `left − 1` steps from a dummy, reverse `right − left + 1` nodes, reconnect both ends (first exercise) | O(n) |
| **Rotate right by k** | Length and tail in one pass, `k %= n`, cut after node `n − k − 1`, join the old tail to the old head (second exercise) | O(n) |
| **Swap in pairs** | k-group with `k = 2`, or a three-node window `(prev, a, b)`: `prev.next = b; a.next = b.next; b.next = a; prev = a` | O(n) |
| **Partition around x** | Two dummies, append to one of two tails, join, then **terminate** the second tail | O(n) |
| **Odd-even reorder** | Two tails advancing by two; join odd tail to even head | O(n) |
| **Palindrome check** | Split, reverse second, compare, reverse back and rejoin | O(n), O(1) space |
| **Sort a list** | Top-down merge sort (O(log n) stack) or bottom-up merge sort with run length doubling (O(1) space) | O(n log n) |
| **Doubly linked reversal** | Swap `prev` and `next` in every node; the new head is the old tail | O(n) |

[Remove Nth Node From End](/practice/remove-nth-from-end) is the smallest composition of the two patterns: the gap template from [fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) finds the predecessor, and the dummy head makes deleting the first node ordinary:

```viz
{"type": "linked-list", "algorithm": "remove-nth-from-end", "values": [1, 2, 3, 4, 5], "n": 2}
```

## Complexity, derived

Every primitive visits each node a constant number of times: reversal reads and writes each `next` once (`n` writes); split reads `1.5n` pointers; merge writes one `next` per node. Compositions of a constant number of primitives stay O(n) time and O(1) space. The exceptions are recursion (O(n) stack for recursive reversal, O(log n) for top-down merge sort) and structures that allocate (the copy, the result of Add Two Numbers, the LRU's nodes).

Measured against the array fallback on CPython 3.14, one development machine, best of three:

| Task | In place on the nodes | Via a Python list | Notes |
|---|---|---|---|
| Reverse 10⁶ nodes | 50 ms | 67 ms (collect nodes, relink backwards) | In place wins: no 8 MB list to allocate |
| Sort 2 × 10⁵ nodes | 192 ms (top-down merge sort) | 61 ms (collect, `list.sort` by key, relink) | The fallback wins 3×: Timsort runs in C, the merge loop in the interpreter |

So "in place" is a space requirement, not a speed guarantee. When the interviewer says memory is free, the array route for sorting is the better engineering answer; when they say O(1) space, you owe them the in-place version and should not claim it is faster.

| Approach | Extra space | Code paths | Typical bug | Where it wins |
|---|---|---|---|---|
| Rewire in place | O(1) | several pointer updates per node | lost tail, cycle | memory-bound, or the node identity must be preserved |
| Array of nodes, relink | O(n) pointers, 8 bytes each | index arithmetic | forgetting to terminate the last node | anything needing random access (sort, k-th from end with repeats) |
| Array of values, new list | O(n) values plus new nodes | simplest | violates "move nodes, not values" | quick prototypes, not interviews that forbid it |

## Under the hood

### Python's tuple assignment is not simultaneous

`a, b = b, a` evaluates the whole right side first, then assigns targets **left to right**. That makes the one-line reversal step order-sensitive. `curr.next, prev, curr = prev, curr, curr.next` works: `curr.next` is assigned while `curr` is still the old node. `prev, curr, curr.next = curr, curr.next, prev` rebinds `curr` first and then writes the *new* `curr`'s `next`: on `1 → 2 → 3 → 4` it cuts the list after node 2 on the first iteration and raises `AttributeError: 'NoneType' object has no attribute 'next'` on the second (measured on CPython 3.14). JavaScript destructuring, `[prev, curr, curr.next] = [curr, curr.next, prev]`, assigns left to right as well and fails the same way (`TypeError: Cannot set properties of null` in Node 24). Write the four explicit lines in an interview; the one-liner saves nothing and hides the order.

### Recursion depth

Recursive reversal needs one frame per node. CPython 3.14's default recursion limit is 1,000: reversing 998 nodes succeeds and 1,000 raises `RecursionError`. Node 24 with its default stack handled about 10,300 nodes before `RangeError: Maximum call stack size exceeded`, a number that depends on the frame size and the `--stack-size` flag. Either way a production list of unknown length rules recursion out, which is the answer to "can you do it recursively, and would you?".

### LRU in the standard libraries

`collections.OrderedDict` is a dict plus a C doubly linked list; `move_to_end` and `popitem(last=False)` are O(1). An `OrderedDict`-based LRU ran 10⁶ mixed operations at capacity 10,000 in 163 ms against 194 ms for the hand-written class above, measured on CPython 3.14; [LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache) has its per-entry memory. JavaScript's `Map` keeps insertion order, so `delete` plus `set` moves a key to the back and `map.keys().next().value` is the oldest key. It is O(1) amortised, but in Node 24 the same 10⁶ operations took 464 ms with that trick against 49 ms for an explicit list: isolated, 2 × 10⁵ evictions through `keys().next()` took 538 ms while 2 × 10⁵ refreshes took 10 ms. V8's ordered table leaves deleted entries as holes until it rehashes, and a fresh iterator walks over every hole at the front. Mention the `Map` trick, then write the list when eviction is hot.

## Failure modes

**The reversed list has one node.** *Symptom:* `reverse(1 → 2 → 3)` returns `1`, or loops back into the reversed part. *Diagnosis:* `curr.next = prev` ran before `nxt = curr.next`, so the only reference to node 2 was overwritten; `curr = curr.next` then steps onto `prev`. *Fix:* the first line of the loop body saves `nxt`; trace two iterations on paper before running.

**A traversal after Reorder List never ends.** *Symptom:* printing the list hangs, or a test harness truncates the output at a repeated node. *Diagnosis:* the split did not set `slow.next = None`, so the first half still runs into the second, which after reversal points back into the first: a cycle. *Fix:* cut at the split; when debugging, run Floyd from [fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) on the result.

**The copy shares nodes with the original.** *Symptom:* values match, but mutating the copy changes the original, or a deep-copy check fails. *Diagnosis:* randoms were set during the weave or the unweave, so some `random` points at an original node. *Fix:* three separate passes; test by walking the copy and asserting no node is in the set of original node identities.

**LRU evicts a key it did not need to.** *Symptom:* a hit rate lower than the trace predicts; `get` returns −1 for a key that should still be cached. *Diagnosis:* `put` on an existing key checks capacity first and evicts before discovering the key is present, or it updates the value without refreshing recency. *Fix:* existing-key branch first, and it always refreshes; eviction only on a genuinely new key.

**Big numbers lose their leading digit.** *Symptom:* 999 + 1 returns 000. *Diagnosis:* the loop condition omits the carry. *Fix:* `while l1 or l2 or carry`.

## Interviewer follow-ups

**"Sort the list in O(1) extra space."** Model answer: bottom-up merge sort: merge runs of length 1, 2, 4, … by walking the list with a tail pointer, cutting and merging in place, no recursion; O(n log n) time, O(1) space. Top-down merge sort is O(log n) stack. If memory is not constrained, the array fallback measured 3× faster in CPython. Common wrong answer: quicksort on the list, whose partition needs random access to pick pivots well and degrades to O(n²) on sorted input with a head pivot.

**"Do it recursively. Would you ship that?"** Model answer: the recursive reversal is the same algorithm with the call stack holding `prev`; it is O(n) stack, fails at about 1,000 nodes under CPython's default limit, so no. Common wrong answer: "recursion is O(1) space because there are no new nodes".

**"Your LRU is called from 64 threads."** Model answer: every `get` mutates the list, so a single lock serialises reads; shard the cache by key hash with a lock per shard, or use an approximate policy (sampled LRU, CLOCK) that makes hits lock-free. Common wrong answer: a read-write lock, which does not help because `get` is a write. The trade-offs are in [LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache).

**"Copy the random-pointer list without a hash map."** Model answer: the interleave, three passes, and the reason the phases cannot be merged. Common wrong answer: two passes with the randoms set during the weave.

**"The digits are stored most significant first."** Model answer: reverse both lists (and the result), or push digits onto two stacks and pop to add from the least significant end; O(m + n) either way. Common wrong answer: convert to integers, which overflows in fixed-width languages and dodges the question.

## What mid-level engineers get wrong

- **Rewiring before saving `next`.** Consequence: the tail is orphaned silently; the function returns a short list and no exception points at the line.
- **Special-casing the head instead of using a dummy.** Consequence: two code paths, twice the off-by-one surface, and an interviewer counting branches.
- **Returning `head` after a reversal.** Consequence: the caller gets the old head, now the tail, a one-node list.
- **Merging randoms and structure into one pass** in the random-pointer copy. Consequence: a copy that points into the original, which value-only tests do not catch.
- **Claiming in place is faster.** Consequence: the sort measurement says otherwise, and an interviewer who knows it discounts the rest.
- **Using the JavaScript `Map` trick for a hot LRU without measuring.** Consequence: evictions that cost microseconds each once deletions pile up at the front.

## Exercises

```exercise
id: reverse-sublist-in-place
title: Reverse a sublist in place
prompt: |
  Given the head of a singly linked list and two 1-indexed positions
  `left <= right` (both within the list), reverse the nodes from position
  `left` to position `right` in place and return the head of the list.

  Do not create new nodes and do not change any node's value; move the
  nodes by rewiring `next` pointers. Use a dummy head so that `left == 1`
  is not a special case.
languages: [python, javascript]
entry: reverse_between
starter:
  python: |
    def reverse_between(head, left, right):
        # head is a ListNode; ListNode(val, next) is provided by the harness
        return head
  javascript: |
    function reverse_between(head, left, right) {
      // head is a ListNode; class ListNode { constructor(val, next) } is provided
      return head;
    }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}, 2, 4]
    expected: {"$list": [1, 4, 3, 2, 5]}
  - args: [{"$list": [5]}, 1, 1]
    expected: {"$list": [5]}
    label: single node
  - args: [{"$list": [1, 2, 3]}, 1, 3]
    expected: {"$list": [3, 2, 1]}
    label: whole list, head changes
  - args: [{"$list": [1, 2, 3, 4]}, 1, 2]
    expected: {"$list": [2, 1, 3, 4]}
  - args: [{"$list": [1, 2, 3, 4, 5, 6]}, 3, 6]
    expected: {"$list": [1, 2, 6, 5, 4, 3]}
    hidden: true
    label: sublist runs to the tail
  - args: [{"$list": [7, 8]}, 2, 2]
    expected: {"$list": [7, 8]}
    hidden: true
    label: left equals right, no change
hints:
  - "Walk a pointer `before` from the dummy exactly left - 1 steps; the sublist starts at before.next."
  - "Reverse exactly right - left + 1 nodes with the prev/curr/nxt loop; when it ends, curr is the first node after the sublist."
  - "Reconnect in two assignments: the old first node of the sublist (now its tail) gets next = curr, and before.next = prev."
```

```exercise
id: rotate-list-right
title: Rotate a list to the right by k
prompt: |
  Given the head of a singly linked list and a non-negative integer `k`,
  rotate the list to the right by `k` places: the last `k` nodes move, in
  order, to the front. For example `1 -> 2 -> 3 -> 4 -> 5` with `k = 2`
  becomes `4 -> 5 -> 1 -> 2 -> 3`.

  Rewire nodes in place in O(n) time and O(1) extra space. `k` may be much
  larger than the length of the list.
languages: [python, javascript]
entry: rotate_right
starter:
  python: |
    def rotate_right(head, k):
        # ListNode(val, next) is provided by the harness
        return head
  javascript: |
    function rotate_right(head, k) {
      // ListNode(val, next) is provided by the harness
      return head;
    }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}, 2]
    expected: {"$list": [4, 5, 1, 2, 3]}
  - args: [{"$list": [0, 1, 2]}, 4]
    expected: {"$list": [2, 0, 1]}
    label: k larger than the length
  - args: [{"$list": []}, 3]
    expected: {"$list": []}
    label: empty list
  - args: [{"$list": [1]}, 99]
    expected: {"$list": [1]}
  - args: [{"$list": [1, 2]}, 2]
    expected: {"$list": [1, 2]}
    hidden: true
    label: k is a multiple of the length
  - args: [{"$list": [1, 2, 3]}, 0]
    expected: {"$list": [1, 2, 3]}
    hidden: true
  - args: [{"$list": [1, 2, 3, 4, 5, 6, 7]}, 1000000000]
    expected: {"$list": [2, 3, 4, 5, 6, 7, 1]}
    hidden: true
    label: huge k must be reduced modulo the length
hints:
  - "One pass finds both the length n and the tail node. Reduce k with k % n; if it is 0, return the head unchanged."
  - "The new tail is the node n - k - 1 steps from the head, and the new head is the node after it."
  - "Cut after the new tail (set its next to null) and link the old tail to the old head."
```

## Senior signals

- You **draw the pointers** and name `prev`, `curr`, `nxt` before writing a loop, and your first line inside the loop saves `nxt`.
- You reach for a **dummy head** by default and can say which special case it removes in each problem.
- You decompose out loud into **split, reverse, merge**, and you know Reorder List, Palindrome List and list merge sort are the same three primitives in different orders.
- You name the **array fallback with a number** (3× faster for sorting in CPython, O(n) memory), then do the in-place version, and say which you would ship.
- You keep **multi-phase algorithms in separate passes** when a later phase reads state an earlier one is still building (random-pointer copy), and you can explain what breaks if they are merged.
- You **restore the input** when the problem is a query (palindrome), and you know recursive reversal is O(n) stack with a cliff near 1,000 nodes in CPython.
- For LRU you check for an **existing key before evicting**, and you know what `OrderedDict` and JavaScript's `Map` do underneath, including the eviction cost of the `Map` trick.

## Check yourself

```quiz
- q: >-
    In the reversal loop you write `curr.next = prev` and then `curr = curr.next`. What happens on the list 1 -> 2 -> 3?
  options: ["The list reverses correctly, one iteration later than planned", "The list turns into a cycle that the loop never leaves", "A null dereference is raised on the first iteration", "curr steps back onto prev and nodes 2 and 3 are lost"]
  answer: 3
  explanation: >-
    After the rewire, curr.next is prev, so curr steps back onto the reversed part and nothing references node 2 any more. No exception is raised; the function returns a short list. Saving nxt = curr.next before the rewire is the fix.
- q: >-
    In Python you write the reversal step as `prev, curr, curr.next = curr, curr.next, prev`. Why does it fail?
  options: ["The right side is evaluated lazily, so curr.next reads a stale value", "Python forbids attribute targets inside a tuple assignment", "Targets are assigned left to right, so curr.next writes the new curr", "Tuple assignment copies the nodes, so the rewiring is lost"]
  answer: 2
  explanation: >-
    The right side is evaluated first, then targets are bound left to right. curr is rebound before curr.next is assigned, so the write lands on the next node, cutting the list and raising AttributeError one iteration later. Ordering the targets as curr.next, prev, curr works, but four explicit lines are clearer.
- q: >-
    In the O(1)-space random-pointer copy, why can the random pointers not be set during the weave pass?
  options: ["Setting randoms first would break the original next links", "The copies would be allocated in a different order", "A random may point forward to a node not yet copied", "Random pointers can only be set after the unweave"]
  answer: 2
  explanation: >-
    During the weave, if A.random is C and C has not been copied yet, then A.random.next is still C's original successor, so A's copy would point at an original node. Once every copy sits right after its original, X.random.next is exactly the copy of X.random. Randoms must be set before the unweave, not after, because the unweave destroys that adjacency.
- q: >-
    An LRU cache of capacity 2 holds keys 1 and 3, with 3 least recent. The next call is put(1, 10). What should happen?
  options: ["Evict key 3, then store 1 with value 10 at the front", "Update key 1 to 10 and move it to the front; evict nothing", "Evict key 1, then insert a fresh node for 1 with value 10", "Update key 1 in place and leave the recency order as it is"]
  answer: 1
  explanation: >-
    The key already exists, so the cache is not growing and nothing is evicted; the update counts as a use, so key 1 moves to the front. Checking capacity before checking for the key evicts 3 needlessly, and updating without refreshing leaves 1 as the next eviction victim.
- q: >-
    Sorting a 200,000-node list in CPython, the lesson measured top-down merge sort on the nodes at 192 ms and collecting the nodes into a Python list, sorting, and relinking at 61 ms. What is the right conclusion?
  options: ["Relinking is O(1), so the fallback does less total work", "Merge sort is asymptotically worse on linked lists than Timsort", "In place is a space requirement; the fallback is faster here", "The measurement is noise, since both are O(n log n) algorithms"]
  answer: 2
  explanation: >-
    Both are O(n log n); the fallback wins on constants because list.sort runs in C while the merge loop runs in the interpreter, at the cost of O(n) extra pointers. When memory is free, the fallback is the better engineering answer; when the interviewer requires O(1) space, you write the in-place version and do not claim it is faster.
- q: >-
    A JavaScript LRU uses Map insertion order: delete and set to refresh, and map.keys().next().value to find the eviction victim. In Node 24 it measured about ten times slower than an explicit doubly linked list. Why?
  options: ["Every set call rehashes the entire table to keep insertion order", "Deleted entries stay as holes, and a new iterator skips them all", "Map lookups are O(log n) because V8 keeps the keys in a tree", "Iterators copy the Map's keys into an array before returning"]
  answer: 1
  explanation: >-
    V8's ordered hash table marks deleted entries and removes them only when it rehashes, so after many evictions from the front a fresh keys() iterator walks over every hole before reaching a live key. Refreshing an existing key is fast (2 x 10^5 refreshes took 10 ms); evicting through keys().next() was the slow part (538 ms for the same count).
```
