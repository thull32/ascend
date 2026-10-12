---
lesson: linked-list-fundamentals
source: 3f2f414b4b38acfa
---
## 1

An engineer argues for a linked list over an array "because inserting in the middle is constant time". What is the strongest objection?

A, arrays can also insert in the middle in constant amortised time, using spare capacity. B, linked lists must copy the tail on insert to keep their nodes contiguous. C, it is constant time only given the predecessor, and finding that is a linear walk. D, linked lists use more memory per node, which outweighs any insert gain.

[think]

The answer is C: it is constant time only given the predecessor, and finding that is a linear walk.

The constant-time claim hides the linear search. Because each node is a separate allocation, that search is a chain of dependent cache misses at roughly 100 nanoseconds each, while an array's shift is a memory move at full bandwidth. So arrays win even for middle insertion at the sizes Stroustrup measured. The memory overhead is real but secondary. The list wins only when positions are reached without searching.

## 2

Why does an LRU cache need a doubly linked list rather than a singly linked one?

A, to iterate entries from most to least recent when the cache is listed. B, to unlink a node found through the map in constant time, without finding its predecessor. C, to store both key and value, since a singly linked node holds one field. D, to save memory, since each node's previous pointer replaces a map entry.

[think]

The answer is B: to unlink a node found through the map in constant time, without finding its predecessor.

On a cache hit, the map hands you the node itself. Unlinking it means updating the predecessor's next pointer, and only a previous pointer makes that constant time. A singly linked list would need a linear walk to the predecessor on every hit. Backward iteration is a side benefit, and the extra pointer costs memory rather than saving it.

## 3

In the sentinel version of deleting every node with a given value, a pointer p walks the list and bypasses its next node when that node matches. What goes wrong if you advance p immediately after a bypass?

A, the loop ends early, since p steps past the last node. B, the sentinel is deleted, so the returned head is a real node's successor. C, the loop skips the new successor, so adjacent matching nodes survive. D, nothing, since the bypassed node is unreachable either way.

[think]

The answer is C: the loop skips the new successor, so adjacent matching nodes survive.

After the bypass, p's new next node has not been examined. Advancing p steps over it, so in the list 1, 6, 6, 2, deleting 6 would remove the first six and keep the second. The correct loop advances only when the current successor is kept. The sentinel itself is never a candidate, because the loop only inspects p's next node.

## 4

Why is a walk over one million linked-list nodes often 10 to 50 times slower than a scan over one million array elements?

A, the garbage collector must be consulted on every node visit, to check that the node is live. B, each node's address is known only after the previous load returns, so nothing can be prefetched. C, pointer dereferences are privileged operations, and each one traps into the kernel. D, each node is 48 bytes rather than 4, so the list moves twelve times as many bytes from memory.

[think]

The answer is B: each node's address is known only after the previous load returns, so nothing can be prefetched.

The list walk is bound by latency: one dependent main-memory miss of roughly 100 nanoseconds per scattered node, with exactly one miss outstanding at a time. The array scan is bound by bandwidth, with the prefetcher running ahead and 10 to 16 misses in flight. Node size matters at the margin but is not the mechanism; dereferences are ordinary loads, and the collector is not involved in a read.

## 5

To insert a new node after node p, you set p's next to the new node first, and only then set the new node's next to p's next. What goes wrong?

A, the new node points at itself, and the rest of the list is lost. B, the new node ends up before p instead of after it. C, p is unlinked, since its successor is overwritten before being saved. D, nothing, since both assignments complete before the list is read.

[think]

The answer is A: the new node points at itself, and the rest of the list is lost.

Once p's next is the new node, the old successor was reachable only through the value you overwrote. The second assignment then sets the new node's next to the new node itself, creating a self-loop and making the tail unreachable. P stays in place; it is everything after it that is lost, and any later traversal spins on the self-loop.

## 6

Why does Redis approximate LRU by sampling, instead of keeping the map plus a doubly linked list?

A, because sampling five keys is exact LRU whenever the cache holds fewer than five keys. B, because two list pointers per key would cost gigabytes at scale, and make every read a write. C, because Redis is single-threaded, and a linked list cannot be updated without a lock. D, because a doubly linked list cannot evict from the tail in constant time once keys expire.

[think]

The answer is B: because two list pointers per key would cost gigabytes at scale, and make every read a write.

Two 8-byte pointers per key is 1.6 gigabytes at 100 million keys, and keeping recency means writing to the list on every read. A 24-bit clock per object, plus sampling a few keys at eviction time, approximates LRU closely for far less. Threading is unrelated, tail eviction is constant time on a doubly linked list, and sampling is approximate in general.
