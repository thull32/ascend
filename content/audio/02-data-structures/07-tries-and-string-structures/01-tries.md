---
lesson: tries
source: 0bb16f52e4ff27de
fit: partial
desk:
  - "The trie class with insert, search and starts with, and the five-insert, three-query trace table"
  - "The two diagrams: the plain trie of car, cart, cat, do, dog, and the radix tree of net, netflix, network, nest, new"
  - "The radix tree edge split, traced step by step for nets and nap"
  - "The measured memory table: dict nodes, plain nodes, the hash set and the pointer-array arithmetic"
  - "The trie, hash set and sorted array comparison table"
  - "Exercises: implement a trie, and autocomplete from a word list in sorted order"
---
## Introduction

Type "net" into a search box and it suggests netflix, network, netherlands. Type one more letter, "netw", and the list narrows. A hash set of a million words cannot do this. Hashing "netw" tells you whether "netw" itself is a word, and nothing at all about the words that begin with it. You would have to scan every key and test its prefix, on every keystroke. A sorted array does better: binary search to the first key at or after "netw" and read forward. But every insert into it costs order n.

A trie turns the prefix into a path. Each character is an edge, and every string that starts with "netw" lives in the subtree under the node you reach by following n, e, t, w. Finding that node costs four steps whether the trie holds a hundred words or a hundred million. That is the whole idea. Everything else is engineering the memory cost down.

Three things, then. The shape, and the one flag that every trie bug comes back to. What a trie really costs, in time and, measured, in memory. And where the compressed version runs in production, from IP routers to search engines.

## The shape and the terminal flag

A trie, from retrieval, usually pronounced "try" to keep it apart from "tree", is a tree where each node stands for a prefix and each edge carries one character. The root is the empty prefix. A node is marked terminal if the prefix it stands for is a complete key in the set.

Here is one small enough to hold in your head. Insert three words: car, cart and cat. From the root, an edge c leads to a node for "c". From there an edge a leads to "ca". Under "ca" there are two edges. One is r, to a node for "car", marked terminal. Below "car" hangs one more edge, t, to "cart", also terminal. The other edge under "ca" is t, to "cat", terminal. Five nodes below the root, for eleven characters inserted. "Car" and "cart" are the same path with one extra edge.

Now the question that separates working tries from broken ones. Search for "ca". Before I tell you: is it in the set?

[pause]

No. The path c, a exists, because it is a prefix of three words. But the node it reaches is not marked terminal, so search returns false. Ask the other question, does anything start with "ca", and the answer is true, because the node exists. That terminal flag is exactly the difference between search and starts with. Forgetting it is the most common trie bug, and it is the first thing an interviewer checks.

## What each operation costs, and deletion

Every operation walks one character per step. Insert, search and the prefix check are all order L, for a key of length L, independent of how many keys are stored. Say it that way in an interview: order L per operation, independent of n.

But do not oversell it. A hash set's lookup is also order L, because it has to hash the whole string. For exact membership the two tie on paper, and the hash set wins on constants: one hash and one or two probes, against L separate dictionary lookups in the trie, each one hashing a one-character string. The trie's advantage begins the moment the question mentions a prefix.

Deletion is the operation the interview version skips, and the one that bites in production. Go back to car, cart and cat, and delete "cat". Unmark the terminal flag on the t under "ca". That node now has no children and is not terminal, so remove it. Then look at "ca": it still has a child, the r for car, so stop there. Remove "cart" instead and the t under "car" goes, but "car" stays because it is terminal.

The rule: walk down recording the path, unmark the terminal, then walk back up deleting each node that is non-terminal and childless, stopping at the first node that is neither. Get it wrong in one direction, only clearing the flag, and you leak a node for every deleted key, so memory grows with churn while the key count stays flat. Get it wrong in the other, deleting every node on the path, and deleting "cat" makes "car" disappear.

## Autocomplete

To list every key with a prefix, walk to the prefix node, then traverse its subtree depth-first, collecting every terminal node. The walk is order L. The enumeration costs the size of the subtree, which for an empty prefix is the whole trie.

There is a free bonus here. If each node keeps its children in sorted order, that traversal yields keys in alphabetical order with no sorting step at all. A hash set cannot offer that at any price.

Real autocomplete never enumerates, though. It wants the top few suggestions by popularity. So it precomputes, at every node, the 5 to 10 best completions below it. A keystroke then costs order L plus k, with no traversal. The price is extra memory per node, and when a completion's popularity changes, every node on its path may need its list recomputed.

