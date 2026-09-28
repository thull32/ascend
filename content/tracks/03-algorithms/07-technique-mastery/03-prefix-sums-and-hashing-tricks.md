---
slug: prefix-sums-and-hashing-tricks
title: "Prefix sums and hashing tricks: inverses, remainder buckets and parity masks"
description: Turn "count or find the subarray whose aggregate equals X" into a hash lookup over prefixes, understand why it needs an inverse, plug remainders, XOR and parity bitmasks into the same six lines, and recognise when an inequality forces an ordered structure instead.
minutes: 45
difficulty: hard
tags: [prefix-sum, hash-map, modular-arithmetic, xor, bitmask, counting]
problems: [subarray-sum-equals-k, range-sum-query-immutable, find-pivot-index, product-except-self]
---
How many contiguous subarrays of `[4, 5, 0, -2, -3, 1]` have a sum divisible by 5? A sliding window cannot help: "divisible by 5" survives neither shrinking nor growing a window (see [sliding window mastery](/learn/algorithms/technique-mastery/sliding-window-mastery)), and with negative numbers the running sum is not even monotone. Extending from every start with a running sum gives `O(n²)`. The answer is 7, and one pass with an array of five counters finds it.

The trick is not "use a hash map". It is an algebraic fact: *the aggregate of a range is the difference of two prefix aggregates, whenever the operation can be undone.* Once you see a subarray as a pair of prefixes, "sum equals `k`", "sum divisible by `k`", "XOR equals `t`" and "every vowel appears an even number of times" are the same six lines with a different key. The [prefix-sum pattern lesson](/learn/interview-patterns/array-patterns/prefix-sum) covers the basic hash-map form. This lesson explains why it works, how far it generalises, and where it stops.

## A range is the difference of two prefixes

Define `P[0]` as the identity and `P[j + 1] = P[j] ⊕ a[j]`. Then the aggregate of `a[i..j-1]` is `P[j] ⊖ P[i]`: the shared prefix `a[0..i-1]` cancels. That works whenever `⊕` is associative and every element has an inverse, which is what mathematicians call a group.

| Operation | Prefix | Aggregate of `a[i..j-1]` | Invertible? |
|---|---|---|---|
| `+` | running sum | `P[j] - P[i]` | Yes |
| `+` modulo `k` | running sum mod `k` | `(P[j] - P[i]) mod k` | Yes |
| XOR | running XOR | `P[j] ^ P[i]` | Yes; every value is its own inverse |
| Parity of several counts | running bitmask, XOR per element | `P[j] ^ P[i]` | Yes |
| Count vector (per letter) | running counts | `P[j] - P[i]`, per letter | Yes |
| `×` | running product | `P[j] / P[i]` | Only without zeros, and floats drift |
| max, min, gcd, OR, AND | running | none | **No**: use a sparse table, segment tree or deque |

```viz
{"type": "array", "algorithm": "prefix-sum", "values": [4, 5, 0, -2, -3, 1], "title": "Prefix sums of the opening array", "caption": "Any range sum is one subtraction of two prefix values. Two prefixes with the same remainder mod 5 bound a range divisible by 5."}
```

The last row explains why [Product of Array Except Self](/practice/product-except-self) uses a prefix product *and* a suffix product instead of dividing: division is the inverse that zeros take away. When an operation has no inverse, range queries need a structure built for the operation, such as a [sparse table](/learn/advanced-data-structures/range-queries/sparse-tables-and-sqrt-decomposition) for idempotent ones like min and gcd.

## Counting subarrays is counting pairs of prefixes

Every subarray `a[i..j-1]` corresponds to exactly one pair of prefix indices `i < j`. So "count the subarrays whose aggregate satisfies `R`" is "count the pairs `i < j` with `R(P[i], P[j])`". When `R` can be rearranged into an **equality**, `P[i] = f(P[j])`, a hash map of the prefixes seen so far answers each `j` in `O(1)`. Scan `j` from left to right, look up the partner key, then insert `P[j]`:

```python
from collections import defaultdict

def count_subarrays_sum_k(nums, k):
    seen = defaultdict(int)
    seen[0] = 1                    # the empty prefix P[0]: subarrays starting at index 0
    prefix = total = 0
    for x in nums:
        prefix += x                # P[j]
        total += seen[prefix - k]  # partners i < j with P[i] = P[j] - k
        seen[prefix] += 1          # insert after the lookup, so i < j strictly
    return total
```

Every variation in this lesson turns one of three knobs:

1. **The prefix operation**: `+`, `+ mod k`, `^`, or XOR of a bitmask.
2. **The partner key**: `P[j] - k`, the residue of `P[j]`, `P[j] ^ t`, or `P[j]` itself.
3. **What the map stores**: counts, to count subarrays; the *first* index of each key, to find the longest; the *last* index, to find the shortest.

When `R` is an **inequality**, such as `P[j] - P[i] >= k`, a hash map is useless, because it cannot answer "how many stored keys are at most `x`". You need order: a Fenwick tree over the compressed prefix values (`O(n log n)`), a merge-sort count, or, for "shortest subarray with sum at least `k`", a monotonic deque over the prefixes. This is the same split as in the two-pointer lesson: **equality goes to a hash map, order goes to a sorted structure.**

## Subarray Sum Equals K, traced

`nums = [1, 2, -1, 2, -2, 3]`, `k = 3`:

| `j` | `x` | `P[j]` | look up `P[j] - 3` | matches | total | inserted |
|---|---|---|---|---|---|---|
| 0 | | 0 | | | 0 | `0:1` |
| 1 | 1 | 1 | −2 | 0 | 0 | `1:1` |
| 2 | 2 | 3 | 0 | 1 | 1 | `3:1` |
| 3 | −1 | 2 | −1 | 0 | 1 | `2:1` |
| 4 | 2 | 4 | 1 | 1 | 2 | `4:1` |
| 5 | −2 | 2 | −1 | 0 | 2 | `2:2` |
| 6 | 3 | 5 | 2 | 2 | 4 | `5:1` |

The four subarrays are `[1, 2]`, `[2, -1, 2]`, `[2, -2, 3]` and `[3]`. The last row found two because prefix 2 occurred twice (at `j = 3` and `j = 5`). Each earlier occurrence is a different start position. That is why the map stores counts rather than a boolean.

Two orderings are load-bearing. The seed `seen[0] = 1` stands for the empty prefix. Without it, every subarray that starts at index 0 is missed, which here is `[1, 2]`. Looking up **before** inserting keeps `i < j`. With `k = 0`, inserting first would match every prefix with itself and count `n` empty subarrays. This technique is how you solve [Subarray Sum Equals K](/practice/subarray-sum-equals-k).

## Remainder buckets

Divisibility is equality in disguise: `(P[j] - P[i]) mod k = 0` exactly when `P[j] ≡ P[i] (mod k)`. The partner key is the residue itself. There are only `k` residues, so the "hash map" is an array of `k` counters. Every pair of equal residues is one subarray, so the answer is `Σ C(count[r], 2)` and the scan order does not even matter.

Back to the opening array, `[4, 5, 0, -2, -3, 1]` with `k = 5`:

| `j` | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| `P[j]` | 0 | 4 | 9 | 9 | 7 | 4 | 5 |
| `P[j] mod 5` | 0 | 4 | 4 | 4 | 2 | 4 | 0 |

Residue 0 occurs twice, residue 4 four times, residue 2 once, so the answer is `C(2,2) + C(4,2) = 1 + 6 = 7`. The pair `(0, 6)` is the whole array (sum 5). The six pairs among positions 1, 2, 3, 5 are `[5]`, `[5, 0]`, `[5, 0, -2, -3]`, `[0]`, `[0, -2, -3]` and `[-2, -3]`.

