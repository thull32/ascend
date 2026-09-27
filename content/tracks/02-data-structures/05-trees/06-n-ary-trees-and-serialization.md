---
slug: n-ary-trees-and-serialization
title: "N-ary trees and serialisation"
description: How general trees are represented (children lists, parent arrays, left-child right-sibling), how to serialise any tree so it can be rebuilt exactly, and what file systems, DOMs and tries have in common.
minutes: 35
difficulty: medium
tags: [trees, n-ary, serialization, deserialization, file-system]
problems: [serialize-deserialize, subtree-of-another, same-tree]
---
Binary trees are what interviews ask about; general trees are what production code is made of. A directory has any number of entries, an HTML element any number of children, an org chart any number of reports, a JSON object any number of keys. And every one of those trees eventually has to leave memory: written to disk, sent over the network, cached, diffed, or logged. Turning a tree into bytes and back without losing its shape is serialisation, and a surprising number of engineers get it subtly wrong, producing a format that cannot distinguish "a node with only a right child" from "a node with only a left child".

## Representing a general tree

### Children lists

The direct translation: each node holds a list of children.

```python
class NTNode:
    def __init__(self, val, children=None):
        self.val = val
        self.children = children or []
```

Traversals generalise by replacing "left then right" with "each child in order". There is no inorder for an n-ary tree (there is no unique "middle"); preorder, postorder and level order remain.

```python
def preorder(node, out):
    if node is None:
        return
    out.append(node.val)
    for child in node.children:
        preorder(child, out)

def height(node):                       # in edges
    if not node.children:
        return 0
    return 1 + max(height(c) for c in node.children)
```

### Parent arrays

The compact form, and the one you get from a database: `parent[i]` is the index of node `i`'s parent, with −1 for the root. Six integers encode a six-node tree, and any tree can be stored in a table with an `id` and a `parent_id` column. The catch is that it only supports walking *up*; to walk down you build the children lists first:

```python
def children_of(parent):
    kids = [[] for _ in parent]
    root = -1
    for i, p in enumerate(parent):
        if p == -1:
            root = i
        else:
            kids[p].append(i)
    return root, kids
```

One O(n) pass. The alternative, "for each node, scan the array for its children", is O(n²), and the SQL equivalent, one query per node, is the N+1 problem in tree form. Recursive CTEs (`WITH RECURSIVE`) exist so that the database can do the O(n) version for you.

### Left-child, right-sibling

Any n-ary tree can be stored as a binary tree: each node's `left` pointer goes to its first child and its `right` pointer goes to its next sibling. Two pointers per node regardless of arity, no lists to grow, and every binary-tree algorithm applies with a translation. Under this encoding, "height of the n-ary tree" is *not* the height of the binary tree: walking right stays at the same depth. The Linux kernel's `struct task_struct` uses a variant of this for the process tree, and old-school compilers use it for syntax trees.

| Representation | Down | Up | Memory | Best for |
|---|---|---|---|---|
| Children lists | O(1) per child | Needs parent pointer | List overhead per node | In-memory trees you mutate |
| Parent array | O(n) preprocessing | O(1) | One int per node | Storage, databases, union-find |
| Left-child right-sibling | O(1) first child, O(k) k-th child | Needs parent pointer | Two pointers per node | Fixed-size nodes, C |

## Serialisation

To serialise is to produce a sequence (of bytes, of tokens, of characters) from which the exact tree can be rebuilt. "Exact" is the requirement that trips people up. A preorder traversal of a binary tree, on its own, is *not* enough:

```text
   1            1
  /              \
 2                2
```

Both have preorder `1, 2`, inorder `2, 1` and `1, 2` respectively, postorder `2, 1` for both. You would need two traversals to distinguish them (preorder plus inorder works, as in the [recursion patterns lesson](/learn/data-structures/trees/tree-recursion-patterns)), and even that fails with duplicate values. The fix is to make the *absence* of a child explicit.

### Preorder with null markers

Emit the node, then recurse into left and right, and emit a marker (`#`) for every null child:

```python
def serialize(node):
    if node is None:
        return "#"
    return f"{node.val},{serialize(node.left)},{serialize(node.right)}"
```

The two trees above become `1,2,#,#,#` and `1,#,2,#,#`: different, and both unambiguous. Deserialising consumes tokens in the same order:

```python
def deserialize(s):
    tokens = iter(s.split(","))
    def go():
        t = next(tokens)
        if t == "#":
            return None
        node = BTNode(int(t))
        node.left  = go()         # left first: that is the order we wrote
        node.right = go()
        return node
    return go()
```

The recursion re-plays the traversal: the first token is the root, the tokens after it are the left subtree's encoding in full, and whatever is left is the right subtree. There is no searching, no splitting, no index map; each token is consumed exactly once, so it is O(n).

```viz
{"type": "tree", "algorithm": "serialize", "values": [8, 3, 10, 1, 6, 14],
 "title": "Preorder serialisation with null markers", "caption": "Each node emits its value and then its two subtrees; a missing child emits a marker. The marker is what makes the encoding invertible."}
```

A tree of n nodes has n + 1 null pointers, so the encoding has 2n + 1 tokens. That is the cost of unambiguity; the level-order encoding below is more compact for some shapes.

### Level order with null markers

This is the LeetCode format and the one the exercises in this module use. Walk the tree with a queue; emit each node's value; for each real node, emit its two children (or `null`). Nulls at the end can be trimmed. `[1, 2, 3, null, 4]` is root 1, children 2 and 3, and 2 has a right child 4 but no left child. Decoding is the queue walk from the [fundamentals lesson](/learn/data-structures/trees/tree-fundamentals).

Level order gives shorter output when the tree is bushy near the top and sparse below (no markers for the children of a null). Preorder gives simpler code, streams well (you can start writing before the tree is fully read), and is what recursive-descent parsers naturally produce. Both are O(n).

### N-ary trees

With variable arity you need either a **child count** per node or an **end marker** after the children:

```text
Child counts, preorder:   A 3 B 0 C 2 D 0 E 0 F 0
End markers,  preorder:   A B ) C D ) E ) ) F ) )
```

Both encode A with children B, C (which has D and E) and F. Child counts make deserialisation a simple loop; end markers are what nested brackets are, which is why JSON, S-expressions and XML all serialise trees with delimiters. A JSON document is a preorder serialisation of an n-ary tree with `{`/`[` and `}`/`]` as begin/end markers.

### What real formats add

Production serialisation cares about things the interview version ignores:

- **Escaping.** If values can contain your delimiter (a comma, a `#`), you need length prefixes or escaping. Protobuf uses length-prefixed fields for exactly this reason.
- **Streaming.** Preorder can be written and read incrementally; level order needs the whole level.
- **Versioning.** A tree format that will be read by next year's code needs a version tag and a way to skip unknown fields.
- **Sharing and cycles.** A DAG with shared subtrees is not a tree; naive preorder duplicates shared nodes, and a cycle makes it loop forever. Formats that handle graphs (pickle, Java serialisation) assign IDs to nodes and emit references.
- **Size.** A pointer-based tree with 8-byte values costs about 24–56 bytes per node in memory and 2–5 bytes per node on the wire with a tight encoding. Serialised size is a real design lever for caches.

## Trees you operate on every day

**File systems.** Directories are n-ary internal nodes; `du -s` is a postorder sum; `find` is a preorder walk with a predicate; `rm -rf` must be postorder (you cannot remove a non-empty directory). Path resolution `/a/b/c` is a top-down walk keyed by name, which is why each directory is effectively a hash map or B-tree from name to child.

**The DOM.** An n-ary tree with parent pointers and sibling pointers (`parentNode`, `firstChild`, `nextSibling`: the left-child right-sibling representation, exposed). `querySelectorAll` is a preorder walk; layout is a postorder pass computing sizes followed by a preorder pass assigning positions; React's reconciliation diffs two trees level by level.

