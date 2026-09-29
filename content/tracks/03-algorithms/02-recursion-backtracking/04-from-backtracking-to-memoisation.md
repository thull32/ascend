---
slug: from-backtracking-to-memoisation
title: "From backtracking to memoisation"
description: How to spot the repeated subproblems inside an exponential search, cache them by the arguments that matter, and watch the running time collapse from 2^n to n^2; the bridge to dynamic programming.
minutes: 50
difficulty: medium
tags: [memoisation, recursion, overlapping-subproblems, dynamic-programming, caching]
problems: [climbing-stairs, decode-ways, word-break, target-sum]
---
Your backtracking solution is correct, the tests pass, and the interviewer says "now do it for $n = 10^4$". You can hear that the search will not finish, and you have four minutes. The move that saves the round is neither a new algorithm nor a clever data structure. It is noticing that the search solves the *same* subproblem thousands of times and writing its answer down the first time.

That is memoisation. It turns a specific kind of exponential recursion into a polynomial one with about three added lines, and it is the door into dynamic programming. This lesson is about recognising *which* recursions it applies to, because it does not apply to all of them, and the difference is the single most useful thing to know about the whole DP module that follows. It also opens up the cache itself, because `@lru_cache` is a data structure with a memory cost and a stack cost, and both bite in production.

## The repeated subproblem

Climbing stairs: you can take 1 or 2 steps; how many distinct ways up $n$ steps? The backtracking answer enumerates sequences of 1s and 2s. The counting version does not need the sequences, only how many there are, so each call returns a number.

```python
def ways(n):
    if n <= 1:
        return 1          # one way to stand still or take the last single step
    return ways(n - 1) + ways(n - 2)
```

Watch the call tree for $n = 6$ (this is the Fibonacci tree; the recurrence is identical):

```viz
{"type": "recursion", "algorithm": "fibonacci", "n": 6,
 "title": "ways(6) as a call tree: count how many times ways(2) appears"}
```

`ways(4)` is computed twice, `ways(3)` three times, `ways(2)` five times, `ways(1)` eight times. The number of calls satisfies $C(n) = C(n-1) + C(n-2) + 1$ with $C(0) = C(1) = 1$, which grows like $\phi^n \approx 1.618^n$. Measured by instrumenting the function (CPython 3.14, one machine):

| `n` | calls, no memo | time | calls, memoised | result |
|---|---|---|---|---|
| 10 | 177 | – | 19 | 89 |
| 20 | 21,891 | – | 39 | 10,946 |
| 30 | 2,692,537 | 0.07 s | 59 | 1,346,269 |
| 40 | 331,160,281 (from the formula) | ~10 s (extrapolated) | 79 | 165,580,141 |
| 100 | ≈ 1.1 × 10²¹ (formula) | longer than the universe | 199 | a 21-digit number |

The formula's values match the instrumented counts exactly for 10, 20 and 30; the 40 and 100 rows are the formula, not a run. The memoised column is `2n − 1`: one call per distinct `n` plus one cache hit per `n`. The waste is total: there are only $n + 1$ distinct inputs, and the function is pure (same input, same output, no side effects). Every call after the first for a given `n` is recomputing a known value.

## Add a cache

```python
def ways(n, memo={}):
    if n <= 1:
        return 1
    if n in memo:
        return memo[n]
    memo[n] = ways(n - 1, memo) + ways(n - 2, memo)
    return memo[n]
```

Now each distinct `n` is computed once; subsequent calls return from the dictionary in O(1). The call tree still *starts* the same way, but every branch that would recompute a known value is cut off at its root. Total calls: about $2n$. Time $O(n)$, space $O(n)$ for the memo plus $O(n)$ stack depth.

```viz
{"type": "dp", "algorithm": "climbing-stairs", "n": 8,
 "title": "The same recurrence, each subproblem solved once and stored"}
```

The idiomatic forms:

```python
from functools import lru_cache

@lru_cache(maxsize=None)          # or @functools.cache on Python 3.9+
def ways(n):
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)
```

