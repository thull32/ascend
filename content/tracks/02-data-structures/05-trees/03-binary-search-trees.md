---
slug: binary-search-trees
title: "Binary search trees: the invariant and what breaks it"
description: Search, insert and the three-case delete, why inorder is sorted, how to validate a BST without the classic bug, and why sorted input turns O(log n) into O(n).
minutes: 40
difficulty: medium
tags: [trees, bst, binary-search-tree, validation, deletion]
problems: [validate-bst, lowest-common-ancestor-bst, kth-smallest-bst]
---
A hash table finds a key in O(1) but cannot tell you the smallest key, the next key after 42, or every key between 100 and 200. A sorted array answers all of those with binary search but costs O(n) to insert into. You want both: ordered queries *and* cheap updates. The binary search tree is the structure that gives you both at O(h), and the entire engineering question is what `h` turns out to be.

## The invariant

A binary search tree is a binary tree where, for every node, every key in its left subtree is smaller than the node's key and every key in its right subtree is larger. Not just the children: the *entire* subtrees. That distinction is the source of the most common BST bug and it comes up again below.

```text
          8
        /   \
       3     10
      / \      \
     1   6      14
        / \     /
       4   7   13
```

Because of the invariant, an inorder traversal (left, node, right) visits keys in ascending order: 1 3 4 6 7 8 10 13 14. That single fact gives you sorted iteration, min and max (leftmost and rightmost node), k-th smallest (k-th visited), successor and predecessor, and range queries, all for free.

Duplicates need a policy. The cleanest for interviews is to forbid them and say so. Real implementations either store a count per node or send equal keys consistently to one side (usually right), and a multimap in C++ or a `TreeMap<K, List<V>>` in Java pushes the problem to the value.

## Search and insert

Search compares the target with the current node and goes left or right, discarding half the remaining tree each step *if the tree is balanced*.

```python
def search(node, key):
    while node is not None and node.val != key:
        node = node.left if key < node.val else node.right
    return node          # None if absent
```

Insert is the same walk, followed by attaching a new leaf where the search fell off the tree. New keys always become leaves; the existing structure is never rearranged.

```python
def insert(node, key):
    if node is None:
        return BTNode(key)
    if key < node.val:
        node.left = insert(node.left, key)
    elif key > node.val:
        node.right = insert(node.right, key)
    return node          # duplicate: ignored
```

The recursive form returns the (possibly new) subtree root and the parent reassigns its child pointer; that pattern ("return the new subtree root") is the standard way to write tree mutations without parent pointers, and delete uses it too.

Watch the same nine keys go in and note that the *insertion order* determines the shape: the first key becomes the root forever.

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13],
 "title": "Building a BST by insertion", "caption": "Each key walks down from the root and becomes a new leaf. The shape is decided by the order the keys arrive."}
```

## Delete: the three cases

Deletion is where BST code gets hard, because removing an internal node leaves a hole that must be filled without breaking the invariant. Find the node, then:

1. **Leaf.** Remove it; set the parent's pointer to null.
2. **One child.** Splice it out: the parent points at the child instead. The invariant holds because the child's whole subtree was already on the correct side of the parent.
3. **Two children.** You cannot remove the node without orphaning a subtree, so replace its *value* with the in-order successor (the minimum of the right subtree), then delete that successor node from the right subtree. The successor has no left child by definition, so that second deletion is case 1 or 2, never case 3 again.

```python
def delete(node, key):
    if node is None:
        return None
    if key < node.val:
        node.left = delete(node.left, key)
    elif key > node.val:
        node.right = delete(node.right, key)
    else:
        if node.left is None:  return node.right        # cases 1 and 2
        if node.right is None: return node.left
        succ = node.right                                # case 3
        while succ.left is not None:
            succ = succ.left
        node.val = succ.val
        node.right = delete(node.right, succ.val)
    return node
```

Trace deleting 3 from the tree above. 3 has two children, so find the minimum of its right subtree: 6, then 4, which has no left child; the successor is 4. Overwrite 3 with 4, then delete 4 from the subtree rooted at 6. 4 is a leaf, so 6's left becomes null. Result: 8 → (4 → (1, 6 → (·, 7)), 10). Inorder: 1 4 6 7 8 10 13 14, still sorted.

You could equally use the in-order *predecessor* (max of the left subtree); alternating between them keeps the tree slightly better balanced under heavy deletion, which Knuth analysed and which almost nobody implements.

```viz
{"type": "tree", "algorithm": "bst-delete", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13], "target": 3,
 "title": "Deleting a node with two children", "caption": "The in-order successor (leftmost node of the right subtree) replaces the deleted value, then is itself removed from where it sat."}
