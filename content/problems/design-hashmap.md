---
slug: design-hashmap
title: Design HashMap
difficulty: easy
patterns: [design]
lists: [ascend-150]
companies: [amazon, microsoft, apple, oracle]
order: 1
lesson: interview-patterns/combinatorial-patterns/design-problems
hints:
  - "You may not use a built-in hash map. An array of buckets indexed by `key % capacity` gets you most of the way; the question is what to do when two keys land in the same bucket."
  - "Chaining: each bucket is a list of `[key, value]` pairs. `put` scans the bucket for the key and overwrites or appends; `get` scans and returns; `remove` scans and deletes."
  - "Keep a count and, when it exceeds `0.75 × capacity`, double the bucket array and re-insert every pair. Without that, a bucket's chain grows without bound and every operation degrades to O(n)."
signatures:
  python:
    name: MyHashMap
    starter: |
      class MyHashMap:
          def __init__(self):
              pass

          def put(self, key: int, value: int) -> None:
              pass

          def get(self, key: int) -> int:
              pass

          def remove(self, key: int) -> None:
              pass
  javascript:
    name: MyHashMap
    starter: |
      class MyHashMap {
        constructor() {
        }
        put(key, value) {
        }
        get(key) {
        }
        remove(key) {
        }
      }
tests:
  - args: [["put", 1, 1], ["put", 2, 2], ["get", 1], ["get", 3], ["put", 2, 1], ["get", 2], ["remove", 2], ["get", 2]]
    expected: [null, null, 1, -1, null, 1, null, -1]
  - args: [["get", 42], ["remove", 42], ["get", 42]]
    expected: [-1, null, -1]
    label: missing keys
  - args: [["put", 5, 10], ["put", 5, 20], ["get", 5]]
    expected: [null, null, 20]
    label: overwrite keeps one entry
  - args: [["put", 3, 3], ["remove", 3], ["get", 3], ["put", 3, 4], ["get", 3]]
    expected: [null, null, -1, null, 4]
    label: re-insert after remove
  - args: [["put", 7, 1], ["put", 1007, 2], ["put", 2007, 3], ["get", 7], ["get", 1007], ["get", 2007], ["remove", 1007], ["get", 1007], ["get", 7], ["get", 2007]]
    expected: [null, null, null, 1, 2, 3, null, -1, 1, 3]
    hidden: true
    label: keys that collide in a small table
  - args: [["put", 0, 42], ["put", 1000000, 7], ["get", 0], ["get", 1000000]]
    expected: [null, null, 42, 7]
    hidden: true
    label: smallest and largest keys
  - args: [["put", 9, 0], ["get", 9], ["get", 10]]
    expected: [null, 0, -1]
    hidden: true
    label: a stored zero is not a missing key
  - args: [["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["put", 4, 4], ["put", 5, 5], ["put", 6, 6], ["put", 7, 7], ["put", 8, 8], ["put", 9, 9], ["put", 10, 10], ["get", 1], ["get", 10], ["remove", 5], ["get", 5], ["get", 6]]
    expected: [null, null, null, null, null, null, null, null, null, null, 1, 10, null, -1, 6]
    hidden: true
    label: survives a resize
time_limit_ms: 4000
---
Implement a hash map for non-negative integer keys and values without using any built-in hash map or dictionary type. Implement a class `MyHashMap` with:

- `put(key, value)` — store `value` under `key`, replacing any previous value.
- `get(key)` — return the value stored under `key`, or `-1` if the key is absent.
- `remove(key)` — delete `key` if present; do nothing otherwise.

Tests are given as a sequence of method calls; the expected output is the list of return values in order, with `null` for `put` and `remove`.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `put(1, 1), put(2, 2), get(1), get(3)` | `null, null, 1, -1` | `3` was never stored |
| `put(2, 1), get(2)` (continuing) | `null, 1` | Overwrite |
| `remove(2), get(2)` (continuing) | `null, -1` | Gone |

### Constraints

- `0 ≤ key, value ≤ 10⁶`
- At most `10⁴` calls in total

### Follow-up

The interviewer asks: "Your keys are integers, so `key % capacity` is fine. What changes when keys are strings, and what makes a hash function *bad*?" Then: "Compare chaining with open addressing: when would you choose each, and what does deletion look like under open addressing?"

## Solution

### The naive approach

Since keys are at most `10⁶`, a plain array of `10⁶ + 1` slots initialised to `-1` gives `O(1)` everything. It is a legitimate answer for these constraints, and you should say so, but it uses eight megabytes to store ten thousand entries and it does not generalise to string keys or a larger key space. The interviewer wants the real structure.

### The insight

A hash map is an array of buckets plus a function that maps a key to a bucket index. Two keys can map to the same bucket (a collision), so each bucket must hold more than one entry; the simplest way is a short list, called a chain. As long as the number of entries stays proportional to the number of buckets, chains stay short and every operation costs a constant number of comparisons on average. Keeping that ratio (the load factor) bounded is what the resize is for.

### The optimal approach

```python
class MyHashMap:
    def __init__(self):
        self.capacity = 16
        self.size = 0
        self.buckets: list[list[list[int]]] = [[] for _ in range(self.capacity)]

    def _index(self, key: int) -> int:
        return key % self.capacity

    def put(self, key: int, value: int) -> None:
        bucket = self.buckets[self._index(key)]
        for pair in bucket:
            if pair[0] == key:
                pair[1] = value
                return
        bucket.append([key, value])
        self.size += 1
        if self.size > self.capacity * 3 // 4:
            self._resize()

    def get(self, key: int) -> int:
        for k, v in self.buckets[self._index(key)]:
            if k == key:
                return v
        return -1

    def remove(self, key: int) -> None:
        bucket = self.buckets[self._index(key)]
        for i, pair in enumerate(bucket):
            if pair[0] == key:
                bucket[i] = bucket[-1]
                bucket.pop()
                self.size -= 1
                return

    def _resize(self) -> None:
        old = self.buckets
        self.capacity *= 2
        self.buckets = [[] for _ in range(self.capacity)]
        for bucket in old:
            for key, value in bucket:
                self.buckets[self._index(key)].append([key, value])
```

With the load factor kept below `0.75`, the expected chain length is below one, so `put`, `get` and `remove` are expected `O(1)`. A resize is `O(n)` but happens only after `n` insertions since the last one, so it amortises to `O(1)` per `put`. Space `O(n + capacity)`.

The `remove` swaps the last pair into the hole rather than calling `list.pop(i)`, which avoids shifting the chain; order inside a bucket does not matter.

### Common mistakes

- Returning `-1` when the stored *value* is `-1` or `0`; the sentinel must mean "absent", so check presence, not value. (Values here are non-negative, but the test with a stored `0` catches code that uses `0` as "empty".)
- Never resizing, so a fixed table of a few hundred buckets degrades to `O(n)` per operation once the map is large.
- Using a prime modulus with a power-of-two table, or vice versa, without knowing why; with integer keys and `key % capacity` a power-of-two capacity is fine because the keys are not adversarial.

### How to discuss it

Describe buckets, chaining, load factor and resize in that order, and give the amortised argument for resize. For string keys, hash the characters (polynomial rolling hash is the classic) and then reduce modulo capacity; a bad hash function is one whose output clusters (all keys with the same last character land together) or one that is predictable enough for an attacker to craft collisions, which is why languages randomise their string hash seeds. On chaining versus open addressing: open addressing (linear probing) stores entries directly in the array, is more cache-friendly and uses less memory per entry, but degrades sharply above a load factor of about `0.7` and needs tombstones on delete so that probe sequences are not broken; chaining tolerates high load and simple deletion at the cost of pointer chasing. Knowing that Python's `dict` uses open addressing and Java's `HashMap` uses chaining (with tree bins for long chains) is a nice concrete detail.
