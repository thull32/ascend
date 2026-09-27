---
slug: single-number
title: Single Number
difficulty: easy
patterns: [bit-manipulation]
lists: [ascend-150]
companies: [amazon, google, apple, microsoft]
order: 1
lesson: interview-patterns/combinatorial-patterns/bit-manipulation-pattern
hints:
  - "A hash map of counts solves it in O(n) time and O(n) space. The challenge is O(1) extra space. Which operation makes a value cancel itself out?"
  - "XOR: a ^ a = 0 and a ^ 0 = a, and XOR is commutative and associative, so the order of the elements does not matter."
  - "XOR every element together. Each pair cancels to 0, and what remains is the unpaired value."
signatures:
  python:
    name: single_number
    starter: |
      def single_number(nums: list[int]) -> int:
          pass
  javascript:
    name: single_number
    starter: |
      function single_number(nums) {
      }
tests:
  - args: [[7, 3, 5, 3, 7]]
    expected: 5
  - args: [[9]]
    expected: 9
    label: single element
  - args: [[-4, -4, 6]]
    expected: 6
    label: negative pair
  - args: [[0, 1, 0]]
    expected: 1
  - args: [[2, -3, 2]]
    expected: -3
    label: negative answer
  - args: [[10, 20, 30, 20, 10]]
    expected: 30
  - args: [[8, 0, 8]]
    expected: 0
    hidden: true
    label: the answer is zero
  - args: [[30000, 5, 30000]]
    expected: 5
    hidden: true
  - args: [[-30000, 1, -1, 1, -30000]]
    expected: -1
    hidden: true
time_limit_ms: 4000
---
You are given a non-empty integer array `nums` in which every value appears **exactly twice**, except for one value that appears exactly once. Return that one value.

Aim for `O(n)` time and `O(1)` extra space.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [7, 3, 5, 3, 7]` | `5` | `7` and `3` are paired; `5` is alone |
| `nums = [-4, -4, 6]` | `6` | Negative values pair up like any others |
| `nums = [8, 0, 8]` | `0` | The lone value can be zero |

### Constraints

- `1 ≤ len(nums) ≤ 3 × 10⁴` (and `len(nums)` is odd)
- `-3 × 10⁴ ≤ nums[i] ≤ 3 × 10⁴`

### Follow-up

The interviewer asks: "Now every value appears *three* times except one." Then: "Now *two* values appear once and everything else twice. Return both."

## Solution

### The naive approach

Count occurrences in a hash map and return the key with count 1: `O(n)` time, `O(n)` space. Or sort and scan pairs: `O(n log n)` time. A third option is arithmetic, `2 · sum(set(nums)) - sum(nums)`, which is `O(n)` time but still `O(n)` space for the set, and in fixed-width languages the sums can overflow.

### The insight

XOR (`^`) works bit by bit: a result bit is 1 when the two input bits differ. Three properties make it perfect here:

- `a ^ a = 0`: a value cancels itself.
- `a ^ 0 = a`: zero is the identity.
- XOR is commutative and associative, so `a ^ b ^ a = b` no matter where the two `a`s are.

XOR all the elements together. Every paired value cancels, whatever positions its two copies occupy, and the result is the single value.

Viewed per bit: for each bit position, the paired values contribute an even number of 1s, which XOR to 0. The single value's bit is left over. That per-bit parity view is what generalises to the follow-ups.

### The optimal approach

```python
def single_number(nums: list[int]) -> int:
    acc = 0
    for x in nums:
        acc ^= x
    return acc
```

Trace `[7, 3, 5, 3, 7]` in 3-bit binary: `111 ^ 011 = 100`, `^ 101 = 001`, `^ 011 = 010`, `^ 111 = 101`, which is `5`.

Negative numbers work unchanged. Python integers behave as infinitely sign-extended two's complement, so `-4 ^ -4 == 0` and `0 ^ -3 == -3`. JavaScript's `^` converts to 32-bit signed integers, which is fine because every value here fits in 32 bits.

Time `O(n)`, space `O(1)`. In Python, `functools.reduce(operator.xor, nums)` is the one-liner.

### Common mistakes

- Starting the accumulator at `nums[0]` and then XOR-ing the *whole* array, which cancels `nums[0]` away. Start at 0.
- Reaching for the sum trick in a language with fixed-width integers without thinking about overflow.
- Assuming values are non-negative. XOR on two's complement handles negatives with no special case.

### How to discuss it

Say the hash-map solution, then: "pairs cancel under XOR, and XOR is order-independent, so XOR-ing everything leaves the single value". For the *three times* follow-up, XOR no longer cancels triples. Count, for each of the 32 bit positions, how many numbers have that bit set; take each count mod 3, and the surviving bits form the answer. (In Python, reinterpret bit 31 as the sign at the end; the `ones`/`twos` state-machine version does the same in `O(1)` space with two variables.) For the *two singles* follow-up, XOR everything to get `a ^ b`, which is non-zero; pick any set bit (`x & -x` isolates the lowest), split the array by that bit, and XOR each half separately to get `a` and `b`. Both follow-ups rely on thinking bit position by bit position, which is the real lesson of this problem.