```javascript
function climb(n, memo = new Map()) {
  if (n <= 1) return 1;
  if (memo.has(n)) return memo.get(n);
  const v = climb(n - 1, memo) + climb(n - 2, memo);
  memo.set(n, v);
  return v;
}
```

Three practical notes that catch people in interviews and in production:

- **The mutable default argument in Python (`memo={}`) persists across top-level calls.** That is a feature here (a second call to `ways(50)` is instant) and a bug when the answer depends on other inputs that changed. Prefer `lru_cache` or pass the memo explicitly.
- **Cache keys must be hashable.** `lru_cache` cannot key on a list; convert to a tuple, or (better) recurse on an *index* into the list rather than on a slice of it. Slicing also copies, which turns an $O(n)$ memoised recursion into $O(n^2)$.
- **Recursion depth is still $n$.** Memoisation removes repeated work, not stack frames. `ways(10000)` with `lru_cache` raises `RecursionError` in CPython. The [next module](/learn/algorithms/dynamic-programming/the-dp-mindset) fixes that by filling the table bottom-up in a loop, and the section on recursion limits below explains why raising the limit is not the fix.

## Under the hood: `functools.lru_cache`

`lru_cache` is implemented in C (`Modules/_functoolsmodule.c`), and its behaviour follows from three design decisions.

**The key.** Every call builds a key from the arguments with `lru_cache_make_key`. Fast path: exactly one positional argument, no keyword arguments, `typed=False`, and the argument is an exact `int` or `str`: the argument object *itself* is stored as the key, so the cache holds no tuple. With other positional-only calls the key is the call's argument tuple, which the wrapper (a `tp_call` object) receives freshly built on every call; with keyword arguments or `typed=True` it builds a new tuple of the positional arguments, a sentinel and the keyword items, with the types appended under `typed=True` so `f(1)` and `f(1.0)` cache separately. So `f(i)` keyed on an index costs one dict probe; `f(i, j)` builds a 2-tuple and hashes it on every call, a hit or a miss.

**Unbounded versus bounded.** With `maxsize=None` (and `functools.cache`, which is the same thing) the wrapper is a plain dict lookup: miss → call → store. With a bound, the wrapper additionally keeps a circular doubly linked list of `lru_list_elem` nodes, each holding the key, the result and the hash; a hit unlinks the node and relinks it at the tail, and a miss at capacity evicts the head. That is the same hash-map-plus-list design as an [LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache), and it is why a bounded cache costs more per entry.

**Introspection.** `f.cache_info()` returns `hits`, `misses`, `maxsize` and `currsize`; `f.cache_clear()` empties it; `f.__wrapped__` is the original function. `cache_info` is the tool for the "does the same argument tuple actually recur?" question below: a memoised function with `hits == 0` is paying for a cache it never uses.

### Memory per entry

Measured with `tracemalloc` on CPython 3.14, 64-bit, on this machine: an `int → small int` function (keys above 256 are separate 28-byte int objects; results are interned) costs about **84 bytes per entry** unbounded and **140 bytes** with a `maxsize` (the list node); a `(i, j) → int` function costs about **116 bytes** unbounded and **170 bytes** bounded, the extra being the tuple key. A memoised `fib(n)` whose results are big integers costs about 284 bytes per entry at `n = 3000`, because the values themselves are 260-byte integers. Rule of thumb: 100–200 bytes per cached state in CPython, so 10⁶ states is 100–200 MB. A bottom-up table of 10⁶ ints in a list is 8 MB of pointers plus the int objects, and `array('q')` or NumPy is 8 MB flat.

**Methods.** `@lru_cache` on a method keys on `self` too, so the cache holds a strong reference to every instance ever called and they are never garbage collected while the class lives. Cache on a module-level function of the instance's *data*, or use `functools.cached_property` for per-instance values.

## Recursion limits

