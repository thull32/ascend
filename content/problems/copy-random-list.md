---
slug: copy-random-list
title: Copy List with Random Pointer
difficulty: medium
patterns: [linked-list]
lists: [ascend-150]
companies: [amazon, meta, microsoft, bloomberg]
order: 5
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "Copying `next` pointers is easy in one pass. The trouble is `random`: when you copy node A, the node that A.random points to may not have been copied yet. What would let you find 'the copy of X' for any original X?"
  - "A hash map from each original node to its copy. First pass: create every copy. Second pass: copy.next = map[orig.next], copy.random = map[orig.random]. That is O(n) time and O(n) extra space."
  - "For O(1) extra space, store the mapping inside the list: insert each copy directly after its original (A -> A' -> B -> B'). Then the copy of X is X.next, so A'.random = A.random.next. Finally unweave the two lists, restoring the original's next pointers."
signatures:
  python:
    name: copy_random_list
    starter: |
      class RandomNode:
          def __init__(self, val: int, next=None, random=None):
              self.val = val
              self.next = next
              self.random = random


      def copy_list(head):
          # YOUR CODE: return the head of a deep copy of the list that starts
          # at head. Every node of the copy must be a new RandomNode, and the
          # original list must be unchanged when you return.
          pass


      # ---- Test harness (provided; no need to change anything below) ----
      # Tests pass the list as [[val, random_index or None], ...]. The entry
      # point builds real nodes, calls copy_list, checks the copy shares no
      # node with the original and the original is intact, then encodes the
      # copy the same way.

      def build(nodes):
          made = [RandomNode(val) for val, _ in nodes]
          for i, (_, r) in enumerate(nodes):
              if i + 1 < len(made):
                  made[i].next = made[i + 1]
              if r is not None:
                  made[i].random = made[r]
          return made[0] if made else None


      def serialise(head):
          order, index = [], {}
          node = head
          while node is not None and id(node) not in index:
              index[id(node)] = len(order)
              order.append(node)
              node = node.next
          return [[n.val, None if n.random is None else index.get(id(n.random), -1)]
                  for n in order]


      def copy_random_list(nodes):
          original = build(nodes)
          originals = []
          node = original
          while node is not None:
              originals.append(node)
              node = node.next
          original_ids = {id(n) for n in originals}
          copied = copy_list(original)
          if serialise(original) != nodes:
              return "error: the original list was modified"
          node, steps = copied, 0
          while node is not None and steps <= len(nodes):
              if id(node) in original_ids or (
                  node.random is not None and id(node.random) in original_ids
              ):
                  return "error: the copy shares nodes with the original"
              node, steps = node.next, steps + 1
          return serialise(copied)
  javascript:
    name: copy_random_list
    starter: |
      class RandomNode {
        constructor(val, next = null, random = null) {
          this.val = val;
          this.next = next;
          this.random = random;
        }
      }

      function copy_list(head) {
        // YOUR CODE: return the head of a deep copy of the list that starts
        // at head. Every node of the copy must be a new RandomNode, and the
        // original list must be unchanged when you return.
      }

      // ---- Test harness (provided; no need to change anything below) ----
      // Tests pass the list as [[val, randomIndex or null], ...]. The entry
      // point builds real nodes, calls copy_list, checks the copy shares no
      // node with the original and the original is intact, then encodes the
      // copy the same way.

      function build(nodes) {
        const made = nodes.map(([val]) => new RandomNode(val));
        nodes.forEach(([, r], i) => {
          if (i + 1 < made.length) made[i].next = made[i + 1];
          if (r !== null) made[i].random = made[r];
        });
        return made.length ? made[0] : null;
      }

      function serialise(head) {
        const order = [];
        const index = new Map();
        for (let node = head; node && !index.has(node); node = node.next) {
          index.set(node, order.length);
          order.push(node);
        }
        return order.map((n) => [
          n.val,
          n.random == null ? null : index.has(n.random) ? index.get(n.random) : -1,
        ]);
      }

      function copy_random_list(nodes) {
        const original = build(nodes);
        const originals = new Set();
        for (let node = original; node; node = node.next) originals.add(node);
        const copied = copy_list(original);
        if (JSON.stringify(serialise(original)) !== JSON.stringify(nodes)) {
          return "error: the original list was modified";
        }
        let steps = 0;
        for (let node = copied; node && steps <= nodes.length; node = node.next, steps++) {
          if (originals.has(node) || (node.random && originals.has(node.random))) {
            return "error: the copy shares nodes with the original";
          }
        }
        return serialise(copied);
      }