At web scale the trie is not even one object. It is sharded by the first one or two characters, hot prefixes are cached, and it is often deployed as a plain key-value table from prefix to its top-k list, because a key-value store shards and replicates without custom code. Redis users build the same thing with a sorted set and a lexicographic range query. The trie is how you think about the problem. The deployment is whatever gives you order L lookup with the operational properties you need.

## Memory, honestly

Here is the number that surprises people. The lesson measured a trie in Python, built from the 19,385 distinct words in the curriculum's own text: about 141 thousand characters, an average of 7.3 per word.

The trie needed 49,715 nodes at about 200 bytes each, close to 10 megabytes. A plain hash set of the same words: about 1.5 megabytes. The raw text: 0.14. So the trie was roughly seven times the hash set and seventy times the text.

Why, when sharing prefixes sounds like it should save space? Look at the shape. Sharing is dense near the root, where there are few nodes, and almost absent near the leaves, where there are many. Fifty-eight percent of the nodes had exactly one child. Each of those pays the full per-node overhead to store one character. A fixed array of 26 child pointers is no better: 208 bytes per node, nearly all of them null.

So the claim "a trie saves memory over a hash set" is wrong, and saying it is a mid-level tell. The trie earns its memory only through prefix operations. And production tries win most of it back.

## Compressed tries in production

Since most nodes have one child, merge each chain into a single edge labelled with the whole substring. The tail of netflix after "net" stops being four nodes, f, l, i, x, and becomes one edge labelled "flix". That is a radix tree, also called a compressed or Patricia trie. Every internal node now branches or is terminal, so the node count falls from the total number of characters to the number of keys. On the same corpus: 23,665 nodes instead of 49,715. The cost is code: inserting can split an edge in two, and deleting can merge one back. That is why interviews ask for the plain version and production libraries ship the compressed one.

Where radix trees run. IP routing: a router must find the longest prefix in its table that matches a packet's destination, and a binary radix tree over the address bits does it in at most 32 steps for IPv4, or 128 for IPv6. A hash table cannot do longest-prefix match without one lookup per possible prefix length. HTTP routers in Go, such as httprouter, Gin and Echo, match URL paths against a radix tree, so matching costs the length of the path, not the number of routes. The Linux page cache maps file offsets to pages with one. And the immutable maps in Clojure and Scala are a hash array mapped trie, where an insert copies only one path, so the new map shares almost everything with the old.

Two denser layouts are worth naming. A double-array trie stores the whole thing in two integer arrays, about 8 bytes per state against the 200 measured, with two array reads per character and no pointer chasing. It is hard to build and update, so it suits static dictionaries, like the ones inside Japanese and Chinese tokenisers. And a finite state transducer shares suffixes as well as prefixes, so "nation" and "station" share their tail. Lucene's terms index has been one since version 4.0, and Elasticsearch's completion suggester is built on it.

## In the interview

The common trie problems in one breath. Wildcard search, where a dot matches any character: at a dot you recurse into every child, so the cost is exponential in the number of dots, and a service that takes such queries from users needs a dot limit. Word search on a grid: put the whole dictionary in a trie and backtrack once from each cell, abandoning any path that leaves the trie. Store the full word at its terminal node, and prune a word from the trie once you find it. Replace words: walk each word and stop at the first terminal. And maximum XOR of a pair is a trie with an alphabet of just zero and one.

Now a follow-up the lesson expects. A hundred million URLs, you need prefix queries, and memory is tight. What do you use?

[pause]

Not a pointer trie with a hash map per node; that is the measured seven times blow-up. A radix tree with compact child arrays, or a static build as a double array or a finite state transducer, or simply a sorted array with binary search if updates are rare. The senior summary from the lesson: a hash set for membership, a trie when the queries mention prefixes, and a sorted structure when the set is static or read-heavy and memory matters. In many languages that means an ordered map with a range query, which gives prefix enumeration in order L log n with excellent memory and no custom code.

And the design question: top 10 suggestions per keystroke for a billion queries a day. The wrong answer walks the trie, collects every completion and sorts them, which costs the whole subtree on every keystroke. The right one precomputes the top k per prefix, shards by prefix, caches the hot ones, serves from memory, and rebuilds offline from the query logs with popularity decaying over time.

## Recap

Four things to remember. A trie makes a prefix a path, so every operation is order L, independent of n, and for exact membership a hash set ties it with better constants. The terminal flag separates search from starts with, and deletion unwinds only the nodes that are childless and non-terminal. A plain trie measured about seven times a hash set, because most nodes have one child; compression, double arrays and transducers win it back. And autocomplete at scale is precomputed top-k per prefix, sharded and cached, not a traversal.

At your desk: the trie code and its trace table, the two diagrams, the radix tree edge split, the memory and comparison tables, and the two exercises.