**Tries.** A trie is an n-ary tree keyed by characters, where the path from the root spells a string. It is the subject of the [next module](/learn/data-structures/tries-and-string-structures/tries), and it is a useful bridge: a trie is what you get when you take a general tree and make the *edge labels* carry the data instead of the nodes.

**Syntax trees and JSON.** Every parser produces an n-ary tree; every serialiser (`JSON.stringify`, `json.dumps`) is a preorder traversal with delimiters; every pretty-printer is a preorder traversal with an indent accumulator, which is the top-down pattern.

## Comparing and searching trees

Two problems that look like they need serialisation and mostly do not.

**Same tree.** Recurse in lockstep: both null → true; one null → false; values differ → false; else compare both left subtrees and both right subtrees. O(min(n₁, n₂)). Serialising both and comparing strings also works and is O(n₁ + n₂), and it is the *right* approach when you compare many trees (hash the serialisation once, then compare hashes).

**Subtree of another tree.** Is `s` identical to some subtree of `t`? Naive: at every node of `t`, run same-tree against `s`: O(n_t · n_s). Serialisation trick: serialise both with null markers and check whether `ser(s)` is a substring of `ser(t)`, using a linear-time string search such as [KMP](/learn/data-structures/tries-and-string-structures/string-matching): O(n_t + n_s). The null markers are essential; without them, `12` would match inside `123`. Prefixing each value with a delimiter (`,1,2,#,#`) also prevents `2` matching inside `12`.

## Exercises

```exercise
id: preorder-serialize
title: Serialise a binary tree in preorder with null markers
prompt: |
  Given a binary tree as a **level-order list** with `null` gaps, return its
  preorder serialisation as a string: node values and `#` for null children,
  separated by commas, with no trailing separator. The empty tree serialises
  to `"#"`.

  For example, root 1 with children 2 and 3 gives `"1,2,#,#,3,#,#"`.
  `build_tree` and `BTNode` are provided.
languages: [python, javascript]
entry: preorder_serialize
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

    def preorder_serialize(values):
        root = build_tree(values)
        parts = []
        # fill parts, then join with ","
        return ",".join(parts)
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

    function preorder_serialize(values) {
      const root = build_tree(values);
      const parts = [];
      // fill parts, then join with ","
      return parts.join(",");
    }
tests:
  - args: [[1, 2, 3]]
    expected: "1,2,#,#,3,#,#"
  - args: [[]]
    expected: "#"
    label: empty tree
  - args: [[1, null, 2]]
    expected: "1,#,2,#,#"
    label: only a right child
  - args: [[-5]]
    expected: "-5,#,#"
    label: negative value
  - args: [[1, 2, null, 3]]
    expected: "1,2,3,#,#,#,#"
    hidden: true
    label: left chain
hints:
  - "Recursive: if node is None append '#' and return; else append str(val), recurse left, recurse right."
  - "Collect into a list and join once; repeated string concatenation is O(n²) in the worst case."
```

```exercise
id: subtree-sizes-parent-array
title: Subtree sizes from a parent array
prompt: |
  A general tree with `n` nodes numbered `0..n-1` is given as a **parent
  array**: `parent[i]` is the index of node `i`'s parent, and the root has
  `parent[root] == -1`. Return a list `sizes` where `sizes[i]` is the number
  of nodes in the subtree rooted at `i`, including `i` itself.

  Aim for O(n): build the children lists in one pass, then compute sizes
  bottom-up. Do not scan the whole array once per node.
languages: [python, javascript]
entry: subtree_sizes
starter:
  python: |
    def subtree_sizes(parent):
        n = len(parent)
        sizes = [1] * n
        # build children lists, then a postorder pass
        return sizes
  javascript: |
    function subtree_sizes(parent) {
      const n = parent.length;
      const sizes = new Array(n).fill(1);
      // build children lists, then a postorder pass
      return sizes;
    }
tests:
  - args: [[-1, 0, 0, 1, 1, 2]]
    expected: [6, 3, 2, 1, 1, 1]
  - args: [[-1]]
    expected: [1]
    label: single node
  - args: [[-1, 0, 1, 2]]
    expected: [4, 3, 2, 1]
    label: chain
  - args: [[1, -1, 1, 0, 0]]
    expected: [3, 5, 1, 1, 1]
    label: root is not index 0
  - args: [[2, 2, -1]]
    expected: [1, 1, 3]
    hidden: true