tests:
  - args: [[[3, null], [8, 0], [5, 3], [2, 1]]]
    expected: [[3, null], [8, 0], [5, 3], [2, 1]]
  - args: [[]]
    expected: []
    label: empty list
  - args: [[[1, null]]]
    expected: [[1, null]]
    label: single node, no random
  - args: [[[1, 0]]]
    expected: [[1, 0]]
    label: random points to itself
  - args: [[[4, 1], [4, 0]]]
    expected: [[4, 1], [4, 0]]
    label: duplicate values, crossed randoms
  - args: [[[1, 2], [2, 2], [3, 2]]]
    expected: [[1, 2], [2, 2], [3, 2]]
    label: every random points to the tail
  - args: [[[5, null], [5, null], [5, null]]]
    expected: [[5, null], [5, null], [5, null]]
    hidden: true
    label: identical values, no randoms
  - args: [[[9, 4], [8, 3], [7, 2], [6, 1], [5, 0]]]
    expected: [[9, 4], [8, 3], [7, 2], [6, 1], [5, 0]]
    hidden: true
    label: randoms mirror the list
  - args: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]]
    expected: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]
    hidden: true
    label: every random points to the head
  - args: [[[-1, 3], [0, null], [1, 1], [2, 3]]]
    expected: [[-1, 3], [0, null], [1, 1], [2, 3]]
    hidden: true
    label: mixed nulls, forward, backward and self
time_limit_ms: 4000
---
A singly linked list has an extra pointer in every node: besides `next`, each node has `random`, which points to **any node in the list** (including itself) or to nothing. Write `copy_list(head)`, which returns a **deep copy** of the list: a brand-new set of nodes with the same values, where each copy's `next` and `random` point to the corresponding *copies*, never to original nodes. The original list must be unchanged when you return.

### How the tests describe a list

The test harness has no built-in encoding for random pointers, so this problem ships its own. A list is written as `[[val, random_index], …]`, one pair per node in `next` order, where `random_index` is the 0-based position of the node that `random` points to, or `null` for none.

The starter code gives you a `RandomNode` class and an entry point, `copy_random_list(nodes)`, that you do not need to change. It:

1. builds the original linked list from `nodes`,
2. calls **your** `copy_list(head)`,
3. checks that the original still encodes to exactly `nodes` (so you restored anything you modified) and that no node reachable in your copy, via `next` or `random`, is an original node,
4. returns your copy encoded in the same `[[val, random_index], …]` format, or an `"error: …"` string if a check failed.

A correct deep copy therefore returns the same encoding it was given. Returning the original head, or a copy whose `random` pointers lead back into the original, fails the test even though the values look right.

### Examples

| `nodes` | Returns | Why |
|---|---|---|
| `[[3, null], [8, 0], [5, 3], [2, 1]]` | `[[3, null], [8, 0], [5, 3], [2, 1]]` | Node 1's random is node 0, node 2's is node 3, node 3's is node 1; the copy has the same shape |
| `[[4, 1], [4, 0]]` | `[[4, 1], [4, 0]]` | Values repeat, so a copy cannot find its random target by value; it must follow node identity |
| `[]` | `[]` | An empty list copies to an empty list |

### Constraints

- `0 ≤ number of nodes ≤ 1000`
- `-10⁴ ≤ val ≤ 10⁴`
- Every `random_index` is `null` or a valid position in the list.

### Follow-up

The interviewer asks: "Do it in `O(1)` extra space, not counting the copy itself." Then: "The structure is now an arbitrary graph of objects with references, such as a document with shared sub-objects. How does your approach generalise?"

## Solution

### The naive approach

Copy the `next` chain first. Then, for each original node, find the *position* of its `random` target by walking from the head, and walk the copy to the same position. Each lookup is `O(n)`, so the whole thing is `O(n²)`. It works, but it is the solution you describe only to show why a mapping is needed.

Mapping by *value* instead of position is faster but wrong: with duplicate values (`[[4, 1], [4, 0]]`) two different originals collapse onto one key.

### The insight

The problem is entirely about one question: **"given an original node X, where is its copy?"** Answer that in `O(1)` and every pointer can be translated. There are two ways to store the answer.

1. A hash map `original → copy`, keyed by node identity. `O(n)` extra space.
2. The list itself. If each copy sits immediately after its original (`A → A' → B → B' → …`), then the copy of X is simply `X.next`. That costs no extra space; you just have to undo the weaving afterwards.

### The hash map approach