The one-pass version is the same count taken incrementally: at each prefix, add the number of earlier prefixes with the same residue, then record this one. `count` below is the five-slot array after the step.

| `j` | `P[j]` | residue | earlier with same residue | running total | `count[0..4]` after |
|---|---|---|---|---|---|
| 0 | 0 | 0 | | 0 | `1 0 0 0 0` |
| 1 | 4 | 4 | 0 | 0 | `1 0 0 0 1` |
| 2 | 9 | 4 | 1 | 1 | `1 0 0 0 2` |
| 3 | 9 | 4 | 2 | 3 | `1 0 0 0 3` |
| 4 | 7 | 2 | 0 | 3 | `1 0 1 0 3` |
| 5 | 4 | 4 | 3 | 6 | `1 0 1 0 4` |
| 6 | 5 | 0 | 1 | 7 | `2 0 1 0 4` |

Adding `count[r]` before incrementing it adds `0 + 1 + 2 + 3` for residue 4 and `0 + 1` for residue 0, which is `C(4,2) + C(2,2)` built one term at a time. The incremental form is the one to write when you also need the *positions* (first or last index per residue) rather than only the total.

**The negative-remainder bug.** In JavaScript, Java, C, C++, Go and Rust, `%` takes the sign of the dividend: `-7 % 5` is `-2`, not `3`. Residues `-2` and `3` are the same class, but they land in different buckets (or at a negative array index), and the count comes out silently low. Tests without negative numbers still pass. Normalise with `((p % k) + k) % k`. Python's `%` already returns a value in `[0, k)` for positive `k`.

Two variations use the other knobs:

- **"Length at least 2, sum a multiple of `k`."** Store the *first* index of each residue and accept a match at `j` only if `j - first[r] >= 2`. Storing the first index keeps the longest span, which is the one most likely to clear the length bar.
- **"Remove the shortest subarray so the rest is divisible by `p`."** You need `total - range ≡ 0`, so `range ≡ total (mod p)`, and the partner key is `(P[j] - total) mod p`. You want the shortest range, so store the *last* index of each residue.

## XOR prefixes

XOR is its own inverse: `x ^ x = 0`. So the XOR of `a[i..j-1]` is `X[j] ^ X[i]`, with no subtraction, no sign problem and no overflow. "Count subarrays with XOR equal to `t`" is the six-line template with partner key `X[j] ^ t`.

XOR problems also allow a counting twist. "Count triples `i < j <= k` where the XOR of `a[i..j-1]` equals the XOR of `a[j..k]`" looks cubic. Two values are equal exactly when their XOR is 0, so the condition says the XOR of `a[i..k]` is 0, which means `X[i] == X[k+1]`. When it holds, *every* `j` in `(i, k]` works, giving `k - i` triples. The answer is therefore the sum of `(m - i - 1)` over all equal prefix pairs `i < m`. For each prefix value, keep both the number of occurrences so far and the sum of their indices. At position `m`, the contribution is `count · (m - 1) - index_sum`:

```python
def count_equal_xor_triples(a):
    count, index_sum = {0: 1}, {0: 0}      # X[0] = 0 occurs at index 0
    x = total = 0
    for m in range(1, len(a) + 1):
        x ^= a[m - 1]                      # X[m]
        c, s = count.get(x, 0), index_sum.get(x, 0)
        total += c * (m - 1) - s           # sum of (m - i - 1) over earlier i with X[i] == X[m]
        count[x], index_sum[x] = c + 1, s + m
    return total
```

On `[2, 3, 1, 6, 7]` this returns 4, and on five 1s it returns 10. Storing "sum of positions" next to "count" to get a sum of distances in `O(1)` is a trick that recurs in hard problems.

## Parity masks: the prefix of a vector

"Find the longest substring in which every vowel appears an even number of times." Track five counts, one per vowel, but only their parities matter. So the prefix state is a 5-bit mask where bit `v` is the parity of vowel `v` in `s[0..j-1]`. Adding a vowel flips its bit. Substring `s[i..j-1]` has all-even vowel counts exactly when `P[i] == P[j]`. You want the longest, so store the first index of each mask. There are only 32 masks, so use an array of 32 slots, not a hash map.

