---
slug: lru-cache
title: "LRU cache: hash map plus doubly linked list, O(1) everything"
description: "The classic design question built from first principles: why neither a hash map nor a list alone works, the pointer writes of every operation traced, how CPython's OrderedDict and functools.lru_cache implement it and what a hit and an entry cost in CPython and Node, the follow-ups interviewers ask next, and how Redis, Linux, InnoDB, memcached and Caffeine approximate LRU instead of implementing it."
minutes: 50
difficulty: medium
tags: [lru, cache, linked-list, hash-map, design]
problems: [lru-cache]
---
You have a slow source (a database, a remote API, a disk) and a fixed amount of fast memory. You want `get(key)` to return the cached value if it is there, `put(key, value)` to store one, and both to take constant time. When the memory is full, you must throw something away, and the thing you throw away should be the one least likely to be needed again.

Least Recently Used (LRU) is the policy that guesses "the entry nobody has touched for the longest time". It is the default answer because access patterns have temporal locality: what was used recently tends to be used again. The design problem is that "least recently used" is an ordering, and hash maps have no order, while ordered structures have no O(1) lookup. The LRU cache is the structure that gives you both at once, and it is the single most common design question in coding interviews because it tests whether you can compose two basic structures without breaking either one's invariants. This lesson traces every pointer write, opens CPython's `OrderedDict` and `functools.lru_cache` to show the same design in C, measures what a hit and an entry cost, and then shows that no large production cache implements the textbook list. It builds on [hash tables](/learn/data-structures/hashing/hash-tables) and [linked list fundamentals](/learn/data-structures/linked-lists/linked-list-fundamentals).

## Why one structure is not enough

A hash map gives `get` and `put` in O(1), but when the map is full you have no idea which key is the oldest; finding it means scanning every entry and comparing timestamps, O(n).

A list ordered by recency tells you the oldest entry instantly (it is at one end) and lets you move an entry to the "most recent" end, but finding the entry for a given key is a walk down the list, O(n).

Put them together. The hash map stores `key → node`, where the node lives in a doubly linked list ordered by recency. A lookup goes through the map, straight to the node, in O(1). Moving that node to the front is O(1) *because the list is doubly linked*: you can unlink a node given only a pointer to it, without walking from the head, since it knows both its neighbours. Evicting is "unlink the tail node and delete its key from the map", also O(1).

```mermaid
flowchart LR
  subgraph map["hash map: key → node"]
    k1["1"] --> n1
    k3["3"] --> n3
    k4["4"] --> n4
  end
  H["head"] <--> n4["4 (most recent)"] <--> n3["3"] <--> n1["1 (least recent)"] <--> T["tail"]
```

The singly linked list would not do: unlinking a node requires updating its predecessor's `next` pointer, and a singly linked node does not know its predecessor. That is the one sentence that explains why this design uses a doubly linked list, and interviewers like to hear it.

## The mechanism, pointer by pointer

```viz
{"type": "system", "scenario": "lru-cache",
 "title": "LRU cache with capacity 2",
 "caption": "Every get or put moves the entry to the front. When a put needs space, the entry at the back is evicted."}
```

Trace a capacity-2 cache with sentinels `H` (head) and `T` (tail). The list is drawn most-recent first; the last two columns count the pointer writes each operation performs, which is what "O(1)" means here.

| Operation | Map lookup | List before | Pointer writes | List after | Map after | Returns |
|---|---|---|---|---|---|---|
| `put(1, 1)` | miss | `H ⇄ T` | push-front: 4 (`n1.next`, `n1.prev`, `T.prev`, `H.next`) | `H ⇄ 1 ⇄ T` | {1} | |
| `put(2, 2)` | miss | `H ⇄ 1 ⇄ T` | push-front: 4 | `H ⇄ 2 ⇄ 1 ⇄ T` | {1, 2} | |
| `get(1)` | hit → n1 | `H ⇄ 2 ⇄ 1 ⇄ T` | unlink: 2 (`n2.next = T`, `T.prev = n2`); push-front: 4 | `H ⇄ 1 ⇄ 2 ⇄ T` | {1, 2} | 1 |
| `put(3, 3)` | miss, full | `H ⇄ 1 ⇄ 2 ⇄ T` | evict `T.prev` = n2: unlink 2, `del map[2]`; push-front n3: 4 | `H ⇄ 3 ⇄ 1 ⇄ T` | {1, 3} | |
| `get(2)` | miss | unchanged | 0 | `H ⇄ 3 ⇄ 1 ⇄ T` | {1, 3} | −1 |
| `put(4, 4)` | miss, full | `H ⇄ 3 ⇄ 1 ⇄ T` | evict n1: 2 + map delete; push-front n4: 4 | `H ⇄ 4 ⇄ 3 ⇄ T` | {3, 4} | |
| `get(1)` | miss | unchanged | 0 | `H ⇄ 4 ⇄ 3 ⇄ T` | {3, 4} | −1 |
| `get(3)` | hit | `H ⇄ 4 ⇄ 3 ⇄ T` | unlink 2, push-front 4 | `H ⇄ 3 ⇄ 4 ⇄ T` | {3, 4} | 3 |
| `get(4)` | hit | `H ⇄ 3 ⇄ 4 ⇄ T` | unlink 2, push-front 4 | `H ⇄ 4 ⇄ 3 ⇄ T` | {3, 4} | 4 |

