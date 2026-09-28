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

## One tree for every trace

```text
          A
        / | \
       B  C  D
         / \   \
        E   F   G
```

Seven nodes, height 2 in edges, fan-out 3 at the root, 2 at C, 1 at D and 0 at the leaves. Every representation and every encoding below is shown on this tree so you can check one against another.

## Representing a general tree

### Children lists

The direct translation: each node holds a list of children. Traversals generalise by replacing "left then right" with "each child in order"; there is no inorder for an n-ary tree (there is no unique middle), but preorder, postorder and level order remain.

```python
class NTNode:
    __slots__ = ("val", "children")
    def __init__(self, val, children=None):
        self.val = val
        self.children = children or []

def preorder(node, out):
    out.append(node.val)
    for child in node.children:
        preorder(child, out)

def height(node):                       # in edges
    if not node.children:
        return 0
    return 1 + max(height(c) for c in node.children)
```

Preorder on the example is A B C E F D G, postorder B E F C G D A, level order A B C D E F G.

### Left-child, right-sibling

Any n-ary tree can be stored as a binary tree with exactly two pointers per node: `left` points to the **first child** and `right` to the **next sibling**. A node's children form a linked list threaded through the sibling pointers.

```text
n-ary                       binary (first child = left, next sibling = right)
      A                          A
    / | \                       /
   B  C  D                     B
     / \   \                    \
    E   F   G                    C
                                / \
                               E   D
                                \   /
                                 F G
```

Reading it back: A's first child is B; B's next sibling is C, whose first child is E and next sibling is D; E's next sibling is F; D's first child is G. The binary tree has height 4 (A, B, C, E, F) while the n-ary tree has height 2, so "height of the binary encoding" is not the n-ary height: walking right stays at the same depth. Every binary-tree algorithm applies with that translation, and fixed-size nodes suit C and arenas.

```python
def to_lcrs(node):                     # NTNode -> BTNode
    b = BTNode(node.val)
    prev = None
    for child in node.children:
        cb = to_lcrs(child)
        if prev is None: b.left = cb   # first child hangs on the left
        else:            prev.right = cb   # later children chain to the right
        prev = cb
    return b

def from_lcrs(b):                      # BTNode -> NTNode
    node, c = NTNode(b.val), b.left
    while c:                           # walk the sibling list
        node.children.append(from_lcrs(c))
        c = c.right
    return node
```

### Parent arrays

The compact form, and the one you get from a database: `parent[i]` is the index of node i's parent, −1 for the root. With A..G numbered 0..6 the example is `[-1, 0, 0, 0, 2, 2, 3]`. It only supports walking *up*; to walk down you invert it into children lists first, one O(n) pass:

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

The alternative, "for each node, scan the array for its children", is O(n²), and its SQL twin, one query per node, is the N+1 problem in tree form; recursive CTEs (`WITH RECURSIVE`) exist so the database does the O(n) version.

### Adjacency dictionaries

What you get from JSON or an API: `{"A": ["B", "C", "D"], "B": [], "C": ["E", "F"], "D": ["G"], ...}`. It is the children-list representation keyed by name instead of by pointer, and it tolerates references to nodes that are defined elsewhere in the document, which is what makes it the format of choice for configuration and dependency graphs, and what makes cycle detection necessary before treating it as a tree.

### Memory per node

Measured on CPython 3.14.7 by allocating 100,000 nodes under `tracemalloc`, including the value each holds:

| Representation | Bytes per node | What it is |
|---|---|---|
| Children list, `__slots__` class | ~144 | 56-byte object + 56-byte empty list + the value; each child pointer adds 8 |
| Children list, plain class | ~184 | Adds the per-instance attribute storage |
| Left-child right-sibling, `__slots__` | ~96 | Object with three slots plus the value; no list |
| Parent array as a Python list of ints | ~40 | 28-byte int plus an 8-byte list slot, rounded |
| Parent array as `array('i')` | ~4 | One 32-bit index; a million-node tree is 4 MB |

