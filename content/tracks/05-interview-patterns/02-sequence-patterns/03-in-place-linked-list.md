---
slug: in-place-linked-list
title: "In-place linked list rewiring: reverse, split, merge"
description: "The pointer discipline behind every linked-list interview problem: the dummy head, the three-pointer reversal, save-next-before-you-rewire, and how reverse, split and merge compose into reorder, k-group and palindrome checks."
minutes: 29
difficulty: medium
tags: [pattern:linked-list, linked-list, in-place, pointer-manipulation, dummy-head]
problems: [reverse-linked-list, merge-two-sorted-lists, reorder-list, remove-nth-from-end, copy-random-list, add-two-numbers, lru-cache, merge-k-sorted-lists, reverse-nodes-k-group, palindrome-linked-list]
---
Linked-list problems are not about algorithms. The algorithm is usually obvious in one sentence: "reverse it", "merge them", "move the last node to the front". What the interviewer is watching is whether you can rewire pointers without losing a node, creating a cycle, or dereferencing null, while talking. A single `curr.next = prev` written before `nxt = curr.next` orphans the rest of the list, and there is no recovering it.

The constraint that makes these problems interesting is **in place**: O(1) extra space, no copying the values into an array and back. Copying to an array is always available as the fallback, it is O(n) space, and you should say so; then you do it properly. This lesson gives you the three primitives (reverse, split, merge), the two habits that make them safe (dummy head, save next first), and the composition rules that turn them into the harder listed problems.

## The signal

You are in this pattern when the input is a singly linked list and the statement says any of: "in place", "O(1) extra space", "reverse", "reorder", "rotate", "swap nodes", "remove the node", "merge", "partition", "without modifying node values". The last phrase is a tell: it forbids the cheat of rewriting values and forces you to move nodes.

Two nearby patterns hand off to this one. Finding *where* to cut (the middle, the k-th from the end) is the [fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) pattern; the cut itself and everything after it is this pattern. Merging more than two lists is [k-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) with a heap choosing the next node; the splice is the same as here.

What rules it out: if you may use O(n) memory and the operation needs random access (say, "sort the list" with no constraint), convert to an array, do the array thing, and rebuild. It is faster in practice because arrays are cache-friendly, and saying that is a senior answer. If the list is doubly linked, half of the difficulty disappears because you can walk backwards.

## The template

Three primitives and two habits. The primitives are written to be composed: each takes a head and returns the new head, or a pair of heads.

### Habit one: the dummy head

A sentinel node before the real head means the first node is never a special case. Removing the head, inserting before the head, merging into an empty result: all become the general case.

```python
dummy = ListNode(0, head)
# ... work with dummy.next as the list ...
return dummy.next
```

```javascript
const dummy = new ListNode(0, head);
// ...
return dummy.next;
```

### Habit two: save next before you rewire

The one line that must come first in any loop that changes `curr.next`:

```python
nxt = curr.next        # 1. remember where you are going
curr.next = prev       # 2. now it is safe to rewire
```

### Primitive one: reverse

```python
def reverse(head):
    prev, curr = None, head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    return prev
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

The invariant, and the sentence to say aloud: **at the top of each iteration, `prev` heads a fully reversed list of every node already visited, `curr` heads the untouched remainder, and no node is reachable from both.** The loop moves one node from the remainder to the reversed side per iteration, so it terminates after n iterations and every node is accounted for.

```viz
{"type": "linked-list", "algorithm": "reverse", "values": [1, 2, 3, 4, 5]}
```

### Primitive two: split at the middle

```python
def split(head):
    slow, fast = head, head.next          # fast starts one ahead
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    second = slow.next
    slow.next = None                      # cut
    return head, second
```

```javascript
function split(head) {
  let slow = head, fast = head.next;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
  }
  const second = slow.next;
  slow.next = null;
  return [head, second];
}
```

Starting `fast` one node ahead makes `slow` stop on the *first* middle, so `1 → 2 → 3 → 4` splits into `1 → 2` and `3 → 4`, and `1 → 2 → 3 → 4 → 5` into `1 → 2 → 3` and `4 → 5`. Cutting with `slow.next = None` is the step people forget; without it the first half still runs into the second.

### Primitive three: merge with a dummy

```python
def merge(a, b, pick_a):
    dummy = tail = ListNode(0)
    while a and b:
        if pick_a(a, b):
            tail.next, a = a, a.next
        else:
            tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b                    # append whichever is left
    return dummy.next