Trace `"baeaeo"` with `a` as bit 0, `e` as bit 1 and `o` as bit 3:

| `j` | char | `P[j]` | first index of this mask | length `j - first` | best |
|---|---|---|---|---|---|
| 0 | | `00000` | set to 0 | | 0 |
| 1 | b | `00000` | 0 | 1 | 1 |
| 2 | a | `00001` | set to 2 | | 1 |
| 3 | e | `00011` | set to 3 | | 1 |
| 4 | a | `00010` | set to 4 | | 1 |
| 5 | e | `00000` | 0 | 5 | 5 |
| 6 | o | `01000` | set to 6 | | 5 |

The answer is 5, `"baeae"`. The trailing `o` is left out because its count is odd. The parity mask packs "`m` counters, each even or odd" into one integer key, so the hash-map machinery works unchanged.

Two extensions show how far this goes. "At most one letter with an odd count" (a substring that can be rearranged into a palindrome) looks up `P[j]` and also `P[j] ^ (1 << c)` for each letter `c`: `σ + 1` lookups per step, still linear. "Longest subarray with equal numbers of 0s and 1s" maps 0 to −1, after which equal counts means sum 0, which means `P[i] == P[j]`, stored by first index.

## Transform first, then take prefixes

Most hard prefix problems become the template once you transform each element:

| Problem | Transform each element | Prefix | Partner key | Store |
|---|---|---|---|---|
| Count subarrays with exactly `k` odd numbers | odd → 1, even → 0 | `+` | `P - k` | counts |
| Longest subarray, equal 0s and 1s | 0 → −1 | `+` | `P` | first index |
| Longest substring, every vowel even | vowel → its bit | `^` | `P` | first index (array of 32) |
| Count subarrays with more 1s than 0s | 0 → −1 | `+` | `P[i] < P[j]`, an inequality | Fenwick tree or counting array |
| Subarrays with average at least `m` | `x → x - m` | `+` | `P[i] <= P[j]`, an inequality | sorted structure |

The first row can also be solved with the at-most-k window. The prefix route is the one that survives negative numbers. The last two rows are inequalities, so the hash map is replaced by an ordered structure such as a [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees), and the time becomes `O(n log n)`. The "average at least `m`" transform (subtract `m` so that the target becomes zero) is worth remembering: it turns a ratio condition into a sum condition.

## Two dimensions: fix a pair of rows

"Count the submatrices of an `R × C` grid that sum to `target`." Fix a top row `r1` and let the bottom row `r2` grow from `r1` downwards. Keep `col[c]` as the sum of column `c` between the two rows, updated in `O(C)` per new `r2`. Each `(r1, r2)` pair reduces the problem to the 1D count over `col`, which is the six-line template. The total is `O(R² · C)` time and `O(C)` space. Put the smaller dimension in the `R²` factor, transposing if necessary. For a 100 × 100 grid that is about 500,000 map operations. "Reduce 2D to many 1D problems by fixing a pair of rows" is the move to remember, and it applies to maximum-sum rectangles as well (run Kadane on `col`).

## Under the hood

**How the map handles prefix sums.** CPython hashes an `int` as its value modulo `2⁶¹ − 1` (so `hash(5) == 5`, `hash(2**61) == 1`, and only `-1` is remapped to `-2`). A dict lookup masks that hash with the table size (a power of two), reads one index slot, and compares the key; on a collision it probes with `i = (5·i + perturb + 1) & mask`, shifting the high bits of the hash into `perturb` each round. Prefix sums of small values are nearly consecutive integers, so they land in distinct slots and the map behaves like an array indexed by prefix value until it fills to two-thirds and doubles. That is why the six-line template runs at about 180 ns per element on 10⁶ values in pure Python (measured), most of it interpreter overhead rather than hashing.