In Java the children-list node is a 16-byte object plus an `ArrayList` (about 40 bytes plus 4 per slot); in Rust a `Vec<Box<Node>>` costs 24 bytes for the vector header plus 8 per child. The 36-fold spread between a Python object and an `array('i')` is why hierarchies of millions of rows are handled as parent arrays and converted only when a traversal needs it.

| Representation | Down | Up | Memory | Best for |
|---|---|---|---|---|
| Children lists | O(1) per child | Needs a parent pointer | Highest: list per node | In-memory trees you mutate |
| Left-child right-sibling | O(1) first child, O(k) k-th | Needs a parent pointer | Two pointers per node | Fixed-size nodes, arenas, C |
| Parent array | O(n) inversion first | O(1) | One index per node | Storage, databases, union-find |
| Adjacency dict | O(1) per child by name | Needs an inverted map | Dict entry + list per node | JSON, configuration, dependency graphs |

## Serialisation

To serialise is to produce a sequence of tokens from which the exact tree can be rebuilt. "Exact" is the requirement that trips people up. A preorder traversal of a binary tree, on its own, is *not* enough:

```text
   1            1
  /              \
 2                2
```

Both have preorder `1, 2` and postorder `2, 1`; only inorder differs (`2, 1` versus `1, 2`). So a single traversal without markers is not decodable, and preorder plus inorder is decodable only with distinct values: for preorder `[1, 1]` and inorder `[1, 1]` both trees above (with 2 replaced by 1) match. The fix is to make the *absence* of a child explicit.

### Preorder with null markers

Emit the node, then recurse into left and right, and emit a marker (`#`) for every null child:

```python
def serialize(node):
    parts = []
    def go(n):
        if n is None:
            parts.append("#"); return
        parts.append(str(n.val)); go(n.left); go(n.right)
    go(node)
    return ",".join(parts)             # join once: repeated += is quadratic
```

The two trees above become `1,2,#,#,#` and `1,#,2,#,#`. On the binary (left-child right-sibling) form of the example tree the output is `A,B,#,C,E,#,F,#,#,D,G,#,#,#,#`: 7 values and 8 markers, 15 tokens, because a binary tree with n nodes always has n + 1 null pointers, so the encoding is always 2n + 1 tokens. Deserialising consumes tokens in the same order:

```python
def deserialize(s):
    tokens = iter(s.split(","))
    def go():
        t = next(tokens)
        if t == "#":
            return None
        node = BTNode(t)
        node.left  = go()         # left first: that is the order we wrote
        node.right = go()
        return node
    return go()
```

| Step | Token | Action | Attaches as |
|---|---|---|---|
| 1 | A | create A, recurse for its left | root |
| 2 | B | create B, recurse left | A.left |
| 3 | # | None | B.left |
| 4 | C | create C | B.right |
| 5 | E | create E | C.left |
| 6 | # | None | E.left |
| 7 | F | create F | E.right |
| 8, 9 | #, # | None, None | F.left, F.right; E and F return |
| 10 | D | create D | C.right |
| 11 | G | create G | D.left |
| 12, 13 | #, # | None, None | G.left, G.right |
| 14 | # | None | D.right; D, C, B return |
| 15 | # | None | A.right; done |

Each token is consumed exactly once and the recursion re-plays the traversal, so there is no searching, splitting or index map: O(n). The recursion depth equals the height of the binary tree, 5 frames at step 8 here.

```viz
{"type": "tree", "algorithm": "serialize", "values": [8, 3, 10, 1, 6, 14],
 "title": "Preorder serialisation with null markers", "caption": "Each node emits its value and then its two subtrees; a missing child emits a marker. The marker is what makes the encoding invertible."}
```

### Level order with null markers