hints:
  - "kids = [[] for _ in range(n)]; for i, p in enumerate(parent): if p != -1: kids[p].append(i)."
  - "Either recurse from the root (size = 1 + sum of children's sizes), or process nodes in reverse BFS order adding each node's size into its parent's."
```

## Senior signals

- You can name three representations of a general tree and say which direction each supports cheaply.
- You know that one traversal is not a serialisation, and that **null markers** (or child counts, or delimiters) are what make an encoding invertible.
- You describe JSON, XML and S-expressions as **preorder serialisations with begin/end markers**, and you know why a shared subtree or a cycle breaks them.
- You turn a `parent_id` column into a traversable tree in one pass, and you recognise the per-node query as N+1.
- You reach for the serialise-and-substring trick for subtree matching, and you know why the markers and delimiters are essential to its correctness.
- You know that production formats need escaping, length prefixes, versioning and reference handling, and that in-memory size and wire size differ by an order of magnitude.

## Check yourself

```quiz
- q: >-
    A colleague proposes serialising a binary tree as its preorder traversal, with values only. What is the problem?
  options: ["Preorder costs O(n log n), too slow for large trees", "Different trees share a preorder, so it cannot be rebuilt", "Preorder emits the root last, so the root cannot be found", "It fails on duplicate values but is fine for distinct ones"]
  answer: 1
  explanation: >-
    A root with only a left child and a root with only a right child produce the same value sequence, even with all values distinct, so the tree cannot be rebuilt exactly. Null markers, or a second traversal, resolve the ambiguity; markers are simpler and also survive duplicate values. Preorder is O(n) and emits the root first.
- q: >-
    A preorder serialisation with null markers of a tree with 1,000 nodes contains how many tokens?
  options: ["1,000, one token per node only", "1,999, one per node and one per edge", "1,000 to 2,001, depending on shape", "2,001, one per node and one per null"]
  answer: 3
  explanation: >-
    Every binary tree with n nodes has exactly n + 1 null child pointers, regardless of shape, so the encoding has n + (n + 1) = 2n + 1 tokens. Edges (n - 1) are implied by the order and are not emitted.
- q: >-
    You have 200,000 rows with id and parent_id and need each node's depth. Which approach is O(n)?
  options: ["For each node, follow parent_id up to the root and count", "Build children lists in one pass, then BFS assigning depths", "Sort by parent_id, then binary search for each node's children", "Issue one SELECT per node to fetch its parent's depth"]
  answer: 1
  explanation: >-
    Following parents per node is O(n · depth), which is O(n²) on a chain. The children-list build plus one BFS from the root (depth = parent depth + 1) touches each node a constant number of times. Note that memoising the walk-up approach also gets to O(n), but the BFS is the standard form.
- q: >-
    Checking whether tree s is a subtree of tree t by testing whether ser(s) is a substring of ser(t) requires:
  options: ["Distinct values, so each value matches at most once", "Both trees to be BSTs, so values appear in sorted order", "Null markers plus a delimiter before every value", "The same traversal order for both, and nothing more"]
  answer: 2
  explanation: >-
    Without markers the shapes are ambiguous, and without delimiters the digits of one value can match inside another (2 inside 12), so a shared traversal order alone is not enough. With both, the encoding of s appears as a contiguous block in ser(t) exactly when s matches a subtree.
- q: >-
    Serialising an object graph in which two parents share the same child node with a plain preorder tree format results in:
  options: ["A shorter encoding, as the child is written only once", "An error, since the writer detects the second parent", "A cycle in the output, since the child is revisited", "Two independent copies of the shared child after reading"]
  answer: 3
  explanation: >-
    Tree formats assume each node has one parent. A shared node is written once per path, and the reader creates a separate node each time; nothing detects the sharing and no cycle exists to loop on. Graph serialisers assign identities and emit references to avoid this.
```