```

```javascript
function merge(a, b, pickA) {
  const dummy = new ListNode(0);
  let tail = dummy;
  while (a && b) {
    if (pickA(a, b)) { tail.next = a; a = a.next; }
    else             { tail.next = b; b = b.next; }
    tail = tail.next;
  }
  tail.next = a ?? b;
  return dummy.next;
}
```

With `pick_a = lambda a, b: a.val <= b.val` this is [Merge Two Sorted Lists](/practice/merge-two-sorted-lists); with `pick_a` alternating it is the interleave step of Reorder List. Same skeleton.

```viz
{"type": "linked-list", "algorithm": "merge-sorted", "values": [1, 3, 5, 7], "values2": [2, 4, 6]}
```

The habit that ties these together: **draw it before you code it.** Four boxes, arrows, and the names `prev`, `curr`, `nxt` written under them. Then write the loop body by reading the arrows off the drawing. It takes thirty seconds and prevents the class of bug that costs ten minutes.

## Worked problems

### Reverse Linked List

[Reverse Linked List](/practice/reverse-linked-list): reverse a singly linked list in place and return the new head.

Insight: you cannot walk backwards, so you flip one arrow per step while carrying the previous node with you. Trace on `1 → 2 → 3 → 4`:

| Iteration | `prev` | `curr` | `nxt` | After `curr.next = prev` |
|---|---|---|---|---|
| start | null | 1 | | `1 → 2 → 3 → 4` |
| 1 | 1 | 2 | 2 | `1 → null`, remainder `2 → 3 → 4` |
| 2 | 2 | 3 | 3 | `2 → 1 → null`, remainder `3 → 4` |
| 3 | 3 | 4 | 4 | `3 → 2 → 1 → null`, remainder `4` |
| 4 | 4 | null | null | `4 → 3 → 2 → 1 → null`, remainder empty |

The loop ends when `curr` is null; `prev` is the new head. Time O(n), space O(1). The recursive version (`reverse(head.next)` then `head.next.next = head; head.next = None`) is elegant and O(n) stack; say that it is the same algorithm with the stack holding `prev` for you, and that you would not use it on a list of unknown length.

### Reorder List

[Reorder List](/practice/reorder-list): given `L0 → L1 → … → Ln`, rearrange it in place to `L0 → Ln → L1 → Ln-1 → L2 → …`.

Insight: the target order is the first half interleaved with the *reversed* second half. That decomposes into the three primitives in order: split, reverse the second half, merge with alternation. Trace on `1 → 2 → 3 → 4 → 5`:

| Phase | Operation | State |
|---|---|---|
| Split | `slow` stops on 3 (fast starts at 2; 2 → 4 → null) | first `1 → 2 → 3`, second `4 → 5` |
| Reverse | reverse second | first `1 → 2 → 3`, second `5 → 4` |
| Merge, step 1 | take from first | `1`, first `2 → 3`, second `5 → 4` |
| Merge, step 2 | take from second | `1 → 5`, first `2 → 3`, second `4` |
| Merge, step 3 | take from first | `1 → 5 → 2`, first `3`, second `4` |
| Merge, step 4 | take from second | `1 → 5 → 2 → 4`, first `3`, second empty |
| Merge, end | append leftover | `1 → 5 → 2 → 4 → 3` |

```python
def reorder_list(head):
    if not head or not head.next:
        return
    first, second = split(head)
    second = reverse(second)
    a, b = first, second
    while b:                        # second is never longer than first
        an, bn = a.next, b.next
        a.next = b
        b.next = an
        a, b = an, bn
```

Because the split puts the extra node (odd length) in the first half, the second half is never longer, and the interleave can loop on `b` alone: when `b` runs out, `a` already points at its correct tail. Time O(n), space O(1), no dummy needed because the head never changes.

### Reverse Nodes in k-Group

[Reverse Nodes in k-Group](/practice/reverse-nodes-k-group): reverse every consecutive group of k nodes; a final group shorter than k stays as it is.

Insight: this is the reversal primitive applied to a bounded sublist, plus bookkeeping to splice each reversed group back between its neighbours. Three names keep it straight: `group_prev` (the node before the group, initially the dummy), `kth` (the last node of the group), and `group_next` (`kth.next`, the first node after the group). Reverse the k nodes with `prev` initialised to `group_next` instead of null, so the group's new tail already points at the rest of the list when the loop ends.

Trace with `1 → 2 → 3 → 4 → 5`, k = 2:

| Step | `group_prev` | `kth` | `group_next` | Action | List |
|---|---|---|---|---|---|
| 1 | dummy | 2 | 3 | reverse `1, 2` with prev = 3: `2 → 1 → 3` | `2 → 1 → 3 → 4 → 5` |
| 2 | 1 | 4 | 5 | reverse `3, 4` with prev = 5: `4 → 3 → 5` | `2 → 1 → 4 → 3 → 5` |
| 3 | 3 | none (only 1 node left) | | stop | `2 → 1 → 4 → 3 → 5` |

After each reversal, `group_prev.next` is set to the group's new head (the old `kth`) and `group_prev` becomes the group's old head (now its tail).

```python
def reverse_k_group(head, k):
    dummy = ListNode(0, head)
    group_prev = dummy
    while True:
        kth = group_prev
        for _ in range(k):
            kth = kth.next
            if not kth:
                return dummy.next        # fewer than k nodes remain
        group_next = kth.next
        prev, curr = group_next, group_prev.next
        while curr is not group_next:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        old_head = group_prev.next
        group_prev.next = kth
        group_prev = old_head