The LeetCode format, and the one the exercises in this module use: walk with a queue, emit each node's value, and for each real node emit its two children or `null`; nulls at the end are trimmed and the children of a null are not listed. The example's binary form becomes `[A, B, null, null, C, E, D, null, F, G]`, 10 tokens with 3 nulls, against 15 for preorder. On a right-skewed chain of n nodes level order emits n − 1 nulls (`[1, null, 2, null, 3, ...]`, 2n − 1 tokens) and preorder n + 1; the format that wastes space on skewed trees is the older full level-order array, which needs 2^(h+1) − 1 slots, 2,097,151 for a 21-node right chain (the arithmetic is in the [fundamentals lesson](/learn/data-structures/trees/tree-fundamentals)). Decoding level order is the queue walk from that lesson; preorder gives simpler code and streams (you can write before the whole tree is read), level order needs a whole level in memory.

### N-ary trees

With variable arity you need either a **child count** per node or an **end marker** after the children:

```text
Child counts, preorder:   A 3 B 0 C 2 E 0 F 0 D 1 G 0      (14 tokens)
End markers,  preorder:   A B ) C E ) F ) ) D G ) ) )       (14 tokens)
Nested parentheses:       A(B,C(E,F),D(G))
JSON:                     {"A":[{"B":[]},{"C":[{"E":[]},{"F":[]}]},{"D":[{"G":[]}]}]}
```

End markers are what nested brackets are, which is why JSON, S-expressions and XML all serialise trees with delimiters: a JSON document is a preorder serialisation with `{`/`[` and `}`/`]` as begin and end markers. Child counts make the decoder a loop with an explicit stack of (node, children still expected):

| Read | Node created | Attached to | Stack after (node, remaining) |
|---|---|---|---|
| A, 3 | A | root | [(A, 3)] |
| B, 0 | B | A, now expecting 2 | [(A, 2)] |
| C, 2 | C | A, now 1; C expects 2 | [(A, 1), (C, 2)] |
| E, 0 | E | C, now 1 | [(A, 1), (C, 1)] |
| F, 0 | F | C, now 0: pop C | [(A, 1)] |
| D, 1 | D | A, now 0: pop A; D expects 1 | [(D, 1)] |
| G, 0 | G | D, now 0: pop D | [] |

```python
def deserialize_counts(tokens):        # ["A", 3, "B", 0, ...]
    root, stack = None, []             # stack of [node, children_remaining]
    for i in range(0, len(tokens), 2):
        node, k = NTNode(tokens[i]), tokens[i + 1]
        if stack:
            stack[-1][0].children.append(node)
            stack[-1][1] -= 1
        else:
            root = node
        while stack and stack[-1][1] == 0:
            stack.pop()                # finished parents leave the stack
        if k > 0:
            stack.append([node, k])
    return root
```

The stack never holds more than the depth of the current node plus one, and there is no recursion, which is the version to ship when the input's depth is not yours to choose.

### Checking a serialisation without building it

A preorder-with-markers string is valid exactly when every token has a slot to fill: start with one open slot; a value consumes one slot and opens two; a marker consumes one; the string is valid if the count never goes negative before a token and ends at zero. `9,3,4,#,#,1,#,#,2,#,6,#,#` runs 1 → 2 → 3 → 4 → 3 → 2 → 3 → 2 → 1 → 2 → 1 → 2 → 1 → 0: valid. `1,#` ends at 1 (a missing right subtree), `#,1` has a token with no slot, and `9,#,#,1` has a token after the count hit zero. One integer of state, O(n), no nodes allocated: the right answer when the question is "validate before you trust it".

### What real formats add

Production serialisation cares about things the interview version ignores. **Escaping**: if values can contain your delimiter, you need length prefixes or escaping. **Streaming**: preorder can be written and read incrementally. **Versioning**: a format read by next year's code needs a version tag and a way to skip unknown fields. **Sharing and cycles**: a DAG with shared subtrees is not a tree; naive preorder duplicates shared nodes and a cycle loops forever, so graph formats (pickle, Java serialisation) assign IDs and emit references. **Size**: a pointer-based tree costs 24–144 bytes per node in memory and 2–5 bytes per node on the wire with a tight encoding, which is why serialised size is a design lever for caches.

