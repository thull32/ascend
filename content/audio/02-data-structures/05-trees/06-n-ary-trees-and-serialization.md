---
lesson: n-ary-trees-and-serialization
source: 70170209a26d4b36
fit: partial
desk:
  - "The seven-node example tree, and its left-child right-sibling drawing both ways, with the conversion code"
  - "The parent-array inversion code and the bytes-per-node table"
  - "Preorder with null markers: the serialise and deserialise code and the fifteen-token trace"
  - "The level-order, child-count and end-marker encodings side by side, and the child-count decoder trace"
  - "The format trade-off table and the production failure table"
  - "Exercises: preorder serialisation with null markers, and subtree sizes from a parent array"
---
## Introduction

Binary trees are what interviews ask about. General trees are what production code is made of. A directory has any number of entries, an HTML element any number of children, a JSON object any number of keys. And every one of those trees eventually has to leave memory: written to disk, sent over the network, cached or diffed.

Turning a tree into bytes and back without losing its shape is serialisation, and a surprising number of engineers get it subtly wrong. They produce a format that cannot tell a node with only a right child from a node with only a left child.

Three ideas. How to represent a tree with any number of children. Why a traversal is not a serialisation, and what makes one exact. And where these trees live: parsers, Git, and the file system.

## Representing a general tree

Here is a small tree to hold. A is the root, with three children: B, C and D, in that order. C has one child, E. Everything else is a leaf. Five nodes.

The direct representation is a children list: each node holds a list of its children. Traversals generalise by replacing "left then right" with "each child in order". Preorder here is A, B, C, E, D. There is no inorder for a general tree, because there is no unique middle.

The second representation stores any tree as a binary tree, with exactly two pointers per node: the left pointer goes to the first child, the right pointer to the next sibling. A's left is B. B's right is its sibling C. C's left is its first child, E, and C's right is its sibling D. A node's children become a linked list threaded through sibling pointers. Fixed-size nodes suit C and arenas. But notice the trap. The general tree has height 2. Its binary encoding has height 3, because walking right stays at the same depth. On a wide, shallow tree, the binary form is tall, and a recursive walk over it recurses through every sibling.

Third, the parent array, which is what you get from a database: for each node, the index of its parent, minus 1 for the root. It only supports walking up. To walk down, invert it into children lists in one pass. Scanning the whole array for each node's children is order n squared, and its SQL twin, one query per node, is the N plus 1 problem in tree form. Recursive common table expressions exist so the database does the linear version.

The memory spread is huge. Measured in CPython, a children-list node with slots costs about 144 bytes. A parent array held in a compact array of 32-bit integers costs 4 bytes per node, so a million-node tree is 4 megabytes. That 36-fold gap is why hierarchies of millions of rows are kept as parent arrays and converted only when a traversal needs it.

## A traversal is not a serialisation

To serialise is to produce a sequence of tokens from which the exact tree can be rebuilt. Exact is the word that trips people up.

Picture two tiny trees. In the first, 1 is the root and 2 is its left child. In the second, 1 is the root and 2 is its right child. Before I tell you: what is the preorder of each?

[pause]

Both are 1, 2. Postorder is 2, 1 for both. So a single traversal cannot be decoded. Preorder plus inorder works, but only with distinct values. The fix is to make the absence of a child explicit.

Preorder with null markers: emit the node's value, recurse left, recurse right, and emit a marker, say a hash sign, for every empty child. The first tree becomes 1, 2, marker, marker, marker. The second becomes 1, marker, 2, marker, marker. Different strings for different trees.

Here is a number interviewers like. A binary tree with n nodes always has exactly n plus 1 empty child pointers, whatever its shape. So the encoding is always 2n plus 1 tokens. For a thousand nodes, 2,001.

Decoding consumes tokens in the same order they were written. Read a token. A marker means nothing here. A value means create the node, then build its left from the next tokens, then its right. Each token is read once, with no searching and no index map, so it is order n.

Two engineering notes. Build the output by collecting parts and joining once. Appending to a string in a loop copies the whole output every time; at 200 thousand tokens that is 2 times 10 to the 10 byte copies. And you can check a serialisation without building anything. Keep one counter of open slots, starting at 1. A value fills one slot and opens two. A marker fills one. The string is valid if the count never goes negative before a token and ends at exactly zero. "1, marker" ends at 1, with a missing right subtree, so it is invalid.