Six pointer writes and one or two hash operations per hit, never more, regardless of capacity. Two details decide whether an implementation is correct. A `put` on an existing key must *update the value and refresh recency*, not insert a second node (otherwise the map has one entry and the list has two, and eviction later deletes a map key that points at the wrong node). And a `get` on a missing key must not change anything.

## The implementation

Use two sentinel nodes, `head` and `tail`, that are never removed. With sentinels the list is never empty, so `unlink` and `push_front` have no null checks and no special cases for "first node" or "last node". That is the difference between fifteen lines and forty.

```python
class Node:
    __slots__ = ("key", "value", "prev", "next")
    def __init__(self, key=None, value=None):
        self.key, self.value = key, value
        self.prev = self.next = None

class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.map = {}
        self.head, self.tail = Node(), Node()      # sentinels
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _push_front(self, node):
        node.next, node.prev = self.head.next, self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        node = self.map.get(key)
        if node is None:
            return -1
        self._unlink(node)
        self._push_front(node)
        return node.value

    def put(self, key, value):
        node = self.map.get(key)
        if node is not None:
            node.value = value
            self._unlink(node)
            self._push_front(node)
            return
        if len(self.map) >= self.capacity:
            lru = self.tail.prev
            self._unlink(lru)
            del self.map[lru.key]
        node = Node(key, value)
        self.map[key] = node
        self._push_front(node)
```

Note that the node stores the **key** as well as the value. Eviction finds the node via the list, not the map, and it needs the key to delete the map entry. Forgetting the key in the node is the most common bug in whiteboard versions.

### What your standard library already gives you

Every mainstream language ships an insertion-ordered map built on this idea, and knowing where each one stops being O(1) is worth more in production than writing the nodes by hand.

- **Python** `collections.OrderedDict` is a hash map plus a doubly linked list, implemented in C: `move_to_end(key)` is the refresh and `popitem(last=False)` is the eviction, both O(1), and `functools.lru_cache` is the same design wrapped around a function (both are opened below). A plain `dict` (insertion-ordered since 3.7) can refresh with `del d[k]; d[k] = v`, but evicting with `next(iter(d))` is not O(1): a deleted entry stays as a hole in the dict's entries array until the next resize, and iteration starts at the front and walks past every hole. Measured on CPython 3.14, that eviction took 0.22 µs at 1,000 entries and 11.8 µs at 100,000, against 52–74 ns for `popitem(last=False)`.
- **Java** `LinkedHashMap(capacity, 0.75f, true)` with `accessOrder = true` reorders on `get`; override `removeEldestEntry` to return `size() > capacity` and you have an LRU cache in five lines.
- **JavaScript** `Map` iterates in insertion order: refresh with `delete` then `set` (moves the key to the end), evict with `map.keys().next().value`. The refresh is O(1); the eviction has the dict's problem, because V8 also leaves deleted entries in place until it rebuilds the table: 0.17 µs per eviction at 1,000 entries and 14.8 µs at 100,000 in Node 24, against 47–92 ns for an explicit node list.

```javascript
class LRUCache {
  constructor(capacity) { this.capacity = capacity; this.map = new Map(); }
  get(key) {
    if (!this.map.has(key)) return -1;
    const v = this.map.get(key);
    this.map.delete(key); this.map.set(key, v);   // refresh
    return v;
  }
  put(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value);
    this.map.set(key, value);
  }
}
```

In an interview, mention the library structure, then write the explicit version if asked; the point of the question is the composition, and "I know `OrderedDict` does this" shows you know why. The `Map` version is fine for a few thousand entries; above that, the explicit list is the one whose eviction stays constant.

## Under the hood: CPython's `OrderedDict`

Since CPython 3.5, `OrderedDict` is written in C (`Objects/odictobject.c`) as a `dict` subclass. The inherited dict still stores keys and values; the subclass adds:

- **A doubly linked list of 32-byte nodes**, each holding `key`, `hash`, `next` and `prev`, allocated with `PyMem_Malloc`. They are not Python objects, so they carry no object header and no GC header. `od_first` and `od_last` point at the ends, which hold `NULL`: no sentinel, no ring.
- **`od_fast_nodes`**, an array of node pointers with one slot per slot of the dict's hash table, indexed by the *entry index* that the ordinary dict lookup returns. Finding a key's node costs one dict probe plus one array read, never a walk.
- **`od_resize_sentinel`**, the address of the dict's keys object when `od_fast_nodes` was built. A dict resize compacts the entries and changes every index, so the next lookup that sees a different keys object rebuilds `od_fast_nodes` in one pass over the list, an `O(n)` cost paid once per resize.

`move_to_end(key)`, the LRU refresh, first checks whether `key` is the very object stored in the last node (a pointer comparison); if so it returns, so refreshing the newest entry costs no hash and no probe. Otherwise it hashes the key (free for a `str`, which caches its hash), finds the node through `od_fast_nodes`, unlinks it and appends it. On keys `1, 2, 3`, oldest first:

| Step | Writes | List, oldest → newest |
|---|---|---|
| find | `hash(2) = 2`; dict probe → entry index 1; `od_fast_nodes[1]` → node `N2` | 1 ⇄ 2 ⇄ 3 |
| unlink | `N1.next = N3`, `N3.prev = N1`, `N2.prev = NULL`, `N2.next = NULL` | 1 ⇄ 3 |
| append | `N2.prev = N3`, `N2.next = NULL`, `N3.next = N2`, `od_last = N2` | 1 ⇄ 3 ⇄ 2 |

Eight pointer writes, no allocation, and the dict is untouched: key 2's entry stays at index 1, so the dict's own order no longer matches, which is why `OrderedDict` iterates over the list. `popitem(last=False)`, the eviction, takes `od_first`, reuses the hash stored in the node, clears its `od_fast_nodes` slot, unlinks and frees the node, pops the key from the dict and returns a `(key, value)` tuple.

The pure-Python fallback in `Lib/collections/__init__.py` maps each key to a `_Link` (`__slots__ = 'prev', 'next', 'key', '__weakref__'`) on a circular list around a sentinel, and holds the sentinel and every `prev` link through a weak-reference proxy: with strong forward links and weak backward links the list has no reference cycles, so reference counting alone frees it.

## Under the hood: `functools.lru_cache`

`@lru_cache(maxsize=128, typed=False)` wraps the function in a `_lru_cache_wrapper`, written in C in `Modules/_functoolsmodule.c`; `Lib/functools.py` keeps a pure-Python twin with the same algorithm. Four decisions live in it.

**The key.** `_make_key` flattens the call into one hashable value: the positional `args`, then, if there are keyword arguments, a private marker object (`kwd_mark`) followed by each name and value in call order, then, with `typed=True`, the type of every argument. So `f(x=1, y=2)` and `f(y=2, x=1)` are two entries, and `typed=True` separates `f(3)` from `f(3.0)`. Two shortcuts: a single positional argument whose type is exactly `int` or `str` (not `bool`) is its own key; with only positional arguments, the call's `args` tuple itself is stored as the key. An unhashable argument raises `TypeError` before the function runs.

**The variant**, chosen once at decoration time. `maxsize=None` selects a wrapper that is a bare dict, with no list and no lock; `functools.cache` (3.9+) is exactly that. `maxsize=0` stores nothing and counts misses. A positive `maxsize` (negative values become 0) selects the bounded wrapper: a dict from key to link plus a circular doubly linked list through a root link. A C link is a 56-byte object (header, `prev`, `next`, `hash`, `key`, `result`) with no GC header, because the wrapper itself walks the ring and reports each link's key and result to the cycle collector. The newest link sits at `root.prev`, the oldest at `root.next`.

**The hit path.** Build the key, hash it once, look it up with the known hash, unlink the link (two writes), relink it before the root (four writes), count a hit, return the stored result.

**The miss path and threads.** The pure-Python wrapper takes an `RLock` for each list update. The C wrapper relies on the GIL and also takes a per-object critical section, which is a real lock only on the free-threaded build: 3.13 held it for the whole call, 3.14 holds it for the lookup and again for the update. In every version the user function runs outside that protection, so two threads that miss the same key both compute it, and the second to finish finds the key present and returns its own result without touching the list. `cache_info()` returns `CacheInfo(hits, misses, maxsize, currsize)`; `cache_clear()` empties the dict and resets the ring.

## Tracing an `lru_cache` eviction, pointer by pointer

Decorate `sq = lru_cache(maxsize=2)(lambda x: x * x)` and call `sq(1)`, `sq(2)`, `sq(3)`, `sq(2)`, `sq(4)`. In the pure-Python version a link is a four-element list `[PREV, NEXT, KEY, RESULT]`; `R` starts as the root and `A`, `B` are links. Reading the ring from the current root along `NEXT` gives oldest to newest.

| Call | Event | Writes | Ring from the root | `cache` |
|---|---|---|---|---|
| start | | `R = [R, R, None, None]` | `R` | {} |
| `sq(1)` | miss, not full | new `A = [R, R, 1, 1]`; `R.next = A`, `R.prev = A` | `R → A(1)` | {1: A} |
| `sq(2)` | miss, now full | new `B = [A, R, 2, 4]`; `A.next = B`, `R.prev = B` | `R → A(1) → B(2)` | {1: A, 2: B} |
| `sq(3)` | miss, full | `R.key = 3`, `R.result = 9`; root becomes `A`; `A.key = A.result = None`; `del cache[1]`; `cache[3] = R` | `A → B(2) → R(3)` | {2: B, 3: R} |
| `sq(2)` | hit | unlink `B`: `A.next = R`, `R.prev = A`; relink before root `A`: `R.next = B`, `A.prev = B`, `B.prev = R`, `B.next = A` | `A → R(3) → B(2)` | unchanged |
| `sq(4)` | miss, full | `A.key = 4`, `A.result = 16`; root becomes `R`; `R.key = R.result = None`; `del cache[3]`; `cache[4] = A` | `R → B(2) → A(4)` | {2: B, 4: A} |

The two evictions write no pointers at all. The root sits between the newest and the oldest link, so writing the new entry into the old root makes it the newest, and emptying the oldest link makes it the new root: no allocation, no free, one dict delete and one insert. Key 3, not key 2, is evicted by `sq(4)` because the hit moved `B` to the newest position (the table was checked by printing the ring of the pure-Python `functools`).

