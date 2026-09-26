---
slug: avl-trees
title: "AVL trees: balance factors and rotations"
description: How AVL trees keep a BST within 1.45 log n of perfect height using balance factors and four rotation cases, with insert and delete traced step by step and an honest comparison with red-black trees.
minutes: 40
difficulty: medium
tags: [avl, balanced-bst, rotations, trees, ordered-map]
problems: [validate-bst, balanced-binary-tree, kth-smallest-bst]
---
Insert the keys 1, 2, 3, … 1,000,000 into a plain binary search tree and you get a linked list a million nodes long. Every lookup walks it: O(n), not O(log n). The same thing happens with any input that arrives roughly sorted, which is most real input (timestamps, auto-increment IDs, log lines). A BST only delivers its promised cost when its height is O(log n), and nothing in the plain insert algorithm guarantees that.

An AVL tree is the oldest fix (Adelson-Velsky and Landis, 1962) and the strictest: after every insert or delete it checks whether any node's two subtrees differ in height by more than one and, if so, repairs it with a constant number of local pointer moves called rotations. The height stays under 1.45 log₂ n no matter what order the keys arrive in.

## The invariant and what it buys you

For every node, define the **balance factor** as `height(left) − height(right)`. The AVL invariant is that every node's balance factor is −1, 0 or +1. Nothing more.

Why does that small rule bound the height? Ask the opposite question: what is the *fewest* nodes an AVL tree of height `h` can have? Call it `N(h)`. The sparsest tree of height `h` has one subtree of height `h−1` and the other as short as the rule allows, `h−2`, so:

```text
N(h) = N(h−1) + N(h−2) + 1,   N(0) = 1, N(1) = 2
N(2) = 4, N(3) = 7, N(4) = 12, N(5) = 20, N(6) = 33, N(7) = 54, N(8) = 88
```

That is the Fibonacci recurrence with an extra 1, so `N(h)` grows like `φ^h` with `φ ≈ 1.618`. Inverting, `h ≤ log_φ(n) ≈ 1.44 log₂ n`. A perfect binary tree has height `log₂ n`; an AVL tree is at most 44% taller, so a lookup does at most 44% more comparisons than the theoretical best. For a million keys that is a height of at most 28 instead of 20. A plain BST could be a million.

## Rotations: the only tool

A rotation is a local rewrite of two nodes and three subtrees that preserves the in-order sequence (so the tree is still a valid BST) while moving one node up and the other down.

```text
Right rotation at y:            Left rotation at x:

      y                x              x                 y
     / \              / \            / \               / \
    x   C    ==>     A   y          A   y     ==>     x   C
   / \                  / \            / \           / \
  A   B                B   C          B   C         A   B
```

In-order before and after is `A x B y C` in both pictures. The only pointers that change are `y.left`, `x.right` and the parent's link. That is O(1) work.

```python
def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update_height(y)      # y is now lower, fix it first
    update_height(x)
    return x              # new root of this subtree

def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update_height(x)
    update_height(y)
    return y
```

The order of the two `update_height` calls matters: the node that moved down must be recomputed before the node that moved up, because the upper node's height depends on it.

## The four insertion cases

After inserting a leaf, walk back up the path. The first node whose balance factor becomes ±2 is the lowest unbalanced node, call it `z`. Exactly four shapes are possible, named by the path from `z` to the inserted key.

| Case | Shape | `balance(z)` | Fix |
|---|---|---|---|
| **LL** | new key in `z.left.left` | +2, `balance(z.left) ≥ 0` | one right rotation at `z` |
| **RR** | new key in `z.right.right` | −2, `balance(z.right) ≤ 0` | one left rotation at `z` |
| **LR** | new key in `z.left.right` | +2, `balance(z.left) < 0` | left rotation at `z.left`, then right rotation at `z` |
| **RL** | new key in `z.right.left` | −2, `balance(z.right) > 0` | right rotation at `z.right`, then left rotation at `z` |

