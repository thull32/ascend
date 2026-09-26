---
slug: insert-delete-getrandom
title: Insert Delete GetRandom O(1)
difficulty: medium
patterns: [design]
lists: [ascend-150]
companies: [amazon, meta, google, linkedin]
order: 3
lesson: interview-patterns/combinatorial-patterns/design-problems
hints:
  - "A hash set gives O(1) insert and remove, but uniform random choice needs indexable storage. A list gives O(1) random choice but O(n) remove. Use both."
  - "Keep a list of values and a dictionary from value to its index in the list. `insert` appends and records the index."
  - "To remove a value in O(1), swap it with the *last* element of the list, update that element's index in the dictionary, then pop the last slot."
signatures:
  python:
    name: RandomizedSet
    starter: |
      import random


      class RandomizedSet:
          def __init__(self):
              pass

          def insert(self, val: int) -> bool:
              pass

          def remove(self, val: int) -> bool:
              pass

          def get_random(self) -> int:
              pass

          def get_random_is_member(self) -> bool:
              return self.get_random() in self.index  # adjust to your own field name
  javascript:
    name: RandomizedSet
    starter: |
      class RandomizedSet {
        constructor() {
        }
        insert(val) {
        }
        remove(val) {
        }
        get_random() {
        }
        get_random_is_member() {
          // return whether get_random() is currently a member of the set
        }
      }
tests:
  - args: [["insert", 1], ["remove", 2], ["insert", 2], ["get_random_is_member"], ["remove", 1], ["insert", 2], ["get_random_is_member"]]
    expected: [true, false, true, true, true, false, true]
  - args: [["insert", 5], ["insert", 5], ["remove", 5], ["remove", 5], ["insert", 5], ["get_random_is_member"]]
    expected: [true, false, true, false, true, true]
    label: duplicate insert and double remove
  - args: [["insert", -7], ["insert", 7], ["remove", -7], ["get_random_is_member"], ["remove", 7], ["remove", 7]]
    expected: [true, true, true, true, true, false]
    label: negatives
  - args: [["remove", 1], ["insert", 0], ["remove", 0], ["insert", 0], ["get_random_is_member"]]
    expected: [false, true, true, true, true]
    label: remove from empty
  - args: [["insert", 1], ["insert", 2], ["insert", 3], ["insert", 4], ["insert", 5], ["remove", 3], ["remove", 1], ["get_random_is_member"], ["insert", 3], ["remove", 5], ["get_random_is_member"]]
    expected: [true, true, true, true, true, true, true, true, true, true, true]
    hidden: true
    label: removals from the middle
  - args: [["insert", 10], ["insert", 20], ["insert", 30], ["remove", 10], ["remove", 30], ["remove", 20], ["remove", 30], ["insert", 30], ["get_random_is_member"]]
    expected: [true, true, true, true, true, true, false, true, true]
    hidden: true
    label: swap-with-last must update the moved index
  - args: [["insert", 4], ["remove", 4], ["insert", 4], ["remove", 4], ["remove", 4], ["insert", 4], ["insert", 4], ["get_random_is_member"]]
    expected: [true, true, true, true, false, true, false, true]
    hidden: true
time_limit_ms: 4000
---
Design a set of integers that supports insertion, deletion and uniformly random selection, each in average `O(1)` time. Implement a class `RandomizedSet` with:

- `insert(val)` — add `val`; return `true` if it was not already present, `false` otherwise.
- `remove(val)` — delete `val`; return `true` if it was present, `false` otherwise.
- `get_random()` — return a member chosen uniformly at random. Only called on a non-empty set.
- `get_random_is_member()` — call your own `get_random()` and return whether the value it produced is currently a member. This method exists so the tests can exercise `get_random()` deterministically: a correct implementation always returns `true`, and a broken one (for example, one that returns a stale value after a removal) will eventually return `false`.

Tests are given as a sequence of method calls; the expected output is the list of return values in order.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `insert(1), remove(2), insert(2)` | `true, false, true` | `2` was absent, then inserted |
| `remove(1), insert(2)` (continuing) | `true, false` | `2` is already present |
| `get_random_is_member()` (continuing) | `true` | Whatever `get_random` picks, it is a member |

### Constraints

- `-2³¹ ≤ val ≤ 2³¹ - 1`
- At most `2 × 10⁵` calls in total

### Follow-up

The interviewer asks: "Now duplicates are allowed, and `get_random` must weight each value by how many copies it holds. What changes?" Then: "Why is `random.choice` over a Python `set` not an option, and what does that tell you about hash tables in general?"

## Solution

### The naive approach

A hash set: `insert` and `remove` are `O(1)`, but `get_random` has no way to pick a uniform element without converting to a list (`O(n)`). A plain list: `get_random` is `O(1)` via a random index, `insert` is `O(1)` append, but `remove` needs a linear search and then a shift. Each structure is missing exactly one property.

### The insight

Use both, and keep them in sync. The list holds the values in arbitrary order so a random index is a uniform choice; the dictionary maps each value to its position in the list so `remove` can find it in `O(1)`. The remaining problem is that deleting from the middle of a list shifts everything after it. The trick: the order does not matter, so move the *last* element into the hole, update its recorded index, and pop the tail. Deletion becomes `O(1)`.

### The optimal approach

```python
import random


class RandomizedSet:
    def __init__(self):
        self.values: list[int] = []
        self.index: dict[int, int] = {}

    def insert(self, val: int) -> bool:
        if val in self.index:
            return False
        self.index[val] = len(self.values)
        self.values.append(val)
        return True

    def remove(self, val: int) -> bool:
        i = self.index.get(val)
        if i is None:
            return False
        last = self.values[-1]
        self.values[i] = last
        self.index[last] = i
        self.values.pop()
        del self.index[val]
        return True

    def get_random(self) -> int:
        return random.choice(self.values)

    def get_random_is_member(self) -> bool:
        return self.get_random() in self.index
```

The order of operations in `remove` matters when `val` *is* the last element: overwriting `values[i]` with itself and setting `index[last] = i` are no-ops, and then the pop and the `del` clean up. Doing `del self.index[val]` before `self.index[last] = i` would, in that case, delete the entry and then re-create it, leaving a stale key.

All four methods are average `O(1)` (dictionary operations are expected constant time). Space `O(n)`.

### Common mistakes

- Removing with `list.remove(val)` or `del values[i]`, both `O(n)`.
- Forgetting to update `index[last]` after the swap, so a later `remove(last)` writes into the wrong slot. The hidden test named for this fails on exactly that bug.
- Returning `True` from `insert` for a value already present, or leaving a stale index entry after `remove`, which makes a later `get_random` return a value that is no longer a member.

### How to discuss it

Explain each structure's missing property and how the pair covers both, then walk through the swap-with-last deletion including the "removing the last element" edge. For the duplicates follow-up, the dictionary maps each value to a *set* of indices; `remove` picks any index from the set, swaps the tail element in, and updates the tail element's index set (remove the old tail position, add the new one), still `O(1)`; uniform choice over the list then automatically weights by multiplicity. For the `random.choice` over a set question: hash tables do not support indexing because their slots are sparse and unordered, so any "pick a random slot" scheme either has to skip empty slots (non-constant, and non-uniform if you stop at the first hit) or first materialise the elements. This is the same reason the structure here needs the list at all.
