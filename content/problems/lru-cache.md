---
slug: lru-cache
title: LRU Cache
difficulty: medium
patterns: [linked-list]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, netflix, google]
order: 7
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "You need O(1) lookup by key and O(1) removal of the least recently used entry. A hash map gives the first; what ordered structure gives the second without a scan?"
  - "A doubly linked list keeps entries in recency order. Moving a node to the front and unlinking the back node are both O(1) if you hold pointers to the node itself, so store the node (not just the value) in the map."
  - "Sentinel head and tail nodes remove every null check from insert and unlink. Both `get` and `put` on an existing key count as a use."
signatures:
  python:
    name: LRUCache
    starter: |
      class LRUCache:
          def __init__(self, capacity: int):
              pass

          def get(self, key: int) -> int:
              pass

          def put(self, key: int, value: int) -> None:
              pass
  javascript:
    name: LRUCache
    starter: |
      class LRUCache {
        constructor(capacity) {
        }
        get(key) {
        }
        put(key, value) {
        }
      }
tests:
  - args: [["__init__", 2], ["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2], ["put", 4, 4], ["get", 1], ["get", 3], ["get", 4]]
    expected: [null, null, null, 1, null, -1, null, -1, 3, 4]
  - args: [["__init__", 1], ["put", 2, 1], ["get", 2], ["put", 3, 2], ["get", 2], ["get", 3]]
    expected: [null, null, 1, null, -1, 2]
    label: capacity one
  - args: [["__init__", 2], ["put", 2, 1], ["put", 2, 2], ["get", 2], ["put", 1, 1], ["put", 4, 1], ["get", 2]]
    expected: [null, null, null, 2, null, null, -1]
    label: overwriting a key does not grow the cache
  - args: [["__init__", 3], ["get", 5]]
    expected: [null, -1]
    label: miss on empty cache
  - args: [["__init__", 2], ["put", 1, 1], ["put", 2, 2], ["put", 1, 10], ["put", 3, 3], ["get", 2], ["get", 1], ["get", 3]]
    expected: [null, null, null, null, null, -1, 10, 3]
    hidden: true
    label: put on an existing key refreshes recency
  - args: [["__init__", 2], ["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 1], ["get", 2], ["get", 3]]
    expected: [null, null, null, 1, null, 1, -1, 3]
    hidden: true
    label: get refreshes recency
  - args: [["__init__", 3], ["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["put", 4, 4], ["get", 4], ["get", 3], ["get", 2], ["get", 1], ["put", 5, 5], ["get", 1], ["get", 2], ["get", 3], ["get", 4], ["get", 5]]
    expected: [null, null, null, null, null, 4, 3, 2, -1, null, -1, 2, 3, -1, 5]
    hidden: true
time_limit_ms: 4000
---
Design a fixed-capacity cache that evicts the **least recently used** entry when it is full. Implement a class `LRUCache`:

- `LRUCache(capacity)` — create a cache that holds at most `capacity` entries (`capacity ≥ 1`).
- `get(key)` — return the value stored for `key`, or `-1` if it is absent. A successful `get` counts as a use of that key.
- `put(key, value)` — insert or overwrite `key`. Both cases count as a use. If inserting a *new* key would exceed the capacity, evict the entry that was used longest ago first.

Every operation must run in `O(1)` average time.

Tests are given as a sequence of method calls beginning with `__init__`; the expected output is the list of return values in order, with `null` for calls that return nothing.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `LRUCache(2)`, `put(1,1)`, `put(2,2)`, `get(1)` | `null, null, null, 1` | Key 1 is now the most recent |
| `put(3,3)`, `get(2)` (continuing) | `null, -1` | Cache was full; 2 was least recent, so it was evicted |
| `put(4,4)`, `get(1)`, `get(3)`, `get(4)` | `null, -1, 3, 4` | Inserting 4 evicted 1, the oldest of {1, 3} |

### Constraints

- `1 ≤ capacity ≤ 3000`
- `0 ≤ key, value ≤ 10⁴`
- At most `2 × 10⁵` calls to `get` and `put`

### Follow-up

The interviewer asks: "How would you make this safe for concurrent readers and writers without serialising every `get`?" Then: "LRU is a poor fit for scan-heavy workloads. What would you change, and what does Redis actually do?"

## Solution

### The naive approach

A hash map from key to `(value, last_used_timestamp)`. `get` and the overwrite path of `put` are `O(1)`, but eviction has to scan every entry for the smallest timestamp: `O(n)`. Alternatively a list ordered by recency makes eviction `O(1)` but every `get` has to find and move an element: `O(n)`. Each structure is fast at one half of the job.

### The insight

Combine them. The hash map answers "where is key `k`?" in `O(1)`; a **doubly linked list** ordered by recency answers "which entry is oldest?" in `O(1)` (it is at the tail). The bridge is that the map stores a pointer to the *list node*, so a `get` can unlink that node from wherever it sits and reinsert it at the front in constant time. Singly linked would not do: unlinking a node requires its predecessor, and a doubly linked node carries that pointer.

### The optimal approach

Keep sentinel `head` and `tail` nodes so the list is never empty and `insert_front` / `unlink` need no null checks. Most recent sits right after `head`; least recent sits right before `tail`.

- `get(key)`: if absent return `-1`; otherwise unlink the node, reinsert at front, return its value.
- `put(key, value)`: if present, update the value and move to front. Otherwise create a node, insert at front, store it in the map; if the map is now over capacity, take the node before `tail`, unlink it, and delete its key from the map.

```python
class _Node:
    __slots__ = ("key", "val", "prev", "next")

    def __init__(self, key: int = 0, val: int = 0):
        self.key, self.val = key, val
        self.prev: "_Node | None" = None
        self.next: "_Node | None" = None


class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.map: dict[int, _Node] = {}
        self.head = _Node()          # sentinel: most recent is head.next
        self.tail = _Node()          # sentinel: least recent is tail.prev
        self.head.next = self.tail
        self.tail.prev = self.head

    def _unlink(self, node: _Node) -> None:
        node.prev.next = node.next
        node.next.prev = node.prev

    def _insert_front(self, node: _Node) -> None:
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key: int) -> int:
        node = self.map.get(key)
        if node is None:
            return -1
        self._unlink(node)
        self._insert_front(node)
        return node.val

    def put(self, key: int, value: int) -> None:
        node = self.map.get(key)
        if node is not None:
            node.val = value
            self._unlink(node)
            self._insert_front(node)
            return
        node = _Node(key, value)
        self.map[key] = node
        self._insert_front(node)
        if len(self.map) > self.cap:
            victim = self.tail.prev
            self._unlink(victim)
            del self.map[victim.key]
```

Every operation is `O(1)`. Space `O(capacity)`.

The node stores its `key` so eviction can delete the right map entry; a node holding only the value would leave a dangling map entry behind. In Python, `collections.OrderedDict` (with `move_to_end` and `popitem(last=False)`) is exactly this structure and is acceptable if you can explain what it does underneath; in Java, `LinkedHashMap` with access order and `removeEldestEntry`.

### Common mistakes

- Forgetting that `get` is a use, so a recently read key gets evicted.
- Not storing the key in the node, then being unable to remove the evicted entry from the map.
- Evicting *before* checking whether the key already exists, which can evict a live entry on a plain overwrite.
- Using a singly linked list and paying `O(n)` to find the predecessor on every move-to-front.

### How to discuss it

Lead with the two requirements and why each structure covers one: "hash map for lookup, doubly linked list for recency order, map points at nodes so moves are O(1)." Draw the sentinels. For concurrency: a single lock around everything is correct but serialises reads; the usual production answer is sharding the cache by key hash into `N` independent LRUs, each with its own lock, accepting that eviction is then approximately-LRU globally. For scan resistance: a full table scan pushes every hot key out of a pure LRU; the fixes are segmented LRU (probationary and protected segments, as in `Caffeine`'s window-TinyLFU) or sampled eviction. Redis does *not* maintain exact LRU; it samples a handful of keys and evicts the oldest of the sample, trading precision for zero bookkeeping on the hot path, which is the kind of trade-off a senior engineer should be able to articulate.