```

Time O(n): every node is visited once by the k-step lookahead and once by the reversal, so about 2n pointer moves. Space O(1). The dummy head earns its keep here because the very first group changes which node is the head of the whole list.

[Remove Nth Node From End](/practice/remove-nth-from-end) is the smaller cousin: dummy head, gap-of-n runner from the fast-slow lesson, then a single `slow.next = slow.next.next`. The dummy is what makes removing the actual head the same code path.

```viz
{"type": "linked-list", "algorithm": "remove-nth-from-end", "values": [1, 2, 3, 4, 5], "n": 2}
```

## The rest of the family

- **[Palindrome Linked List](/practice/palindrome-linked-list)**: split, reverse the second half, compare the halves node by node, then reverse the second half again and re-join so the caller's list is unchanged. Restoring the input is the detail that separates careful from correct.
- **[Add Two Numbers](/practice/add-two-numbers)**: digits stored least-significant first; walk both lists with a carry, building the result behind a dummy tail. The only trap is the final carry, which needs one more node after both inputs are exhausted.
- **[Copy List with Random Pointer](/practice/copy-random-list)**: the O(n)-space answer is a map from old node to new node. The O(1)-space answer interleaves each copy right after its original (`A → A' → B → B'`), sets `A'.random = A.random.next`, then unweaves the two lists. It is the same "save next before you rewire" discipline under more pressure.
- **[Merge k Sorted Lists](/practice/merge-k-sorted-lists)**: the merge primitive with a heap selecting the smallest head; the splice is identical to two-list merge. Covered in [k-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge).
- **[LRU Cache](/practice/lru-cache)**: a hash map into a doubly linked list, where "move to front" and "evict from back" are O(1) unlink/relink operations. Every pointer habit here applies, doubled. See [LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache).

## Variations

- **Reverse only a sublist** (positions left..right). Walk to the node before `left` with a dummy, reverse exactly `right - left + 1` nodes with the primitive, then reconnect: the old first node of the sublist becomes its tail and must point at `curr`, and the node before the sublist must point at `prev`. This is the exercise below.
- **Rotate the list by k.** Find the length and the tail in one pass, join the tail to the head to make a ring, walk `n - k mod n` steps from the head, cut there. Reduce `k` modulo `n` first, or you walk in circles.
- **Swap nodes in pairs.** k-group with k = 2, or written directly with a dummy and a three-node window `(prev, a, b)`: `prev.next = b; a.next = b.next; b.next = a; prev = a`.
- **Partition around a value.** Two dummies (`less`, `greater`), append each node to one of the two tails, then join `less_tail.next = greater_head` and set `greater_tail.next = None`. Forgetting to terminate the greater list creates a cycle.
- **Remove all nodes with a value.** Dummy head, single pointer `p` that stays on a kept node: `while p.next: if p.next.val == v: p.next = p.next.next else p = p.next`. Advance only when you did not delete.

## Pitfalls

- **Rewiring before saving.** `curr.next = prev` followed by `curr = curr.next` moves backwards and loses the remainder. The fix is mechanical: the first line of the loop body is `nxt = curr.next`.
- **Not cutting the list after a split.** If the first half still points into the second half, the interleave in Reorder List produces a cycle, and a later traversal never terminates. `slow.next = None` is not optional.
- **Missing the leftover in merge.** `tail.next = a or b` after the loop. Without it, the longer input's tail is dropped.
- **Special-casing the head instead of using a dummy.** It works, but it doubles the code paths and the interviewer sees two chances for an off-by-one instead of one.
- **Returning the wrong head.** After reversal the head is `prev`, not `head`; after a dummy-based build it is `dummy.next`. Say the return value before you write `return`.
- **Recursion on long lists.** Recursive reversal is O(n) stack; Python's default limit is around a thousand frames. Fine for an interview demonstration, wrong for a million-node list.
- **Losing a node in k-group's lookahead.** Count exactly k `.next` moves from `group_prev` and bail out on null before touching any pointer; touching pointers first and then discovering the group is short leaves a half-reversed tail.

