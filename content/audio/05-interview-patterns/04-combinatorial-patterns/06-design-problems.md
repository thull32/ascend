---
lesson: design-problems
source: df156f33b1d8b364
fit: partial
desk:
  - "The building-blocks table, and the indexed-array composition in Python and JavaScript with its differential test"
  - "The LRU and LFU classes, Min Stack, Design Twitter and the circular queue, with every structure shown after each operation"
  - "The near-misses, variations and complexity tables"
  - "The measurements: OrderedDict and Map LRUs, random.choice, swap-with-last removal, the unlocked LRU under four threads"
  - "Exercises: snapshot array, and LFU cache"
---
## Introduction

"Design a data structure that supports insert, remove and get-random, each in average constant time." There is no algorithm to discover and no search space to prune. The problem is a list of operations with a budget, and the difficulty is that no single structure meets the whole budget.

A hash set finds a value in constant time, but cannot hand you a uniformly random member without walking it. An array returns a random element in constant time, but needs linear time to find the value you want to remove. The answer is to use both. And then the whole interview turns on one question: after every operation, do the two structures still agree?

That is the pattern. Write the operations down, find the cheapest structure for each, notice the conflict, and compose two structures whose consistency you guarantee with an explicit invariant. Every method becomes locate, mutate, repair. Design rounds are also where the senior bar is most visible: coding the class is table stakes, and the follow-ups, amortised against worst case, concurrency, what you would use in production, are where the level is decided.

## The signal

"Implement the class with these methods", each with a required complexity. A stream of operations with state kept across calls: the k-th largest after each add, or the median so far. Capacity and eviction: "evict the least recently used", "a fixed-size buffer". Time or versions: "the value as of timestamp t". Randomness over a changing set. And access patterns no single structure serves: by key and by recency, last-in-first-out and minimum, per-user lists and a global recency order.

What rules it out? A single query on fixed input is an algorithm question, even when phrased as a class. And operations that one structure already serves. Put, get and delete by key is a hash map; a second structure without a conflict that forces it is over-engineering, and interviewers notice.

A few near misses. "Evict the least recently used" looks like a heap keyed by last-use time, but every access changes the order, and a heap would need decrease-key; it is a hash map plus a doubly linked list. "Entries expire after a TTL" looks like LRU, but the order is expiry time, not use: a map plus a min-heap by expiry, checked lazily. "Median of a stream" looks like a sorted list, but only the middle is ever read: two heaps.

## The template

Five steps, and the first three happen before any code. List the operations and their budgets. Name the structure that does each one best. Find the conflict, and choose a primary store, which serves the hardest operation, and an index into it, which makes it addressable. Write the invariant that ties them together, in one sentence. Then implement each method as locate, mutate, repair, and test with sequences that hit the edges: remove the last element, evict at capacity 1, wrap around.

The composition you will use most is a dense array plus an index map. The array is the primary store: every slot holds one value, so a uniform random index is a uniform random member. The map takes each value to its position. The invariant: the map says value v is at position i exactly when the array holds v at position i.

Removal is the move to know. To remove v, look up its position, copy the last value into that slot, update the moved value's map entry, pop the array, and delete v from the map. The hole is filled, nothing shifts, and it is constant time. Order is not kept, and nobody asked for it.

## Why it is correct, and where the bugs live

A composite structure is correct when two things hold. The representation invariant is true after every public method: here, the map and the array describe the same values at the same positions, with no holes. And the abstraction function maps every such state to the value the class represents, here the set of values in the array, and each method changes that value exactly as specified. The constructor establishes the invariant; each method, assuming it on entry, restores it on exit; correctness follows by induction over any sequence of calls.

That framing tells you where bugs live: in the pairing of each mutation with its repair, in an order that survives aliasing. In removal, the last value and v are the same value when v happens to be last. So which order is right: repair the moved value's entry first, or delete v's entry first?

[pause]

Repair first, delete second. If you delete first, then removing the last element writes its entry straight back, and the map now claims a value that is no longer in the array. From then on, get-random can hand back a removed value, or inserting it again reports that it is already present. Repair-then-delete handles the case with no special branch.

How do you find a bug like that? Test the way the hidden tests will: random sequences of operations against a slow model whose correctness is obvious, a plain set, checking the invariant after every step. With a key space of only 8 values, "remove the last element" happens constantly, and the bug surfaces within the first few sequences.

A trace, said aloud. Insert 10, 20 and 30: the array is 10, 20, 30. Remove 10: the last value, 30, moves into slot 0, and the array is 30, 20. Remove 30: 20 moves into slot 0, and the array is 20. Remove 20: it is itself the last value, the aliasing case, and the array is empty.

If duplicates are allowed, the map takes each value to a set of positions, and the swap moves one position of the relocated value.

## LRU and LFU

LRU Cache: get returns the value or minus 1, put inserts or updates, and a put beyond capacity evicts the least recently used key. Gets and puts both count as uses. Find by key needs a hash map. Recency needs a sequence where any element can move to the front and the oldest can leave, in constant time. An array cannot move from the middle cheaply, and a singly linked list cannot unlink a node without its predecessor. A doubly linked list can, once the map hands you the node.

