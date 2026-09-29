---
slug: design-problems
title: "Design problems: compose two structures and state the invariant that binds them"
description: Turn "implement a class supporting these operations in O(1)" into an operation table, pick one structure per requirement and bind them with an invariant, and see Insert Delete GetRandom, LRU, LFU, Min Stack, Design Twitter and a ring buffer traced with their internal structures after every operation, plus what OrderedDict, random.choice and the GIL actually do.
minutes: 45
difficulty: medium
tags: [design, data-structure-design, hash-map, linked-list, ring-buffer, invariants, pattern:design]
problems: [lru-cache, time-based-kv, min-stack, design-hashmap, design-circular-queue, insert-delete-getrandom, kth-largest-stream, design-twitter, find-median-data-stream]
---
"Design a data structure that supports `insert`, `remove` and `getRandom`, each in average `O(1)`." There is no algorithm to discover and no search space to prune. The problem is a list of operations with a complexity budget, and the difficulty is that no single structure meets the whole budget. A hash set finds values in `O(1)` but cannot hand you a uniformly random member without walking it. An array returns a random element in `O(1)` but needs `O(n)` to find the value you want to remove. The answer is to use both, and the whole interview then turns on one question: after every operation, do the two structures still agree?

That is the pattern. Write the operations down, find the cheapest structure for each, notice the conflict, and **compose two structures whose consistency you guarantee with an explicit invariant**. Every method becomes "locate, mutate, repair". Design rounds are also where the senior bar is most visible: coding the class is table stakes, and the follow-up conversation (amortised versus worst case, what breaks under concurrency, what you would use in production) is where the level is decided. The cache policies themselves are covered in [LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache) and [LFU and modern policies](/learn/advanced-data-structures/caches-and-eviction/lfu-and-modern-policies); this lesson is about executing the composition under interview conditions.

## The signal

- **"Implement the class `X` with these methods"**, each with a required complexity ("in `O(1)`", "average `O(1)`", "`O(log n)`").
- **A stream of operations with state kept across calls**: "add a number, then report the k-th largest after each add" ([Kth Largest Element in a Stream](/practice/kth-largest-stream)), "report the median so far" ([Find Median from Data Stream](/practice/find-median-data-stream)).
- **Capacity and eviction**: "evict the least recently used" ([LRU Cache](/practice/lru-cache)), "fixed-size buffer" ([Design Circular Queue](/practice/design-circular-queue)).
- **Time or versions**: "the value as of timestamp `t`" ([Time Based Key-Value Store](/practice/time-based-kv)), "take a snapshot".
- **Randomness over a changing set** ([Insert Delete GetRandom O(1)](/practice/insert-delete-getrandom)).
- **Access patterns that no single structure serves**: by key *and* by recency, by key *and* by position, LIFO *and* minimum ([Min Stack](/practice/min-stack)), per-user lists *and* a global recency order ([Design Twitter](/practice/design-twitter)).

What rules it out:

- **A single query on fixed input** is an algorithm question, even when phrased as "write a class".
- **Operations one structure already serves.** Put, get and delete by key is a hash map ([Design HashMap](/practice/design-hashmap) asks you to build that map, a different exercise). A second structure without a conflict that forces it is over-engineering, and interviewers notice.

The confusable round is distributed [system design](/learn/system-design/building-blocks/the-design-interview-method). This lesson is the in-memory version, but its follow-ups deliberately bridge the two: memory per entry, concurrency, persistence.

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Evict the least recently used" | a heap keyed by last-use time | hash map + doubly linked list | every access changes the order; a heap would need decrease-key |
| "Evict the least frequently used, ties to the least recent" | LRU plus a counter, or a heap | key map + per-frequency ordered buckets + `min_freq` | counts change by exactly +1 |
| "Entries expire after a TTL" | LRU | map + min-heap or timing wheel by expiry, checked lazily on read | the order is expiry time, not use |
| "Random element; duplicates allowed" | Insert Delete GetRandom | map from value to a *set* of indices | one value occupies several slots |
| "The 10 most recent tweets from everyone I follow" | sort every tweet | k-way merge of per-user lists with a heap | each list is already in time order |
| "Stack with `getMin`; now also `popMin`" | Min Stack | doubly linked list + sorted map or heap with lazy deletion | removal from the middle |
| "Median of a stream" | a sorted list with `insort` | two heaps | only the middle is ever read |
| "Design a hash map" | two structures | one: buckets, a hash, a resize | no conflicting operations |

## The template

Five steps; the first three happen before any code:

1. **List the operations and their budgets.**
2. **Name the structure that does each one best.**
3. **Find the conflict**; choose a primary store (serves the hardest operation) and an index into it (makes it addressable).
4. **Write the invariant** that ties them together, in one sentence.
5. **Implement each method as locate, mutate, repair**, and test with operation sequences that hit the edges: remove the last element, evict at capacity 1, wrap around.

| Requirement | Building block | Cost |
|---|---|---|
| Find by key | hash map | `O(1)` average |
| Uniform random element | dense array | `O(1)` |
| Delete from the middle of an array | swap with the last element, then pop | `O(1)`, order not kept |
| Recency order: move to front, delete anywhere | doubly linked list + map from key to node | `O(1)` |
| Minimum of a LIFO sequence | stack of (value, minimum so far) | `O(1)` |
| k-th largest of a stream | min-heap holding the k largest | `O(log k)` per add |
| Newest items across many sorted lists | heap of one cursor per list | `O(log lists)` per item |
| Latest version at or before `t` | per-key append-only list + binary search | `O(log versions)` |
| FIFO with fixed capacity | ring buffer: array + head + count | `O(1)`, no allocation |
| Ordered keys, floor and ceiling | balanced BST, skip list or sorted container | `O(log n)` |

The composition you will use most is **a dense array plus an index map**:

```python
class IndexedArray:
    """O(1) add, remove, contains and uniform random over a set of values."""
    def __init__(self):
        self.items = []          # primary store: dense, so every slot is one value
        self.pos = {}            # index. Invariant: pos[v] == i  <=>  items[i] == v

    def add(self, v):
        if v in self.pos:
            return False
        self.pos[v] = len(self.items)
        self.items.append(v)
        return True

    def remove(self, v):
        if v not in self.pos:                  # locate
            return False
        i, last = self.pos[v], self.items[-1]
        self.items[i] = last                   # mutate: fill the hole with the last value
        self.pos[last] = i                     # repair the moved value's index entry
        self.items.pop()
        del self.pos[v]                        # delete last, so this is right even if v was last
        return True

    def _check(self):                          # the invariant, executable
        assert len(self.items) == len(self.pos)
        assert all(self.pos[v] == i for i, v in enumerate(self.items))
```

```javascript
class IndexedArray {
  constructor() {
    this.items = [];
    this.pos = new Map();                      // invariant: pos.get(v) === i  <=>  items[i] === v
  }
  add(v) {
    if (this.pos.has(v)) return false;
    this.pos.set(v, this.items.length);
    this.items.push(v);
    return true;
  }
  remove(v) {
    if (!this.pos.has(v)) return false;
    const i = this.pos.get(v), last = this.items[this.items.length - 1];
    this.items[i] = last;
    this.pos.set(last, i);
    this.items.pop();
    this.pos.delete(v);                        // after the repair, so removing the last value works
    return true;
  }
}
```

Test it the way the interviewer's hidden tests will: random operation sequences against a slow model whose correctness is obvious, checking the invariant after every step.

```python
import random

def differential_test(trials=500, steps=200):
    for _ in range(trials):
        fast, model = IndexedArray(), set()
        for _ in range(steps):
            v = random.randrange(8)                  # a small key space forces collisions
            if random.random() < 0.5:
                assert fast.add(v) == (v not in model); model.add(v)
            else:
                assert fast.remove(v) == (v in model); model.discard(v)
            fast._check()
            assert set(fast.items) == model
```

## Why the composition is correct

A composite structure is correct when two things hold. The **representation invariant** is true after every public method (here: `pos` and `items` describe the same values at the same positions, and `items` has no holes). The **abstraction function** maps any state satisfying it to the value the class represents (here: the set of values in `items`), and each method changes that value exactly as its specification says. Correctness then follows by induction over any sequence of calls: the constructor establishes the invariant, and each method, assuming it on entry, restores it on exit.

That framing tells you where the bugs live. Every mutation of one structure must be paired with the repair of the other *in an order that survives aliasing*: in `remove`, `last` and `v` are the same value when `v` is the last element. Repairing first (`pos[last] = i`) and deleting second (`del pos[v]`) leaves the map right in both cases; the reverse order resurrects an entry for a removed value. The differential test above finds that bug within the first few sequences, because a key space of 8 makes "remove the last element" frequent.

## Worked problems

### Insert Delete GetRandom O(1)

[Insert Delete GetRandom O(1)](/practice/insert-delete-getrandom): `insert(v)`, `remove(v)` (each returning whether it changed anything) and `get_random()`, uniform over current members, all average `O(1)`.

`insert` and `remove` want a hash set; `get_random` wants a dense array, because a uniform index into it is a uniform member. Neither Python's `set` nor JavaScript's `Set` is indexable, so random selection from them materialises a list in `O(n)`. The composition is `IndexedArray` plus one method:

```python
import random

class RandomizedSet(IndexedArray):
    insert = IndexedArray.add
    def get_random(self):
        return random.choice(self.items)       # uniform: every member has exactly one slot
```

| operation | `items` after | `pos` after | note |
|---|---|---|---|
| insert 10 | `[10]` | `{10: 0}` | |
| insert 20 | `[10, 20]` | `{10: 0, 20: 1}` | |
| insert 30 | `[10, 20, 30]` | `{10: 0, 20: 1, 30: 2}` | |
| remove 10 | `[30, 20]` | `{30: 0, 20: 1}` | the last value, 30, moves into slot 0 |
| get_random | | | uniform index in `[0, 2)` |
| remove 30 | `[20]` | `{20: 0}` | 30 is at slot 0; 20 moves in, pop |
| remove 20 | `[]` | `{}` | 20 is itself the last value: the aliasing case |
| insert 40 | `[40]` | `{40: 0}` | |

With **duplicates allowed**, `pos` maps each value to a *set* of indices, and the swap moves one index of the relocated value from `n − 1` to `i`. With **weighted randomness**, keep prefix sums of the weights and binary search a random number ([randomisation](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation)).

### LRU Cache

[LRU Cache](/practice/lru-cache): `get(key)` returns the value or −1, `put(key, value)` inserts or updates, and a put beyond `capacity` evicts the least recently *used* key; gets and puts both count as uses. All `O(1)`.

Find by key needs a hash map. Recency needs a sequence where any element moves to the front and the oldest leaves, in `O(1)`. An array cannot move from the middle cheaply, and a singly linked list cannot unlink a node without its predecessor. A **doubly linked list** can, once the map hands you the node. Invariant: *the map holds exactly the keys in the list, each entry points at the node holding that key, and the list runs from most to least recently used.*

```python
class Node:
    __slots__ = ("key", "val", "prev", "next")
    def __init__(self, key=0, val=0):
        self.key, self.val, self.prev, self.next = key, val, None, None

class LRUCache:
    def __init__(self, capacity):
        self.cap, self.map = capacity, {}
        self.head, self.tail = Node(), Node()        # sentinels: no None checks anywhere
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, node):
        node.prev.next, node.next.prev = node.next, node.prev

    def _push_front(self, node):
        node.prev, node.next = self.head, self.head.next
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        node = self.map.get(key)
        if node is None:
            return -1
        self._unlink(node)
        self._push_front(node)                       # a read is a use
        return node.val

    def put(self, key, val):
        if self.cap == 0:
            return
        node = self.map.get(key)
        if node:                                     # update in place, refresh recency
            node.val = val
            self._unlink(node)
            self._push_front(node)
            return
        if len(self.map) == self.cap:
            lru = self.tail.prev                     # least recent sits immediately before the tail
            self._unlink(lru)
            del self.map[lru.key]                    # this is why nodes store their key
        node = Node(key, val)
        self.map[key] = node
        self._push_front(node)
```

