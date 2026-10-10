---
slug: reversal-and-runner-techniques
title: Reversal and runner techniques
description: Iterative and recursive reversal with per-step pointer and call-stack traces, the measured cost of recursion depth, the fast/slow runner for the middle and the nth node from the end with the even/odd cases tabulated, and the sublist, k-group and palindrome compositions.
minutes: 40
difficulty: medium
tags: [linked-list, reversal, two-pointers, fast-slow, runner, recursion, stack-depth, palindrome, k-group]
problems: [reverse-linked-list, middle-of-linked-list, remove-nth-from-end, reorder-list, reverse-nodes-k-group, palindrome-linked-list]
---
You are asked to reverse a singly linked list in place. It is four lines of code, and a large share of candidates write one of the four in the wrong order on the whiteboard. Then the interviewer asks for the middle node in one pass, or the 7th node from the end without knowing the length. These two techniques, rewiring pointers as you walk and walking two pointers at different speeds or offsets, cover most linked-list questions.

Neither technique is deep. Both are unforgiving, because a singly linked list gives you no way back: overwrite the wrong `next` and the tail of the list is gone, with no exception to tell you. The discipline is to name what each pointer means, state the invariant, and trace by hand before running. This lesson does the traces for you once, step by step, so you can reproduce them under pressure.

## Iterative reversal

Three pointers: `prev` (the reversed prefix so far), `curr` (the node being rewired), and `nxt` (saved so the rest of the list is not lost).

```python
def reverse(head):
    prev, curr = None, head
    while curr is not None:
        nxt = curr.next        # 1. save the rest
        curr.next = prev       # 2. rewire this node backwards
        prev = curr            # 3. advance prev
        curr = nxt             # 4. advance curr
    return prev
```

**Invariant:** at the top of each iteration, `prev` is the head of a correctly reversed list containing exactly the nodes already visited, and `curr` is the head of the untouched remainder. When `curr` becomes null, `prev` is the whole list reversed.

Trace on `1 → 2 → 3 → 4`:

| iteration | `nxt` saved | write | `prev` (reversed part) after | `curr` after |
|---|---|---|---|---|
| start | – | – | `None` | 1 |
| 1 | 2 | `1.next = None` | `1 → None` | 2 |
| 2 | 3 | `2.next = 1` | `2 → 1 → None` | 3 |
| 3 | 4 | `3.next = 2` | `3 → 2 → 1 → None` | 4 |
| 4 | `None` | `4.next = 3` | `4 → 3 → 2 → 1 → None` | `None` |

Return `prev` = node 4. Four iterations for four nodes: O(n) time, O(1) extra space, and no allocation.

```viz
{"type": "linked-list", "algorithm": "reverse", "values": [1, 2, 3, 4, 5], "title": "Iterative reversal: prev, curr, nxt"}
```

The line people get wrong is step 1. Swap steps 1 and 2 and the trace becomes:

| iteration | write first | then `nxt = curr.next` reads | `prev` | `curr` |
|---|---|---|---|---|
| 1 | `1.next = None` | `None` | `1 → None` | `None` |

The loop exits after one iteration with `prev = 1`; nodes 2, 3 and 4 are unreachable and, in a garbage-collected language, gone. No error is raised. Say "save next" out loud before you touch the pointer.

## Recursive reversal

```python
def reverse_rec(head):
    if head is None or head.next is None:
        return head
    new_head = reverse_rec(head.next)   # reverses everything after head
    head.next.next = head               # the old successor now points back at head
    head.next = None                    # head becomes the tail
    return new_head
```

Trust the recursive call: after `reverse_rec(head.next)` returns, the sublist from `head.next` onward is reversed and `head.next` (unchanged so far) is the *last* node of that reversed sublist. Appending `head` after it is `head.next.next = head`; then `head.next = None` makes `head` the new tail.

The call stack for `1 → 2 → 3 → 4`, in time order (the list state column shows what is reachable from node 4 and from node 1):