## Under the hood: parsers, wire formats and Git

**JSON parsers are recursive descent**, and the recursion depth is the nesting depth of the document, chosen by whoever sent it. CPython's `json` decoder is C code that recurses on the C stack: on 3.14.7, `json.loads` of an array nested 20,000 deep succeeds and one nested 100,000 deep raises `RecursionError: Stack overflow (used 8148 kB) while decoding a JSON array`, the 8 MiB main-thread stack. Jackson, the JVM's usual parser, has enforced a default maximum nesting depth of 1,000 in recent versions (configurable through its stream-read constraints), so a hostile document fails fast instead of overflowing the thread stack. If your parser has no such limit, put one in front of it.

**Protobuf** encodes a nested message as a *length-delimited* field: a tag, a varint length, then that many bytes. Because the length comes first, a parser can skip an entire subtree it does not understand by advancing the length, which is how unknown fields and forward compatibility work, and it can bound nesting cheaply: the C++ and Java implementations refuse messages nested deeper than 100 by default. See [gRPC and protobuf](/learn/networking/application-protocols/grpc-and-protobuf).

**Git stores directories as an n-ary tree of content-addressed objects.** A tree object is a list of entries, each a mode, a name and the hash of a blob or another tree; a commit points at one root tree. Because the hash of a tree is computed from its entries' hashes, two commits whose `src/` directory is byte-identical share the same tree object, so an unchanged subtree costs nothing to store and comparing two commits can skip any subtree whose hashes match. That is a Merkle tree, covered in [Merkle trees and ring buffers](/learn/advanced-data-structures/log-structured-and-disk-structures/merkle-trees-and-ring-buffers).

**The DOM** exposes the left-child right-sibling representation plus back pointers: every node has `parentNode`, `firstChild`, `lastChild`, `previousSibling` and `nextSibling`, five pointers, which is what lets a `TreeWalker` advance without a stack (first child if any, else next sibling, else climb) and lets `removeChild` unlink in O(1). Layout is a post-order pass computing sizes followed by a pre-order pass assigning positions.

## File systems: the tree you use every day

A directory is an internal node whose entries name its children; a file is a leaf. Two objects matter. The **inode** holds the metadata and block pointers of one file or directory (256 bytes by default on ext4) and is identified by number, not by name. A **directory entry** maps a name (at most 255 bytes, `NAME_MAX`) to an inode number. A **hard link** is a second directory entry for the same inode: two names, one file, and a link count in the inode. So the file system is a tree of *directories* (hard links to directories are refused, which is what keeps `..` unambiguous) but a DAG of *files*, and any tool that sums sizes by walking names must remember which inodes it has seen. GNU `du` does exactly that, counting a multiply-linked file once; a naive walker double counts.

Path resolution walks one component at a time: `/usr/lib/python3` looks up `usr` in the root directory's entries, then `lib` in that directory, then `python3`, each step a lookup keyed by (parent, name) in the kernel's **dentry cache**, a hash table that turns repeated resolutions into a handful of hash probes instead of directory reads. The whole path may be at most 4,096 bytes (`PATH_MAX`). `find` is a pre-order walk with a predicate (its `-depth` flag switches it to post-order); `du` is a post-order sum; `rm -rf` must be post-order because a non-empty directory cannot be removed. Large directories are not linear lists: ext4 indexes entries with a hashed tree so that a directory of a million files still resolves a name in a few block reads. The [filesystems lesson](/learn/systems/operating-systems/filesystems-and-storage) goes deeper.

## Tries: the preview

