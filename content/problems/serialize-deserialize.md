---
slug: serialize-deserialize
title: Serialize and Deserialize Binary Tree
difficulty: hard
patterns: [tree-bfs]
lists: [core-75, ascend-150]
companies: [amazon, meta, google, microsoft, linkedin]
order: 5
lesson: interview-patterns/tree-and-graph-patterns/tree-bfs
hints:
  - "A traversal of values alone loses the shape. Include an explicit marker for every missing child, and the traversal becomes reversible."
  - "Level order with null markers is the format the examples use. Serialise with a queue that also enqueues missing children as markers; deserialise with a queue of parents, consuming two tokens per parent."
  - "Preorder with null markers is the recursive alternative: serialise as `val, left, right`; deserialise by reading tokens in the same order with a shared index."
signatures:
  python:
    name: roundtrip
    starter: |
      def roundtrip(root: TreeNode | None) -> TreeNode | None:
          # Implement serialize(root) -> str and deserialize(s) -> TreeNode,
          # then return deserialize(serialize(root)).
          pass
  javascript:
    name: roundtrip
    starter: |
      function roundtrip(root) {
        // Implement serialize(root) -> string and deserialize(s) -> tree,
        // then return deserialize(serialize(root)).
      }
tests:
  - args: [{"$tree": [1, 2, 3, null, null, 4, 5]}]
    expected: {"$tree": [1, 2, 3, null, null, 4, 5]}
  - args: [{"$tree": []}]
    expected: null
    label: empty tree
  - args: [{"$tree": [1]}]
    expected: {"$tree": [1]}
    label: single node
  - args: [{"$tree": [1, null, 2, null, 3]}]
    expected: {"$tree": [1, null, 2, null, 3]}
    label: right chain
  - args: [{"$tree": [-1, 0, -2]}]
    expected: {"$tree": [-1, 0, -2]}
    label: negative values and zero
  - args: [{"$tree": [5, 5, 5, 5, null, null, 5]}]
    expected: {"$tree": [5, 5, 5, 5, null, null, 5]}
    hidden: true
    label: duplicate values, shape must be preserved
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}]
    expected: {"$tree": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
    hidden: true
  - args: [{"$tree": [10, -3, null, 20, null, null, 7]}]
    expected: {"$tree": [10, -3, null, 20, null, null, 7]}
    hidden: true
    label: mixed gaps
time_limit_ms: 4000
---
Design a way to convert a binary tree into a string and back, so that `deserialize(serialize(tree))` reconstructs a tree identical in shape and values. There is no required string format; it only has to be reversible.

The harness calls a single function `roundtrip(root)` that must serialise `root` to a string, deserialise that string, and return the resulting tree. The interviewer expects to see **both halves** implemented; returning `root` unchanged is not a solution.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3, null, null, 4, 5]` | `[1, 2, 3, null, null, 4, 5]` | The round trip preserves the tree |
| `[5, 5, 5, 5, null, null, 5]` | `[5, 5, 5, 5, null, null, 5]` | Duplicate values: the format must carry shape, not just values |
| `[]` | `[]` | The empty tree must survive too |

### Constraints

- `0 ≤ number of nodes ≤ 10⁴`
- `-1000 ≤ node.val ≤ 1000`

### Follow-up

The interviewer asks: "How large is your encoding relative to the tree, and could you make it smaller?" Then: "Your format is fine for a test. What would you change before using it as a wire format between services?"

## Solution

### The naive approach

Emit an in-order or pre-order sequence of values. It is not reversible: `[1, 2]` and `[1, null, 2]` both pre-order to `1 2`. Some candidates then emit *two* traversals (pre-order and in-order) and reconstruct as in [Construct from Preorder and Inorder](/practice/construct-from-preorder-inorder). That works only with distinct values, doubles the size, and needs a hash map to decode. The duplicate-values test kills it.

### The insight

Shape is lost because a missing child leaves no trace in the output. Put a marker (`#`) wherever a child is missing and any traversal order becomes uniquely decodable, because the decoder always knows whether the next token is a node or a gap. With markers, both pre-order and level order work; level order matches the tree notation used in the tests, and pre-order gives the shortest code.

### The optimal approach

Level order with markers. **Serialise**: BFS with a queue that holds `None` entries too; emit `#` for a `None` and do not enqueue its children; emit the value otherwise and enqueue both children (even if `None`). **Deserialise**: read the root, then keep a queue of nodes awaiting children; for each parent, consume two tokens, creating a child for each non-`#` token and enqueuing it.

Trace serialising `[1, 2, 3, null, null, 4, 5]`: queue `[1]` → emit 1, enqueue 2, 3. Emit 2, enqueue `None, None`. Emit 3, enqueue 4, 5. Emit `#`, `#`. Emit 4, enqueue `None, None`. Emit 5, enqueue `None, None`. Emit four `#`. String: `1,2,3,#,#,4,5,#,#,#,#`. Deserialising reads 1 as root; parent 1 takes `2, 3`; parent 2 takes `#, #`; parent 3 takes `4, 5`; parents 4 and 5 take `#, #` each.

```python
from collections import deque

def serialize(root: TreeNode | None) -> str:
    if root is None:
        return ""
    out: list[str] = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append("#")
            continue
        out.append(str(node.val))
        queue.append(node.left)
        queue.append(node.right)
    return ",".join(out)


def deserialize(data: str) -> TreeNode | None:
    if data == "":
        return None
    tokens = data.split(",")
    root = TreeNode(int(tokens[0]))
    queue = deque([root])
    i = 1
    while queue and i < len(tokens):
        parent = queue.popleft()
        if tokens[i] != "#":
            parent.left = TreeNode(int(tokens[i]))
            queue.append(parent.left)
        i += 1
        if i < len(tokens) and tokens[i] != "#":
            parent.right = TreeNode(int(tokens[i]))
            queue.append(parent.right)
        i += 1
    return root


def roundtrip(root: TreeNode | None) -> TreeNode | None:
    return deserialize(serialize(root))
```

Both directions are `O(n)` time and `O(w)` queue space; the string is `O(n)` tokens (every node contributes itself plus at most two markers, so under `3n`).

The pre-order variant is shorter to write: serialise as `val` followed by the serialisation of left then right, with `#` for `None`; deserialise with an iterator over tokens, reading one token and recursing left then right. It has the same `O(n)` size and uses `O(h)` recursion instead of a queue.

### Common mistakes

- Omitting the markers, or including markers only for one child.
- Using a delimiter-free format so negative numbers and multi-digit values run together; always separate tokens.
- Treating `#` as a value on decode, or forgetting to skip enqueueing children of a `#` on encode, so the two sides disagree about token counts.
- Not handling the empty tree, which must round-trip to `None`, not to a node with value `0`.

### How to discuss it

State why value-only traversals fail, then choose a format and describe the encoder and decoder as a matched pair, since the decoder is the mirror of the encoder. On size: level order emits a `#` for every missing child, which for a complete tree is roughly `n + 1` markers, so about half the tokens are markers; a bit-packed shape (one bit per child presence) plus a values array is far denser, and if the tree is a BST you can drop the shape entirely and rebuild from pre-order using bounds. On a wire format: add a version prefix so the schema can change, use a length-prefixed binary encoding rather than comma-separated text, define the behaviour for malformed input (reject, never crash), and think about whether a 10⁴-deep recursive decoder is a stack-overflow attack surface; that last point is the reason to prefer the queue-based decoder in production.