| event | depth | frame's `head` | action | reachable from 4 | reachable from 1 |
|---|---|---|---|---|---|
| 1 | 0 | 1 | call `reverse_rec(2)` | `4 → None` | `1 → 2 → 3 → 4` |
| 2 | 1 | 2 | call `reverse_rec(3)` | `4 → None` | `1 → 2 → 3 → 4` |
| 3 | 2 | 3 | call `reverse_rec(4)` | `4 → None` | `1 → 2 → 3 → 4` |
| 4 | 3 | 4 | base case: return 4 | `4 → None` | `1 → 2 → 3 → 4` |
| 5 | 2 | 3 | `4.next = 3`, `3.next = None`, return 4 | `4 → 3 → None` | `1 → 2 → 3 → None` |
| 6 | 1 | 2 | `3.next = 2`, `2.next = None`, return 4 | `4 → 3 → 2 → None` | `1 → 2 → None` |
| 7 | 0 | 1 | `2.next = 1`, `1.next = None`, return 4 | `4 → 3 → 2 → 1 → None` | `1 → None` |

Four frames are alive at event 4, one per node. That is the cost.

```viz
{"type": "memory", "algorithm": "call-stack", "fn": "reverse", "values": [1, 2, 3, 4], "title": "One frame per node: the recursion is as deep as the list is long"}
```

## The recursion cliff, measured