```

Cost: O(h) for the search plus O(h) for the successor walk, so O(h) overall.

## Validation: the bug everyone writes first

"Is this tree a valid BST?" is asked constantly because the obvious solution is wrong. The obvious solution checks each node against its children:

```python
def is_bst_wrong(node):
    if node is None:
        return True
    if node.left and node.left.val >= node.val:  return False
    if node.right and node.right.val <= node.val: return False
    return is_bst_wrong(node.left) and is_bst_wrong(node.right)
```

It accepts this tree:

```text
      10
     /  \
    5    15
        /  \
       6    20
```

Every parent-child pair is consistent, but 6 sits in the right subtree of 10 and is smaller than 10. Search for 6 would go right at 10, left at 15, and find it, so it seems to work; but search for 7 goes right at 10, left at 15, right at 6, and fails even though the ordering "should" put 7 there. Worse, an inorder traversal gives 5 10 6 15 20, not sorted.

The correct condition is the invariant as stated: every node must lie within the range established by *all* its ancestors. Pass the range down:

```python
def is_bst(node, lo=float("-inf"), hi=float("inf")):
    if node is None:
        return True
    if not (lo < node.val < hi):
        return False
    return is_bst(node.left, lo, node.val) and is_bst(node.right, node.val, hi)
```

Going left tightens the upper bound to the current value; going right tightens the lower bound. At node 6 the range is (10, 15), 6 fails, done. The alternative is an inorder traversal checking that each value is strictly greater than the previous; both are O(n).

Two follow-ups a senior interviewer will add. First, "what if values can equal the 32-bit integer limits?": using sentinels like `-2³¹ − 1` breaks; use `None` for "no bound" or the language's infinities. Second, "what if duplicates are allowed on the right?": the left check stays strict and the right check becomes `>=`.

```viz
{"type": "tree", "algorithm": "validate-bst", "values": [10, 5, 15, 6, 20],
 "title": "Validating with ancestor bounds", "caption": "The visualiser inserts the values as a BST, then checks each node against the (lo, hi) range inherited from its ancestors."}
```

## The degenerate tree

Everything above is O(h). Insert the keys 1, 2, 3, …, n in order and every key is larger than everything before it, so every insertion goes right: the tree is a chain of height n − 1. Search, insert and delete are now O(n), and recursion on it overflows the stack.

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [1, 2, 3, 4, 5, 6, 7],
 "title": "Sorted input builds a chain", "caption": "Each new key is the largest so far, so it always goes right. Height is n - 1 and every operation degrades to O(n)."}
```

This is not a contrived case. Auto-incrementing IDs, timestamps, log lines, sorted exports and anything already ordered by the producer will do this to a naive BST. For random insertion order, the expected height is about 2 ln n ≈ 1.39 log₂ n, comfortably logarithmic; but production data is rarely random, and a BST whose performance depends on the order clients happen to send keys is a latent incident.

There are three responses: shuffle the input before bulk-loading (only works offline), build from a sorted array by recursively picking the middle element (perfectly balanced, O(n), also only offline), or use a self-balancing tree that restructures on every insert and delete, which is the [next lesson](/learn/data-structures/trees/balanced-trees). Every standard library ordered map (`std::map`, `TreeMap`, `BTreeMap`) is self-balancing; nobody ships a plain BST.

## Ordered operations the hash table cannot do

Given the invariant, each of these is a short walk:

| Query | Method | Cost |
|---|---|---|
| min / max | Leftmost / rightmost node | O(h) |
| floor(x): largest key ≤ x | Walk down; record the node each time you go right | O(h) |
| ceiling(x): smallest key ≥ x | Walk down; record the node each time you go left | O(h) |
| successor of a node | Min of right subtree, else nearest ancestor you are in the left subtree of | O(h) |
| k-th smallest | Inorder, stop after k; or store subtree sizes and navigate | O(h + k), or O(h) with sizes |
| range [a, b] | Inorder, prune subtrees entirely outside the range | O(h + output) |

The subtree-size augmentation deserves a sentence: store `size` in each node and maintain it on insert and delete. Then "k-th smallest" becomes a descent: if the left subtree has `s` nodes, the answer is in the left subtree if k ≤ s, is the node if k = s + 1, and is the (k − s − 1)-th of the right subtree otherwise. This is an **order-statistic tree**, and it is what "rank of this element" and "count of elements less than x" queries want. Interviewers ask for it as a follow-up to `kth-smallest-bst`: "now the tree is modified frequently and you need k-th smallest repeatedly".

## In real systems