The same property is an attack surface. Integer hashing is not randomised in CPython, and libstdc++'s `std::unordered_map` hashes integers to themselves with prime bucket counts, so an input whose prefix sums are all multiples of the current bucket count lands every key in one bucket and turns each operation into a linear scan. Competitive-programming "anti-hash" tests are built exactly this way; the defence, a randomised hash or a splitmix-style mixer, is in [meet in the middle and randomisation](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation).

**Memory per entry.** A dict entry is a 24-byte `(hash, key, value)` record plus a 1–8-byte index slot, plus a 28-byte boxed `int` for any key outside the cached range `[-5, 256]`. Measured: a dict of 632,000 distinct prefix sums traced at 41 MB, about 65 bytes per entry. A residue array is `k` slots of 8 bytes, whatever `n` is.

**Remainders by language.** Python's `%` is floored (`-7 % 5 == 3`); C, C++, Java, JavaScript, Go and Rust truncate toward zero (`-7 % 5 == -2`). Rust offers `rem_euclid` for the floored result; everywhere else, `((p % k) + k) % k`.

**Vectorised prefix sums.** `numpy.cumsum` computes the prefix array in one C loop, but NumPy integer arrays wrap on overflow without raising: a cumulative sum that passes `2⁶³` comes back negative, and on platforms where the default integer is 32 bits the ceiling is about `2 × 10⁹`. Pass `dtype=np.int64` explicitly, or check `abs(sum) < 2**62` before trusting the result.

## Quantified costs

- **The template.** One dict `get` and one `set` per element: about 0.2 s for 10⁶ elements in Python, 10–20 ms in C or Rust with a good hash map. The `O(n²)` extend-from-every-start version does 5 × 10¹¹ additions at 10⁶ elements, which is hours.
- **Memory.** Hash map of prefixes: roughly 65 bytes × (number of distinct prefixes), up to 65 MB at 10⁶. Residue array: `8k` bytes. Parity-mask array: 32 slots.
- **Inequalities.** A Fenwick tree over compressed prefix values does `2 log₂ n` array steps per element: about 4 × 10⁷ steps for `n = 10⁶`, a few seconds in Python and tens of milliseconds in C.
- **Two dimensions.** `R² × C` map operations: 10⁶ for a 100 × 100 grid, 1.25 × 10⁸ for 500 × 500 (minutes in pure Python, under a second in C). Transposing so the smaller dimension is squared is a free factor of `R/C`.

## Failure modes

**Symptom: the count is too low, but only on inputs with negative numbers, and only in JavaScript, Java, C++, Go or Rust.** Diagnosis: `%` keeps the sign of the dividend, so residues `-2` and `3` occupy different buckets (or a negative array index, which in JavaScript is a silent property write rather than an error). Fix: normalise with `((p % k) + k) % k`, and add a test whose prefix sums go negative.

**Symptom: the count is off by exactly the number of valid subarrays that start at index 0.** Diagnosis: the map was not seeded with `P[0]`. Fix: `seen[0] = 1` (or `first[0] = 0` for longest-window variants) before the loop.

**Symptom: with `k = 0` the answer is too large by `n`.** Diagnosis: the current prefix was inserted before the lookup, so every prefix matched itself and counted an empty subarray. Fix: look up, then insert.

**Symptom: the JavaScript version disagrees with Python above about 10¹⁵.** Diagnosis: a prefix sum has passed `2⁵³`, where `Number` loses integer precision, and two different prefixes hash to the same rounded value. Fix: `BigInt`, or reduce modulo `k` as you go when only divisibility matters.

**Symptom: intermittent misses when the values are prices or durations.** Diagnosis: float keys; `0.1 + 0.2` is not `0.3`, so equal sums produce unequal keys. Fix: scale to integers (cents, microseconds) before summing.