```javascript
class LRUNode { constructor(key = 0, val = 0) { this.key = key; this.val = val; this.prev = null; this.next = null; } }

class LRUCache {
  constructor(capacity) {
    this.cap = capacity; this.map = new Map();
    this.head = new LRUNode(); this.tail = new LRUNode();       // sentinels
    this.head.next = this.tail; this.tail.prev = this.head;
  }
  unlink(n) { n.prev.next = n.next; n.next.prev = n.prev; }
  pushFront(n) { n.prev = this.head; n.next = this.head.next; this.head.next.prev = n; this.head.next = n; }
  get(key) {
    const n = this.map.get(key);
    if (n === undefined) return -1;
    this.unlink(n); this.pushFront(n);                           // a read is a use
    return n.val;
  }
  put(key, val) {
    if (this.cap === 0) return;
    let n = this.map.get(key);
    if (n) { n.val = val; this.unlink(n); this.pushFront(n); return; }
    if (this.map.size === this.cap) { const lru = this.tail.prev; this.unlink(lru); this.map.delete(lru.key); }
    n = new LRUNode(key, val); this.map.set(key, n); this.pushFront(n);
  }
}
```

Capacity 2, both structures after each operation:

| operation | list, most → least recent | map keys | returns | note |
|---|---|---|---|---|
| put(1, 1) | 1 | {1} | | |
| put(2, 2) | 2, 1 | {1, 2} | | |
| get(1) | 1, 2 | {1, 2} | 1 | the read moves 1 to the front |
| put(3, 3) | 3, 1 | {1, 3} | | full: unlink `tail.prev` (2), `del map[node.key]` |
| get(2) | 3, 1 | {1, 3} | −1 | |
| put(4, 4) | 4, 3 | {3, 4} | | evict 1 |
| get(1) | 4, 3 | {3, 4} | −1 | |
| get(3) | 3, 4 | {3, 4} | 3 | |
| get(4) | 4, 3 | {3, 4} | 4 | |

If `get(1)` had not refreshed recency, `put(3, 3)` would have evicted 1 instead of 2, and every later answer would differ: the most common failing test for this problem.

```viz
{"type": "system", "scenario": "lru-cache", "keys": ["A", "B", "A", "C", "D", "B", "A"], "title": "Recency order under a stream of accesses", "caption": "Capacity 3. A hit moves the key to the front; a miss at capacity evicts the key at the back, the least recently used."}
```

### LFU Cache

LFU evicts the key with the fewest uses, ties going to the least recent among them. A heap keyed by count would need a decrease-key on every access. The shape of the updates is the way out: a count only ever grows by exactly 1. So keep **buckets**, one ordered set of keys per count, plus `min_freq`, the smallest non-empty count. Invariant: *every key is in exactly the bucket of its count, oldest use first, and `min_freq` names the lowest non-empty bucket.*

```python
from collections import defaultdict, OrderedDict

class LFUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.val = {}                                 # key -> value
        self.freq = {}                                # key -> number of uses
        self.buckets = defaultdict(OrderedDict)       # uses -> keys, least recent first
        self.min_freq = 0

    def _touch(self, key):                            # one more use: move up a bucket
        f = self.freq[key]
        del self.buckets[f][key]
        if not self.buckets[f]:
            del self.buckets[f]
            if self.min_freq == f:
                self.min_freq = f + 1                 # the touched key moved there
        self.freq[key] = f + 1
        self.buckets[f + 1][key] = None               # newest at the end

    def get(self, key):
        if key not in self.val:
            return -1
        self._touch(key)
        return self.val[key]

    def put(self, key, value):
        if self.cap == 0:
            return
        if key in self.val:
            self.val[key] = value
            self._touch(key)                          # an update is a use
            return
        if len(self.val) == self.cap:
            bucket = self.buckets[self.min_freq]
            victim, _ = bucket.popitem(last=False)    # least recent among the least used
            if not bucket:
                del self.buckets[self.min_freq]
            del self.val[victim], self.freq[victim]
        self.val[key] = value
        self.freq[key] = 1
        self.buckets[1][key] = None
        self.min_freq = 1                             # a new key is always the least used
```

Capacity 2:

| operation | buckets after (count: keys, oldest first) | `min_freq` | returns |
|---|---|---|---|
| put(1, 1) | 1: [1] | 1 | |
| put(2, 2) | 1: [1, 2] | 1 | |
| get(1) | 1: [2]; 2: [1] | 1 | 1 |
| put(3, 3) | full, evict oldest of bucket 1 (2); 1: [3]; 2: [1] | 1 | |
| get(2) | unchanged | 1 | −1 |
| get(3) | 2: [1, 3]; bucket 1 emptied | 2 | 3 |
| put(4, 4) | full, evict oldest of bucket 2 (1); 1: [4]; 2: [3] | 1 | |
| get(1) | unchanged | 1 | −1 |
| get(3) | 1: [4]; 3: [3] | 1 | 3 |
| get(4) | 2: [4]; 3: [3]; bucket 1 emptied | 2 | 4 |

The two `min_freq` updates carry the correctness. When a touch empties the minimum bucket, the new minimum is `f + 1`, because the touched key is there and nothing is below `f`. When a new key arrives, the minimum is 1. Nothing else can change the minimum, so no scan is ever needed. The class was checked against a brute-force model (a dict of `(value, count, last use)` and a `min` over it) on 3,000 random operation sequences.

