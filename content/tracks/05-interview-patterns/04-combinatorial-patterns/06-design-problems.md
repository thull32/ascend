---
slug: design-problems
title: "Design problems: compose two structures and state the invariant that binds them"
description: Turn "implement a class supporting these operations in O(1)" into an operation table, pick one structure per requirement, keep them consistent with an explicit invariant, and see Insert Delete GetRandom, LRU Cache and Design Circular Queue traced operation by operation.
minutes: 33
difficulty: medium
tags: [design, data-structure-design, hash-map, linked-list, ring-buffer, invariants, pattern:design]
problems: [lru-cache, time-based-kv, min-stack, design-hashmap, design-circular-queue, insert-delete-getrandom, kth-largest-stream]
---
"Design a data structure that supports `insert`, `remove` and `getRandom`, each in average `O(1)`." There is no algorithm to discover and no search space to prune. The problem is a list of operations with a complexity budget, and the difficulty is that no single structure meets the whole budget. A hash set finds values in `O(1)` but cannot hand you a uniformly random member without walking it. An array returns a random element in `O(1)` but needs `O(n)` to find the value you want to remove. The answer is to use both, and the whole interview then turns on one question: after every operation, do the two structures still agree?

That is the pattern. Write the operations down, find the cheapest structure for each, notice the conflict, and **compose two structures whose consistency you guarantee with an explicit invariant**. Every method becomes "do the work, then restore the invariant". Design rounds are also where the senior bar is most visible. Coding the class is table stakes. What separates senior from mid-level is the follow-up conversation: amortised versus worst case, what breaks under concurrency, and what you would use in production instead.

## The signal

- **"Implement the class `X` with these methods"**, each with a required complexity ("in `O(1)`", "average `O(1)`", "`O(log n)`").
- **A stream of operations with state kept across calls**: "add a number, then report the k-th largest after each add" ([Kth Largest Element in a Stream](/practice/kth-largest-stream)).
- **Capacity and eviction**: "when full, evict the least recently used" ([LRU Cache](/practice/lru-cache)), or "fixed-size buffer" ([Design Circular Queue](/practice/design-circular-queue)).
- **Time or versions**: "get the value as of timestamp `t`" ([Time Based Key-Value Store](/practice/time-based-kv)), "take a snapshot".
- **Randomness over a changing set** ([Insert Delete GetRandom O(1)](/practice/insert-delete-getrandom)).
- **Access patterns that no single structure serves**: by key *and* by recency, by key *and* by position, LIFO *and* minimum ([Min Stack](/practice/min-stack)).

What rules it out:

- **A single query on fixed input** is an algorithm question, not a design question, even if it is phrased as "write a function".
- **Operations one structure already serves.** If the class only needs put, get and delete by key, it is a hash map ([Design HashMap](/practice/design-hashmap) asks you to build that map itself, which is a different exercise). Adding a second structure without a conflict that forces it is over-engineering, and interviewers notice.

The confusable round is distributed [system design](/learn/system-design/building-blocks/the-design-interview-method). This lesson is about designing an in-memory data structure, but the senior follow-ups deliberately bridge the two: memory overhead, concurrency, persistence.

## The template

The method has five steps, and the first three happen before any code:

1. **List the operations and their budgets.**
2. **For each operation, name the structure that does it best.**
3. **Find the conflict**, then pick a primary store (which serves the hardest operation) and an index into it (which makes it addressable).
4. **Write the invariant** that ties them together, in one sentence.
5. **Implement each method as "locate, mutate, repair"**, and test it with operation sequences that hit the edges: remove the last element, evict at capacity 1, wrap around.

These are the building blocks you compose:

| Requirement | Building block | Cost |
|---|---|---|
| Find by key | Hash map | `O(1)` average |
| Uniform random element | Dense array | `O(1)` |
| Delete from the middle of an array | Swap with the last element, then pop | `O(1)`, order not kept |
| Recency order: move to front, delete anywhere | Doubly linked list + map from key to node | `O(1)` |
| Minimum of a LIFO sequence | Stack of (value, minimum so far) | `O(1)` |
| k-th largest of a stream | Min-heap holding the k largest | `O(log k)` per add |
| Latest version at or before `t` | Per-key append-only list + binary search | `O(log v)` |
| FIFO with fixed capacity | Ring buffer: array + head + count | `O(1)`, no allocation |
| Ordered keys, floor and ceiling | Balanced BST, skip list or sorted container | `O(log n)` |

The composition you will use most is **a dense array plus an index map**, and it doubles as the template for "locate, mutate, repair":

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

    def _check(self):                          # call after every operation in tests
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

The `_check` method is not decoration. Writing the invariant as executable code and calling it after every step of a randomised operation sequence is how you find the bug before the interviewer does.

## Worked problems

### Insert Delete GetRandom O(1)

[Insert Delete GetRandom O(1)](/practice/insert-delete-getrandom): a set of integers supporting `insert(v)` and `remove(v)`, each returning whether it changed anything, and `get_random()`, returning each current member with equal probability. Everything must be average `O(1)`.

The operation table decides it. `insert` and `remove` want a hash set. `get_random` wants a dense array, because `random.choice(items)` picks a uniform index. Neither Python's `set` nor JavaScript's `Set` supports indexing, so random selection from them means materialising a list in `O(n)`. The composition is exactly `IndexedArray` plus one method:

```python
import random

class RandomizedSet(IndexedArray):
    insert = IndexedArray.add
    def get_random(self):
        return random.choice(self.items)       # uniform: every member has exactly one slot
```

Trace it:

| operation | `items` after | `pos` after | note |
|---|---|---|---|
| insert 10 | `[10]` | `{10: 0}` | |
| insert 20 | `[10, 20]` | `{10: 0, 20: 1}` | |
| insert 30 | `[10, 20, 30]` | `{10: 0, 20: 1, 30: 2}` | |
| remove 10 | `[30, 20]` | `{30: 0, 20: 1}` | the last value, 30, moves into slot 0 |
| get_random | | | uniform index in `[0, 2)` |
| remove 30 | `[20]` | `{20: 0}` | 30 is at slot 0; 20 moves in, pop |
| remove 20 | `[]` | `{}` | 20 is itself the last value |
| insert 40 | `[40]` | `{40: 0}` | |

The row "remove 20" is the one that breaks careless code. When the victim *is* the last element, `last == v`, and the repair `pos[last] = i` writes an entry for the value being removed. If the code deletes `pos[v]` **before** that repair, the repair then resurrects a stale entry for a value that is no longer in the set. Deleting after the repair makes the special case disappear. That is why the template orders the two writes the way it does.

The follow-ups: with **duplicates allowed**, `pos` maps each value to a *set* of indices, and the swap must move one index of the relocated value from `n - 1` to `i`. With **weighted randomness**, keep prefix sums of the weights and binary search a random number, as in [meet in the middle and randomisation](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation).

### LRU Cache

[LRU Cache](/practice/lru-cache): `get(key)` returns the value or −1, `put(key, value)` inserts or updates, and when a put exceeds `capacity`, the least recently *used* key is evicted, where both gets and puts count as uses. Everything is `O(1)`.

The operation table: find by key needs a hash map. Recency order needs a sequence where you can move any element to the front and remove the oldest, all in `O(1)`. An array cannot move from the middle cheaply, and a singly linked list cannot unlink a node without its predecessor. A **doubly linked list** can, as long as you can reach the node directly, and the hash map gives you that: key → node. The invariant: *the map holds exactly the keys in the list, each entry points at the node holding that key, and the list runs from most to least recently used.*

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
            lru = self.tail.prev                     # least recent sits just before the tail
            self._unlink(lru)
            del self.map[lru.key]                    # this is why nodes store their key
        node = Node(key, val)
        self.map[key] = node
        self._push_front(node)