A trie is an n-ary tree keyed by characters: the path from the root spells a string, and a node holds one child per possible next character. Storing `car`, `cat` and `cart` produces a root with one child `c`, then `a`, then a node with children `r` and `t`, and `r` has a child `t`; the shared prefix `ca` is stored once. Each node's child table is the design decision: an array of 26 pointers is O(1) per step and 208 bytes per node on a 64-bit machine even when only one child exists, a dictionary is a few times slower per step and only as large as the branching. It is the subject of the [tries lesson](/learn/data-structures/tries-and-string-structures/tries); the bridge from here is that a trie is a general tree whose *edge labels* carry the data.

## Comparing and searching trees

**Same tree.** Recurse in lockstep: both null → true; one null → false; values differ → false; else compare both left subtrees and both right subtrees. O(min(n₁, n₂)). Serialising both and comparing strings also works and is O(n₁ + n₂), and it is the *right* approach when you compare many trees (hash the serialisation once, then compare hashes, which is what Git does).

**Subtree of another tree.** Is s identical to some subtree of t? Naive: at every node of t, run same-tree against s: O(n_t · n_s). Serialise both with null markers and check whether `ser(s)` is a substring of `ser(t)` with a linear-time search such as [KMP](/learn/data-structures/tries-and-string-structures/string-matching): O(n_t + n_s). The null markers are essential; without them `12` would match inside `123`. Prefixing each value with a delimiter (`,1,2,#,#`) also prevents `2` matching inside `12`.

## Trade-offs across formats

| Format (example tree) | Tokens | Decodable alone | Streams | Human-readable | N-ary |
|---|---|---|---|---|---|
| Preorder, no markers | 7 | No | Yes | Yes | No |
| Preorder + inorder | 14 | Only with distinct values | No: needs both sequences | Yes | No |
| Preorder with null markers | 15 | Yes | Yes | Barely | No, but its binary encoding is |
| Level order with nulls (LeetCode) | 10 | Yes | Per level | Yes | No |
| Preorder with child counts | 14 | Yes | Yes | Yes | Yes |
| Preorder with end markers (JSON, XML, S-expressions) | 14 | Yes | Yes | Yes | Yes |
| Length-prefixed (protobuf) | bytes, not tokens | Yes | Yes, and subtrees are skippable | No | Yes |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| The service dies with a stack overflow or `RecursionError` on one request; the trace is the deserialiser repeated a thousand times | Recursive descent on input whose depth a client chooses: a 100,000-deep JSON array is a 200 KB payload | A depth limit in front of the parser (1,000 is plenty for real documents); an explicit-stack decoder such as `deserialize_counts` |
| Serialising a large tree takes seconds and the profiler shows time in string copying | `result += token` builds the output by copying it once per token, n²/2 bytes for n tokens; 2 × 10⁵ tokens is 2 × 10¹⁰ byte copies | Collect parts in a list and join once, or write to a buffer; the same applies to Java strings and JavaScript in a loop |
| A tree round-trips through the cache and comes back with children on the wrong side, or two different trees compare equal | A traversal without markers was used as the format, and the decoder guessed the shape | Null markers, child counts or delimiters; a test that deserialises and re-serialises every fixture and compares |
| `du`-style totals exceed the disk size, or an export contains the same subtree many times | Hard links or shared subtrees: the structure is a DAG walked as a tree, so shared nodes are counted or written once per path | Track visited inode numbers or node ids and count each once; emit references for shared subtrees |
| A level-order decoder attaches a child to the wrong parent | The decoder expected two entries per position (the full-array convention) but the input omits the children of nulls (the LeetCode convention), or the reverse | Decode with a queue of real nodes and consume two tokens per real node; agree the convention in the format's version tag |

## Interviewer follow-ups

**"Serialise an n-ary tree."** Model answer: preorder with a child count after each value (`A 3 B 0 C 2 ...`) or an end marker after each node's children; decode with a stack of (node, remaining) or with recursion re-playing the order; both O(n), 2n tokens. Common wrong answer: preorder values alone, or a binary encoding via left-child right-sibling without saying that null markers are still required.