```viz
{"type": "system", "scenario": "lfu-cache", "keys": ["A", "A", "B", "C", "A", "D", "B", "E", "A", "D"], "title": "LFU: frequency first, recency breaks ties", "caption": "Capacity 3. A new key enters at frequency 1 and is the first candidate for eviction; among equal frequencies the least recently used goes."}
```

### Min Stack

[Min Stack](/practice/min-stack): `push`, `pop`, `top` and `get_min`, all `O(1)`. Store the minimum *as of each element*: every entry is `(value, min(value, previous minimum))`, so popping restores the previous minimum for free.

```python
class MinStack:
    def __init__(self):
        self.st = []                                  # (value, minimum of the stack up to here)
    def push(self, v):
        self.st.append((v, min(v, self.st[-1][1]) if self.st else v))
    def pop(self):
        self.st.pop()
    def top(self):
        return self.st[-1][0]
    def get_min(self):
        return self.st[-1][1]
```

| operation | stack after, bottom → top | returns |
|---|---|---|
| push 5 | (5, 5) | |
| push 3 | (5, 5) (3, 3) | |
| push 7 | (5, 5) (3, 3) (7, 3) | |
| push 3 | (5, 5) (3, 3) (7, 3) (3, 3) | |
| get_min | | 3 |
| pop | (5, 5) (3, 3) (7, 3) | |
| get_min | | 3 |
| pop, pop | (5, 5) | |
| get_min | | 5 |

The two-stack version pushes onto a separate min-stack only when `v <= current_min`. The `<=` matters: with `<`, the second 3 is not recorded, the first pop removes the min-stack's only 3, and `get_min` answers 5 while a 3 is still on the stack.

```viz
{"type": "stack-queue", "algorithm": "min-stack", "operations": [["push", 5], ["push", 3], ["push", 7], ["push", 3], ["getMin"], ["pop"], ["getMin"], ["pop"], ["pop"], ["getMin"]], "title": "Min stack with a duplicate minimum", "caption": "The second 3 is also pushed onto the min-stack, so popping one 3 leaves the minimum at 3, not 5."}
```

### Design Twitter

[Design Twitter](/practice/design-twitter): `post_tweet(user, id)`, `follow`, `unfollow`, and `get_news_feed(user)`, the 10 most recent tweet ids from the user and everyone they follow. Posting and following are `O(1)` with a per-user list of `(time, id)` and a per-user set of followees. The feed is a **k-way merge**: each author's list is already sorted by time, so a heap holding one cursor per author yields the newest tweets in order without sorting everything.

```python
import heapq, itertools
from collections import defaultdict

class Twitter:
    def __init__(self):
        self.clock = itertools.count()             # global order: larger means newer
        self.tweets = defaultdict(list)            # user -> [(time, tweet_id)], oldest first
        self.follows = defaultdict(set)            # user -> followees

    def post_tweet(self, user, tweet_id):
        self.tweets[user].append((next(self.clock), tweet_id))

    def follow(self, follower, followee):
        if follower != followee:                   # a user always sees their own tweets
            self.follows[follower].add(followee)

    def unfollow(self, follower, followee):
        self.follows[follower].discard(followee)

    def get_news_feed(self, user, limit=10):
        heap = []
        for u in self.follows[user] | {user}:
            if self.tweets[u]:
                i = len(self.tweets[u]) - 1        # each author's newest tweet
                t, tid = self.tweets[u][i]
                heap.append((-t, tid, u, i))
        heapq.heapify(heap)                        # max-heap on time via negation
        feed = []
        while heap and len(feed) < limit:
            _, tid, u, i = heapq.heappop(heap)
            feed.append(tid)
            if i > 0:                              # that author's next-newest tweet
                t, nxt = self.tweets[u][i - 1]
                heapq.heappush(heap, (-t, nxt, u, i - 1))
        return feed
```

```javascript
class Twitter {
  constructor() { this.clock = 0; this.tweets = new Map(); this.follows = new Map(); }
  postTweet(user, tweetId) {
    if (!this.tweets.has(user)) this.tweets.set(user, []);
    this.tweets.get(user).push([this.clock++, tweetId]);
  }
  follow(a, b) { if (a === b) return; if (!this.follows.has(a)) this.follows.set(a, new Set()); this.follows.get(a).add(b); }
  unfollow(a, b) { this.follows.get(a)?.delete(b); }
  getNewsFeed(user, limit = 10) {
    // No heap in JavaScript: take at most `limit` newest per author, then sort that pool.
    const authors = new Set(this.follows.get(user) ?? []); authors.add(user);
    const pool = [];
    for (const u of authors) pool.push(...(this.tweets.get(u) ?? []).slice(-limit));
    pool.sort((x, y) => y[0] - x[0]);                         // newest first
    return pool.slice(0, limit).map((x) => x[1]);
  }
}
```

Users 1, 2 and 3 post 101, 102, 103, 104 (user 1), 105 (user 3), 106 (user 2) at times 0–5; user 1 follows 2 and 3. Then `get_news_feed(1, limit=4)`:

| step | popped `(−time, id, author)` | feed | pushed (that author's previous tweet) | heap after |
|---|---|---|---|---|
| start | | | one cursor per author | (−5, 106), (−4, 105), (−3, 104) |
| 1 | (−5, 106, user 2) | 106 | (−1, 102) | (−4, 105), (−3, 104), (−1, 102) |
| 2 | (−4, 105, user 3) | 106, 105 | (−2, 103) | (−3, 104), (−2, 103), (−1, 102) |
| 3 | (−3, 104, user 1) | 106, 105, 104 | (0, 101) | (−2, 103), (−1, 102), (0, 101) |
| 4 | (−2, 103, user 3) | 106, 105, 104, 103 | limit reached | |

After `unfollow(1, 2)` the feed is `[105, 104, 103, 101]`. The merge costs `O(F + limit · log F)` for `F` authors; the JavaScript pool-and-sort costs `O(F · limit · log(F · limit))`, fine for interview sizes. Both were checked against a brute-force "filter the global log" model on 2,000 random sequences.

### Design Circular Queue

[Design Circular Queue](/practice/design-circular-queue): fixed capacity `k`, `O(1)` everything, no allocation after construction. A ring buffer: array, `head`, `count`. Invariant: *the elements, oldest first, are `buf[(head + i) % k]` for `i` in `[0, count)`*; the rear is at `(head + count − 1) % k`, the next free slot at `(head + count) % k`.

```python
class MyCircularQueue:
    def __init__(self, k):
        self.buf, self.k, self.head, self.count = [0] * k, k, 0, 0
    def enqueue(self, value):
        if self.count == self.k:
            return False
        self.buf[(self.head + self.count) % self.k] = value
        self.count += 1
        return True
    def dequeue(self):
        if self.count == 0:
            return False
        self.head = (self.head + 1) % self.k      # nothing to clear: the slot is dead
        self.count -= 1
        return True
    def front(self):
        return self.buf[self.head] if self.count else -1
    def rear(self):
        return self.buf[(self.head + self.count - 1) % self.k] if self.count else -1
    def is_empty(self):
        return self.count == 0
    def is_full(self):
        return self.count == self.k
```

| operation | `buf` | `head` | `count` | returns |
|---|---|---|---|---|
| enqueue 1, 2, 3 | `[1, 2, 3]` | 0 | 3 | true ×3 |
| enqueue 4 | unchanged | 0 | 3 | false: full |
| dequeue | `[1, 2, 3]`, slot 0 dead | 1 | 2 | true |
| enqueue 4 | `[4, 2, 3]` | 1 | 3 | true: written at `(1 + 2) % 3 = 0` |
| rear | | | | `buf[(1 + 3 − 1) % 3]` = 4 |
| front | | | | `buf[1]` = 2 |

With only `head` and `tail`, `head == tail` means both empty and full; a count, a full flag or one wasted slot disambiguates. Power-of-two `k` turns `% k` into `& (k − 1)`, which is why network-card and lock-free queues use such sizes ([ring buffers](/learn/advanced-data-structures/log-structured-and-disk-structures/merkle-trees-and-ring-buffers)).

## Variations

| Variant | Change to the template | Why it stays correct |
|---|---|---|
| [Kth Largest in a Stream](/practice/kth-largest-stream) | min-heap of the `k` largest; push, pop if size exceeds `k` | the root is the smallest of the top `k` |
| [Find Median from Data Stream](/practice/find-median-data-stream) | max-heap of the lower half, min-heap of the upper, sizes differ by ≤ 1 | the roots straddle the middle ([Two heaps](/learn/interview-patterns/sequence-patterns/two-heaps)) |
| [Time Based Key-Value Store](/practice/time-based-kv) | per key, append `(t, value)`; `get` is `bisect_right − 1` | timestamps arrive increasing, so appends keep order |
| [Design HashMap](/practice/design-hashmap) | buckets with chaining, `key % buckets`, double at load factor ~0.75 | amortised `O(1)` ([hash tables](/learn/data-structures/hashing/hash-tables)) |
| Snapshot array | per-index history of `(snap_id, value)`, binary search on `get` | only changed cells cost memory (the exercise below) |
| TTL cache | map + min-heap of `(expiry, key)`, stale heap entries skipped on pop | expiry order is independent of use |
| Hit counter, rate limiter | ring buffer of per-second buckets, or a deque trimmed from the front | a circular queue indexed by time |
| Max Stack with `popMax` | doubly linked list + sorted map (or heap with lazy deletion) | removal from the middle needs the list |

## Complexity, derived

| Design | Hardest operation | Cost | Memory |
|---|---|---|---|
| RandomizedSet | `remove` | `O(1)` average (hash) | array slot + dict entry per value |
| LRU | `put` with eviction | `O(1)` average | dict entry + node (4 pointers) per key |
| LFU | `get` (moves buckets) | `O(1)` average | three dict entries + bucket entry per key |
| Min Stack | `push` | `O(1)` amortised (list growth) | a pair per element |
| Twitter | `get_news_feed` | `O(F + limit · log F)` | a list entry per tweet, a set entry per follow |
| Circular queue | any | `O(1)` worst case | `k` slots, fixed |

"Average" is the hash map's expected cost; "amortised" is a dynamic array's occasional `O(n)` copy. Say which one you mean. Only the ring buffer is `O(1)` in the worst case.

## Under the hood

### `OrderedDict` and JavaScript `Map`

CPython's `OrderedDict` has been implemented in C since 3.5: a regular dict plus a doubly linked list of nodes, with an array parallel to the dict's hash table that finds a key's node in `O(1)`, so `move_to_end` and `popitem(last=False)` are constant time. Measured on CPython 3.14 with 10⁵ integer entries: a plain dict cost 84 bytes per entry, an `OrderedDict` 137, and the hand-written LRU with `__slots__` nodes 148. On 10⁶ operations (70% gets, 20,000 keys, capacity 10,000), the `OrderedDict` LRU took 121 ms and the hand-written one 153 ms. In production Python, use `OrderedDict` (or `functools.lru_cache` for memoising a function); in the interview, write the list, because building it is the question.

JavaScript's `Map` iterates in insertion order, so `delete` then `set` moves a key to the end and `map.keys().next().value` is the oldest: an LRU in ten lines. In Node 24 it was also 4–5 times *slower* than the hand-written list (249–287 ms against 54–77 ms on the same 10⁶ operations): each delete-and-reinsert appends a new entry and leaves a deleted slot behind in V8's insertion-ordered table, which is reclaimed only when the table rehashes.

### `random.choice` and swap-with-last

`random.choice(seq)` is `seq[self._randbelow(len(seq))]`, and `_randbelow(n)` draws `n.bit_length()` random bits and rejects results `≥ n`. The result is exactly uniform, at a cost of fewer than two draws on average (1.9991 measured for `n = 2¹⁶ + 1`, the worst case). 10⁵ calls on a list took 12 ms. The same call on `list(s)` for a set of 10⁵ members cost 0.24 ms each, because it copies the set, which is 24 s for 10⁵ calls. Removal shows the same gap: swap-with-last removed all 10⁵ values in 21 ms, while `list.remove` took 3.2 s for the first 2 × 10⁴, since each call scans and shifts. In JavaScript, `Math.floor(Math.random() * n)` over V8's xorshift128+ generator, which builds each double from 53 random bits, is uniform to within about `n / 2⁵³`, negligible at interview sizes; neither generator is suitable for security.

### What the GIL does not protect

The GIL makes each bytecode atomic, not each method. Four Python threads calling `get` and `put` on one unlocked `LRUCache` (capacity 100, 300 keys) for three seconds, with the default switch interval, ended with the map at 300 entries and the list turned into a cycle in one run, and with 102 list nodes against 100 map entries in another, plus `KeyError` and `AttributeError` from half-unlinked nodes. `_unlink` and `_push_front` are four pointer writes each, and a thread switch between them leaves the list inconsistent with the map. A lock around each public method fixes it; see [Races, mutexes and invariants](/learn/systems/concurrency/races-mutexes-and-invariants).

## Failure modes

**Symptom: after some removals, `get_random` returns a value that was removed, or `insert` of it reports "already present".** Diagnosis: `del pos[v]` ran before `pos[last] = i`, so removing the last element resurrected its entry. Fix: repair first, delete second; the differential test catches it within a few sequences.

**Symptom: LRU fails the standard sequence at the first eviction.** Diagnosis: `get` does not move the node to the front, or `put` on an existing key creates a second node. Fix: both paths unlink and push front; `put` on an existing key updates in place.

**Symptom: LFU evicts a frequently used key right after a new insert.** Diagnosis: `min_freq` not reset to 1 when a new key arrives, so the eviction looks in a stale, higher bucket. Fix: set `min_freq = 1` on every insert of a new key.

**Symptom: Min Stack reports 5 while a 3 is still on the stack.** Diagnosis: the two-stack version pushes to the min-stack only on `<`, so a duplicate minimum is not recorded. Fix: `<=`, or store pairs.

**Symptom: an LRU in a threaded server slowly exceeds its capacity and eventually raises `KeyError` on eviction.** Diagnosis: unlocked shared cache, as measured above. Fix: one lock per cache, or sharded caches each with its own lock.

**Symptom: memory grows although the cache is bounded.** Diagnosis: `defaultdict` reads such as `self.buckets[f]` or `self.tweets[u]` insert empty entries for keys that were only looked up. Fix: `.get()` for reads, and delete buckets when they empty (as the LFU does).

## Trade-offs

| Implementation of LRU | Speed, 10⁶ ops (measured) | Memory per entry | Concurrency | Exact LRU |
|---|---|---|---|---|
| Hand-written list + dict (Python) | 153 ms | 148 B | needs a lock | yes |
| `OrderedDict` (Python) | 121 ms | 137 B | needs a lock | yes |
| Hand-written list + `Map` (Node) | 54–77 ms | a node object per key | single-threaded event loop | yes |
| `Map` delete-and-reinsert (Node) | 249–287 ms | one `Map` entry | single-threaded event loop | yes |
| Sharded LRU, `N` locks | same per shard | same | scales with shards | per shard only |
| Sampled LRU (Redis `maxmemory-samples`, default 5) | no list maintenance | a timestamp per key | no list to contend on | approximate |

## Interviewer follow-ups

**"Make the LRU thread-safe for a read-heavy service."** Model answer: every `get` mutates the list, so a read-write lock gives nothing; start with one mutex per cache, then shard by key hash into `N` independent LRUs to cut contention at the cost of exact global LRU. Production caches go further: Caffeine records reads in lossy ring buffers and applies them to the policy in batches under a try-lock, and Redis avoids the list entirely by sampling a few keys and evicting the oldest. Common wrong answer: "reads do not modify anything, so they need no lock".

**"Design Twitter with 10⁸ users; some have 10⁷ followers."** Model answer: the in-memory merge is fan-out on read, `O(F)` per feed; at scale you precompute timelines (fan-out on write: each post is pushed to every follower's timeline cache), which makes reads cheap but costs on the order of 10⁷ writes per post from a celebrity, so the usual answer is a hybrid: push for ordinary accounts, pull for accounts above a follower threshold, merged at read time. Common wrong answer: one global sorted list of tweets filtered per user.

**"Add a TTL to the LRU."** Model answer: keep the expiry in the node, check it on `get` and treat an expired hit as a miss; to reclaim memory without waiting for reads, add a min-heap (or a timing wheel) of `(expiry, key)` and pop expired entries on each operation, skipping stale heap entries whose key was refreshed. Common wrong answer: a background thread that scans the whole map every second.

**"`get_random` must allow duplicates."** Model answer: `pos` maps a value to a set of indices; `remove` takes any index `i` from the value's set, moves the last element into `i`, and updates the moved value's set by removing `n − 1` and adding `i` (unless `i == n − 1`); `get_random` is unchanged and now weights each value by its count. Common wrong answer: a counter per value, which makes random selection `O(distinct values)`.

**"The cache must survive a restart."** Model answer: persistence is a log, not a data-structure change: append each `put` to a write-ahead log and replay it on start, or snapshot periodically and replay the tail; recency order can be rebuilt approximately from the log order. Common wrong answer: pickling the linked list, which records pointers, not state.

## What mid-level engineers get wrong

- **Coding before the operation table.** The conflict (random access versus lookup, recency versus lookup) is the whole problem; missing it produces an `O(n)` method.
- **Repairing the index in the wrong order** in swap-with-last deletion, which corrupts the map only when the removed value is last.
- **A node that does not store its key**, so eviction cannot delete the map entry.
- **Forgetting `min_freq = 1` on insert** in LFU, or scanning buckets to find the minimum.
- **Saying `O(1)` without "average" or "amortised"**, then being unable to explain the resize spike.
- **Assuming reads are safe to run concurrently** in an LRU, or that the GIL makes a method atomic.
- **Reaching for `OrderedDict` or `Map` without saying so** in an interview that asked you to build the structure, or hand-rolling one in production when the library exists.

## Exercises

```exercise
id: snapshot-array
title: Snapshot array
prompt: |
  Implement `SnapshotArray`. The tests call `__init__(length)` first,
  creating an array of `length` zeros. Then:

  - `set(index, val)` sets the element at `index` to `val` (returns nothing).
  - `snap()` takes a snapshot and returns its id: 0 for the first call,
    then 1, 2, and so on.
  - `get(index, snap_id)` returns the value at `index` at the moment
    snapshot `snap_id` was taken.

  Copying the whole array on every `snap` costs O(length) per snapshot.
  Instead, keep a per-index history of `(snap_id, value)` pairs and
  binary search it in `get`.
languages: [python, javascript]
entry: SnapshotArray
starter:
  python: |
    class SnapshotArray:
        def __init__(self, length):
            # your code here
            pass

        def set(self, index, val):
            pass

        def snap(self):
            return 0

        def get(self, index, snap_id):
            return 0
  javascript: |
    class SnapshotArray {
      constructor(length) {
        // your code here
      }
      set(index, val) {}
      snap() { return 0; }
      get(index, snap_id) { return 0; }
    }
tests:
  - args: [["__init__", 3], ["set", 0, 5], ["snap"], ["set", 0, 6], ["get", 0, 0]]
    expected: [null, null, 0, null, 5]
  - args: [["__init__", 2], ["snap"], ["get", 1, 0]]
    expected: [null, 0, 0]
    label: never set, reads the initial zero
  - args: [["__init__", 1], ["set", 0, 4], ["snap"], ["snap"], ["snap"], ["get", 0, 2], ["set", 0, 7], ["get", 0, 1]]
    expected: [null, null, 0, 1, 2, 4, null, 4]
    label: snapshots with no changes in between
  - args: [["__init__", 2], ["set", 1, 3], ["set", 1, 9], ["snap"], ["set", 1, 1], ["snap"], ["get", 1, 0], ["get", 1, 1], ["get", 0, 1]]
    expected: [null, null, null, 0, null, 1, 9, 1, 0]
    label: several sets before one snapshot keep only the last
  - args: [["__init__", 4], ["snap"], ["set", 2, 8], ["snap"], ["set", 2, 0], ["snap"], ["get", 2, 0], ["get", 2, 1], ["get", 2, 2]]
    expected: [null, 0, null, 1, null, 2, 0, 8, 0]
    hidden: true
    label: setting a value back to zero
  - args: [["__init__", 1], ["snap"], ["set", 0, 1], ["snap"], ["set", 0, 2], ["get", 0, 0], ["get", 0, 1]]
    expected: [null, 0, null, 1, null, 0, 1]
    hidden: true
hints:
  - "history[i] starts as [(-1, 0)] or [(0, 0)]; set appends (current_snap_id, val), or overwrites the last pair if it has the same snap id."
  - "get(index, s) is the last pair in history[index] whose snap id is <= s: bisect_right on the snap ids, minus one."
  - "snap() returns the current id and then increments it."
```

```exercise
id: lfu-cache
title: LFU cache
prompt: |
  Implement `LFUCache`. The tests call `__init__(capacity)` first. Then:

  - `get(key)` returns the value stored for `key`, or -1 if absent.
  - `put(key, value)` stores the value (returns nothing). If `key` is new
    and the cache already holds `capacity` keys, first evict the key with
    the fewest uses; among keys tied on uses, evict the least recently
    used one.

  Every successful `get` and every `put` (new key or update) counts as a
  use. A new key starts with one use. A capacity of 0 stores nothing.
  Both operations must be O(1) on average: keep, for each use count, the
  keys with that count in recency order, plus the smallest count that
  currently has keys.
languages: [python, javascript]
entry: LFUCache
starter:
  python: |
    class LFUCache:
        def __init__(self, capacity):
            # your code here
            pass

        def get(self, key):
            return -1

        def put(self, key, value):
            pass
  javascript: |
    class LFUCache {
      constructor(capacity) {
        // your code here
      }
      get(key) { return -1; }
      put(key, value) {}
    }
tests:
  - args: [["__init__", 2], ["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2], ["get", 3], ["put", 4, 4], ["get", 1], ["get", 3], ["get", 4]]
    expected: [null, null, null, 1, null, -1, 3, null, -1, 3, 4]
  - args: [["__init__", 0], ["put", 0, 0], ["get", 0]]
    expected: [null, null, -1]
    label: capacity 0
  - args: [["__init__", 2], ["put", 1, 1], ["put", 2, 2], ["put", 1, 10], ["put", 3, 3], ["get", 2], ["get", 1], ["get", 3]]
    expected: [null, null, null, null, null, -1, 10, 3]
    label: an update counts as a use
  - args: [["__init__", 2], ["put", 1, 1], ["put", 2, 2], ["get", 1], ["get", 2], ["put", 3, 3], ["get", 1], ["get", 2], ["get", 3]]
    expected: [null, null, null, 1, 2, null, -1, 2, 3]
    label: tie on uses goes to the least recent
  - args: [["__init__", 1], ["put", 1, 1], ["get", 1], ["put", 2, 2], ["get", 1], ["get", 2]]
    expected: [null, null, 1, null, -1, 2]
    label: capacity 1 evicts even a frequent key
  - args: [["__init__", 2], ["put", 1, 1], ["get", 1], ["get", 1], ["put", 2, 2], ["put", 3, 3], ["get", 2], ["get", 3], ["get", 1]]
    expected: [null, null, 1, 1, null, null, -1, 3, 1]
    hidden: true
    label: a new key resets the minimum count to 1
  - args: [["__init__", 3], ["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["get", 1], ["get", 1], ["get", 2], ["put", 4, 4], ["get", 3], ["get", 4], ["put", 5, 5], ["get", 2], ["get", 1], ["get", 5]]
    expected: [null, null, null, null, 1, 1, 2, null, -1, 4, null, -1, 1, 5]
    hidden: true
hints:
  - "Keep key -> value, key -> count, and count -> ordered keys (OrderedDict in Python, Map in JavaScript, both keep insertion order)."
  - "A use moves a key from bucket f to the end of bucket f + 1; if bucket f empties and f was the minimum, the minimum becomes f + 1."
  - "On eviction, remove the first key of the minimum bucket; after inserting a new key, the minimum is 1."
```

## Senior signals

- You start with the **operation table**, name the conflict before choosing structures, and state **the invariant** in one sentence.
- You implement every method as **locate, mutate, repair**, order the repair to survive aliasing, and test with a **differential test against a slow model**.
- You separate **average, amortised and worst case**, and know only the ring buffer is `O(1)` worst case; resize pauses are why Redis rehashes its dictionaries incrementally.
- You explain **why LFU needs no heap**: counts change by exactly 1, so buckets plus `min_freq` stay `O(1)`.
- You treat the Twitter feed as a **k-way merge** and move to fan-out on write, on read, or a hybrid when the follower counts are named.
- You know **what the library does**: `OrderedDict` is 137 bytes per entry and faster than a hand-written list in CPython, a `Map`-based LRU is slower than a list in V8, and `random.choice` is exactly uniform by rejection.
- You know **the GIL does not make a method atomic**, and that an LRU's reads are writes, which is why production caches shard, batch or sample.

## Check yourself

```quiz
- q: >-
    In the swap-with-last removal, the code does del pos[v] before pos[last] = i. On which operation does this fail?
  options: ["Never; the two writes can safely go in either order", "Removing the element that sits first in the array", "Removing any element from a set of exactly two", "Removing the last element, whose entry gets re-created"]
  answer: 3
  explanation: >-
    When v is last, last == v. Deleting first and repairing second writes pos[v] back with pos[last] = i, so the map claims a value that is no longer in the array. Repairing first and deleting last handles the case with no special branch.
- q: >-
    Why does an LRU cache use a doubly linked list rather than a singly linked one?
  options: ["Singly linked lists cannot use a sentinel head node", "Doubly linked nodes use less memory than singly linked ones", "To print the cache in both directions for debugging", "Unlinking needs the predecessor, and prev gives it in O(1)"]
  answer: 3
  explanation: >-
    The hash map gives direct access to the node, and moving it to the front means unlinking it first. Unlinking needs node.prev, and a singly linked list would have to walk from the head to find it, which is O(n). The extra pointer costs memory; it is the price of O(1) moves.
- q: >-
    An LFU cache evicts by fewest uses. Why can it be O(1) without a heap?
  options: ["Counts are capped at a constant, so a heap is O(1) too", "Counts only rise by 1, so buckets and min_freq suffice", "Eviction scans every bucket, but the buckets are small", "Hash maps keep their keys sorted by value automatically"]
  answer: 1
  explanation: >-
    A use moves a key from bucket f to bucket f + 1, and a new key enters bucket 1, so the minimum can only become f + 1 (when bucket f empties) or 1 (on insert). Tracking it in a variable avoids both a heap's decrease-key and any scan over the buckets.
- q: >-
    Four Python threads share an unlocked LRU cache. Why can it end up above its capacity even with the GIL?
  options: ["Python threads run truly in parallel since 3.12", "The GIL is released during every dict lookup", "Dicts are not thread-safe for concurrent reads", "The GIL makes each bytecode atomic, not a method"]
  answer: 3
  explanation: >-
    A thread switch can happen between the pointer writes of an unlink and a push-front, leaving the list and the map inconsistent; in the measurement the map grew to 300 entries with capacity 100 and the list became a cycle. Every get writes to the list, so each public method needs a lock, or the cache must be sharded.
- q: >-
    In Node, an LRU built on Map with delete-then-set per hit was measured against a hand-written linked list. Which result matches, and why?
  options: ["Map failed, since insertion order is not guaranteed", "They were identical, since both are O(1) per operation", "Map was faster, since its order is maintained natively", "Map was 4-5x slower, from churn in its ordered table"]
  answer: 3
  explanation: >-
    Both are O(1), but each delete-and-reinsert appends a new entry and leaves a deleted slot in V8's insertion-ordered table, reclaimed only on rehash. On 10^6 operations the Map version took 249-287 ms and the hand-written list 54-77 ms. Insertion order is guaranteed by the language specification.
- q: >-
    Design Twitter's get_news_feed must return the 10 newest tweets from F followees. What is the efficient in-memory approach?
  options: ["Heap-merge one cursor per author: O(F + 10 log F)", "Store each tweet in every follower's feed as it is posted", "Keep one global list and filter it for each read request", "Sort all of the followees' tweets by time on each read"]
  answer: 0
  explanation: >-
    Each author's tweets are already in time order, so a heap seeded with each author's newest tweet yields the global order one pop at a time, pushing that author's previous tweet after each pop. Sorting or filtering touches every tweet. Pushing into followers' feeds is fan-out on write, a scale decision with its own cost for accounts with millions of followers.
```