```

Trace with capacity 2:

| operation | list after, most to least recent | returns | note |
|---|---|---|---|
| put(1, 1) | 1 | | |
| put(2, 2) | 2, 1 | | |
| get(1) | 1, 2 | 1 | the read moves 1 to the front |
| put(3, 3) | 3, 1 | | at capacity: evict the tail, 2 |
| get(2) | 3, 1 | −1 | |
| put(4, 4) | 4, 3 | | evict the tail, 1 |
| get(1) | 4, 3 | −1 | |
| get(3) | 3, 4 | 3 | |
| get(4) | 4, 3 | 4 | |

If `get(1)` had not refreshed recency, `put(3, 3)` would have evicted 1 instead of 2, and every later answer would differ. That is the most common failing test for this problem.

```viz
{"type": "system", "scenario": "lru-cache", "keys": ["A", "B", "A", "C", "D", "B", "A"], "title": "Recency order under a stream of accesses", "caption": "Capacity 3. A hit moves the key to the front; a miss at capacity evicts the key at the back, the least recently used."}
```

In production you would rarely write the list yourself. Python's `OrderedDict` has `move_to_end` and `popitem(last=False)`. A JavaScript `Map` iterates in insertion order, so `delete` then `set` moves a key to the end and `map.keys().next().value` is the oldest. Java's `LinkedHashMap` with access order and `removeEldestEntry` is an LRU cache in five lines. Say this, then implement the list anyway, because building it is the point of the exercise. The [LRU cache lesson](/learn/advanced-data-structures/caches-and-eviction/lru-cache) goes deeper into what real systems do instead of exact LRU.

### Design Circular Queue

[Design Circular Queue](/practice/design-circular-queue): a FIFO queue of fixed capacity `k` with `enqueue`, `dequeue` (both returning success), `front`, `rear`, `is_empty` and `is_full`, all `O(1)`, with no allocation after construction.

The structure is a ring buffer: an array of size `k`, a `head` index and a `count`. The invariant is *the queue's elements, oldest first, are `buf[(head + i) % k]` for `i` in `[0, count)`.* From it, the rear element is at `(head + count - 1) % k` and the next free slot is at `(head + count) % k`.

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
        self.head = (self.head + 1) % self.k      # nothing to clear: the slot is simply dead
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

Trace with `k = 3`:

| operation | `buf` | `head` | `count` | returns |
|---|---|---|---|---|
| enqueue 1 | `[1, _, _]` | 0 | 1 | true |
| enqueue 2 | `[1, 2, _]` | 0 | 2 | true |
| enqueue 3 | `[1, 2, 3]` | 0 | 3 | true |
| enqueue 4 | unchanged | 0 | 3 | false: full |
| rear | | | | `buf[(0 + 3 - 1) % 3]` = 3 |
| is_full | | | | true |
| dequeue | `[1, 2, 3]`, slot 0 now dead | 1 | 2 | true |
| enqueue 4 | `[4, 2, 3]` | 1 | 3 | true: written at `(1 + 2) % 3 = 0` |
| rear | | | | `buf[(1 + 3 - 1) % 3]` = `buf[0]` = 4 |
| front | | | | `buf[1]` = 2 |

Why a `count` rather than a `tail` index? With only `head` and `tail`, `head == tail` means both "empty" and "full". The three standard fixes are a count, a separate full flag, or an array of `k + 1` slots with one always left unused. The count is the easiest to reason about. When `k` is a power of two, `% k` becomes `& (k - 1)`, which is why high-performance ring buffers (network card queues, audio buffers, lock-free single-producer queues) choose power-of-two sizes. See [Merkle trees and ring buffers](/learn/advanced-data-structures/log-structured-and-disk-structures/merkle-trees-and-ring-buffers).

## Variations

- **Min Stack** ([Min Stack](/practice/min-stack)). Push `(value, min(value, current_min))` pairs, and `get_min` reads the top pair. The two-stack version pushes onto the min-stack only when `value <= current_min`. The `<=` matters: push 1, push 1, pop must leave the minimum at 1 (the replay below shows the same case with 3s).
- **Kth Largest in a Stream** ([Kth Largest Element in a Stream](/practice/kth-largest-stream)). Keep a **min**-heap of the `k` largest values seen. Its root is the k-th largest. On `add`, push, and pop if the size exceeds `k`. The min-heap is what lets you discard the smallest of the top `k` in `O(log k)`. A max-heap of everything costs `O(n)` memory and still needs `k` pops per query.
- **Time Based Key-Value Store** ([Time Based Key-Value Store](/practice/time-based-kv)). Map each key to a list of `(timestamp, value)`. The problem guarantees increasing timestamps, so appending keeps each list sorted, and `get(key, t)` is `bisect_right - 1`. If timestamps could arrive out of order, the append becomes an `O(n)` insort or a balanced-tree insert. Asking about this is a good clarifying question.
- **Design HashMap** ([Design HashMap](/practice/design-hashmap)). An array of buckets with chaining, a hash such as `key % buckets`, and a load-factor threshold that doubles and rehashes, giving amortised `O(1)`. Open addressing needs tombstones for deletion. The mechanics are in [hash tables](/learn/data-structures/hashing/hash-tables).
- **LFU cache.** A map from key to node, a map from frequency to a doubly linked list of nodes, and a `min_freq` pointer: `O(1)` for everything, covered in [LFU and modern policies](/learn/advanced-data-structures/caches-and-eviction/lfu-and-modern-policies).
- **Snapshot array.** Instead of copying the array on every snapshot (`O(n)` per snap), store a per-index history of `(snap_id, value)` and binary search it on `get`. This is the exercise below.
- **Hit counter or rate limiter.** A ring buffer of per-second buckets, or a deque of timestamps trimmed from the front. It is a circular queue with the time as the index.

The Min Stack replay, with a duplicate minimum:

```viz
{"type": "stack-queue", "algorithm": "min-stack", "operations": [["push", 5], ["push", 3], ["push", 7], ["push", 3], ["getMin"], ["pop"], ["getMin"], ["pop"], ["pop"], ["getMin"]], "title": "Min stack with a duplicate minimum", "caption": "The second 3 is also pushed onto the min-stack, so popping one 3 leaves the minimum at 3, not 5."}
```

## Pitfalls

- **Repairing the index in the wrong order** in swap-with-last deletion, which corrupts the map when the removed value is the last one.
- **Random selection from a hash set.** `random.choice(list(s))` is `O(n)` per call, and JavaScript's `Set` has no indexed access.
- **LRU `get` that does not refresh recency**, a `put` on an existing key that creates a second node, or a node that does not store its key, so eviction cannot delete the map entry.
- **`<` instead of `<=`** in the two-stack Min Stack, which loses the minimum when a duplicate minimum is popped.
- **The `head == tail` ambiguity** in ring buffers. Also, `rear` computed as `buf[tail - 1]` works by accident in Python when `tail == 0`, because `buf[-1]` is the last slot, and returns `undefined` in JavaScript. Use the modular formula in both.
- **Mutable default arguments** in Python constructors (`def __init__(self, nums=[])`): the list is shared across instances.
- **Unstated amortisation.** Dynamic arrays and hash maps are amortised `O(1)`. A single operation can take `O(n)` during a resize, which shows up as a latency spike. Say "amortised" when it is.
- **Sentinel confusion.** Return exactly what the problem specifies (−1, `null`, `""`), and do not leak internal sentinels such as a dummy node's key.

## Exercise

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

## Senior signals

- You start with the **operation table** and name the conflict before choosing structures, then state **the invariant** that binds them in one sentence.
- You implement every method as **locate, mutate, repair**, and you test with **operation sequences against a brute-force model** (for example a plain list plus linear scans), including the edge cases: last element, capacity 1, wrap-around.
- You separate **amortised from worst case** and name the production consequence: resize pauses, which is why Redis rehashes its dictionaries incrementally across operations instead of all at once.
- You discuss **concurrency**: one lock is simple but contended. Sharded or striped locks scale further. An LRU is hard to make concurrent because every read mutates the list, which is why production caches such as Caffeine buffer reads and apply them in batches, and why Redis approximates LRU by sampling keys.
- You know the **library equivalents** (`OrderedDict`, `LinkedHashMap`, insertion-ordered `Map`, `heapq`, `bisect`, `deque(maxlen=k)`) and say when you would use them in production.
- You account for **memory**: a doubly linked node carries two pointers and an object header, which for small values can cost several times the payload across a million entries.

## Check yourself

```quiz
- q: >-
    In the swap-with-last removal, the code does del pos[v] before pos[last] = i. On which operation does this fail?
  options: ["Removing the element that sits first in the array", "Removing any element from a set of exactly two", "Removing the last element, whose entry gets re-created", "Never; the two writes can safely go in either order"]
  answer: 2
  explanation: >-
    When v is last, last == v. Deleting first and repairing second writes pos[v] back with pos[last] = i, so the map claims a value that is no longer in the array. Repairing first and deleting last handles the case with no special branch.