**"Verify a serialisation is valid without building the tree."** Model answer: the slot count, one integer: start at 1, a value consumes 1 and adds 2, a marker consumes 1; valid if never negative and exactly 0 at the end (for child counts, a value consumes 1 and adds its count). Common wrong answer: building the tree and catching exceptions, which allocates n nodes and still misses a trailing garbage token.

**"The tree may be 10⁶ deep. Deserialise it."** Model answer: the explicit-stack decoder; the stack holds the current root-to-node path, so memory is O(depth) on the heap rather than O(depth) frames on a fixed stack, and a depth cap belongs in front of it if the input is untrusted. Common wrong answer: raising the recursion limit, which on CPython's C-implemented `json` does not stop the C stack overflowing.

**"Compute `du` on a directory tree that contains hard links."** Model answer: post-order sum of sizes with a set of visited (device, inode) pairs, counting an inode once no matter how many names reach it, which is what GNU `du` does; the directory structure is still a tree, so no cycle handling is needed. Common wrong answer: summing by name, which double counts every linked file.

**"Encode a tree whose values repeat."** Model answer: markers make shape explicit, so preorder with null markers (or child counts) is unambiguous with duplicates; preorder plus inorder is not, since `[1, 1]` / `[1, 1]` fits two shapes. Add a delimiter before each value so that substring tricks cannot match `2` inside `12`. Common wrong answer: "use preorder and inorder", which is the case that breaks.

## What mid-level engineers get wrong

- **Treating a traversal as a serialisation.** Preorder alone cannot distinguish a left-only child from a right-only one; the fix is a marker per null, which costs n + 1 tokens.
- **Recursing on input whose depth a client controls.** A parser that works on fixtures overflows on the first deeply nested document; the depth is the attacker's parameter.
- **Building output with repeated concatenation.** Quadratic on large trees; collect and join.
- **Walking a DAG as a tree.** Hard links and shared subtrees are counted or written once per path; totals inflate and exports bloat.
- **Scanning the parent array once per node.** O(n²) and the N+1 query in disguise; invert it once.
- **Assuming the binary encoding's height is the n-ary height.** Left-child right-sibling turns a wide shallow tree into a tall one, and a recursive walk over it recurses to the total number of siblings.

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
  - args: [["A", "B", null, null, "C", "E", "D", null, "F", "G"]]
    expected: "A,B,#,C,E,#,F,#,#,D,G,#,#,#,#"
    label: the lesson's left-child right-sibling tree
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
  - args: [[-1, 0, 0, 0, 2, 2, 3]]
    expected: [7, 1, 3, 2, 1, 1, 1]
    label: the lesson's seven-node tree, A..G as 0..6
  - args: [[2, 2, -1]]
    expected: [1, 1, 3]
    hidden: true
hints:
  - "kids = [[] for _ in range(n)]; for i, p in enumerate(parent): if p != -1: kids[p].append(i)."
  - "Either recurse from the root (size = 1 + sum of children's sizes), or process nodes in reverse BFS order adding each node's size into its parent's."
```

## Senior signals

- You can name four representations of a general tree, draw the left-child right-sibling conversion both ways, and give the bytes per node for each with the arithmetic.
- You know that one traversal is not a serialisation, that **null markers, child counts or delimiters** make an encoding invertible, and that preorder plus inorder fails on duplicates.
- You describe JSON, XML and S-expressions as preorder serialisations with begin and end markers, protobuf as length-prefixed and therefore skippable, and Git's object store as a content-addressed tree whose shared subtrees cost nothing.
- You validate an encoding with a slot count before building anything, and you decode hostile input with an explicit stack behind a depth limit.
- You know a file system is a tree of directories and a DAG of files, and you count inodes, not names.
- You turn a `parent_id` column into a traversable tree in one pass, and you recognise the per-node query as N+1.
- You reach for serialise-and-substring for subtree matching and can say why the markers and delimiters are essential to its correctness.

## Check yourself

```quiz
- q: >-
    A colleague proposes serialising a binary tree as its preorder traversal, with values only. What is the problem?
  options: ["Different trees share a preorder, so it cannot be rebuilt", "It fails on duplicate values but is fine for distinct ones", "Preorder costs O(n log n), too slow for large trees", "Preorder emits the root last, so the root cannot be found"]
  answer: 0
  explanation: >-
    A root with only a left child and a root with only a right child produce the same value sequence, even with all values distinct, so the tree cannot be rebuilt exactly. Null markers, or a second traversal, resolve the ambiguity; markers are simpler and also survive duplicate values. Preorder is O(n) and emits the root first.
