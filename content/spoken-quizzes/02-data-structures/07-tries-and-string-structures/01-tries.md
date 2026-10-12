---
lesson: tries
source: f2d6e67a39a88474
---
## 1

A trie contains the word "cart" and nothing else. What do search for "car" and starts with "car" return?

A, false, then true. B, true, then false. C, false and false. D, true and true.

[think]

The answer is A: false, then true.

The path c, a, r exists, because it is a prefix of cart. But the node it reaches is not marked terminal, so search says false, while the prefix check only needs the node to exist. Confusing the two is the canonical trie bug.

## 2

Why is a plain trie, with an array of 26 child pointers in every node, usually larger than a hash set of the same words?

A, hash sets compress their keys into one shared buffer, so they use less than the raw text. B, shared prefixes are copied at every branch point, so popular prefixes end up stored many times. C, most nodes have one child, so about 25 of the 26 pointers sit empty, and there is a node per character. D, each node also stores the full key string, so every word is duplicated along its path.

[think]

The answer is C: most nodes have one child, so about 25 of the 26 pointers sit empty, and there is a node per character.

Prefix sharing saves a little near the root, but most nodes sit near the leaves with one child each, 58 percent of them in the measured corpus, and every one pays for a full 208-byte pointer array. Nothing is duplicated: a trie stores each shared prefix exactly once, which is why the intuition that it saves memory is so tempting. Compact child vectors and path compression win the memory back.

## 3

An HTTP router with 5,000 registered routes matches an incoming path using a radix tree. What is the match cost proportional to?

A, the path length times the number of routes. B, the length of the request path. C, the log of the number of registered routes. D, the number of registered routes.

[think]

The answer is B: the length of the request path.

A radix walk consumes the path one edge label at a time. The number of registered routes affects only the branching at each node, which is bounded by the alphabet. It is not logarithmic in the route count either; that would be a binary search over a sorted array. This is why routers can register thousands of routes at no cost per request.

## 4

You delete the word "cat" from a trie that also holds "car" and "cart". What must the deletion do?

A, unmark the terminal flag only, leaving all the nodes in place for later reuse. B, remove every node on the path c, a, t, since the key is no longer present. C, unmark the terminal, then on the way back up remove only nodes that are childless and non-terminal. D, rebuild the trie from the remaining keys, since deleting in place is unsafe.

[think]

The answer is C: unmark the terminal, then on the way back up remove only nodes that are childless and non-terminal.

After unmarking, the t under a is childless and non-terminal, so it goes. The a and the c are shared with car and cart, so the unwinding stops there. Removing the whole path corrupts the shared keys, and clearing only the flag leaks a node for every deleted key.

## 5

In word search two, why does putting the dictionary in a trie and backtracking once per grid cell beat backtracking once per word?

A, the trie removes the need for a visited set, because a grid path can never revisit a trie node. B, one grid traversal serves every word, and a path is cut off as soon as it leaves the trie. C, the trie makes each grid step constant time instead of proportional to the word length. D, the trie indexes the grid's letters, so each cell's neighbours are found in constant time.

[think]

The answer is B: one grid traversal serves every word, and a path is cut off as soon as it leaves the trie.

Backtracking once per word repeats the same grid exploration thousands of times. With a trie, one exploration serves all the words, and any path whose prefix is not in the dictionary is pruned at once. A visited set is still required, because the grid path can loop back to a cell even while the trie walk moves strictly downward.

## 6

You need all keys with a given prefix, over a static set of 10 million short strings, with minimal memory, in Rust. What is the pragmatic choice?

A, a hand-written trie with a hash map of children in every node, walking to the prefix and enumerating below it. B, a hash set of the keys, scanning every key and testing whether it starts with the prefix. C, a min-heap of the keys, popping in order until a key no longer starts with the prefix. D, a sorted vector or a B-tree map, range-scanning from the prefix until keys stop matching.

[think]

The answer is D: a sorted vector or a B-tree map, range-scanning from the prefix until keys stop matching.

Sorted storage finds the prefix with a binary search and then reads forward, L log n plus the output, with almost no overhead per key. A trie saves the log factor but costs far more memory, especially with a hash map in every node. For a static set the log factor is a bargain, and a double-array or finite state transducer build is the next step only if it matters.