Ordered maps in standard libraries are red-black trees (C++, Java, Linux kernel) or B-trees (Rust's `BTreeMap`, which uses a fan-out of about 11 to stay cache-friendly). Databases use B+-trees, which are search trees with hundreds of keys per node so that a lookup touches three or four disk pages. Redis sorted sets combine a hash table with a skip list, which is a randomised structure with the same O(log n) ordered operations. In each case the pure BST is the *idea*; the shipped structure is a variant that guarantees height.

The BST's honest niche in application code: you need ordered iteration or floor/ceiling on an in-memory set that changes, and you are in a language with a balanced tree in the standard library. Python has none; use `bisect` on a sorted list (O(n) insert, but the memmove is so fast that it wins below about 10⁵ elements) or the third-party `sortedcontainers`.

## Exercises

```exercise
id: validate-bst
title: Validate a binary search tree
prompt: |
  Given a binary tree as a **level-order list** with `null` gaps, return
  `true` if it is a valid BST: for every node, all keys in its left subtree
  are strictly smaller and all keys in its right subtree are strictly larger.
  Duplicates are not allowed. The empty tree is valid.

  Check ancestors, not just parents. `build_tree` and `BTNode` are provided.
languages: [python, javascript]
entry: is_valid_bst
starter:
  python: |
    class BTNode:
        def __init__(self, val):
            self.val, self.left, self.right = val, None, None

    def build_tree(values):
        if not values or values[0] is None:
            return None
        root = BTNode(values[0])
        queue, head, i = [root], 0, 1
        while head < len(queue) and i < len(values):
            node = queue[head]; head += 1
            if values[i] is not None:
                node.left = BTNode(values[i]); queue.append(node.left)
            i += 1
            if i < len(values) and values[i] is not None:
                node.right = BTNode(values[i]); queue.append(node.right)
            i += 1
        return root

    def is_valid_bst(values):
        root = build_tree(values)
        return True
  javascript: |
    class BTNode {
      constructor(val) { this.val = val; this.left = null; this.right = null; }
    }

    function build_tree(values) {
      if (!values.length || values[0] === null) return null;
      const root = new BTNode(values[0]);
      const queue = [root];
      let head = 0, i = 1;
      while (head < queue.length && i < values.length) {
        const node = queue[head++];
        if (values[i] !== null && values[i] !== undefined) { node.left = new BTNode(values[i]); queue.push(node.left); }
        i++;
        if (i < values.length && values[i] !== null) { node.right = new BTNode(values[i]); queue.push(node.right); }
        i++;
      }
      return root;
    }

    function is_valid_bst(values) {
      const root = build_tree(values);
      return true;
    }
tests:
  - args: [[5, 3, 8, 1, 4, 7, 9]]
    expected: true
  - args: [[5, 1, 4, null, null, 3, 6]]
    expected: false
    label: right child smaller than root
  - args: [[]]
    expected: true
    label: empty tree
  - args: [[2, 2]]
    expected: false
    label: duplicate
  - args: [[2, 1, 3]]
    expected: true
  - args: [[10, 5, 15, null, null, 6, 20]]
    expected: false
    hidden: true
    label: violates an ancestor bound, not a parent bound
hints:
  - "Recurse with (lo, hi) bounds; use None or infinity for 'no bound'. Going left sets hi = node.val; going right sets lo = node.val."
  - "Alternatively, inorder-traverse and check each value is strictly greater than the previous one."
```

```exercise
id: bst-insert-delete
title: Build a BST, delete a key, report preorder
prompt: |
  `bst_insert_delete(values, key)`: insert the integers in `values` into an
  initially empty BST **in the given order** (ignore duplicates), then delete
  `key` (a no-op if it is absent), and return the **preorder** traversal of
  the resulting tree as a list.

  When the deleted node has two children, replace its value with the
  **in-order successor** (the minimum of its right subtree) and remove that
  successor node. This rule makes the result deterministic.

  Inputs are plain arrays; build the nodes yourself with `BTNode`.
languages: [python, javascript]
entry: bst_insert_delete
starter:
  python: |
    class BTNode:
        def __init__(self, val):
            self.val, self.left, self.right = val, None, None

    def insert(node, key):
        # return the subtree root after inserting key
        return node

    def delete(node, key):
        # return the subtree root after deleting key
        return node

    def bst_insert_delete(values, key):
        root = None
        for v in values:
            root = insert(root, v)
        root = delete(root, key)
        out = []
        # preorder into out
        return out
  javascript: |
    class BTNode {
      constructor(val) { this.val = val; this.left = null; this.right = null; }
    }

    function insert(node, key) {
      // return the subtree root after inserting key
      return node;
    }

    function delete_key(node, key) {
      // return the subtree root after deleting key
      return node;
    }

    function bst_insert_delete(values, key) {
      let root = null;
      for (const v of values) root = insert(root, v);
      root = delete_key(root, key);
      const out = [];
      // preorder into out
      return out;
    }
tests:
  - args: [[5, 3, 8, 1, 4, 7, 9], 3]
    expected: [5, 4, 1, 8, 7, 9]
    label: two children, successor is a leaf
  - args: [[5, 3, 8, 1, 4, 7, 9], 5]
    expected: [7, 3, 1, 4, 8, 9]
    label: delete the root
  - args: [[5, 3, 8, 1, 4, 7, 9], 1]
    expected: [5, 3, 4, 8, 7, 9]
    label: delete a leaf
  - args: [[5, 3, 8, 1, 4, 9], 8]
    expected: [5, 3, 1, 4, 9]
    label: one child is spliced up
  - args: [[5, 3, 8, 1, 4, 7, 9], 10]
    expected: [5, 3, 1, 4, 8, 7, 9]
    label: absent key is a no-op
  - args: [[], 1]
    expected: []
    label: empty
  - args: [[5, 3, 8, 1, 4, 7, 9], 8]
    expected: [5, 3, 1, 4, 9, 7]
    hidden: true
    label: successor has no left child but the node keeps its left subtree
hints:
  - "Write insert and delete as functions that return the new subtree root, and have the parent assign node.left = insert(node.left, key)."
  - "In delete, handle 'no left child' and 'no right child' first; the two-children case copies the successor value and recurses into the right subtree to delete it."
```

## Senior signals

- You state the invariant as a **subtree** property, not a child property, and you know that the parent-only check is the canonical wrong answer.
- You implement delete with the "return the new subtree root" pattern and can name the three cases and why case 3 never recurses into itself.
- You say "O(h)" and immediately follow with "and h is O(n) on sorted input, which is why nobody ships an unbalanced BST".
- You reach for a BST-shaped structure when the query is **ordered** (floor, ceiling, range, k-th), and a hash table when it is not.
- You know the augmentation trick: store subtree sizes to get O(h) rank and select.
- You can name what your language's ordered map actually is (red-black tree, B-tree, skip list) and why each was chosen.

## Check yourself

```quiz
- q: >-
    A BST validation checks that every left child is smaller than its parent and every right child is larger. Which tree does it wrongly accept?
  options: ["A tree with a duplicate at the root", "10 with left child 5 and right child 15, where 15 has left child 6", "A single node", "A right chain 1, 2, 3"]
  answer: 1
  explanation: >-
    6 is smaller than its parent 15, so the parent-only check passes, but 6 lies in the right subtree of 10 and must be greater than 10. Only ancestor bounds catch it.
- q: >-
    Deleting a node with two children by replacing it with its in-order successor never requires a further two-child deletion. Why?
  options: ["The successor is always a leaf", "The successor is the minimum of the right subtree and therefore has no left child", "The right subtree always has exactly one node", "The successor is always the node's direct right child"]
  answer: 1
  explanation: >-
    The leftmost node of a subtree has no left child by construction, so removing it is case 1 (leaf) or case 2 (one right child). It may not be a leaf, and it is the direct right child only when that child has no left subtree.
- q: >-
    Keys 1 through 100,000 are inserted in ascending order into a plain BST. Searching for key 100,000 costs:
  options: ["About 17 comparisons", "About 100,000 comparisons", "About 50,000 comparisons on average", "It depends on the hash function"]
  answer: 1
  explanation: >-
    Ascending insertion produces a right chain of height 99,999; the largest key is at the bottom, so the search walks every node. A balanced tree would take about 17.
- q: >-
    You need to support insert, delete and "how many stored keys are less than x" in O(log n) each. The right structure is:
  options: ["A hash set", "A sorted array with binary search", "A balanced BST augmented with subtree sizes", "A min-heap"]
  answer: 2
  explanation: >-
    Subtree sizes let you compute rank(x) in one O(h) descent, and balancing keeps h logarithmic. A sorted array answers the query in O(log n) but inserts in O(n); a heap gives no rank information; a hash set has no order.
- q: >-
    Python has no balanced tree in the standard library. For an ordered set of about 10,000 integers with frequent inserts and floor queries, the pragmatic choice is:
  options: ["Implement a red-black tree", "A sorted list with the bisect module", "A dict with sorted() on every query", "A heapq"]
  answer: 1
  explanation: >-
    bisect gives O(log n) search and O(n) insert, but the insert is a memmove of at most 80 KB, which is microseconds. sorting a dict per query is O(n log n) each time; a heap cannot answer floor.
```