Trace the four with three keys each. Insert 10, 20, 30: 30 goes to `20.right`, so 10 has balance −2 and its right child has balance −1. RR. Left-rotate at 10 and 20 is the root with 10 and 30 as children. Insert 30, 20, 10: the mirror, LL, one right rotation, same result. Insert 10, 30, 20: 20 lands at `30.left`, so 10 has balance −2 but its right child 30 has balance +1. That is RL, and a single left rotation at 10 would *not* fix it (try it: 30 becomes root with 10 on its left and 20 still hanging off 10's right, height unchanged). Right-rotate at 30 first, which turns the shape into RR, then left-rotate at 10. The final tree is again 20 with children 10 and 30.

The double rotation is the part people get wrong under pressure. The rule to remember: if the heavy child leans the *same* way as its parent, one rotation; if it leans the *opposite* way, straighten the child first.

Watch the animation insert a sequence that triggers a single rotation, then a double rotation at the root:

```viz
{"type": "tree", "algorithm": "avl-insert", "values": [10, 20, 30, 40, 50, 25],
 "title": "AVL insert with RR then RL rebalancing",
 "caption": "Inserting 30 triggers an RR rotation at 10; inserting 50 triggers RR at 30; inserting 25 triggers an RL double rotation at the root."}
```

Trace the last step by hand. Before inserting 25 the tree is `20 → (10, 40 → (30, 50))`. 25 goes under 30's left. Now 30 has height 2, 40 has height 3 with balance +1, and the root 20 has balance 1 − 3 = −2 with a right child leaning left. RL: right-rotate at 40 (30 comes up, 40 goes to its right with 50) and left-rotate at 20. The root is 30, with 20 → (10, 25) on the left and 40 → (·, 50) on the right. Level order: `30, 20, 40, 10, 25, 50`. Height 3 for six nodes, which is optimal.

## Insert, in full

```python
class Node:
    __slots__ = ("key", "left", "right", "height")
    def __init__(self, key):
        self.key, self.left, self.right, self.height = key, None, None, 1

def height(n):
    return n.height if n else 0

def update_height(n):
    n.height = 1 + max(height(n.left), height(n.right))

def balance(n):
    return height(n.left) - height(n.right) if n else 0

def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    else:
        return node                       # duplicates ignored
    update_height(node)
    b = balance(node)
    if b > 1 and balance(node.left) >= 0:   # LL
        return rotate_right(node)
    if b > 1:                               # LR
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if b < -1 and balance(node.right) <= 0: # RR
        return rotate_left(node)
    if b < -1:                              # RL
        node.right = rotate_right(node.right)
        return rotate_left(node)
    return node
```

Two facts about this code that interviewers probe:

**Insert needs at most one rebalancing.** After a rotation (single or double) at the lowest unbalanced node, that subtree's height returns to what it was before the insert, so no ancestor can be unbalanced. Insert is O(log n) to walk down and O(log n) to update heights on the way up, but only O(1) rotations.

**The recursion is the parent pointer.** Returning the possibly-new subtree root from every call is how the parent's link gets updated without storing parent pointers. An iterative version needs either parent pointers or an explicit stack of the path.

## Delete

Delete in a BST has three cases: leaf (unlink), one child (splice), two children (replace the key with the in-order successor, then delete the successor from the right subtree). AVL delete is the same followed by rebalancing on the way back up, with one important difference from insert.

```python
def delete(node, key):
    if node is None:
        return None
    if key < node.key:
        node.left = delete(node.left, key)
    elif key > node.key:
        node.right = delete(node.right, key)
    else:
        if node.left is None or node.right is None:
            return node.left or node.right
        succ = node.right
        while succ.left:
            succ = succ.left
        node.key = succ.key
        node.right = delete(node.right, succ.key)
    update_height(node)
    return rebalance(node)      # same four cases as insert
```

The difference: **delete may need a rotation at every level.** Removing a node from the shorter subtree can shrink that subtree's height, which can unbalance the parent, and fixing the parent can shrink *its* height by one, which unbalances the grandparent, and so on to the root. Worst case O(log n) rotations, still O(log n) total, but a materially more expensive operation than insert. That asymmetry is one of the reasons red-black trees exist.

There is also a subtle case in delete that does not occur in insert: the heavy child can have balance factor 0. For the LL check, `balance(node.left) >= 0` (not `> 0`) handles it; a single rotation is correct there. Several published AVL implementations get this wrong and silently violate the invariant.

## AVL versus red-black

Both give O(log n) worst-case for everything. The difference is how tight the balance is and what that costs on writes.

| | AVL | Red-black |
|---|---|---|
| Height bound | ≤ 1.44 log₂ n | ≤ 2 log₂ n |
| Rotations per insert | ≤ 1 (single or double) | ≤ 2 |
| Rotations per delete | O(log n) | ≤ 3 |
| Per-node overhead | height (a byte) or balance (2 bits) | colour (1 bit, often stolen from a pointer) |
| Best fit | Lookup-heavy, rarely modified | Insert/delete-heavy, general-purpose |

AVL trees are shorter, so lookups touch fewer nodes. Red-black trees rotate less on delete and their rebalancing is cheaper in the average case, which is why `std::map`, Java's `TreeMap`, and the Linux kernel's `rb_tree` (used for the CFS scheduler run queue, I/O schedulers, and for years the process address-space map) all chose red-black. The honest summary: for a workload that is 95% reads the AVL tree wins by a few percent; for anything write-heavy the red-black tree wins by more. In practice both lose to a [B-tree](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) once the data is bigger than the CPU cache, because a B-tree node fills a cache line or a disk page instead of chasing a pointer per key.

The [next lesson](/learn/advanced-data-structures/balanced-trees/red-black-trees) covers why red-black rebalancing is cheaper. For now the key idea is that AVL is the one to *understand*; its four cases are the vocabulary every other balanced tree is described in.

## Where AVL trees show up

Honest answer: rarely in standard libraries, which went red-black or B-tree. You meet AVL trees in three places.

1. **Interviews.** Rotations are asked about because they are the cleanest test of whether you can reason about a pointer structure under an invariant. "Insert 1..7 and draw the tree" is a real question; the answer is the perfect tree `4 → (2 → (1, 3), 6 → (5, 7))`.
2. **Read-mostly in-memory indexes** in systems written before B-trees became the default for memory, and in functional languages: Haskell's `Data.Map` uses a weight-balanced tree, a cousin that balances on subtree *size* rather than height.
3. **As a mental model.** When you read that a database's in-memory index or a runtime's interval tree is "a balanced BST", the operations and costs are the AVL ones.

## Exercise

```exercise
id: avl-level-order
title: Build an AVL tree and return its level order
prompt: |
  Implement `avl_level_order(values)`: insert the distinct integers in
  `values` one at a time into an initially empty AVL tree, rebalancing after
  each insert with the four rotation cases, and return the final tree's keys
  in level order (breadth-first, left to right).

  Balance factor is `height(left) − height(right)`; a leaf has height 1. Use
  `>=`/`<=` on the child's balance for the single-rotation cases.
languages: [python, javascript]
entry: avl_level_order
starter:
  python: |
    class Node:
        def __init__(self, key):
            self.key = key
            self.left = None
            self.right = None
            self.height = 1

    def height(n):
        return n.height if n else 0

    def insert(node, key):
        # TODO: BST insert, update height, then rebalance (LL, LR, RR, RL)
        return node

    def avl_level_order(values):
        root = None
        for v in values:
            root = insert(root, v)
        # TODO: breadth-first traversal of root
        return []
  javascript: |
    class Node {
      constructor(key) { this.key = key; this.left = null; this.right = null; this.height = 1; }
    }
    function height(n) { return n ? n.height : 0; }

    function insert(node, key) {
      // TODO: BST insert, update height, then rebalance (LL, LR, RR, RL)
      return node;
    }

    function avl_level_order(values) {
      let root = null;
      for (const v of values) root = insert(root, v);
      // TODO: breadth-first traversal of root
      return [];
    }
tests:
  - args: [[10, 20, 30]]
    expected: [20, 10, 30]
    label: RR single rotation
  - args: [[30, 20, 10]]
    expected: [20, 10, 30]
    label: LL single rotation
  - args: [[10, 30, 20]]
    expected: [20, 10, 30]
    label: RL double rotation
  - args: [[30, 10, 20]]
    expected: [20, 10, 30]
    label: LR double rotation
  - args: [[1, 2, 3, 4, 5, 6, 7]]
    expected: [4, 2, 6, 1, 3, 5, 7]
    label: sorted input becomes a perfect tree
  - args: [[]]
    expected: []
    label: empty
  - args: [[10, 20, 30, 40, 50, 25]]
    expected: [30, 20, 40, 10, 25, 50]
    hidden: true
    label: RL at the root after earlier rotations
  - args: [[50, 40, 60, 30, 45, 20]]
    expected: [40, 30, 50, 20, 45, 60]
    hidden: true
    label: LL at the root with a full sibling
hints:
  - "Return the (possibly new) subtree root from `insert` and assign it back: `node.left = insert(node.left, key)`."
  - "After a rotation recompute the height of the node that moved down before the node that moved up."
  - "For the double rotation cases, rotate the child first so the shape becomes the single-rotation case, then rotate the node."
```

## Senior signals

- You state the AVL invariant as a **balance-factor rule** and can derive the 1.44 log n height bound from the Fibonacci recurrence, not just quote it.
- You know the four cases by shape and the rule for choosing single versus double rotation: same direction, one rotation; opposite direction, two.
- You know that insert needs **at most one** rebalancing but delete can need **O(log n) rotations**, and that this asymmetry is why libraries chose red-black.
- You say out loud that AVL is rarely deployed and that for anything larger than cache a B-tree beats both AVL and red-black, and you can say why (fan-out per memory access).
- You check the `balance(child) == 0` edge case in delete and know it is a common published bug.
- In an interview you offer "a balanced BST such as AVL or red-black, O(log n) per operation" as the ordered-map tool, then immediately ask whether a sorted array plus binary search or a hash map would do, because those are cheaper when they fit.

## Check yourself

```quiz
- q: >-
    An AVL tree has 1,000,000 keys. Which statement about its height h is guaranteed?
  options: ["h is exactly 20", "h is at most about 29", "h is at most 40", "h could be up to 1,000,000 if keys arrive sorted"]
  answer: 1
  explanation: >-
    The AVL bound is h ≤ 1.44 log₂ n ≈ 1.44 × 19.93 ≈ 28.7, so at most 28 or 29. A perfect tree would be 20 but AVL does not guarantee perfection; 40 is the red-black bound; a million is the unbalanced BST worst case that AVL exists to prevent.
- q: >-
    After inserting a key, the lowest unbalanced node z has balance −2 and z.right has balance +1. What fixes it?
  options: ["A single left rotation at z", "A single right rotation at z", "A right rotation at z.right followed by a left rotation at z", "A left rotation at z.right followed by a right rotation at z"]
  answer: 2
  explanation: >-
    Balance −2 means right-heavy; the right child leaning left (+1) is the RL case. A single left rotation leaves the height unchanged. Straighten the child with a right rotation first, then left-rotate at z.
- q: >-
    Why can an AVL delete cost O(log n) rotations while an insert needs at most one rebalancing?
  options: ["Delete must also rebalance the successor's subtree separately", "A rotation after delete can shrink the subtree height by one, which may unbalance the next ancestor; after insert the rotation restores the original height", "Delete rotations are more expensive because they touch four nodes", "Insert never changes heights above the new leaf"]
  answer: 1
  explanation: >-
    After an insert, the rebalanced subtree has the same height it had before the insert, so ancestors are unaffected. After a delete, fixing one node can leave its subtree one shorter, propagating the imbalance upwards.
- q: >-
    You insert the keys 1 through 7 in order into an AVL tree. What is the root?
  options: ["1", "4", "7", "It depends on tie-breaking in the rotations"]
  answer: 1
  explanation: >-
    Sorted input triggers RR rotations at 1 (after 3), at 3 (after 5), at 2 (after 6), and at 5 (after 7), producing the perfect tree 4 → (2 → (1, 3), 6 → (5, 7)). The result is deterministic.
- q: >-
    A service keeps 50 million timestamped events in memory and does range queries constantly, with occasional inserts. A colleague proposes an AVL tree. What is the strongest objection?
  options: ["AVL trees cannot do range queries", "An in-memory B-tree does the same job with far fewer cache misses per lookup because each node holds many keys", "Red-black trees would be faster for reads", "AVL trees use too much memory for the height field"]
  answer: 1
  explanation: >-
    Every AVL level costs a pointer dereference and probably a cache miss, about 26 of them for 50 million keys. A B-tree with 64-key nodes needs about 5. Range queries work fine on any BST via in-order traversal; red-black trees are slightly taller, not faster, for reads.
```