- q: >-
    Why does an LRU cache use a doubly linked list rather than a singly linked one?
  options: ["Doubly linked nodes use less memory than singly linked ones", "Unlinking needs the predecessor, and prev gives it in O(1)", "Singly linked lists cannot use a sentinel head node", "To print the cache in both directions for debugging"]
  answer: 1
  explanation: >-
    The hash map gives direct access to the node, and moving it to the front means unlinking it first. Unlinking needs node.prev, and a singly linked list would have to walk from the head to find it, which is O(n). The extra pointer costs memory; it is the price of O(1) moves.
- q: >-
    A circular queue stores only head and tail indices in an array of size k. What problem must the design solve?
  options: ["The array must be resized whenever tail passes head", "The head index eventually overflows as it keeps growing", "Dequeue cannot be O(1) once the buffer wraps around", "head == tail is ambiguous: it means empty and also full"]
  answer: 3
  explanation: >-
    Both an empty queue and a full queue have the indices coinciding, so the state is ambiguous without a count, a flag, or a wasted slot. Tracking count, or keeping one slot always empty, disambiguates. A count also gives is_full and is_empty directly.
- q: >-
    For Kth Largest Element in a Stream, why a min-heap of size k rather than a max-heap of all elements?
  options: ["A max-heap cannot hold duplicate values correctly", "Its root is the k-th largest; adds cost O(log k)", "Both are equivalent in time and memory for this task", "Min-heaps are faster than max-heaps in Python's heapq"]
  answer: 1
  explanation: >-
    Keeping only the top k and discarding the smallest of them on overflow is exactly what a min-heap does cheaply: its root is the k-th largest, each add costs O(log k), and memory is O(k). A max-heap of everything keeps data you will never need, costs O(n) memory, and needs k pops to answer.
- q: >-
    An interviewer asks how you would make your LRU cache thread-safe for a read-heavy service. Which answer shows the most understanding?
  options: ["A read-write lock, since gets only read the cache", "Wrap every method in one mutex; reads are cheap anyway", "Use a concurrent hash map and drop the recency list", "Gets mutate the list; shard or batch recency updates"]
  answer: 3
  explanation: >-
    The trap is assuming gets are reads: in an LRU, every get moves a node, so a read-write lock does not help. A single lock is simple but contended; sharding by key into independent LRUs trades exact global LRU for scalability; buffered or approximate recency (Caffeine, Redis sampling) is what real systems do. Dropping the list breaks eviction order.
```