CPython's default `sys.getrecursionlimit()` is 1,000. Measured here: a memoised `deep(k) = deep(k−1) + 1` succeeds at `deep(990)` and raises `RecursionError: maximum recursion depth exceeded` at `deep(2000)` on CPython 3.14. Memoisation changes nothing about that first call: before any value is cached the recursion must reach the base case, `n` frames down.

Two version-honest details. Since Python 3.11, a Python function calling a Python function no longer consumes C stack; the interpreter "inlines" the call into its own frame stack, so the limit is a pure Python-level count. A memoised call, though, goes Python → the C `lru_cache` wrapper → Python, and each level re-enters the interpreter through C, so deep memoised recursion still consumes C stack per level. Raising `sys.setrecursionlimit(10**5)` and recursing that deep can therefore exhaust the C stack (8 MB by default on the main thread of Linux) and crash the process; 3.12 added a separate C-level recursion guard that turns some of those crashes into `RecursionError`, but the exact depth at which either fires depends on the version, platform and thread stack size. [The call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame mechanics.

The fix is not a bigger limit. Convert to bottom-up (a loop over `n`), or keep the recursion but drive it with an explicit stack: push `n`, and whenever a needed subresult is missing push it and continue; when both children are cached, compute and pop. In JavaScript the engine's stack is typically around 10⁴ frames; the same conversion applies.

## What makes a subproblem

Memoisation only helps when the same subproblem recurs, and a subproblem is defined by the arguments that *affect the return value*. Learning to see that state is the skill.

**Decode Ways.** A digit string maps to letters (`1` to `A` … `26` to `Z`); how many decodings? The backtracking search tries "take one digit" or "take two digits" at each position. What does the count from position `i` onward depend on? Only on `i`: the digits before `i` are already decoded and do not affect how the suffix can be decoded. So the state is `i`, there are $n + 1$ states, and the exponential search becomes $O(n)$.

```python
def num_decodings(s):
    n = len(s)
    memo = {}
    def from_pos(i):
        if i == n:
            return 1                                  # consumed everything: one valid decoding
        if s[i] == "0":
            return 0                                  # no letter is "0" or starts with 0
        if i in memo:
            return memo[i]
        total = from_pos(i + 1)                       # take one digit
        if i + 1 < n and 10 <= int(s[i:i + 2]) <= 26:
            total += from_pos(i + 2)                  # take two digits
        memo[i] = total
        return total
    return from_pos(0)
```

Trace `"226"`: `from_pos(0)` takes `2` then `from_pos(1)`; `from_pos(1)` takes `2` then `from_pos(2)` (which takes `6` and reaches the end: 1) and takes `26` reaching the end: 1, so `from_pos(1) = 2`. Back in `from_pos(0)`, taking `22` gives `from_pos(2) = 1`, already cached. Total 3: `BBF`, `BZ`, `VF`. The memo saved one call here; on a string of thirty `1`s it saves about 2.7 million (the unmemoised count is the Fibonacci call tree above).

**Word Break.** Can `s` be segmented into dictionary words? Backtracking tries every dictionary word as a prefix and recurses on the rest. The rest is `s[i:]`, so the state is `i` again. Without the memo, `"aaaaaaaaaaaaaaaaaaaaaaaab"` with dictionary `["a", "aa", "aaa", "aaaa"]` explores every composition of 24 into parts of size 1–4 before discovering the `b` is unreachable: 3,919,944 compositions and 8,146,016 calls. With the memo, 25 states, each tried against 4 words: 100 steps.

```python
def word_break(s, words):
    words = set(words)
    max_len = max((len(w) for w in words), default=0)
    memo = {}
    def can(i):
        if i == len(s):
            return True
        if i in memo:
            return memo[i]
        for j in range(i + 1, min(len(s), i + max_len) + 1):
            if s[i:j] in words and can(j):
                memo[i] = True
                return True
        memo[i] = False
        return False
    return can(0)
```

```viz
{"type": "dp", "algorithm": "word-break", "s": "applepenapple", "words": ["apple", "pen"],
 "title": "can(i) depends only on i: thirteen states, each decided once"}
```

The `max_len` bound is the pruning from the [previous lesson](/learn/algorithms/recursion-backtracking/constraint-satisfaction) applied here: no point testing prefixes longer than the longest word. Complexity $O(n \cdot L)$ where $L$ is the longest word length, plus the substring hashing, which itself costs $O(L)$ per slice.

### A two-component state

**Target Sum.** Assign `+` or `-` to each number so the total equals a target; count the assignments. The search state after deciding the first `i` signs is `(i, running_sum)`. Two different sign patterns that reach index `i` with the same running sum have identical futures, so they are the same subproblem. State space: $n \times (\text{range of sums})$, typically a few hundred thousand, versus $2^n$ paths. The state has *two* components; that is still fine, the memo key is a tuple, at the 116-bytes-per-entry price measured above.

The general test: **two paths through the search that arrive at the same arguments must have the same answer from there on.** If the answer also depends on *how* you got there, those arguments are not the whole state, and either the state must be enlarged or memoisation does not apply.

## Purity, demonstrated

The cache is keyed on the arguments and on nothing else. A function that reads anything mutable outside its arguments is not pure, and the cache will faithfully return an answer to a question that is no longer being asked:

```python
from functools import lru_cache

prices = [1, 2, 3]

@lru_cache(maxsize=None)
def total(i):                       # sum of prices[i:], memoised on i
    return 0 if i == len(prices) else prices[i] + total(i + 1)

print(total(0))                     # 6
prices[0] = 100
print(total(0))                     # still 6
print(total.cache_info())           # CacheInfo(hits=1, misses=4, maxsize=None, currsize=4)
```

The second call is a cache hit (`hits=1`) and never looks at `prices` again. No exception, no warning, an answer that was right an hour ago. In a service this shows up as "the recommendation for user 42 is stale until the process restarts", and it is intermittent because it depends on which arguments happened to be cached before the data changed. The rule: everything the function reads is either an argument (and therefore part of the key) or immutable for the cache's lifetime. If the data legitimately changes, the cache must be invalidated (`cache_clear()`) or the data's version must be part of the key.

## When memoisation does not apply

Permutations. The search state after placing `k` elements is "which elements are used", and the number of *distinct* used-sets is $2^n$, not $n$. Worse, the output is the list of permutations, and there are $n!$ of them; no cache can make producing $n!$ things faster than $n!$. Memoisation cannot beat the output size. The same goes for listing all subsets, all N-queens boards, all palindrome partitions: if the question is "list them", the enumeration is the answer and its cost is the output.

The moment the question becomes **count**, **decide**, **minimise** or **maximise**, the picture changes. "How many N-queens solutions" is still hard because the state (columns, two diagonal masks) does not collapse; there are exponentially many reachable states. But "how many palindrome partitions", "minimum cuts", "does a segmentation exist", "how many ways to reach the sum": each of these has a small state and memoises.

A quick diagnostic:

| Question type | Return value | State small? | Memoise? |
|---|---|---|---|
| List all objects | The objects | irrelevant | No: output-bound |
| Count / decide / optimise, state = position | number / bool | $O(n)$ | Yes |
| Count / decide / optimise, state = (position, budget) | number / bool | $O(n \cdot W)$ | Yes, if $W$ is reasonable |
| Count / decide / optimise, state = subset used | number / bool | $2^n$ | Only for $n \le 20$ (bitmask DP) |
| Optimise with path-dependent constraints | number | grows with path | No, unless you can enlarge the state |

The third row is the [knapsack family](/learn/algorithms/dynamic-programming/knapsack-family); the fourth is bitmask DP over subsets (Travelling Salesman for $n \le 20$). Both appear later in the DP module.

## Memoisation versus tabulation

Memoisation is top-down: start from the full problem, recurse, cache. Tabulation is bottom-up: figure out the order in which subproblems depend on each other, then fill an array in that order with a loop. They compute exactly the same values.

```python
def ways_tab(n):
    dp = [0] * (n + 1)
    dp[0] = dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]
```

| | Memoisation (top-down) | Tabulation (bottom-up) |
|---|---|---|
| Effort to write | Add a cache to the recursion you already have | Must work out the dependency order |
| Subproblems computed | Only the ones actually reached | All of them, reached or not |
| Stack | Depth = recursion depth; `RecursionError` past ~1,000 in CPython | None |
| Constant factor | Dict probe plus a function call per state, ~100 ns and up in CPython | Array indexing in a loop; several times faster in CPython (measure your case) |
| Memory per state | 100–200 bytes (dict entry, key, value) | 8 bytes per list slot, or 4–8 in a typed array |
| Space optimisation | Hard (the cache holds everything) | Often easy (keep the last row, or two values) |
| Cache locality | Hash table, scattered | Sequential sweep, prefetch-friendly |

**When top-down wins.** When most states are unreachable. Word break with a dictionary whose shortest word has length 20 reaches only positions that are sums of word lengths; a knapsack with capacity 10⁶ and 20 items of weight around 10⁵ reaches at most 2²⁰ ≈ 10⁶ capacities in principle but typically a few thousand distinct ones; a memoised recursion touches only those, while a table fills all 10⁶ × 20 cells. Top-down also wins when the dependency order is awkward to state, as in DP over a DAG whose edges point in arbitrary directions. In an interview, derive the recursion and memoise it first: it is the fastest route to a correct, polynomial solution, and it makes the state definition explicit because the state *is* the function's parameter list. Then, if asked for the bottom-up version, the parameters become array indices and the base cases become the initial cells. That translation is what [The DP mindset](/learn/algorithms/dynamic-programming/the-dp-mindset) and [One-dimensional DP](/learn/algorithms/dynamic-programming/one-dimensional-dp) practise.

## Quantified costs

- **States × bytes.** A memo over `(i, j)` with `i, j <= 3,000` is 9 × 10⁶ entries × ~116 bytes ≈ 1 GB in CPython; the same table as a NumPy `int32` array is 36 MB, and as two rolling rows is 24 KB.
- **Calls.** Unmemoised Fibonacci-shaped recursion at `n = 40` is 3.3 × 10⁸ calls, about ten seconds in CPython by the extrapolation in the table above; memoised it is 79 calls.
- **Key cost.** A dict probe with an `int` key measured about 19 ns and with a 2-tuple key about 25 ns on this machine (CPython 3.14), before the tuple allocation the wrapper does per call; the function-call overhead around it is several times larger than either.
- **Depth.** 1,000 frames by default; each Python frame is a few hundred bytes of interpreter memory, so the limit is a policy, not a memory constraint, and the C stack behind a memoised recursion is the real ceiling.

## Failure modes

**The memoised version is still exponential.** Symptom: `count_decodings` on forty `1`s times out even with a memo. Diagnosis: one branch returns before storing (`return from_pos(i + 1) + ...` without assigning to `memo[i]`), or the memo is created inside the recursive function so each call gets a fresh one, or the key includes a list that is different on every path. Fix: `cache_info()` shows `hits == 0`; store on every path, or use `@lru_cache` and let it do the bookkeeping.

**`TypeError: unhashable type: 'list'`.** Symptom: the decorator raises on the first call. Diagnosis: a list argument in the key. Fix: recurse on an index into the list, which is also asymptotically faster than slicing; or convert to a tuple once at the boundary.

**Stale answers that depend on call order.** Symptom: results are correct after a restart and drift as the process runs. Diagnosis: the function reads mutable state outside its arguments (a global, `self`, a closure over a list). Fix: put the version of that state into the key, or clear the cache on every write; measured with `cache_info`, a hit after a data change is the smoking gun.

**`RecursionError` at `n ≈ 1,000`, or a segfault after raising the limit.** Symptom: tests with small `n` pass; production input crashes. Diagnosis: the first call's depth is `n` regardless of the cache, and the C stack behind the `lru_cache` wrapper does not grow with `setrecursionlimit`. Fix: bottom-up, or an explicit stack.

**A service's memory grows without bound.** Symptom: RSS climbs for days and drops on restart. Diagnosis: `@lru_cache(maxsize=None)` on a function whose argument space is unbounded (user ids, timestamps, request bodies), at 100–200 bytes per entry plus the values. Fix: a `maxsize`, a TTL cache from a library, or caching at the data layer rather than the function; and never `lru_cache` a method whose `self` should be collectable.

## The recognition protocol

When your search is too slow, ask in order:

1. **Is the output itself exponential?** If yes, stop; the search is the algorithm, and pruning is the only lever.
2. **What arguments does the recursive function take, and which ones affect the result?** Drop the ones that do not (the path, the accumulated list) or turn them into something small (the sum, not the sequence of signs).
3. **How many distinct values can the remaining arguments take?** Multiply the ranges. If it is polynomial, memoise on those arguments.
4. **Does the same argument tuple actually recur?** Count on a small example, or read `cache_info().hits`. If every call has unique arguments (a balanced tree walk, for instance), the cache is pure overhead.
5. **Is the recursion pure?** No dependence on mutable state outside the arguments. If the function reads a `used` array or a board that changes, the arguments are not the whole state and the cache will return wrong answers.

Step 5 is the production bug. A memoised function that quietly depends on something not in its key returns stale results on the next call, and the failure is intermittent because it depends on call order.

## Interviewer follow-ups

**"You memoised on `(i, remaining)`. How much memory is that for `n = 10⁴` and sums up to 10⁴?"** Model answer: up to 10⁸ states, at 100–200 bytes each in a Python dict that is 10–20 GB, so the memo is infeasible; bottom-up with two rolling rows is 2 × 10⁴ cells, and if the reachable sums are sparse the memo may touch far fewer states, which `cache_info` would show. Common wrong answer: "it is O(n · S), which is fine", with no bytes attached.

**"Why does `fib(10000)` fail even with `lru_cache`?"** Model answer: the first call recurses 10,000 deep before anything is cached; CPython's limit is 1,000 frames; raising it moves the failure to the C stack because the C wrapper re-enters the interpreter per level; the fix is a loop. Common wrong answer: "set `sys.setrecursionlimit(20000)`".

**"Your memoised search reads a `board` that the caller mutates between calls. What happens?"** Model answer: stale hits; the board must be part of the key (hash its contents, or a version counter) or the cache must be cleared on mutation. Common wrong answer: "the cache notices the change", which nothing in `lru_cache` does.

**"When would you write the bottom-up version in an interview even though top-down is faster to write?"** Model answer: when `n` exceeds the recursion limit, when the memory of a dict per state matters, when a rolling-row optimisation is available, or when the interviewer asks for reconstruction and you want a table to walk back through. Common wrong answer: "bottom-up is always better", which ignores sparse state spaces.

**"Two DFS paths reach the same `(index, sum)` in Target Sum. Why is it safe to reuse the count?"** Model answer: the remaining choices depend only on the index and the remaining budget, not on which signs produced the sum; the future is identical, so the count is identical. Common wrong answer: "because the sums are equal", without arguing that the future is determined by the state.

## What mid-level engineers get wrong

- **Keying on the path.** `memo[(i, tuple(path))]` makes every call unique. Consequence: an exponential search with the memory cost of a cache and none of the benefit.
- **Slicing instead of indexing.** `solve(s[1:])` copies $O(n)$ per call. Consequence: an $O(n)$ algorithm turned into $O(n^2)$ and a memo keyed on strings.
- **Raising the recursion limit as the fix for depth.** Consequence: a crash instead of an exception, on inputs the tests never had.
- **`@lru_cache` on methods.** Consequence: every instance pinned in memory for the life of the process.
- **Unbounded caches in long-running services.** Consequence: memory growth measured in days, resolved by a restart, diagnosed by nobody.
- **Trusting `O(states)` without counting bytes.** Consequence: a "polynomial" solution that needs 10 GB.

## Exercises

```exercise
id: decode-ways-memo
title: Count decodings with memoisation
prompt: |
  Digits map to letters: `"1"` → A, `"2"` → B, …, `"26"` → Z. Implement
  `count_decodings(s)` returning the number of ways the digit string `s`
  can be decoded. A `"0"` is never a letter on its own and `"06"` is not
  a valid two-digit code. The empty string has exactly one decoding
  (decode nothing).

  Write the recursion on the position `i` and memoise it; the hidden
  tests are long enough that the unmemoised search will time out.
languages: [python, javascript]
entry: count_decodings
starter:
  python: |
    def count_decodings(s):
        # recurse on position i; cache results by i
        return 0
  javascript: |
    function count_decodings(s) {
      // recurse on position i; cache results by i
      return 0;
    }
tests:
  - args: ["12"]
    expected: 2
  - args: ["226"]
    expected: 3
  - args: ["06"]
    expected: 0
    label: leading zero
  - args: [""]
    expected: 1
    label: empty string
  - args: ["11106"]
    expected: 2
  - args: ["2101"]
    expected: 1
    hidden: true
  - args: ["1111111111"]
    expected: 89
    hidden: true
    label: ten ones
  - args: ["111111111111111111111111111111"]
    expected: 1346269
    hidden: true
    label: thirty ones
hints:
  - "from(i) = 1 when i == len(s); 0 when s[i] == '0'; otherwise from(i+1) plus from(i+2) if s[i:i+2] is between 10 and 26."
  - "The state is only i: the digits before i never change how the suffix decodes."
  - "Thirty ones gives Fibonacci(31); without the memo that is millions of calls."
```

```exercise
id: word-break-memo
title: Word break with memoisation
prompt: |
  Implement `word_break(s, words)` returning `true` if `s` can be split
  into a sequence of one or more strings from `words` (each may be used
  any number of times), and `false` otherwise. The empty string is
  breakable.

  Recurse on the start index and memoise; bound the prefix length by the
  longest word.
languages: [python, javascript]
entry: word_break
starter:
  python: |
    def word_break(s, words):
        # your code here
        return False
  javascript: |
    function word_break(s, words) {
      // your code here
      return false;
    }
tests:
  - args: ["leetcode", ["leet", "code"]]
    expected: true
  - args: ["applepenapple", ["apple", "pen"]]
    expected: true
  - args: ["catsandog", ["cats", "dog", "sand", "and", "cat"]]
    expected: false
  - args: ["", ["a"]]
    expected: true
    label: empty string
  - args: ["cars", ["car", "ca", "rs"]]
    expected: true
    hidden: true
  - args: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab", ["a", "aa", "aaa", "aaaa"]]
    expected: false
    hidden: true
    label: exponential without the memo
hints:
  - "can(i) is true when i == len(s), or when some prefix s[i:j] is a word and can(j) is true."
  - "Store both true and false results; the false ones are what prune the exponential case."
  - "Use a Set of words and only try j up to i + (longest word length)."
```

## Senior signals

- You describe memoisation as **caching a pure function on the arguments that determine its result**, and you can point at the argument list and say "this is the state".
- You **count subproblems and bytes before coding**: $n$ states means $O(n)$ after memoisation; $2^n$ states means memoisation will not save you; 10⁸ states in a dict means 10 GB.
- You know memoisation is **output-bound**: it cannot make listing $n!$ permutations faster, and you switch to counting or optimising the moment the question allows.
- You know what `lru_cache` does: **C dict with an optional linked list**, the single-int fast-path key, `cache_info` as a diagnostic, 100–200 bytes per entry, and the `self` trap on methods.
- You know the three traps: **unhashable keys** (slices, lists), **stack depth** (memoisation does not remove frames, and the C stack behind the wrapper is why raising the limit crashes), and **hidden mutable state** (the cache returns stale answers when the function reads anything not in its key).
- You can state the **top-down versus bottom-up** trade-offs, including when a sparse state space makes top-down cheaper, and you derive the recursion first, then tabulate if asked.
- You recognise when two search paths **converge on the same state** (same index, same remaining budget) and say so before the interviewer does.

## Check yourself

```quiz
- q: >-
    A backtracking function count(i, path) counts valid completions from position i, where path is the list of choices so far and does not affect the count. The right memo key is:
  options: ["(i, tuple(path))", "tuple(path)", "len(path)", "i"]
  answer: 3
  explanation: >-
    Only arguments that affect the result belong in the key. Including path makes every call unique and the cache never hits; keying on i alone gives n states. len(path) is usually i again, but only if it is truly determined by i.
- q: >-
    You add lru_cache to the naive Fibonacci and call fib(50000). What happens in CPython?
  options: ["It hangs, since the unbounded cache fills memory", "A wrong answer, since the integers overflow 64 bits", "RecursionError, as the first call nests 50,000 frames deep", "It returns instantly, since each value is computed once"]
  answer: 2
  explanation: >-
    Memoisation removes repeated work but not stack depth: the first call still recurses 50,000 frames deep before any value is cached, and Python's default limit is about 1,000. Bottom-up tabulation, or a loop, is the fix; overflow is not an issue for Python integers, and 50,000 cached values are a trivial amount of memory.
- q: >-
    Which problem does NOT benefit from memoisation?
  options: ["Number of ways to segment a string into dictionary words", "Whether a subset of the numbers sums to a target", "Minimum edits to turn one string into another", "The list of all permutations of 9 distinct items"]
  answer: 3
  explanation: >-
    The output has 9! entries and no caching can produce them faster than writing them out. The other three are count, decide and minimise questions with polynomial state spaces (index; index and sum; two indices).
- q: >-
    A memoised recursive function reads a global list that another part of the program mutates between calls. The symptom you should expect is:
  options: ["Stale answers that depend on call order", "A KeyError when the cache sees the new list", "A RecursionError once the list grows long", "Correct results, but more cache misses"]
  answer: 0
  explanation: >-
    The cache key does not include the global, so the cache never notices the change: no miss, no error. Once an answer is cached it is returned even after the global changes. Bugs like this are intermittent and hard to reproduce, which is why memoised functions must be pure in their arguments.
- q: >-
    Target Sum asks how many ways to assign + or - to n numbers to hit a target. Two sign patterns that both reach index i with running sum 7 are the same subproblem because:
  options: ["Their remaining choices and remaining target match", "Both must have used the same sign pattern so far", "Their sign patterns share a common prefix up to index i", "They used equally many + and - signs so far"]
  answer: 0
  explanation: >-
    The remaining choices and the remaining target are identical regardless of how 7 was reached, so the future depends only on (i, running sum); the signs themselves may differ entirely. That collapses 2^n paths into at most n × (sum range) states, which is the whole point of choosing the state to be the history's effect rather than the history itself.
- q: >-
    A service memoises a pure function of two integers with lru_cache(maxsize=None) and its memory grows by about 1 GB a day. What is the most likely explanation?
  options: ["Each cached (i, j) entry costs over 100 bytes and the key space is unbounded", "The cache retains every stack frame of the recursion that created each entry", "The linked list of recently used entries is never trimmed without a maxsize", "Tuple keys are rehashed on every hit, leaking one hash object per call"]
  answer: 0
  explanation: >-
    A tuple-keyed entry measured about 116 bytes in CPython, so ten million distinct argument pairs a day is about a gigabyte, and with no maxsize nothing is ever evicted. An unbounded cache has no linked list at all, hashes do not leak, and frames are released when calls return; the growth is the entries themselves. A maxsize, a TTL cache, or caching at the data layer is the fix.
```