The invariant: the map holds exactly the keys in the list, each entry points at the node holding that key, and the list runs from most to least recently used. Two details make the code clean. Sentinel head and tail nodes remove every null check. And each node stores its own key, because eviction finds the oldest node at the tail and must then delete its key from the map.

With capacity 2: put 1, put 2, get 1, then put 3. Which key is evicted? The get moved 1 to the front, so 2 is the least recent, and 2 goes. If get had not refreshed recency, 1 would have been evicted, and every later answer would differ. That is the most common failing test for this problem.

LFU evicts the key with the fewest uses, with ties going to the least recent. A heap keyed by count would need a decrease-key on every access. The way out is the shape of the updates: a count only ever rises by exactly 1. So keep a bucket per count, each an ordered set of keys, oldest use first, plus one variable for the smallest non-empty count.

Only two events can change that minimum. When a use empties the minimum bucket, the new minimum is that count plus one, because the touched key just moved there and nothing lies below. When a new key arrives, the minimum is 1. Nothing else changes it, so no scan is ever needed. The bug: forgetting to reset the minimum to 1 on insert, so eviction looks in a stale, higher bucket and throws out a frequently used key.

## Stacks, feeds and rings

Min Stack wants push, pop, top and get-minimum, all constant time. Store with each element the minimum as of that element, so popping restores the previous minimum for free. The two-stack version pushes onto a separate minimum stack only when the new value is at most the current minimum, and "at most" matters. Push 5, 3, 7, and 3 again. With "strictly less", the second 3 is not recorded, the first pop removes the minimum stack's only 3, and get-minimum answers 5 while a 3 is still on the stack.

Design Twitter: post, follow, unfollow, and a feed of the 10 newest tweets from a user and everyone they follow. Each author's list is already in time order, so the feed is a k-way merge. Seed a heap with each author's newest tweet, pop the newest overall, and push that author's previous tweet. The cost is the number of authors plus 10 times the log of the number of authors, without sorting everything.

A circular queue has fixed capacity, constant time for everything, and no allocation after construction: an array, a head, and a count. With only a head and a tail, "head equals tail" means both empty and full, so keep a count, a full flag, or one wasted slot. A power-of-two capacity turns the modulo into a mask, which is why network cards and lock-free queues use such sizes.

Say what kind of constant time you mean. "Average" is the hash map's expected cost. "Amortised" is a dynamic array's occasional full copy. Only the ring buffer is constant time in the worst case.

## Under the hood

CPython's OrderedDict is a dict plus a doubly linked list, written in C, so moving a key to the end and popping the oldest are constant time. On a million operations, an OrderedDict LRU took 121 milliseconds and the hand-written one 153. In production Python, use the library; in the interview, write the list, because building it is the question. In Node, an LRU built by deleting and re-setting keys in a Map was four to five times slower than a hand-written list, because each re-insert leaves a deleted slot behind in its ordered table.

Picking at random from a Python set copies it into a list first: about a quarter of a millisecond per call at 100 thousand members, which is 24 seconds for 100 thousand calls. That is why the array exists.

And the GIL does not make a method atomic. It makes each bytecode atomic. Four threads hammering one unlocked LRU of capacity 100 ended, in one run, with 300 map entries and a list turned into a cycle, plus errors from half-unlinked nodes. Unlinking and pushing to the front are four pointer writes each, and a thread switch between them leaves list and map disagreeing. A lock around each public method fixes it.

## In the interview

"Make the LRU thread-safe for a read-heavy service."

[pause]

Every get mutates the list, so a read-write lock gives you nothing: reads are writes. Start with one lock per cache, then shard by key hash into independent LRUs to cut contention, at the cost of exact global LRU. Production caches go further: Caffeine records reads in lossy buffers and applies them in batches, and Redis avoids the list entirely by sampling a few keys and evicting the oldest. The wrong answer is "reads do not modify anything".

"Design Twitter with 100 million users, some with 10 million followers." The in-memory merge is fan-out on read. At scale you precompute timelines, fan-out on write, which makes reads cheap but costs on the order of 10 million writes per celebrity post. The usual answer is a hybrid: push for ordinary accounts, pull for accounts above a follower threshold, merged at read time.

"Add a TTL to the LRU." Keep the expiry in the node and treat an expired hit as a miss; to reclaim memory without waiting for reads, add a min-heap of expiries and pop expired entries on each operation, skipping stale ones. Not a background thread that scans the whole map every second.

## Recap

Five things to remember. Start with the operation table, find the conflict, and state the invariant in one sentence. Every method is locate, mutate, repair, with the repair ordered to survive aliasing, and tested against a slow model. LRU is a hash map plus a doubly linked list whose nodes store their keys. LFU needs no heap, because counts rise by exactly 1, so buckets plus a minimum suffice. And say average, amortised or worst case, and remember that the GIL does not make a method atomic.

At your desk: the building-blocks table and the indexed array with its differential test, the five classes traced operation by operation, the measurements, and the two exercises on the snapshot array and the LFU cache.