The C version cannot rotate its root, which is embedded in the wrapper object. On `sq(3)` it extracts the oldest link `A` (`R.next = B`, `B.prev = R`), pops key 1 from the dict (known hash, identity match, so no `__eq__` call), overwrites `A`'s hash, key and result, stores `cache[3] = A` and appends `A` before the root (`B.next = A`, `R.prev = A`, `A.prev = B`, `A.next = R`): six pointer writes, still no allocation.

## Under the hood: what an entry costs

The list is not free, and its price is the reason every production cache below replaces it. The CPython rows were measured with `tracemalloc` on CPython 3.14 at 10⁶ entries whose `int` keys and values were built beforehand, so they count the container alone.

| Runtime | Per-entry cost of the LRU bookkeeping | Measured or derived from |
|---|---|---|
| CPython `dict`, for reference | **41.9 bytes**: 2²¹ four-byte index slots and 1.4 million 24-byte entry slots, per million keys | `tracemalloc` |
| CPython, hand-written `Node` with `__slots__` | 64-byte node (16-byte GC header, 16-byte object header, four 8-byte slots) plus the dict: **105.9 bytes** | `tracemalloc`, `sys.getsizeof` |
| CPython `OrderedDict` | 32-byte C node plus 16.8 bytes of `od_fast_nodes` plus the dict: **90.7 bytes** | `tracemalloc`, `OrderedDict.__sizeof__` |
| CPython `@lru_cache`, one `int` or `str` argument | 56-byte link plus the dict: **97.9 bytes**; `@cache` keeps no list, 41.9 | `tracemalloc` |
| CPython `@lru_cache`, two arguments | the 64-byte `args` tuple stored as the key, on top: **161.9 bytes** | `tracemalloc` |
| Java `LinkedHashMap.Entry` | `HashMap.Node` (12-byte header, hash, key, value, next = 32 bytes with compressed references) plus `before` and `after` = **40 bytes**, before the boxed key and value | object layout with compressed oops |
| Redis `robj` | **24 bits** of LRU clock in the object header; no list at all | `LRU_BITS 24` in `server.h` |
| Caffeine `Node` | a generated class with only the fields the configuration needs (two access-order links for size eviction, two write-order links when expiry is on), plus a shared frequency sketch of **8–16 bytes per entry** of maximum size | `BoundedLocalCache`, `FrequencySketch` |

Two pointers per entry look cheap until the cache holds fifty million small entries: 400 MB of `before`/`after` references in Java with compressed pointers (800 MB above a 32 GB heap, where they switch off), 3.2 GB of hand-written CPython nodes, 2.8 GB of `lru_cache` links, all on top of the map and the payload. That arithmetic, plus the cache-line write every `get` performs to move a node, is why Redis keeps 24 bits and samples, why memcached keeps its LRU per slab class and touches an item at most once per minute, and why Caffeine records reads in a buffer instead of moving nodes on the read path.

## Measured: what a hit costs

Nanoseconds per `get` on a cache of 1,000 `int` keys, 10⁶ random hits, best of five runs with the loop overhead subtracted, on one core of an AMD Ryzen 9 9950X3D (CPython 3.14.7, Node 24.21):

| Operation | ns per hit |
|---|---|
| CPython `dict` lookup `d[k]` | 9.6 |
| CPython call of an undecorated one-line function | 8 |
| `@functools.cache` hit | 19 |
| `@lru_cache` hit, one `int` argument | 21 |
| `@lru_cache` hit, two arguments (tuple key) | 35 |
| `OrderedDict`: `od[k]` then `move_to_end(k)` | 30 |
| the hand-written `LRUCache.get` above | 77 |
| Node: `Map.get` | 11 |
| Node: `Map` LRU `get` (`has`, `get`, `delete`, `set`) | 50 |
| Node: hand-written node-list LRU `get` | 18 |

The numbers depend on the working set fitting in L1 and L2 (1,000 entries do), on cheap `int` hashing (a `str` key hashes once, then reads its cached hash), and on the runtime version (3.14 makes a plain Python call about as cheap as a dict lookup). Two readings hold beyond this machine. In CPython the C structures win: an `lru_cache` hit costs a quarter of the hand-written class, because every `node.prev = …` in Python is a descriptor store with reference-count updates and every `get` is a Python method call. In Node the ranking flips: JIT-compiled field stores cost almost nothing, while the `Map` refresh is four hash operations plus a periodic rebuild that compacts the holes deletions leave. Write the class in the interview; in production Python use `OrderedDict` or `lru_cache`, and in JavaScript keep the explicit list for large caches.

## Interviewer follow-ups

Getting the basic structure right is the mid-level bar. The senior bar is the questions that come after it.