The numbers, measured on this platform's runtimes: CPython 3.14.7 has a default recursion limit of 1,000 (`sys.getrecursionlimit()`), so `reverse_rec` on 50,000 nodes raises `RecursionError` at once; with the limit raised to 50,100 it completes in 6.9 ms against 2.5 ms for the iterative loop on the same list, about 2.8× slower for the call overhead alone. Node 24 (V8, default stack of roughly 1 MB) throws `RangeError: Maximum call stack size exceeded` at a depth of 9,634 frames for this function. A JVM thread's default stack is 1 MB on 64-bit Linux, which is on the order of 10⁴ frames of a small method before `StackOverflowError`. Note also that `reverse_rec` does work *after* the call returns, so it is not tail-recursive; even a language with tail-call elimination would keep every frame. In an interview, write the iterative version and mention the recursive one; in production, never recurse over a list whose length you do not control. [Stack, heap and the call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame mechanics and [Recursion design](/learn/algorithms/recursion-backtracking/recursion-design) the general rule.

## Worked example: reversing a sublist

Reverse positions `m..n` (1-indexed) of `1 → 2 → 3 → 4 → 5` with `m = 2`, `n = 4`, so the answer is `1 → 4 → 3 → 2 → 5`. The core is the same loop; the work is in the reconnection, and a sentinel handles `m = 1`.

```python
def reverse_between(head, m, n):
    sentinel = ListNode(0, head)
    before = sentinel
    for _ in range(m - 1):
        before = before.next          # the node before the sublist
    tail = before.next                # first node of the sublist; becomes its last
    prev, curr = None, tail
    for _ in range(n - m + 1):
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    before.next = prev                # reconnect the front: prev is the reversed head
    tail.next = curr                  # reconnect the back: curr is the node after n
    return sentinel.next
```

| step | `before` | `tail` | loop `k` | `prev` after | `curr` after | reachable from head |
|---|---|---|---|---|---|---|
| walk | 1 | 2 | – | – | – | `1 → 2 → 3 → 4 → 5` |
| reverse | 1 | 2 | 1 | 2 | 3 | `1 → 2 → None` (3, 4, 5 held only by `curr`) |
| reverse | 1 | 2 | 2 | 3 | 4 | `1 → 2 → None`; `3 → 2` |
| reverse | 1 | 2 | 3 | 4 | 5 | `1 → 2 → None`; `4 → 3 → 2` |
| `before.next = prev` | 1 | 2 | – | 4 | 5 | `1 → 4 → 3 → 2 → None` |
| `tail.next = curr` | 1 | 2 | – | 4 | 5 | `1 → 4 → 3 → 2 → 5` |

During the loop the list is temporarily in two pieces, which is normal; the two reconnection writes are what make it whole. Two of the four pointers (`before`, `tail`) exist only for those writes. Forgetting `tail.next = curr` leaves `2.next = None` and silently drops node 5 and everything after it; the symptom in production is a list that is shorter after the operation than before, so a length assertion around the call is the cheapest test.

## Reverse in groups of k

[Reverse Nodes in k-Group](/practice/reverse-nodes-k-group) applies `reverse_between` repeatedly and leaves a final partial group alone. The rule that keeps it O(n): count `k` nodes ahead *before* reversing, so a short tail is never reversed and then reversed back.

```python
def reverse_k_group(head, k):
    sentinel = ListNode(0, head)
    group_prev = sentinel
    while True:
        kth = group_prev
        for _ in range(k):                   # find the k-th node of this group
            kth = kth.next
            if kth is None:
                return sentinel.next         # fewer than k left: leave them
        group_next = kth.next
        prev, curr = group_next, group_prev.next   # reverse k nodes onto group_next
        while curr is not group_next:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        first = group_prev.next              # the old first node is now the group's last
        group_prev.next = kth
        group_prev = first
```

On `1 → 2 → 3 → 4 → 5 → 6 → 7` with `k = 3`: after the first group `3 → 2 → 1 → 4 → 5 → 6 → 7`; after the second `3 → 2 → 1 → 6 → 5 → 4 → 7`; the count-ahead for the third group finds only node 7 and returns. Starting `prev` at `group_next` instead of `None` is what reconnects the back of each group without a separate write. [In-place linked list](/learn/interview-patterns/sequence-patterns/in-place-linked-list) collects the other members of this family.

## The runner technique: fast and slow pointers

Two pointers start at the head. `slow` advances one node per step, `fast` advances two. When `fast` reaches the end, `slow` is at the middle. One pass, no length count, O(1) space.

```python
def middle(head):
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
    return slow
```

**Invariant:** `fast` is `2k` nodes from the head when `slow` is `k` nodes from the head. Where `fast` stops determines which "middle" you get:

| step | odd length `1 → 2 → 3 → 4 → 5`: (`slow`, `fast`) | even length `1 → 2 → 3 → 4`: (`slow`, `fast`) |
|---|---|---|
| 0 | (1, 1) | (1, 1) |
| 1 | (2, 3) | (2, 3) |
| 2 | (3, 5) | (3, `None`) |
| stop because | `fast.next` is null | `fast` is null |
| `slow` | 3, the exact middle | 3, the *second* of the two middles |

Both checks in `while fast and fast.next` are load-bearing: odd lengths end with `fast` on the last node, even lengths end with `fast` null, and dropping either check dereferences null on one of them. Three variants of the loop give three answers on even lengths; choose deliberately before writing it:

| length | `while fast and fast.next` | `while fast.next and fast.next.next` | `fast = head.next` start |
|---|---|---|---|
| 1 | 1 | 1 | 1 |
| 2 | 2 | 1 | 1 |
| 3 | 2 | 2 | 2 |
| 4 | 3 | 2 | 2 |
| 5 | 3 | 3 | 3 |
| 6 | 4 | 3 | 3 |

The first column gives the second middle, which the palindrome check wants; the other two give the first middle, which splitting a list for merge sort wants (so the cut after `slow` leaves two non-empty halves for length 2). The off-by-one here is the most common bug in reorder and list merge-sort code, and [Merging and partitioning](/learn/data-structures/linked-lists/merging-and-partitioning) shows the infinite recursion it causes.

```viz
{"type": "linked-list", "algorithm": "middle", "values": [1, 2, 3, 4, 5, 6], "title": "Runner: fast moves two, slow moves one"}
```

## Nth node from the end with a gap of n

Advance a `lead` pointer `n` nodes ahead of `trail`, then move both until `lead` is at the last node. `trail` is then immediately before the nth node from the end, which is what deletion needs. Starting both at a sentinel makes `n = length` (delete the head) an ordinary case.

```python
def remove_nth_from_end(head, n):
    sentinel = ListNode(0, head)
    lead = trail = sentinel
    for _ in range(n):
        lead = lead.next             # assumes 1 <= n <= length
    while lead.next is not None:
        lead = lead.next
        trail = trail.next
    trail.next = trail.next.next     # unlink
    return sentinel.next
```

| `n` on `1 → 2 → 3 → 4 → 5` | after the `n` advances | second loop (`lead`, `trail`) | unlink | result |
|---|---|---|---|---|
| 2 | `lead` = 2, `trail` = S | (3, 1), (4, 2), (5, 3) | `3.next = 5` | `1 → 2 → 3 → 5` |
| 5 | `lead` = 5, `trail` = S | never runs: `lead.next` is already null | `S.next = 2` | `2 → 3 → 4 → 5` |
| 1 | `lead` = 1, `trail` = S | (2, 1), (3, 2), (4, 3), (5, 4) | `4.next = None` | `1 → 2 → 3 → 4` |

```viz
{"type": "linked-list", "algorithm": "remove-nth-from-end", "values": [1, 2, 3, 4, 5], "n": 2, "title": "Gap of n between two pointers"}
```

The two-pass version (count the length, then walk `length − n`) is also O(n), and in an interview you should say so first. The one-pass version reads `n` fewer nodes twice, which matters when a node visit is expensive (a lazily fetched record, a disk-backed node), and it is the version interviewers want because it shows the offset-pointer idea. Be precise about what "one pass" means: the gap technique still needs the nodes between `trail` and `lead` to stay reachable, so on a true forward-only stream the equivalent is a ring buffer of the last `n` elements, not two pointers.

## Palindrome in O(1) space

Find the middle, reverse the second half in place, compare the two halves, and (if the caller expects the list intact) reverse the second half back. The second-middle variant makes the odd-length case work without a special branch:

| list | `slow` stops at | reversed from `slow` | compare | result |
|---|---|---|---|---|
| `1 → 2 → 3 → 2 → 1` | 3 (third node) | `1 → 2 → 3` | (1,1), (2,2), (3,3), then the reversed pointer is null | palindrome |
| `1 → 2 → 2 → 1` | second 2 (third node) | `1 → 2` | (1,1), (2,2), then null | palindrome |
| `1 → 2 → 3` | 2 | `3 → 2` | (1,3) differ | not a palindrome |

The comparison loop runs while the *reversed* pointer is non-null, because the second half is never longer than the first; on odd lengths the middle node is compared with itself. [Palindrome Linked List](/practice/palindrome-linked-list) is the problem.

## Other runner problems

- **Split a list in half** for merge sort: first-middle variant, then `mid.next = None`.
- **Reorder** `1 → 2 → 3 → 4 → 5` into `1 → 5 → 2 → 4 → 3`: middle, reverse the second half, interleave ([Reorder List](/practice/reorder-list)); traced step by step in [Merging and partitioning](/learn/data-structures/linked-lists/merging-and-partitioning).
- **Cycle detection**: the runner with a different termination question, with its proof in [Cycle detection](/learn/data-structures/linked-lists/cycle-detection).
- **Intersection of two lists**: two pointers that switch lists when they reach the end, so both travel `len(A) + len(B)` and meet at the intersection node or at null.

[Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) is the pattern lesson with the full problem list.

## Under the hood: what a reversal costs the machine

An iteration of the iterative loop is one dependent load (`curr.next`, whose address is unknown until `curr` arrives) and one store (`curr.next = prev`) to a cache line that the load has already pulled in. Reversal therefore costs the same as a traversal: bandwidth-cheap on a freshly allocated list whose nodes are adjacent, and roughly one DRAM miss (~100 ns, depending on the machine) per node on a scattered one, so a million scattered nodes is on the order of 100 ms. [Linked list fundamentals](/learn/data-structures/linked-lists/linked-list-fundamentals) has the arithmetic; nothing about reversal changes it.

The recursive version adds a frame per node. In CPython 3.11 and later, a Python-to-Python call no longer consumes C stack: frames live in interpreter-managed chunks, and the recursion limit is a counter checked on every call, which is why the failure is a clean `RecursionError` rather than a segmentation fault (since 3.12 the limit applies only to Python code, and C-level recursion is guarded by a separate mechanism). In V8 and the JVM the frames are on the thread's native stack, sized at thread creation (V8's default is under 1 MB; the JVM's `-Xss` defaults to 1 MB on 64-bit Linux), and overflow is `RangeError` or `StackOverflowError`. Raising the limit moves the cliff; it does not remove it.

Real libraries mostly avoid reversing at all. A doubly linked list is read backwards through `prev` (Java's `LinkedList.descendingIterator`, Python's `reversed(deque)`), so no pointer is rewritten. `Collections.reverse` on a Java list that is not `RandomAccess` and has 18 or more elements walks two `ListIterator`s inward from both ends and swaps *values*, leaving the nodes where they are. Rewiring is the interview technique; in production the question to ask first is whether the list needs to be reversed or only read in reverse.

## Trade-offs

| Approach | Time | Extra space | Fails at | Keeps node identities | Use when |
|---|---|---|---|---|---|
| Iterative in-place | O(n) | O(1) | never | yes (head becomes tail) | the default |
| Recursive in-place | O(n), ~2.8× slower measured on CPython | O(n) frames | ~1,000 nodes (CPython default), ~10⁴ (V8, JVM) | yes | showing the recursive structure on a whiteboard |
| Copy values to an array, rebuild | O(n) | O(n) nodes or values | memory | no (new nodes) | the original must stay intact |
| Doubly linked: swap `prev`/`next` per node | O(n) | O(1) | never | yes | you own both pointers |
| Doubly linked: iterate backwards | O(n) read | O(1) | never | untouched | you only need to *read* in reverse |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| `RecursionError`, `RangeError: Maximum call stack size exceeded` or `StackOverflowError` from a list utility, only on large inputs | Recursive reversal or merge; depth equals list length; CPython dies at 1,000 frames, V8 near 10⁴ | Rewrite iteratively; add a test with a list longer than the platform's limit |
| A list is shorter after "reverse the middle section" than before | The back reconnection (`tail.next = curr`) was skipped, or the front one wrote to the wrong node; a length assertion before and after finds it | Budget the two reconnection pointers before writing the loop; test `m = 1` and `n = length` |
| Merge sort on a list hangs or overflows the stack on two-node input | The split used the second-middle variant, so one half is empty and never shrinks | Start `fast` at `head.next` (first middle); test lengths 1, 2 and 3 |
| Palindrome check wrong on odd lengths only | The middle node was reversed into the second half and compared against the wrong partner, or the loop compares while the *first* pointer is non-null | Use the second-middle variant and compare while the reversed pointer is non-null |
| Deleting the nth from the end throws on `n` equal to the length, or when `n` exceeds it | `trail` started at the head, so the head has no predecessor; or `lead` ran off the end during the advance | Start both pointers at a sentinel; check for null during the advance and define what "too short" returns |
| After an in-place reversal, code elsewhere iterates a one-element list | Another reference still points at the old head, which is now the tail with `next = None` | Reversal returns a new head; every holder of the old head must be updated, or reverse a copy |
| Readers see a cycle or a truncated list while another thread reverses it | Mid-loop states (`1 → None` with 2, 3, 4 held only by `curr`) are visible to concurrent readers | Reverse under the same lock the readers take, or build the reversed list and swap the head pointer atomically |

## Interviewer follow-ups

**Q: "Now reverse a doubly linked list."**

Model answer: walk the list once and swap `prev` and `next` on every node, then swap the head and tail references; O(n), O(1), no `nxt` variable needed because the old `next` is saved in `prev` after the swap. Then ask whether the caller needs a reversed *list* or a reversed *walk*: if the latter, iterate from the tail through `prev` and write nothing. Common wrong answer: applying the singly linked three-pointer loop and leaving every `prev` pointing the old way, which corrupts the list for the next backward walk.

**Q: "Your recursive version passes all the tests. Would you ship it?"**

Model answer: not for input whose length I do not control. The depth equals the length; CPython's default limit is 1,000 frames and V8's stack gives about 10⁴; the failure is an exception in production, not a slow path. The iterative loop is the same four lines with O(1) space. Common wrong answer: "raise `sys.setrecursionlimit`", which moves the cliff and, on a runtime that uses the native stack, turns the clean exception into a crash.

**Q: "Why are both checks in `while fast and fast.next` needed?"**

Model answer: on an odd-length list `fast` ends on the last node, so `fast.next` is null and `fast.next.next` would fault; on an even-length list `fast` itself becomes null. Each check guards one parity. Common wrong answer: "`while fast.next` is enough", which crashes on every even-length list.

**Q: "Reverse in groups of k. What happens to a final group shorter than k?"**

Model answer: leave it as is, and make sure it costs nothing: count `k` nodes ahead before reversing, so a short tail is never reversed and reversed back; total work stays one pointer write per node. Common wrong answer: reversing every group and re-reversing the last one when it turns out short, which is correct but doubles the work on the tail and is harder to reason about.

**Q: "Find the nth from the end of a stream of records you cannot rewind."**

Model answer: the two-pointer trick needs the intermediate nodes to remain reachable; on a real stream that is a ring buffer of the last `n` records, O(n) memory, which is the same memory the gap between `lead` and `trail` occupied on the list. Common wrong answer: "the one-pass two-pointer method works unchanged on streams".

## What mid-level engineers get wrong

- **Writing `curr.next = prev` before saving `curr.next`.** The loop ends after one node and the rest of the list is silently unreachable; no error is raised, so the bug reaches production as missing data.
- **Choosing the middle variant by habit.** The second middle breaks list merge sort on two nodes (infinite recursion); the first middle breaks the palindrome check on odd lengths. Each problem needs one specific variant.
- **Recursing over caller-supplied lists.** The unit tests use ten nodes; the first real input has ten thousand.
- **Naming pointers `p`, `q`, `r`.** With no meaning attached, nobody can state the invariant, and the reconnection writes in `reverse_between` are guessed rather than derived.
- **Forgetting that reversal changes the head.** The function returns the new head; callers that keep the old reference now hold the tail.
- **Testing only the five-node happy path.** Empty, one node, two nodes, `m = 1`, `n = length`, and a group that is exactly `k` long are where the pointer bugs are.

## A checklist for pointer code

1. **Name every pointer by its meaning**: `prev`/`curr`/`nxt`, `slow`/`fast`, `lead`/`trail`, `before`/`tail`.
2. **State the invariant** in one sentence and check that the loop body preserves it ([Invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning)).
3. **Save before you overwrite.** Any assignment to `x.next` where you still need the old `x.next` is preceded by saving it.
4. **Check the termination expression against null.** `while curr`, `while curr.next` and `while fast and fast.next` are each correct for one loop and wrong for the others.
5. **Trace four cases by hand**: empty, one node, two nodes, and a list where the answer is the head or the tail.
6. **Return the right head.** After reversal it is `prev`; after edits with a sentinel it is `sentinel.next`.

## Exercises

```exercise
id: reverse-list
title: Reverse a linked list
prompt: |
  Reverse the singly linked list in place and return the new head. O(n)
  time and O(1) extra space; do not build a new list or use recursion.
  The list has at least one node.
languages: [python, javascript]
entry: reverse_list
starter:
  python: |
    def reverse_list(head):
        # your code here
        return head
  javascript: |
    function reverse_list(head) {
      // your code here
      return head;
    }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}]
    expected: {"$list": [5, 4, 3, 2, 1]}
  - args: [{"$list": [1]}]
    expected: {"$list": [1]}
    label: single node
  - args: [{"$list": [1, 2]}]
    expected: {"$list": [2, 1]}
    label: two nodes
  - args: [{"$list": [3, 3, 1]}]
    expected: {"$list": [1, 3, 3]}
    hidden: true
    label: duplicate values
  - args: [{"$list": [1, 2, 3, 4, 5, 6, 7, 8]}]
    expected: {"$list": [8, 7, 6, 5, 4, 3, 2, 1]}
    hidden: true
hints:
  - "Three pointers: save `nxt = curr.next` before setting `curr.next = prev`."
  - "When `curr` becomes null, `prev` is the new head."
```

```exercise
id: kth-from-end
title: Value of the k-th node from the end
prompt: |
  Return the value of the k-th node from the end of the list (`k = 1` is
  the last node), or `None`/`null` if the list has fewer than `k` nodes.
  Use two pointers with a gap of `k` and a single pass; do not compute the
  length first.
languages: [python, javascript]
entry: kth_from_end
starter:
  python: |
    def kth_from_end(head, k):
        # your code here
        return None
  javascript: |
    function kth_from_end(head, k) {
      // your code here
      return null;
    }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}, 2]
    expected: 4
  - args: [{"$list": [1, 2, 3, 4, 5]}, 5]
    expected: 1
    label: k equals the length
  - args: [{"$list": [1, 2, 3, 4, 5]}, 1]
    expected: 5
    label: last node
  - args: [{"$list": [1, 2]}, 3]
    expected: null
    label: k larger than the list
  - args: [{"$list": [10, 20, 30, 40]}, 4]
    expected: 10
    hidden: true
  - args: [{"$list": [9]}, 2]
    expected: null
    hidden: true
hints:
  - "Advance `lead` k times; if it runs off the end (becomes null) before k steps complete, the list is too short."
  - "Then move `lead` and `trail` together until `lead` is null; `trail` is the answer."
```

## Senior signals

- You write iterative reversal without hesitation, name the invariant, and can trace which assignment order loses the tail and why no error reports it.
- You know recursive reversal is O(n) stack, can quote the cliffs (1,000 frames by default in CPython, about 10⁴ in V8 and the JVM), and know it is not tail-recursive so no optimiser saves it.
- You choose the first or second middle deliberately for even-length lists, can say which loop condition gives which, and know which problem needs which.
- You budget the two reconnection pointers before reversing a sublist and start `prev` at `group_next` when reversing in groups.
- You use a sentinel with the nth-from-end pattern so deleting the head is not a special case, and you can say what "one pass" does and does not buy on a stream.
- You ask whether the list needs reversing or only reading backwards before rewiring anything in production.
- You trace empty, single, double and boundary cases before running.

## Check yourself

```quiz
- q: >-
    In iterative reversal, what happens if `curr.next = prev` is executed before saving `curr.next`?
  options: ["The loop ends after one node, and the rest of the list is unreachable", "The list is reversed correctly, since prev still holds the old successor", "The loop never ends, since the first node now points back at itself", "Only the last node is lost, since nxt is read one iteration late"]
  answer: 0
  explanation: >-
    Overwriting `curr.next` discards the only reference to the remainder. `nxt` is then read from the already-rewired pointer (prev, which is None on the first iteration), so `curr` becomes `None` after one iteration and the loop exits with the tail lost and no error raised. No self-loop is created, because the node is pointed at prev, not at itself.
- q: >-
    With `slow = fast = head` and `while fast and fast.next`, what does `slow` point to for the list 1 → 2 → 3 → 4?
  options: ["3, the second middle node", "1, the head of the list", "2, the first middle node", "4, the tail of the list"]
  answer: 0
  explanation: >-
    Steps: (1,1) → (2,3) → (3,None). The loop exits with slow at 3. Starting fast at head.next, or using `while fast.next and fast.next.next`, yields the first middle (2), which is what list-splitting for merge sort needs.
- q: >-
    Why is recursive list reversal a poor choice for a list of 100,000 nodes in Python?
  options: ["Each node adds a frame, and the default recursion limit is 1,000 frames", "Python lacks tail-call optimisation, which makes it O(n log n) time", "Recursion cannot reassign `next`, so it must copy every node it visits", "It is O(n²), since each call walks the remaining sublist to find its end"]
  answer: 0
  explanation: >-
    The recursion depth equals the list length. The algorithm is O(n) time but O(n) stack space, and CPython raises RecursionError at its default limit of 1,000 frames. The function does work after the recursive call, so it is not tail-recursive and tail-call optimisation would not help even if Python had it. Iteration uses O(1) space.
- q: >-
    To delete the nth node from the end with two pointers in one pass, why start `trail` at a sentinel rather than at the head?
  options: ["Because the head might be null, and the sentinel avoids a null check on it", "So `trail` lands on the target itself, which can then be unlinked directly", "So `trail` ends before the target, even when the target is the head", "So `lead` is not needed, since the sentinel marks where counting starts"]
  answer: 2
  explanation: >-
    Deletion in a singly linked list needs the predecessor, not the target itself. With `trail` starting at the sentinel it ends one node behind the target; when n equals the length, the second loop never runs, the head's predecessor is the sentinel, and `sentinel.next` is rewired with no special case.
- q: >-
    Which of these problems combines the runner technique and reversal?
  options: ["Remove the nth node from the end in a single pass", "Reverse the sublist between positions m and n in place", "Reorder a list as first, last, second, second-last, ...", "Sort a list by splitting it at the middle and merging"]
  answer: 2
  explanation: >-
    Reorder List finds the middle with fast/slow pointers, reverses the second half in place, and interleaves the two halves, exercising both techniques. Removing the nth from the end uses offset pointers but no reversal, reversing a sublist uses reversal but no runner, and merge sort uses the runner to split but never reverses.
- q: >-
    In `reverse_between`, the sublist 2..4 of 1 → 2 → 3 → 4 → 5 has been reversed and `before.next = prev` has been written. What does the list look like if `tail.next = curr` is forgotten?
  options: ["1 → 2 → 3 → 4 → 5, since the reversal is undone", "1 → 4 → 3 → 2, with node 5 unreachable", "1 → 4 → 3 → 2 → 5, since curr already pointed at 5", "1 → 4 → 3 → 2 → 2, with a self-loop on node 2"]
  answer: 1
  explanation: >-
    Node 2 was the first node of the sublist and became its last; its `next` was set to None on the first iteration of the reversal loop and nothing rewrote it. `curr` holds node 5, but only the missing `tail.next = curr` connects it. The result is a shorter list with no error, which is why a length assertion around the call is a cheap test.
```