**Symptom: a Python or C++ service is fine in staging and times out on one customer's data.** Diagnosis: adversarial or unlucky key distribution collapsing the hash table (all prefix sums multiples of a large power of two, or of the bucket count). Fix: a randomised hash, or an ordered structure with a worst-case bound.

## Choosing the structure

| Structure | Condition it answers | Time per element | Memory | Online? |
|---|---|---|---|---|
| Hash map of prefixes | Equality: `P[i] = f(P[j])` | `O(1)` expected | ~65 B × distinct prefixes | Yes |
| Counter array (residues, masks) | Equality over a small key space | `O(1)` | `k` or `2^m` slots | Yes |
| Fenwick tree over compressed prefixes | Inequality: count `P[i] ≤ x` | `O(log n)` | `O(n)` | No: needs all values to compress |
| Merge-sort count on prefixes | Inequality, count only | `O(log n)` amortised | `O(n)` | No |
| Monotonic deque over prefixes | Shortest window with `P[j] − P[i] ≥ k` | `O(1)` amortised | `O(n)` worst case | Yes |
| Sliding window | Hereditary predicates only | `O(1)` amortised | `O(window)` | Yes |

## Interviewer follow-ups

**"Now count subarrays with sum at least `k`, negatives allowed."** Model answer: `P[j] − P[i] ≥ k` is `P[i] ≤ P[j] − k`, an inequality, so use a Fenwick tree over the sorted distinct prefix values or a merge-sort count, `O(n log n)`. Common wrong answer: a sliding window, which needs heredity that negatives destroy.

**"Return the longest such subarray instead of the count."** Model answer: store the first index of each key and never overwrite it; the candidate at `j` is `j − first[key]`. For shortest, store the last index. Common wrong answer: keeping counts and trying to recover positions afterwards.

**"Make it two-dimensional: count submatrices summing to `t`."** Model answer: fix a top row, extend the bottom row downwards while maintaining column sums, and run the 1D template on the column array per row pair, `O(R²C)`. Common wrong answer: a 2D prefix table followed by a check of all `O(R²C²)` rectangles.

**"XOR instead of sum."** Model answer: identical template with `^` and partner key `X[j] ^ t`; no sign or overflow issues because XOR is its own inverse. Common wrong answer: subtracting XOR values.

**"Why not a window here at all?"** Model answer: a window needs the property to survive shrinking or growing; "sum equals `k`" survives neither, and with negatives even "sum at most `k`" does not. Windows still work for sign-independent properties such as "at most `k` distinct". Common wrong answer: "windows never work with negative numbers", said as a rule without the reason.

## What mid-level engineers get wrong

- **Forgetting `seen[0] = 1`.** Every subarray starting at index 0 is missed; the tests with a full-array match fail and nothing else does.
- **Inserting before looking up.** Correct for `k ≠ 0`, wrong by `n` for `k = 0`.
- **Trusting `%` on negative numbers** in a truncating language, then debugging the algorithm instead of the arithmetic.
- **Using prefix differences for max, min, gcd or OR.** There is no inverse; the "prefix max" of a range is not `P[j] − P[i]`. Reach for a sparse table or segment tree.
- **A hash map when an array would do.** Residues, parity masks and prefix sums bounded in `[-n, n]` fit in an array with predictable memory and no hashing.
- **Float prefix sums as keys.** Equal sums compare unequal; the bug appears on real data, never on the sample.

## Exercises

