---
lesson: linked-list-fundamentals
source: 774090fd71724909
fit: great
desk:
  - "The insert-after trace in both write orders, and the singly against doubly table"
  - "The sentinel delete code and its trace, and the circular sentinel's push and unlink"
  - "The traversal and cache-line visualisers, and the array scan against list walk table"
  - "The node-size and million-integers tables"
  - "The LRU hand trace and visualiser, and the kernel list_head layout"
  - "Exercises: insert into a sorted linked list, and delete every node with a given value"
---
## Introduction

An LRU cache has to move any element to the front of the recency order in constant time, and evict from the back in constant time. An array cannot do the first: moving an element from the middle to the front shifts everything in between. A hash map cannot do the second: it has no notion of a back. The structure that does both is a doubly linked list. That is why Memcached's eviction, Java's LinkedHashMap and the Linux page cache all contain one. Redis, notably, does not, and the reason is a number we will get to.

A linked list trades the array's contiguous memory for a chain of separately allocated nodes, each pointing at the next. That buys constant-time insertion and removal at a position you already hold. It costs linear access by index, one dependent memory load per node, and between 2 and 20 times the memory per element. Knowing what is bought and what is paid, in bytes and nanoseconds rather than in big O, is the whole topic.

Four ideas. Pointer surgery, and why the order of two writes is the entire correctness argument. Sentinel nodes, which delete the edge cases. What a pointer chase really costs. And the few real systems where lists win, and what they have in common.

## Pointer surgery

A singly linked list is a chain of nodes. Each node holds a value and a reference to the next node, and the last one's reference is null. The list itself is just a reference to the first node, the head.

Every operation is pointer surgery. To insert a new node after a node p, you do two writes. First, point the new node at p's current successor. Second, point p at the new node.

Say it on the list 1, 2, 3, inserting 9 after the 2. Point 9 at the 3. Then point 2 at the 9. The list is 1, 2, 9, 3. Now do the same two writes in the other order, and before I tell you, picture what happens.

[pause]

Point 2 at 9 first, and the 3 is now unreachable: the only copy of that pointer was the one you just overwrote. Then point 9 at "2's next", which is now 9 itself. The node points at itself, the tail is lost, and any traversal spins forever. This is the mechanism behind most linked list bugs: a write that destroys the only copy of a pointer you still need.

Deleting the node after p is one write: p's next becomes p's next's next. The bypassed node is unreachable, and is collected, or freed.

Both operations are constant time, given p. Finding p is a linear walk from the head. That qualifier is the source of every misleading claim about linked lists. "Constant-time insertion" is true only when you already hold a pointer to the neighbour.

## Singly against doubly linked

A doubly linked node also holds a pointer to the previous node. That costs one more pointer per node, 8 bytes on a 64-bit machine, and buys two things. You can walk backwards. And you can delete a node given only a pointer to that node, because you can reach its predecessor. Two writes: the predecessor's next skips over it, and the successor's previous skips back over it.

That unlink by handle is exactly what the LRU cache needs. The hash map stores a pointer to each list node. A hit unlinks the node and pushes it on the front. Eviction unlinks the tail. A singly linked list cannot do this without walking from the head to find the predecessor, on every hit. And the production symptom of that mistake is memorable: the cache's 99th percentile latency grows with the cache's size, which is the opposite of what a cache is for.

So singly linked lists live where you only ever work after a node: stacks, hash table chains, allocator free lists. Doubly linked lists live where positions are held elsewhere: deques, LRU caches, kernel lists, editor buffers.

## Sentinels

Most bugs in linked list code are special cases: the empty list, inserting at the head, deleting the head, the single node. Each needs its own branch, and each branch is a place to be wrong.

A sentinel, or dummy node, removes them. Allocate one node that is never a real element, and make it the permanent head. Now every real node has a predecessor, so "insert at the front" and "delete the first node" are the ordinary "after p" operations, with p as the sentinel. At the end you return the sentinel's next, which is the correct head whether or not the original survived.

Take deleting every node with value 6 from 6, 1, 6, 6, 2. Without a sentinel, the leading 6 needs its own loop, because it changes the head. With one, it is just the first ordinary bypass. Then comes the subtle part. When p's next matches, you bypass it, and you do not advance p. The new successor has not been examined yet. Advance p after a bypass and, with two 6s in a row, you remove the first and step right over the second. The result should be 1, 2.

Doubly linked lists usually use one circular sentinel: its next is the first element and its previous is the last. The empty list is the sentinel pointing at itself both ways. Pushing on the front is always the same four writes, and unlinking never touches a null pointer, so neither has a single branch. That is the Linux kernel's list layout, and the list inside most LRU implementations.

## What a pointer chase costs