```python
def copy_list_with_map(head):
    if head is None:
        return None
    clone = {}
    node = head
    while node:                               # pass 1: create every copy
        clone[node] = RandomNode(node.val)
        node = node.next
    node = head
    while node:                               # pass 2: translate the pointers
        clone[node].next = clone.get(node.next)
        clone[node].random = clone.get(node.random)
        node = node.next
    return clone[head]
```

Python objects hash by identity unless their class overrides `__eq__`, so `clone` is keyed by node, not by value. `clone.get(None)` returns `None`, which handles both the tail's `next` and null randoms. Time `O(n)`, space `O(n)`.

### The optimal approach: weave, link, unweave

```python
def copy_list(head):
    if head is None:
        return None
    # 1. Weave: put each copy right after its original. A -> A' -> B -> B' -> ...
    node = head
    while node:
        node.next = RandomNode(node.val, node.next)
        node = node.next.next
    # 2. Link randoms: the copy of X.random is X.random.next.
    node = head
    while node:
        if node.random is not None:
            node.next.random = node.random.next
        node = node.next.next
    # 3. Unweave: restore the original next pointers and thread the copies.
    copy_head = head.next
    node = head
    while node:
        copy = node.next
        node.next = copy.next
        copy.next = copy.next.next if copy.next else None
        node = node.next
    return copy_head
```

Trace `[[4, 1], [4, 0]]` (call the originals A and B, with `A.random = B`, `B.random = A`):

- After weaving: `A → A' → B → B'`.
- Linking: `A'.random = A.random.next = B.next = B'`, and `B'.random = B.random.next = A.next = A'`.
- Unweaving: `A.next = B`, `A'.next = B'`, `B.next = None`, `B'.next = None`.

The copy is `A' → B'` with crossed randoms, the original is back to `A → B`, and the harness sees `[[4, 1], [4, 0]]`.

Time `O(n)`: three linear passes. Extra space `O(1)` beyond the `n` new nodes, which are the output.

Step 2 must finish completely before step 3 starts. If you unweave while still linking randoms, a later node's `random.next` may already point to the next *original* instead of the copy.

### Common mistakes

- Setting `copy.random = original.random`. The values look right, but the copy points back into the original list; the harness reports shared nodes. This is the classic shallow-copy bug.
- Keying the map by `val`. Fails as soon as values repeat.
- Forgetting to restore the original in the weaving approach. The copy may be perfect, but the caller's list now contains your nodes; the harness reports that the original was modified.
- Dereferencing `node.random.next` without checking `node.random` for `None`.

### How to discuss it

Say "the whole problem is mapping each original to its copy" and give the hash map solution first; it is short, obviously correct, and what most production code would use. Then offer the weaving trick for `O(1)` extra space, and be explicit that it temporarily mutates the input, which matters if another thread might be reading the list, or if the input is immutable. That trade-off (less memory, but a destructive intermediate state) is exactly the kind of thing a senior engineer calls out. For the object-graph follow-up, the hash map version generalises directly: it is the same as [Clone Graph](/practice/clone-graph), a DFS or BFS with a `visited` map from original to copy, and it is how `copy.deepcopy` in Python handles shared references and cycles (its `memo` dictionary). The weaving trick does not generalise, because it relies on every node having exactly one `next` slot to borrow.

### The harness, for reference

The validator runs the reference solution through the same entry point as the starter. These are the helpers from the starter code, unchanged:

```python
class RandomNode:
    def __init__(self, val: int, next=None, random=None):
        self.val = val
        self.next = next
        self.random = random


def build(nodes):
    made = [RandomNode(val) for val, _ in nodes]
    for i, (_, r) in enumerate(nodes):
        if i + 1 < len(made):
            made[i].next = made[i + 1]
        if r is not None:
            made[i].random = made[r]
    return made[0] if made else None


def serialise(head):
    order, index = [], {}
    node = head
    while node is not None and id(node) not in index:
        index[id(node)] = len(order)
        order.append(node)
        node = node.next
    return [[n.val, None if n.random is None else index.get(id(n.random), -1)]
            for n in order]


def copy_random_list(nodes):
    original = build(nodes)
    originals = []
    node = original
    while node is not None:
        originals.append(node)
        node = node.next
    original_ids = {id(n) for n in originals}
    copied = copy_list(original)
    if serialise(original) != nodes:
        return "error: the original list was modified"
    node, steps = copied, 0
    while node is not None and steps <= len(nodes):
        if id(node) in original_ids or (
            node.random is not None and id(node.random) in original_ids
        ):
            return "error: the copy shares nodes with the original"
        node, steps = node.next, steps + 1
    return serialise(copied)
```