- q: >-
    A preorder serialisation with null markers of a tree with 1,000 nodes contains how many tokens?
  options: ["1,000 to 2,001, depending on shape", "1,000, one token per node only", "2,001, one per node and one per null", "1,999, one per node and one per edge"]
  answer: 2
  explanation: >-
    Every binary tree with n nodes has exactly n + 1 null child pointers, regardless of shape, so the encoding has n + (n + 1) = 2n + 1 tokens. Edges (n - 1) are implied by the order and are not emitted.
- q: >-
    You have 200,000 rows with id and parent_id and need each node's depth. Which approach is O(n)?
  options: ["Build children lists in one pass, then BFS assigning depths", "For each node, follow parent_id up to the root and count", "Issue one SELECT per node to fetch its parent's depth", "Sort by parent_id, then binary search for each node's children"]
  answer: 0
  explanation: >-
    Following parents per node is O(n times depth), which is O(n²) on a chain. The children-list build plus one BFS from the root (depth = parent depth + 1) touches each node a constant number of times. Memoising the walk-up approach also reaches O(n), but the BFS is the standard form.
- q: >-
    Checking whether tree s is a subtree of tree t by testing whether ser(s) is a substring of ser(t) requires:
  options: ["The same traversal order for both, and nothing more", "Null markers plus a delimiter before every value", "Distinct values, so each value matches at most once", "Both trees to be BSTs, so values appear in sorted order"]
  answer: 1
  explanation: >-
    Without markers the shapes are ambiguous, and without delimiters the digits of one value can match inside another (2 inside 12), so a shared traversal order alone is not enough. With both, the encoding of s appears as a contiguous block in ser(t) exactly when s matches a subtree.
- q: >-
    A directory-size tool walks the tree by name and reports a total larger than the disk. What is the most likely cause?
  options: ["Hard links: several names reach one inode, so its size is added once per name", "The dentry cache returns stale sizes for recently written files", "Symbolic links: the walk follows them into other directories and loops", "Path components longer than 255 bytes are counted twice by the kernel"]
  answer: 0
  explanation: >-
    The file system is a tree of directories but a DAG of files: a hard link is a second directory entry for the same inode. A tool that sums by name counts a multiply-linked file once per link, which is why GNU du tracks visited inode numbers and counts each once. Symlink loops cause hangs or errors, not inflated totals, and name length and the dentry cache do not affect sizes.
- q: >-
    A service parses JSON documents supplied by clients with a recursive-descent parser and no depth limit. What is the realistic failure?
  options: ["Deep documents parse correctly but the resulting tree cannot be serialised back", "A document nested 100,000 deep, about 200 KB, overflows the parser's stack and kills the worker", "Documents with duplicate keys produce an ambiguous tree that fails validation", "Deeply nested arrays take O(n²) time to parse because each level rescans the input"]
  answer: 1
  explanation: >-
    Recursion depth equals nesting depth, which the sender chooses; CPython's json decoder raises a stack overflow at a depth in the tens of thousands and a native parser without a limit crashes. Parsing stays O(n); duplicate keys are a semantic question, not a crash. The fix is a nesting limit in front of the parser, as Jackson enforces by default in recent versions, or an explicit-stack decoder.
```