## Exercise

```exercise
id: reverse-sublist-in-place
title: Reverse a sublist in place
prompt: |
  Given the head of a singly linked list and two 1-indexed positions
  `left <= right` (both within the list), reverse the nodes from position
  `left` to position `right` in place and return the head of the list.

  Do not create new nodes and do not change any node's value; move the
  nodes by rewiring `next` pointers. Use a dummy head so that `left == 1`
  is not a special case. The harness converts the returned list back to an
  array for comparison.
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
    expected: [1, 4, 3, 2, 5]
  - args: [{"$list": [5]}, 1, 1]
    expected: [5]
    label: single node
  - args: [{"$list": [1, 2, 3]}, 1, 3]
    expected: [3, 2, 1]
    label: whole list, head changes
  - args: [{"$list": [1, 2, 3, 4]}, 1, 2]
    expected: [2, 1, 3, 4]
  - args: [{"$list": [1, 2, 3, 4, 5, 6]}, 3, 6]
    expected: [1, 2, 6, 5, 4, 3]
    hidden: true
    label: sublist runs to the tail
  - args: [{"$list": [7, 8]}, 2, 2]
    expected: [7, 8]
    hidden: true
    label: left equals right, no change
hints:
  - "Walk a pointer `before` from the dummy exactly left - 1 steps; the sublist starts at before.next."
  - "Reverse exactly right - left + 1 nodes with the prev/curr/nxt loop; when it ends, curr is the first node after the sublist."
  - "Reconnect in two assignments: the old first node of the sublist (now its tail) gets next = curr, and before.next = prev."
```

## Senior signals

- You **draw the pointers** and name `prev`, `curr`, `nxt` before writing a loop, and your first line inside the loop saves `nxt`.
- You reach for a **dummy head** by default and can say exactly which special case it removes.
- You decompose a hard problem into **split, reverse, merge** out loud, and you know Reorder List and Palindrome List are the same three steps.
- You mention the **array fallback** and its O(n) memory, then do the in-place version, then say which you would ship and why (usually the array version, for cache locality and readability, unless memory is the point).
- You **restore the input** when the problem is a query (palindrome check), and you can state the invariant that proves reversal loses no node.
- You know recursive reversal is **O(n) stack** and would not use it in production on unbounded lists.

## Check yourself

```quiz
- q: >-
    In the reversal loop you write `curr.next = prev` and then `curr = curr.next`. What happens?
  options: ["The list reverses correctly", "curr moves backwards to prev and the unvisited remainder is lost", "A null pointer exception on the first iteration", "The list becomes a cycle"]
  answer: 1
  explanation: >-
    After rewiring, curr.next is prev, so curr steps back onto the already reversed part and nothing references the remainder any more. Save nxt = curr.next before rewiring.
- q: >-
    After splitting a list at its middle for Reorder List you forget `slow.next = None`. What does the interleave produce?
  options: ["A correct result, since the merge stops when the second half ends", "A list with duplicated nodes", "A cycle, because the first half still runs into the second half which now points back into the first", "An empty list"]
  answer: 2
  explanation: >-
    Without the cut, the first half's tail still points into the second half. Once the second half is reversed and spliced back, following the list eventually loops, and any later traversal never terminates.
- q: >-
    Why does the k-group solution initialise `prev` to `group_next` instead of `None` before reversing a group?
  options: ["To avoid a null check", "So the reversed group's tail already points at the rest of the list, removing a separate reconnect step", "Because groups are reversed from the back", "It is a style choice with no effect"]
  answer: 1
  explanation: >-
    The reversal primitive makes the first node point at prev. Seeding prev with the node after the group means the group's old head, which becomes its tail, links to the remainder as a side effect of the loop.
- q: >-
    Which statement about the dummy head is true?
  options: ["It costs O(n) extra space", "It removes the special case where the list's head changes or is removed", "It is only useful for doubly linked lists", "It makes reversal O(1)"]
  answer: 1
  explanation: >-
    A single sentinel node is O(1) space. It means operations that would otherwise need an `if node is head` branch, such as removing the first node or reversing a group that starts at the head, run through the general path.
- q: >-
    An interviewer asks you to sort a singly linked list with no space constraint. What is the senior answer?
  options: ["Bubble sort on the list, since swapping nodes is easy", "Copy the values into an array, sort, and write back or rebuild; note the O(n) memory and the cache advantage", "Recursive merge sort on the list, because in-place is always better", "Insert each node into a BST"]
  answer: 1
  explanation: >-
    With no space constraint the array route is simpler, faster on real hardware and easier to get right. Merge sort on the list is the answer once O(1) auxiliary space is required; saying when each applies is the point.
```