```exercise
id: divisible-subarrays
title: Count subarrays with sum divisible by k
prompt: |
  Return the number of non-empty contiguous subarrays of `nums` whose sum
  is divisible by `k` (`k >= 1`). Values may be negative.

  Two prefixes with the same remainder mod `k` bound a divisible
  subarray. Count prefixes per remainder in one pass. In JavaScript,
  normalise remainders with ((p % k) + k) % k, because % keeps the sign
  of a negative dividend.
languages: [python, javascript]
entry: count_divisible_subarrays
starter:
  python: |
    def count_divisible_subarrays(nums, k):
        # your code here
        return 0
  javascript: |
    function count_divisible_subarrays(nums, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[4, 5, 0, -2, -3, 1], 5]
    expected: 7
  - args: [[5], 9]
    expected: 0
  - args: [[-1, 2, 9], 2]
    expected: 2
    label: negative prefix remainders
  - args: [[], 3]
    expected: 0
    label: empty input
  - args: [[0, 0, 0], 1]
    expected: 6
    label: everything is divisible by 1
  - args: [[-5, -5, -5], 5]
    expected: 6
    hidden: true
  - args: [[2, -2, 2, -4], 6]
    expected: 2
    hidden: true
  - args: [[1, 2, 3, 4, 5, 6], 3]
    expected: 11
    hidden: true
hints:
  - "Seed the count for remainder 0 with 1: the empty prefix."
  - "For each element, update the running remainder, add the number of earlier prefixes with the same remainder, then increment its count."
```

```exercise
id: longest-even-vowels
title: Longest substring with every vowel an even number of times
prompt: |
  Return the length of the longest substring of `s` (lowercase letters)
  in which each of the vowels a, e, i, o, u appears an even number of
  times (zero counts as even).

  Keep a 5-bit mask of vowel parities for the prefix read so far. Two
  prefixes with the same mask bound a valid substring. Record the first
  index at which each of the 32 masks appears.
languages: [python, javascript]
entry: longest_even_vowels
starter:
  python: |
    def longest_even_vowels(s):
        # your code here
        return 0
  javascript: |
    function longest_even_vowels(s) {
      // your code here
      return 0;
    }
tests:
  - args: ["eleetminicoworoep"]
    expected: 13
  - args: ["leetcodeisgreat"]
    expected: 5
  - args: ["bcbcbc"]
    expected: 6
    label: no vowels at all
  - args: [""]
    expected: 0
    label: empty string
  - args: ["a"]
    expected: 0
  - args: ["baeaeo"]
    expected: 5
    hidden: true
  - args: ["aeiou"]
    expected: 0
    hidden: true
  - args: ["xaeiouxaeioux"]
    expected: 13
    hidden: true
hints:
  - "first = [-1] * 32 with first[0] = 0 (the empty prefix at position 0). Walk j from 1 to len(s)."
  - "Flip the vowel's bit in the mask. If first[mask] is set, the candidate length is j - first[mask]; otherwise set first[mask] = j."
```

## Senior signals

- You explain prefix techniques as **"a range is the difference of two prefixes, when the operation has an inverse"**, and you know which operations lack one (max, gcd, OR) and what to use instead.
- You restate subarray counting as **counting pairs of prefixes**, and choose the store by the question: counts, first index, or last index.
- You separate **equality (hash map) from inequality (Fenwick tree, merge sort, deque)** before you write code.
- You normalise **negative remainders** in languages whose `%` keeps the sign, and you mention it before the interviewer finds the bug.
- You compress several parities into a **bitmask key**, and you switch from a hash map to an array when the key space is small.
- You reduce 2D problems to 1D by **fixing two rows**, and you say which dimension goes in the quadratic factor.
- You know why the map is fast (**integer hashes are the values themselves**, so consecutive prefixes fill consecutive slots) and why that same fact makes unrandomised integer hashing attackable.
- You can put numbers on it: about 65 bytes per dict entry, 0.2 s per 10⁶ elements in Python, `R²C` for the 2D version, and `2⁵³` as the point where JavaScript prefix sums stop being exact.

## Check yourself

