---
slug: from-backtracking-to-memoisation
title: "From backtracking to memoisation"
description: How to spot the repeated subproblems inside an exponential search, cache them by the arguments that matter, and watch the running time collapse from 2^n to n^2; the bridge to dynamic programming.
minutes: 40
difficulty: medium
tags: [memoisation, recursion, overlapping-subproblems, dynamic-programming, caching]
problems: [climbing-stairs, decode-ways, word-break, target-sum]
---
Your backtracking solution is correct, the tests pass, and the interviewer says "now do it for $n = 10^4$". You can hear that the search will not finish, and you have four minutes. The move that saves the round is neither a new algorithm nor a clever data structure. It is noticing that the search solves the *same* subproblem thousands of times and writing its answer down the first time.

That is memoisation. It turns a specific kind of exponential recursion into a polynomial one with about three added lines, and it is the door into dynamic programming. This lesson is about recognising *which* recursions it applies to, because it does not apply to all of them, and the difference is the single most useful thing to know about the whole DP module that follows.

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

`ways(4)` is computed twice, `ways(3)` three times, `ways(2)` five times, `ways(1)` eight times. The number of calls satisfies $C(n) = C(n-1) + C(n-2) + 1$, which grows like $\phi^n \approx 1.618^n$. For $n = 40$ that is about 300 million calls to produce the 41st Fibonacci number, which is a single 64-bit integer. For $n = 100$ the universe ends first.

The waste is total: there are only $n + 1$ distinct inputs to `ways`, and the function is pure (same input, same output, no side effects). Every call after the first for a given `n` is recomputing a known value.

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
- **Recursion depth is still $n$.** Memoisation removes repeated work, not stack frames. `ways(10000)` with `lru_cache` raises `RecursionError` in CPython. The [next module](/learn/algorithms/dynamic-programming/the-dp-mindset) fixes that by filling the table bottom-up in a loop.

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

Trace `"226"`: `from_pos(0)` takes `2` then `from_pos(1)`; `from_pos(1)` takes `2` then `from_pos(2)` (which takes `6` and reaches the end: 1) and takes `26` reaching the end: 1, so `from_pos(1) = 2`. Back in `from_pos(0)`, taking `22` gives `from_pos(2) = 1`, already cached. Total 3: `BBF`, `BZ`, `VF`. The memo saved one call here; on a string of forty `1`s it saves about $10^{8}$.

**Word Break.** Can `s` be segmented into dictionary words? Backtracking tries every dictionary word as a prefix and recurses on the rest. The rest is `s[i:]`, so the state is `i` again. Without the memo, `"aaaaaaaaaaaaaaaaaaaaaaaab"` with dictionary `["a", "aa", "aaa", "aaaa"]` explores every composition of 24 into parts of size 1–4 before discovering the `b` is unreachable: around $10^7$ paths. With the memo, 25 states, each tried against 4 words: 100 steps.

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

The `max_len` bound is the pruning from the previous lesson applied here: no point testing prefixes longer than the longest word. Complexity $O(n \cdot L)$ where $L$ is the longest word length, plus the substring hashing.

**Target Sum.** Assign `+` or `-` to each number so the total equals a target; count the assignments. The search state after deciding the first `i` signs is `(i, running_sum)`. Two different sign patterns that reach index `i` with the same running sum have identical futures, so they are the same subproblem. State space: $n \times (\text{range of sums})$, typically a few hundred thousand, versus $2^n$ paths. The state has *two* components; that is still fine, the memo key is a tuple.

The general test: **two paths through the search that arrive at the same arguments must have the same answer from there on.** If the answer also depends on *how* you got there, those arguments are not the whole state, and either the state must be enlarged or memoisation does not apply.

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

The third row is the knapsack family; the fourth is bitmask DP over subsets (Travelling Salesman for $n \le 20$). Both appear later in the DP module.

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
| Stack | Depth = recursion depth; can overflow | None |
| Constant factor | Dictionary lookups and function calls | Array indexing in a loop; 5–20× faster in Python |
| Space optimisation | Hard (cache holds everything) | Often easy (keep last row, last two values) |

In an interview, derive the recursion and memoise it first: it is the fastest route to a correct, polynomial solution, and it makes the state definition explicit because the state *is* the function's parameter list. Then, if asked for the bottom-up version, the parameters become array indices and the base cases become the initial cells. That translation is what [The DP mindset](/learn/algorithms/dynamic-programming/the-dp-mindset) and [One-dimensional DP](/learn/algorithms/dynamic-programming/one-dimensional-dp) practise.

## The recognition protocol

When your search is too slow, ask in order:

1. **Is the output itself exponential?** If yes, stop; the search is the algorithm, and pruning is the only lever.
2. **What arguments does the recursive function take, and which ones affect the result?** Drop the ones that do not (the path, the accumulated list) or turn them into something small (the sum, not the sequence of signs).
3. **How many distinct values can the remaining arguments take?** Multiply the ranges. If it is polynomial, memoise on those arguments.
4. **Does the same argument tuple actually recur?** Count on a small example. If every call has unique arguments (a balanced tree walk, for instance), the cache is pure overhead.
5. **Is the recursion pure?** No dependence on mutable state outside the arguments. If the function reads a `used` array or a board that changes, the arguments are not the whole state and the cache will return wrong answers.

Step 5 is the production bug. A memoised function that quietly depends on something not in its key returns stale results on the next call, and the failure is intermittent because it depends on call order. If you add `lru_cache` to a method, remember that `self` is part of the key and the cache holds a reference to the instance for as long as the cache lives.

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
  - "The state is just i: the digits before i never change how the suffix decodes."
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
- You **count subproblems before coding**: $n$ states means $O(n)$ after memoisation; $2^n$ states means memoisation will not save you.
- You know memoisation is **output-bound**: it cannot make listing $n!$ permutations faster, and you switch to counting or optimising the moment the question allows.
- You know the three traps: **unhashable keys** (slices, lists), **stack depth** (memoisation does not remove frames), and **hidden mutable state** (the cache returns stale answers when the function reads anything not in its key).
- You can state the **top-down versus bottom-up** trade-offs and you derive the recursion first, then tabulate if asked.
- You recognise when two search paths **converge on the same state** (same index, same remaining budget) and say so before the interviewer does.

## Check yourself

```quiz
- q: >-
    A backtracking function count(i, path) counts valid completions from position i, where path is the list of choices so far and does not affect the count. The right memo key is:
  options: ["(i, tuple(path))", "tuple(path)", "len(path)", "i"]
  answer: 3
  explanation: >-
    Only arguments that affect the result belong in the key. Including path makes every call unique and the cache never hits; keying on i alone gives n states. len(path) is usually just i again, but only if it is truly determined by i.
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
```