## General trees on the wire

With any number of children, you need either a child count per node or an end marker after the children. With counts, the five-node tree becomes: A 3, B 0, C 1, E 0, D 0. Ten tokens, two per node. The decoder is a loop with an explicit stack of nodes and how many children each still expects. When a count reaches zero, that node leaves the stack. No recursion, and the stack never holds more than the current depth plus one. That is the version to ship when the depth of the input is not yours to choose.

End markers are nested brackets. That is why JSON, XML and S-expressions all serialise trees with delimiters. A JSON document is a preorder serialisation, with the opening brace or bracket as the begin marker and the closing one as the end marker.

Production formats add what the interview version ignores. Escaping, if values can contain your delimiter. Versioning, so next year's code can read this year's bytes. And sharing: a structure with shared subtrees is not a tree, so naive preorder duplicates shared nodes and a cycle loops forever. Graph formats assign IDs and emit references.

## Under the hood

JSON parsers are recursive descent, so their recursion depth is the nesting depth of the document, chosen by whoever sent it. CPython's json decoder recurses on the C stack. A document nested 20 thousand deep parses, and one nested 100 thousand deep, only about 200 kilobytes, raises a stack overflow at the 8 mebibyte stack. Jackson, the usual JVM parser, has enforced a default maximum nesting of 1,000 since version 2.15. If your parser has no limit, put one in front of it.

Protobuf encodes a nested message with its length first. So a parser can skip a whole subtree it does not understand by advancing that many bytes, which is how unknown fields and forward compatibility work.

Git stores directories as a tree of content-addressed objects. A tree object lists entries, each a name and the hash of a file or another tree. Because a tree's hash comes from its entries' hashes, two commits whose source directory is identical share the same object: an unchanged subtree costs nothing to store, and a comparison can skip any subtree whose hashes match.

The file system is the tree you use every day. A directory entry maps a name to an inode, the record holding a file's metadata. A hard link is a second name for the same inode. So the file system is a tree of directories, but a graph of files, and any tool that sums sizes by walking names must remember which inodes it has seen. GNU du does exactly that. A naive walker double counts, and can report a total larger than the disk. And the traversal orders show up again: find is a pre-order walk, du is a post-order sum, and a recursive remove must be post-order, because a non-empty directory cannot be removed.

One preview. A trie is a general tree keyed by characters, where the path from the root spells a string, and a shared prefix is stored once. Its edge labels carry the data, and it gets its own lesson.

## Comparing trees

Same tree: recurse in lockstep, failing at the first mismatch in shape or value. That costs at most the size of the smaller tree. Serialising both and comparing strings costs a little more, but it is the right approach when you compare many trees: hash each serialisation once and compare hashes, which is what Git does.

Is s a subtree of t? The naive way runs same-tree at every node of t, which costs the size of t times the size of s. Better: serialise both with null markers and search for s's string inside t's with a linear-time string search, which costs the size of t plus the size of s. The markers are essential, and so is a delimiter before every value; without one, the 2 can match inside 12.

## In the interview

A follow-up the lesson expects. The tree may be a million deep. Deserialise it.

[pause]

Use the explicit-stack decoder. The stack holds the current root-to-node path, so memory is order depth on the heap rather than order depth frames on a fixed stack, and a depth cap belongs in front of it if the input is untrusted. The wrong answer is raising the recursion limit, which on CPython's C-implemented json parser does not stop the C stack overflowing.

And another: encode a tree whose values repeat. Markers make the shape explicit, so preorder with null markers, or child counts, is unambiguous even with duplicates. Preorder plus inorder is not: a pair of ones fits two shapes.

## Recap

Four things to remember. A general tree can be children lists, left-child right-sibling, or a parent array; invert a parent array in one pass, never once per node, and remember the binary encoding of a wide tree is tall. One traversal is not a serialisation: null markers, child counts or delimiters make it exact, and preorder with markers is always 2n plus 1 tokens. Recursion depth in a parser is chosen by the sender, so put a depth limit in front, or decode with an explicit stack. And a file system is a tree of directories but a graph of files: count inodes, not names.

At your desk: the seven-node tree and its conversions, the representation and memory tables, the serialise and deserialise code with the token trace, the child-count decoder, the format and failure tables, and the two exercises.