```quiz
- q: >-
    Why does the counting template seed the map with seen[0] = 1 before the loop?
  options: ["It is the empty prefix P[0], the partner for every subarray starting at index 0", "It handles negative numbers, whose prefix sums can come back down to zero", "It prevents a KeyError on the first lookup, before any prefix is inserted", "It makes k = 0 work, since a zero-sum subarray needs a zero prefix to match"]
  answer: 0
  explanation: >-
    A subarray a[0..j-1] corresponds to the prefix pair (0, j). Without P[0] in the map, no subarray starting at index 0 is ever counted, whatever k is. It has nothing to do with key errors (the template uses a defaultdict), and it is needed with or without negatives.
- q: >-
    You need the number of subarrays with sum at least k in an array with negatives. Why does the hash-map template not apply directly?
  options: ["It does apply; look up P[j] - k, and the stored count covers larger sums too", "The answer can reach O(n²), more than one map lookup per index can count", "It is an inequality, and a hash map cannot count keys below a threshold", "Negative prefix sums cannot be used as hash-map keys without an offset"]
  answer: 2
  explanation: >-
    The condition P[j] - P[i] >= k asks how many stored prefixes are at most P[j] - k, and a hash map only answers exact-key lookups. Counting partners below a threshold needs order: a Fenwick tree over compressed prefix values, or a merge-sort count, gives O(n log n). Looking up P[j] - k only counts sums exactly equal to k. Negative keys are fine, and each lookup returns a count, so large answers are no problem.
- q: >-
    In JavaScript you key a counts array by p % k for prefix sums that can go negative, without normalising. What goes wrong?
  options: ["Residues -2 and 3 land in different slots, so the count comes out low", "It overcounts, since residues -2 and 3 are merged into a single slot", "The program throws a RangeError as soon as it indexes the array at -2", "Nothing; JavaScript's % always returns a value in the range [0, k)"]
  answer: 0
  explanation: >-
    JavaScript's % takes the sign of the dividend, so -2 and 3, the same class mod 5, land in different slots (or at a negative index, which does not throw), and their matches are silently missed. The fix is ((p % k) + k) % k. Tests without negatives still pass, which is why this bug survives into interviews.
- q: >-
    For "longest substring where every vowel appears an even number of times", what should the map store for each 5-bit parity mask?
  options: ["The longest length seen so far with that mask", "The first index at which the mask occurred", "The number of times the mask occurred", "The last index at which the mask occurred"]
  answer: 1
  explanation: >-
    Two equal masks bound a valid substring. For the longest one ending at j, you want the earliest matching start, so you store the first index and never overwrite it. Counts are for counting, last indices are for shortest, and a stored length loses the start position that future matches need.
- q: >-
    Why does Product of Array Except Self use prefix and suffix products instead of the total product divided by each element?
  options: ["Dividing out each element is O(n) per element, so the total becomes O(n²)", "Division is slow on most CPUs, and n divisions would dominate the run time", "The total product overflows, while prefix and suffix products stay small", "Zero has no multiplicative inverse, so a single zero breaks the division"]
  answer: 3
  explanation: >-
    The prefix difference trick needs an inverse. Zero has no multiplicative inverse, so dividing out an element fails exactly when an element is zero. Prefix and suffix products compute each answer without undoing anything. Speed is not the issue (one product, then n O(1) divisions), and prefix products can grow as large as the total.
- q: >-
    A C++ solution using std::unordered_map<long long, int> over prefix sums passes every test except one where all values are multiples of the map's bucket count, and on that one it times out. What happened?
  options: ["Integers hash to themselves, so every prefix sum landed in one bucket and each lookup became a linear scan", "The prefix sums overflowed long long, so the map kept growing with wrapped-around keys", "unordered_map is O(log n) per operation, and the test is only the largest one", "The bucket count is prime, so multiples of it are rejected and reinserted on every access"]
  answer: 0
  explanation: >-
    libstdc++ hashes an integer to its own value and picks the bucket by taking it modulo a prime bucket count, so keys that are all multiples of that prime share bucket 0. Every insert and lookup then walks the whole chain, and n operations cost O(n²). Overflow would change the keys, not the speed; unordered_map is O(1) expected, not O(log n). A randomised hash function, or a mixer that scrambles the bits, is the fix, which is why hash randomisation exists in Python for strings and in Rust and Go for every map.
```