Traversal is what makes lists slow. Each step reads a pointer to a node that could be anywhere on the heap, and the CPU cannot start fetching the next node until the current one has arrived, because the next address is inside it. An array scan is the opposite: the next address is known in advance, the prefetcher runs ahead, and the core keeps 10 to 16 misses in flight. A list walk has exactly one.

Put numbers on a million elements. The array of 4-byte integers is 4 megabytes, and streams through at bandwidth in about 0.4 milliseconds. A list whose every node misses to main memory costs about 100 nanoseconds per node: 100 milliseconds, about 250 times slower. That is the ceiling for scattered nodes, which is what a list looks like after churn. A freshly built list, whose nodes came from the allocator in order, sits closer to the array. Real traversals commonly land 10 to 50 times slower.

Bjarne Stroustrup's often-cited experiment makes the point. Insert random integers into a sorted sequence, then remove them at random positions, with a vector and with a list. The intuitive answer is "the list, of course". In his words, that is completely and dramatically wrong. The vector wins, because the list's search for the position is a chain of cache misses, while the vector's shift is a memory move at bandwidth.

So here is the honest rule. A linked list is the right choice only when you hold pointers to positions and need constant-time splicing or unlinking there, or when elements must never move in memory. If you are going to search for the position anyway, use an array.

## What a node costs

Memory is the other bill. A Python node with slots for value and next is 48 bytes: two 16-byte headers and two 8-byte slots. Without slots it is about 88 bytes, or about 152 once anything touches its attribute dictionary. And the integer it holds is another 32 bytes after the allocator rounds it. A Java LinkedList node is 24 bytes, plus a 16-byte boxed Integer. A Rust or C node with a 32-bit value is 16 bytes, which the allocator may round up to 32.

Store a million 32-bit integers. As a plain array, 4 megabytes. As a Python list, 40. As a Java LinkedList, 40. As a Python linked list with slots, 80; without slots, up to 184. Twenty to forty times the array, before you count a single cache miss. And a million nodes is a million objects for the garbage collector to trace.

## Where lists win

Every system where a linked list is the right call shares one property: the position is held, never searched for.

Python's deque is a doubly linked list of blocks of 64 slots each. Both ends are constant time with no copying, and inside a block it has the array's cache behaviour. The Linux kernel's list is intrusive: two pointers embedded inside the object itself, so no node is allocated and one task can sit on several lists at once. Allocator free lists write the next pointer into the free block itself, because a free block is unused memory anyway; freeing a small chunk is a push, and allocating it again is a pop.

And the LRU cache, a hash map plus a doubly linked list. A hit is six pointer writes. The lesson traces a capacity of three over the accesses A, B, C, A, D, B, E, A. The fourth access, A, is a hit and moves to the front. Then D evicts B, B comes back and evicts C, E evicts A, and A comes back and evicts D. One hit in eight: a working set of five keys cycling through a cache of three thrashes, which is the classic LRU failure.

Now Redis. Why does it not keep this list?

[pause]

At 100 million keys, two 8-byte pointers per key is 1.6 gigabytes, and every read would become a write to the list. Instead Redis stores a 24-bit clock per object, and on eviction samples five keys by default and evicts the oldest of the sample. Approximate LRU, the right trade when the pointers cost more than the accuracy is worth. The common wrong answer is "because Redis is single-threaded", which is unrelated.

One Java trap to finish. LinkedList's get by index walks from the nearer end, so an indexed for loop over it is quadratic: 100 thousand elements is about 2.5 billion node visits. That is a real production bug, not a textbook one. For a queue or a stack, Java's own documentation points you to ArrayDeque, a ring buffer.

## In the interview

A follow-up the lesson expects. Your LRU cache is single-threaded. What breaks with two threads?

[pause]

A hit is six pointer writes, and a miss is a map update plus an unlink and a push. Interleave two and you get a node on the list twice, a dropped node, or a cycle, because no intermediate state is a valid list. Lock both get and put, since a get moves the node to the front, and if the lock is contended, shard into several independent caches by key hash. The common wrong answer is "reads do not need the lock".

And: delete a node from a singly linked list when you only have a pointer to that node. Copy the successor's value into it and unlink the successor, in constant time. Then state the two caveats: it fails on the tail, and any outside pointer to the successor now refers to the wrong value. Which is why the doubly linked list is the real answer whenever handles are held.

## Recap

Four things to remember. Insertion is constant time only given the position; finding it is a linear walk. In pointer surgery, save the pointer before you overwrite it, or you lose the tail and make a self-loop. Use a sentinel by default, and after a bypass, do not advance. A list walk is one dependent cache miss per node, 10 to 50 times slower than an array scan, at 20 to 40 times the memory in Python. And lists win only where the position is held: deque blocks, kernel lists, free lists, and the LRU's hash map plus doubly linked list.

At your desk: the insert and sentinel traces, the traversal visualisers, the node-size tables, the LRU trace and the kernel layout, and the two exercises, sorted insert and delete by value.