**"Make it thread-safe."** Model answer: a single lock is correct but serialises every `get`, the wrong shape for a structure that exists to make reads fast; shard the map into segments each with its own lock (Guava's `Cache`, 4 segments by default), or record reads in a lock-free ring buffer drained in batches to update the order (Caffeine), accepting that the order is then *approximately* LRU, which is fine because LRU was only ever a heuristic. Common wrong answer: "wrap `get` and `put` in `synchronized`" and stop there.

**"Add a TTL."** Model answer: store an expiry timestamp in each node and treat an expired entry as a miss on `get` (lazy expiry); because dead entries then occupy memory until touched or evicted, add a periodic sweep, or do what Redis does: ten times a second, sample 20 keys that have a TTL and delete the expired ones, repeating while more than 10% of the sample had expired (25% before Redis 6.0). Common wrong answer: a timer thread per entry, which is a heap of a million timers.

**"Bound by bytes, not by entry count."** Model answer: track the total weight; on `put`, evict from the tail until `total + new ≤ budget`, and reject a value heavier than the whole budget rather than evicting everything to make room for it. That loop may evict many small entries for one large one, which is what Caffeine's `maximumWeight` does. The second exercise below is this variant. Common wrong answer: bounding by count and assuming values are the same size.

**"What about a scan?"** Model answer: a single pass over a large dataset (an analytics query, a backup, a crawler) touches every key once; pure LRU promotes each one to the front and evicts the entire working set for data that will never be read again. This is *scan pollution*, and it is why almost no production system uses pure LRU; the defences are a probation area (2Q, segmented LRU, InnoDB's midpoint insertion) or frequency-based admission ([next lesson](/learn/advanced-data-structures/caches-and-eviction/lfu-and-modern-policies)). Common wrong answer: "make the cache bigger".

**"Is `functools.lru_cache` thread-safe?"** Model answer: its bookkeeping is (an `RLock` in pure Python; the GIL, plus a critical section on the free-threaded build, in C), but the function runs outside that protection, so threads that miss the same key all call it: four threads and a 50 ms function on CPython 3.14 gave four misses and one stored entry. If a duplicate computation is expensive, put a per-key lock or a shared future in front (single-flight, covered in [cache design considerations](/learn/advanced-data-structures/caches-and-eviction/cache-design-considerations)). Common wrong answer: "yes, so each value is computed once".

## Under the hood: what real systems do instead

**Redis** does not maintain a linked list; the pointers would cost 16 bytes per key. Each object carries a 24-bit clock of its last access at one-second resolution (`LRU_CLOCK_RESOLUTION 1000`, so the clock wraps every 194 days and the comparison handles the wrap). With `maxmemory-policy allkeys-lru`, eviction samples `maxmemory-samples` random keys (default 5), and since 3.0 keeps a **pool of 16 candidates** (`EVPOOL_SIZE`) sorted by idle time across samples, evicting the best of the pool. The Redis documentation's hit-ratio curves show that with 10 samples the approximation is nearly indistinguishable from exact LRU. `OBJECT IDLETIME key` reads the clock.

**Linux page cache** keeps two lists, *active* and *inactive*, with `PG_referenced` and `PG_active` flag bits per page. A page enters the inactive list on first touch and is promoted to active only on a second touch; eviction takes from the inactive tail. A one-off scan fills and drains the inactive list and never displaces the active pages. Evicted pages leave *shadow entries* so that a page refaulted soon after eviction is recognised as part of the working set and promoted directly. Since 6.1 the multi-generational LRU (MGLRU) refines this into several generations with cheaper aging. This is a two-queue (2Q) design, and it is the standard defence against scan pollution.

**MySQL InnoDB buffer pool** uses a single LRU list with *midpoint insertion*: a new page is inserted 3/8 of the way from the tail (`innodb_old_blocks_pct = 37`), not at the head, and it is promoted to the "new" sublist only if it is accessed again after `innodb_old_blocks_time` (1,000 ms by default) has passed. A table scan streams through the old sublist and touches nothing that the workload actually uses.

## Under the hood: memcached, Postgres and the CDN edge

**memcached** keeps one LRU per slab class and, since 1.4.24, segments each into HOT, WARM and COLD sublists (HOT and WARM capped at 20% and 40% of the class); an item is "bumped" at most once every 60 seconds, so a hot item costs no list writes between bumps, and a background *LRU crawler* thread reclaims expired items. Netflix's EVCache, which fronts most of its microservices, is memcached with this eviction plus replication across availability zones, at a scale of on the order of a trillion requests a day across the fleet.

**Postgres** avoids LRU entirely: `shared_buffers` uses a clock-sweep with a usage counter per buffer, and sequential scans of large tables use a small ring buffer so they cannot pollute the pool. **CDN edges and reverse proxies** (Varnish, Nginx `proxy_cache`, Apache Traffic Server) use LRU or segmented LRU for the object store, often with an admission filter in front (recall the [Bloom filter](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) that only admits an object on its second request).

The lesson: LRU is the *concept* every one of these approximates, and none of them implements the textbook linked list. When you propose "an LRU cache" in a design review, be ready to say which approximation you mean and what protects it from scans.

## Trade-offs

| | Exact LRU (list) | Sampled LRU (Redis) | Clock / second chance | 2Q / segmented LRU | W-TinyLFU |
|---|---|---|---|---|---|
| Bookkeeping per entry | 2 pointers (16 B) | 24 bits | 1–3 bits | 2 pointers + segment bit | 2 pointers + 8–16 B of sketch |
| Work per hit | 6 pointer writes | 1 clock store | 1 bit set | 6 pointer writes (or 0 if in protected and recently bumped) | 1 buffer append |
| Eviction cost | O(1) | O(samples) | amortised O(1) | O(1) | O(1) |
| Scan resistance | none | none | weak | good | good |
| Hit ratio on skewed traces | baseline | ≈ baseline with 10 samples | ≈ baseline | better | best of the group |

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Hit ratio collapses every night at 02:00 and recovers by 08:00 | A batch scan (report, backup, reindex) runs through the cache and evicts the working set | Bypass the cache for scans, or a scan-resistant policy (2Q, midpoint insertion, TinyLFU) |
| Cache memory is 5× the payload size | Per-entry overhead: ~100 bytes in CPython, 40 in Java, plus boxed keys and values, for small entries | Store compact values (bytes, not objects), bound by weight, or use an off-heap or Redis-style store with 24-bit bookkeeping |
| Read throughput stops scaling past 4 threads; a profiler shows time in lock acquisition | One lock around `get` turns every hit into a serialised critical section | Segment the map, or a read buffer drained in batches (Caffeine); for a read-mostly cache, an immutable snapshot swapped atomically |
| The map and the list disagree: `size()` says 1,000 but iteration finds 1,002; eventually a `KeyError` during eviction | `put` on an existing key created a second node instead of updating the existing one | Look up before inserting; a test that puts the same key twice and then evicts catches it |
| Entries with a TTL keep memory long after they expire | Lazy expiry only: a dead entry lives until touched or reaching the tail | A periodic sweep, or Redis-style sampling of keys with TTLs |
| Two threads `get` the same key and one gets a stale value after a `put` | The refresh step (unlink + push-front) is not atomic with the value update, and a concurrent reader observed a half-moved node | Hold the lock for the whole operation, or design the read path to never move nodes (buffer the access instead) |
| A long-running worker's memory grows until it is OOM-killed; a heap dump shows thousands of objects that should be gone | `@lru_cache` on a method: `self` is part of every key, so the decorated function, which lives as long as the class, keeps every instance alive (forever with `maxsize=None`) | Cache a module-level function keyed by an id, use `functools.cached_property` for per-instance values, or build a per-instance cache in `__init__` |
| `cache_info()` shows `currsize=128` and almost no hits; the decorated function is no faster than the plain one | The default `maxsize=128` is smaller than the working set, so every call misses and also pays key building and eviction | Size `maxsize` from the working set, or `maxsize=None` when the argument domain is small and bounded |
| Eviction CPU grows with cache size; a profile shows time in `next(iter(d))` or `Map.prototype.keys` | A plain `dict` or `Map` used as the LRU: deleted entries stay as holes at the front of the entries array and every eviction walks past them (11.8 µs per eviction at 100,000 entries in CPython) | `OrderedDict.popitem(last=False)` in Python; an explicit node list in JavaScript |

## What mid-level engineers get wrong

- **Forgetting the key in the node**, then being unable to delete the map entry on eviction.
- **Inserting a second node on `put` of an existing key**, which desynchronises map and list.
- **Proposing pure LRU for a cache that a nightly job scans through**, and blaming the database when the morning's hit ratio is 20%.
- **Counting entries instead of bytes** for a cache of variable-size values.
- **Quoting O(1) and ignoring the 100 bytes per entry**, so a "10 million entry cache" needs 5× the memory in the plan.
- **One global lock**, presented as "thread-safe" without saying what it costs.
- **Putting `@lru_cache` on a method**, which keys every entry by `self` and keeps every instance alive.
- **Trusting `next(iter(d))` or `map.keys().next()` to evict in O(1).** It walks the holes that deletions leave: 160 times slower than `popitem(last=False)` at 100,000 entries.

## Exercises

```exercise
id: lru-cache-class
title: Implement an O(1) LRU cache
prompt: |
  Implement `LRUCache`. The tests first call `set_capacity(n)`, then
  replay `put(key, value)` (returns nothing) and `get(key)` (returns the
  value, or `-1` if absent). Every `get` and every `put` must count as a
  use of that key; when a `put` needs space, evict the least recently
  used key. All operations must be O(1).

  Use a hash map plus a doubly linked list with sentinel nodes (or your
  language's insertion-ordered map, if you can explain why it is O(1)).
languages: [python, javascript]
entry: LRUCache
starter:
  python: |
    class Node:
        def __init__(self, key=None, value=None):
            self.key, self.value = key, value
            self.prev = self.next = None

    class LRUCache:
        def __init__(self):
            self.capacity = 0
            self.map = {}
            self.head, self.tail = Node(), Node()
            self.head.next, self.tail.prev = self.tail, self.head

        def set_capacity(self, capacity):
            self.capacity = capacity

        def get(self, key):
            # TODO
            return -1

        def put(self, key, value):
            # TODO
            pass
  javascript: |
    class LRUCache {
      constructor() {
        this.capacity = 0;
        // TODO: choose your structures
      }
      set_capacity(capacity) { this.capacity = capacity; }
      get(key) {
        // TODO
        return -1;
      }
      put(key, value) {
        // TODO
      }
    }
tests:
  - args: [["set_capacity",2],["put",1,1],["put",2,2],["get",1],["put",3,3],["get",2],["put",4,4],["get",1],["get",3],["get",4]]
    expected: [null, null, null, 1, null, -1, null, -1, 3, 4]
    label: the classic trace
  - args: [["set_capacity",1],["put",1,1],["get",1],["put",2,2],["get",1],["get",2]]
    expected: [null, null, 1, null, -1, 2]
    label: capacity 1
  - args: [["set_capacity",2],["put",1,1],["put",2,2],["put",1,10],["put",3,3],["get",1],["get",2]]
    expected: [null, null, null, null, null, 10, -1]
    label: updating a key refreshes it and keeps one entry
  - args: [["set_capacity",2],["get",5]]
    expected: [null, -1]
    label: miss on an empty cache
  - args: [["set_capacity",3],["put",1,1],["put",2,2],["put",3,3],["get",1],["get",2],["put",4,4],["get",3],["put",5,5],["get",1],["get",2],["get",4],["get",5]]
    expected: [null, null, null, null, 1, 2, null, -1, null, -1, 2, 4, 5]
    hidden: true
    label: gets refresh recency
  - args: [["set_capacity",2],["put",2,1],["put",2,2],["get",2],["put",1,1],["put",4,1],["get",2]]
    expected: [null, null, null, 2, null, null, -1]
    hidden: true
hints:
  - "Store the key inside the list node; eviction reaches the node through the list and must delete its key from the map."
  - "With head and tail sentinels, unlink is two pointer writes and push-front is four, with no null checks."
  - "A put on an existing key updates the value and moves the node to the front; it must not create a second node."
```

```exercise
id: weighted-lru
title: LRU bounded by weight, not by count
prompt: |
  Implement `WeightedLRU`, an LRU cache whose capacity is a total weight
  (think bytes). The tests call `set_capacity(w)` first, then replay:

  - `put(key, value, weight)`: if `weight` exceeds the capacity, remove any
    existing entry for `key` and return `false` without storing. Otherwise
    remove the existing entry for `key` (if any), evict least-recently-used
    entries until the new entry fits, store it as most recently used and
    return `true`.
  - `get(key)`: return the value and mark the key most recently used, or
    `-1` if absent.
  - `total_weight()`: the sum of stored weights.
  - `keys()`: the stored keys from least to most recently used.
languages: [python, javascript]
entry: WeightedLRU
starter:
  python: |
    from collections import OrderedDict

    class WeightedLRU:
        def __init__(self):
            self.capacity = 0
            self.weight = 0
            self.entries = OrderedDict()   # key -> (value, weight), LRU first

        def set_capacity(self, capacity):
            self.capacity = capacity

        def put(self, key, value, weight):
            # TODO
            return False

        def get(self, key):
            # TODO
            return -1

        def total_weight(self):
            return self.weight

        def keys(self):
            return list(self.entries.keys())
  javascript: |
    class WeightedLRU {
      constructor() {
        this.capacity = 0;
        this.weight = 0;
        this.entries = new Map();   // key -> {value, weight}, LRU first
      }
      set_capacity(capacity) { this.capacity = capacity; }
      put(key, value, weight) {
        // TODO
        return false;
      }
      get(key) {
        // TODO
        return -1;
      }
      total_weight() { return this.weight; }
      keys() { return [...this.entries.keys()]; }
    }
tests:
  - args: [["set_capacity", 10], ["put", "a", 1, 4], ["put", "b", 2, 4], ["put", "c", 3, 4], ["keys"], ["total_weight"]]
    expected: [null, true, true, true, ["b", "c"], 8]
    label: the third entry evicts the first
  - args: [["set_capacity", 10], ["put", "a", 1, 4], ["put", "b", 2, 4], ["get", "a"], ["put", "c", 3, 4], ["keys"], ["get", "b"]]
    expected: [null, true, true, 1, true, ["a", "c"], -1]
    label: a get protects the entry
  - args: [["set_capacity", 10], ["put", "a", 1, 2], ["put", "b", 2, 2], ["put", "c", 3, 2], ["put", "big", 9, 9], ["keys"], ["total_weight"]]
    expected: [null, true, true, true, true, ["big"], 9]
    label: one heavy entry evicts several light ones
  - args: [["set_capacity", 10], ["put", "a", 1, 3], ["put", "huge", 1, 11], ["keys"], ["get", "huge"]]
    expected: [null, true, false, ["a"], -1]
    label: heavier than the whole cache is rejected, nothing else is evicted
  - args: [["set_capacity", 10], ["put", "a", 1, 3], ["put", "a", 2, 8], ["keys"], ["total_weight"], ["get", "a"]]
    expected: [null, true, true, ["a"], 8, 2]
    label: re-putting a key replaces its weight
  - args: [["set_capacity", 5], ["put", "a", 1, 5], ["put", "b", 2, 1], ["keys"], ["put", "c", 3, 5], ["keys"], ["total_weight"]]
    expected: [null, true, true, ["b"], true, ["c"], 5]
    hidden: true
    label: an entry equal to the capacity fits alone
  - args: [["set_capacity", 10], ["get", "x"], ["keys"], ["total_weight"]]
    expected: [null, -1, [], 0]
    hidden: true
    label: empty cache
  - args: [["set_capacity", 10], ["put", "a", 1, 6], ["put", "a", 2, 20], ["keys"], ["total_weight"]]
    expected: [null, true, false, [], 0]
    hidden: true
    label: an oversized re-put removes the old entry
hints:
  - "Remove the old entry for the key before checking the weight, so the rejected oversized put still clears it."
  - "Evict with a loop: while `weight + new > capacity`, pop the least recently used entry and subtract its weight."
  - "In JavaScript, `map.delete(key); map.set(key, entry)` moves a key to the most-recent end."
```

Then do the full problem, with its follow-ups, at [LRU Cache](/practice/lru-cache).

## Senior signals

- You explain the design by **what each structure cannot do alone**, and you say why the list must be doubly linked.
- You use **sentinels** and store the **key in the node**, your code has no special cases, and you can count the six pointer writes a hit costs.
- You know the library equivalents (`OrderedDict`, `LinkedHashMap` with access order, JS `Map`), which of their operations are really O(1) (not an eviction through a `dict` or `Map` iterator), and you can quote what an entry costs (91–106 bytes in CPython, 40 in Java, 24 bits in Redis).
- You raise **scan pollution** unprompted and can describe the 2Q / midpoint-insertion / segmented-LRU defences in Linux, InnoDB and memcached.
- You know Redis approximates LRU by **sampling** with a 16-entry candidate pool and can say why exact LRU is not worth 16 bytes per key.
- You answer the thread-safety follow-up with segments or lock-free read buffers, not one global lock, and the byte-bound follow-up with a weight loop that rejects oversized values.
- You can open the library: `OrderedDict` finds a node through `od_fast_nodes` and refreshes with eight pointer writes; `lru_cache` keys by the `args` tuple (so `self` pins instances), recycles a link on eviction, and computes twice when two threads miss the same key. You know a hit costs about 21 ns in `lru_cache` against 77 ns for a hand-written class on CPython 3.14.

## Check yourself

```quiz
- q: >-
    Why does the LRU cache need a doubly linked list rather than a singly linked one?
  options: ["Eviction must delete the key from the map, and only a doubly linked node can store it", "Doubly linked nodes use less memory, because sentinels remove the need for null checks", "Pushing to the front needs the old head's address, which a singly linked list does not keep", "Unlinking a node needs its predecessor, which a singly linked node cannot reach in O(1)"]
  answer: 3
  explanation: >-
    The hash map hands you a pointer to the node, not to its predecessor. Unlinking needs predecessor.next = node.next; only a prev pointer gives you that without an O(n) walk. The head is always known, any node can store its key, and a prev pointer costs memory rather than saving it.
- q: >-
    A full lru_cache(maxsize=2) in the pure-Python functools misses on a new key. What happens to its linked list?
  options: ["The oldest link is freed and a new link is allocated before the root", "The dict and the ring are cleared and the new entry starts a fresh ring", "The old root takes the new entry and the oldest link becomes the root", "The oldest link is found by scanning the ring for the lowest hit count"]
  answer: 2
  explanation: >-
    The root sits between the newest and the oldest link, so writing the new key and result into the old root makes it the newest entry, and emptying the oldest link turns it into the new root: no pointer writes and no allocation. The C version reuses the oldest link object too, but moves it with six pointer writes. Nothing scans for hit counts, because LRU order is the ring order.
- q: >-
    A `put` on a key that is already cached creates a fresh node and pushes it to the front, leaving the old node in the list. What is the first visible consequence?
  options: ["Map and list disagree, and a later eviction deletes a live key from the map", "The old node is evicted first, so the cache acts as if the key were refreshed", "Nothing: the map points at the new node, so the old one is unreachable", "Memory use doubles at once, because the value is now stored twice"]
  answer: 0
  explanation: >-
    The map has one entry per key but the list has two nodes for it. When the stale node reaches the tail, eviction deletes the key from the map even though the fresh node is still near the front, so a live entry disappears and later the fresh node is unlinked with no map entry. Memory grows by one node, not double, and the old node is still reachable through the list.
- q: >-
    A nightly job scans every row of a large table through a pure-LRU cache in front of the database. What happens to the daytime working set?
  options: ["It survives, because its keys have far higher access counts", "It survives, because read-only access does not change LRU order", "It is evicted, because every scanned row becomes most recent", "Part of it survives, because scanned rows enter at the list midpoint"]
  answer: 2
  explanation: >-
    LRU has no notion of frequency; a single touch makes a scanned row the most recent entry. A scan larger than the cache flushes everything. Midpoint insertion is InnoDB's defence against exactly this, not something pure LRU does. This scan pollution is why Linux, InnoDB and Postgres all deviate from pure LRU.
- q: >-
    Why does Redis approximate LRU by sampling a few keys instead of keeping a linked list?
  options: ["A list needs a lock around every access, and Redis must avoid locks", "Expired keys would clog a list, and sampling purges them for free", "Sampling gives a higher hit ratio than exact LRU for the same memory", "A list costs 16 bytes per key, and sampling comes close to exact LRU"]
  answer: 3
  explanation: >-
    Sixteen bytes of pointers per key is significant when keys are small and numerous; a 24-bit clock plus sampling of 5 to 10 keys, with a 16-entry pool of the best candidates, gets close to exact LRU's hit ratio at a fraction of the memory. It is not more accurate than exact LRU, only nearly as accurate and much cheaper.
- q: >-
    You add thread safety with a single mutex around get and put. What is the main cost?
  options: ["Every read queues on the one lock, so reads lose parallelism", "Gets can interleave with puts, so results become incorrect", "Memory roughly doubles, because every entry needs its own lock", "Recency order becomes approximate, because reads are buffered"]
  answer: 0
  explanation: >-
    A global lock is correct but turns a structure meant to serve reads in parallel into a serial bottleneck. Segmented locks or lock-free read buffers (Caffeine) keep reads concurrent; approximate recency order is the price of those read buffers, not of a global lock.
```
