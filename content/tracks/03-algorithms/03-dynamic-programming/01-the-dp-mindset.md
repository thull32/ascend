---
slug: the-dp-mindset
title: "The DP mindset: state, transition, order, answer"
description: Why naive recursion explodes, the two properties that make a problem dynamic programming, and the four-step procedure (state, transition, order, answer) that produces every DP solution.
minutes: 55
difficulty: medium
tags: [dynamic-programming, memoisation, tabulation, recursion, pattern:dynamic-programming]
problems: [climbing-stairs, min-cost-climbing-stairs]
---
You are asked how many distinct ways there are to climb a staircase of `n` steps if each move climbs 1 or 2 steps. The recursive answer writes itself: the last move was either a 1-step from stair `n-1` or a 2-step from stair `n-2`, so `ways(n) = ways(n-1) + ways(n-2)`. It is correct, and it is unusable: `ways(40)` makes 331,160,281 calls, which at roughly 100 ns per CPython call (the figure depends on the Python version and the CPU) is about half a minute, and `ways(45)` makes 3,672,623,805 calls, eleven times more, to compute a number you could write on the back of a receipt.

The recursion is not wrong. It is *wasteful*: it solves the same subproblem, `ways(20)` say, hundreds of millions of times. Dynamic programming is the discipline of noticing that waste and solving each subproblem once. Everything else, the tables, the memo dictionaries, the "bottom-up versus top-down" debate, is bookkeeping around that single idea.

## Why the recursion explodes

Draw the full call tree for `ways(6)` (base cases `ways(0) = ways(1) = 1`):

```text
ways(6)
├── ways(5)
│   ├── ways(4)
│   │   ├── ways(3)
│   │   │   ├── ways(2)
│   │   │   │   ├── ways(1)
│   │   │   │   └── ways(0)
│   │   │   └── ways(1)
│   │   └── ways(2)
│   │       ├── ways(1)
│   │       └── ways(0)
│   └── ways(3)
│       ├── ways(2)
│       │   ├── ways(1)
│       │   └── ways(0)
│       └── ways(1)
└── ways(4)
    ├── ways(3)
    │   ├── ways(2)
    │   │   ├── ways(1)
    │   │   └── ways(0)
    │   └── ways(1)
    └── ways(2)
        ├── ways(1)
        └── ways(0)
```

Count the nodes by argument:

| argument | 6 | 5 | 4 | 3 | 2 | 1 | 0 | total |
|---|---|---|---|---|---|---|---|---|
| calls | 1 | 1 | 2 | 3 | 5 | 8 | 5 | **25** |

Twenty-five calls, of which only **7** are distinct subproblems (`ways(0)` through `ways(6)`). The call counts are themselves Fibonacci numbers: `ways(k)` is called `fib(n-k+1)` times for `k ≥ 1` (and `ways(0)` `fib(n-1)` times), and the total is `2·fib(n+1) − 1` with `fib(1) = fib(2) = 1`. For `n = 6` that is `2·13 − 1 = 25`; for `n = 40` it is `2·165,580,141 − 1 = 331,160,281`. The tree has about `1.6ⁿ` nodes because every internal node spawns two children and the depth shrinks by only one or two per level, while the number of distinct arguments is `n + 1`. The ratio between those two numbers, exponential calls versus linear distinct subproblems, is the entire opportunity. The [recursion-design lesson](/learn/algorithms/recursion-backtracking/recursion-design) shows how to draw these trees for any recursion; [from backtracking to memoisation](/learn/algorithms/recursion-backtracking/from-backtracking-to-memoisation) is the bridge that lands here.

```viz
{"type": "recursion", "algorithm": "fibonacci", "n": 6, "name": "ways", "bases": [1, 1], "title": "Naive recursion: watch ways(3) and ways(2) get recomputed", "caption": "Every repeated subtree is wasted work. The number of distinct arguments is tiny compared with the number of calls."}
```

## The two properties that make a problem DP

A problem is a dynamic-programming problem when it has both of these:

**Optimal substructure.** The answer to the whole problem can be assembled from answers to smaller instances of the *same* problem. "Number of ways to reach stair `n`" decomposes into "number of ways to reach stair `n-1`" and "stair `n-2`". "Shortest path from A to Z" decomposes into "shortest path from A to some neighbour Y of Z, plus the edge Y→Z". Counting and optimisation problems usually have it; problems where the best choice now depends on the *entire* history usually do not, and when they do, the history has to become part of the state, which is where DP gets expensive.

**Overlapping subproblems.** The decomposition hits the same smaller instances repeatedly. Merge sort has optimal substructure (sort the halves, merge) but its subproblems are disjoint: every element is in exactly one half at each level, so there is nothing to reuse and merge sort is divide and conquer, not DP. Climbing stairs, shortest paths and edit distance all revisit the same states, so caching pays.

If a problem has the first property but not the second, use [divide and conquer](/learn/algorithms/divide-and-conquer/divide-and-conquer-thinking). If it has a *greedy-choice* property, where one locally best decision is always safe, you do not need to explore alternatives at all and [greedy](/learn/algorithms/greedy/greedy-and-exchange-arguments) beats DP. DP sits in the middle: you must consider several choices at each step, but the consequences of a choice depend only on a small summary of the past, the state.

### Optimal substructure must be argued, not assumed

Here is a problem where the decomposition *looks* right and is wrong. Take the undirected 4-cycle `A–B–C–D–A` and ask for the **longest simple path** (no repeated vertex) from `A` to `C`. The tempting recurrence mirrors shortest paths: "the last edge enters `C` from `B` or `D`, so `longest(A, C) = 1 + max(longest(A, B), longest(A, D))`". Compute the pieces by hand:

| subproblem | best simple path | length |
|---|---|---|
| `longest(A, B)` | `A–D–C–B` | 3 |
| `longest(A, D)` | `A–B–C–D` | 3 |
| recurrence's claim for `longest(A, C)` | `1 + max(3, 3)` | **4** |
| true `longest(A, C)` | `A–B–C` or `A–D–C` | **2** |

The recurrence says 4; the truth is 2. The 3-edge path to `B` passes *through* `C`, so extending it with `B–C` repeats `C` and is not simple. The subproblem's answer depends on which vertices the rest of the path will need, which is not in the state `(A, B)`. To fix the state you would have to add the set of vertices already used, giving `2ⁿ` states: longest simple path is NP-hard, and the DP cannot save it.

Shortest paths survive the same decomposition because of a *cut-and-paste* argument: if the prefix of a shortest path to `Y` were not itself a shortest path to `Y`, you could splice in the shorter prefix and get a shorter whole path, a contradiction. Whenever you propose a transition, say that sentence for your problem. If you cannot, you do not yet have optimal substructure, and the table you fill will be confidently wrong.

## The four-step procedure

Every DP solution in this module, from climbing stairs to matrix chain multiplication, is produced by answering four questions in order. Write them down; say them out loud in interviews.

1. **State.** What is a subproblem, and what parameters identify it? Write it as a sentence: "`dp[i]` is the number of ways to reach stair `i`." The sentence must be precise enough that a stranger could compute `dp[i]` by hand for any `i`.
2. **Transition.** How does one state's answer follow from smaller states? `dp[i] = dp[i-1] + dp[i-2]`. This is the recurrence. It comes from asking "what was the *last* decision?" and summing or minimising over the possibilities.
3. **Order (and base cases).** Which states have no dependencies (`dp[0] = 1`, `dp[1] = 1`), and in what order must the rest be computed so that every dependency is already filled? For a 1-D array, increasing `i`. For a grid, row by row. For intervals, by increasing length.
4. **Answer.** Which state (or combination of states) is the final answer? `dp[n]`. It is not always the last cell; in longest increasing subsequence it is the *maximum* over all cells.

### The definition test for a state

A state is the **minimal tuple of arguments such that the answer is a pure function of it**. The test: can two different situations map to the same tuple and yet have different answers or different futures? If yes, the tuple is too coarse and any transition you write over it is wrong on some input.

Add one rule to climbing stairs: you may not take two 2-steps in a row. The state `dp[i]` = "ways to reach stair `i`" fails the test: arriving at stair 2 by `1+1` and arriving by `2` are the same state, but only the first may be followed by a 2-step. Watch the coarse recurrence go wrong for `n = 4`:

| `i` | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| coarse `dp[i] = dp[i-1] + dp[i-2]` | 1 | 1 | 2 | 3 | **5** |
| legal sequences | – | `1` | `11`, `2` | `111`, `12`, `21` | `1111`, `112`, `121`, `211` |
| true count | 1 | 1 | 2 | 3 | **4** |

The coarse table counts `22`, which is illegal. The fix is to add the missing information to the state: `dp[i][t]` = ways to reach stair `i` where `t = 1` if the last move was a 2-step. Transitions: `dp[i][0] = dp[i-1][0] + dp[i-1][1]` (a 1-step may follow anything) and `dp[i][1] = dp[i-2][0]` (a 2-step may follow only a 1-step). Base `dp[0] = (1, 0)`. For `n = 4`: `(1,0), (1,0), (1,1), (2,1), (3,1)`, answer `3 + 1 = 4`; for `n = 5` it gives `(4, 2) = 6`, matching enumeration. Sharpening the state is nearly always the fix when you are stuck: "`dp[i][holding]`, best profit after day `i` *given whether you hold a share*", is the same move in [sequence DP](/learn/algorithms/dynamic-programming/sequence-dp).

## Two ways to fill the table

Once you have the recurrence, there are two ways to evaluate it without repeating work.

### Top-down: memoisation

Keep the recursive function, add a cache keyed by the state. Before computing, check the cache; after computing, store the result.

```python
from functools import lru_cache

def climb(n: int) -> int:
    @lru_cache(maxsize=None)
    def ways(i: int) -> int:
        if i <= 1:
            return 1
        return ways(i - 1) + ways(i - 2)
    return ways(n)
```

```javascript
function climb(n) {
  const memo = new Map();
  function ways(i) {
    if (i <= 1) return 1;
    if (memo.has(i)) return memo.get(i);
    const r = ways(i - 1) + ways(i - 2);
    memo.set(i, r);
    return r;
  }
  return ways(n);
}
```

Each distinct state is computed once; every other call is a cache hit, so the 25-call tree for `n = 6` collapses to 7 computed states plus 4 hits, 11 calls in all (`lru_cache` reports `hits=4, misses=7`). Time drops from `O(1.6ⁿ)` to `O(n)`. The cost is the call stack: `ways(n)` recurses `n` deep before the first base case returns, so `n = 10⁴` exceeds CPython's default recursion limit of 1,000 frames and raises `RecursionError`.

### Bottom-up: tabulation

Reverse the direction: start from the base cases and fill an array in dependency order until you reach the answer.

```python
def climb(n: int) -> int:
    dp = [0] * (n + 1)
    dp[0] = dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]
```

Watch the table fill:

```viz
{"type": "dp", "algorithm": "climbing-stairs", "n": 7, "title": "Bottom-up: dp[i] = dp[i-1] + dp[i-2]", "caption": "Each cell reads two already-filled cells to its left. The order (increasing i) guarantees the dependencies exist."}
```

| `i` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| `dp[i]` | 1 | 1 | 2 | 3 | 5 | 8 | 13 | 21 |

Because `dp[i]` only reads `dp[i-1]` and `dp[i-2]`, you can throw away everything older and keep two variables, dropping memory from `O(n)` to `O(1)`. This *rolling window* trick recurs in almost every DP family and gets its own treatment in [DP craft](/learn/algorithms/dynamic-programming/dp-craft).

### Choosing between them

| Axis | Top-down (memo) | Bottom-up (table) |
|---|---|---|
| Ease of writing | Recurrence → code directly; order is implicit | You must work out the fill order |
| Subproblems computed | Only those actually reached | All of them, even unreachable ones |
| Stack | Depth = longest dependency chain; `RecursionError` past 1,000 in CPython | None |
| Memory optimisation | Hard (the cache holds every state) | Easy (rolling rows or variables) |
| Constant factor per state | Function call plus hash lookup, order of 100 ns in CPython | Array index, no call; typically several times faster |
| Reconstruction | Walk the memo again from the top | Walk the table back, or keep parent pointers |
| Awkward orders (intervals, trees, bitmasks, DAGs) | Free: recursion finds a topological order | You must derive the order (by length, post-order, by popcount) |

In an interview, write top-down first if the recurrence has awkward dependencies or if only a sparse set of states is reachable. Write bottom-up when the state space is a dense rectangle and you may need to optimise memory or the depth would exceed the stack. Say which you are choosing and why; that sentence alone is a senior signal.

## A worked example with a real decision: minimum cost stairs

Counting ways has no choices, only sums. Most DP problems *optimise* over choices. Variant: each stair `i` has a cost `cost[i]` you pay when you step *on* it; you may start on stair 0 or 1; you climb 1 or 2 stairs at a time; the "top" is one past the last stair. Minimise the total cost.

1. **State.** `dp[i]` = the minimum cost to *stand on* stair `i` (having paid for it). "Minimum cost to *reach* `i` without paying for it yet" also works, as long as the transition and answer agree with the sentence you wrote.
2. **Transition.** The last move onto stair `i` came from `i-1` or `i-2`, so `dp[i] = cost[i] + min(dp[i-1], dp[i-2])`. The `min` is the decision; the DP tries both and keeps the cheaper.
3. **Order and base cases.** `dp[0] = cost[0]`, `dp[1] = cost[1]` (you may start on either without paying for anything before). Then increasing `i`.
4. **Answer.** The top is stair `n`, which has no cost, reached from `n-1` or `n-2`: `min(dp[n-1], dp[n-2])`.

Trace with `cost = [1, 100, 1, 1, 1, 100, 1, 1, 100, 1]` (`n = 10`), filling one cell at a time:

| `i` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| `cost[i]` | 1 | 100 | 1 | 1 | 1 | 100 | 1 | 1 | 100 | 1 |
| `min(dp[i-1], dp[i-2])` | – | – | min(100, 1) = 1 | min(2, 100) = 2 | min(3, 2) = 2 | min(3, 3) = 3 | min(103, 3) = 3 | min(4, 103) = 4 | min(5, 4) = 4 | min(104, 5) = 5 |
| `dp[i]` | 1 | 100 | 2 | 3 | 3 | 103 | 4 | 5 | 104 | 6 |

Two cells in full: `dp[4] = cost[4] + min(dp[3], dp[2]) = 1 + min(3, 2) = 3`, and `dp[5] = cost[5] + min(dp[4], dp[3]) = 100 + min(3, 3) = 103`. Answer: `min(dp[9], dp[8]) = min(6, 104) = 6`, the path 0 → 2 → 3 → 4 → 6 → 7 → 9 → top, paying 1 on each of six stairs.

Note what the table does *not* store: the path. `dp[i]` is a number, not a route. If the interviewer asks "which stairs?", you either store which predecessor won per cell (a parent pointer) or walk back from the answer re-checking which predecessor produces the stored value; see [DP craft](/learn/algorithms/dynamic-programming/dp-craft).

## Why the table is right: the invariant

A DP is a loop, and like every loop it is proved by an [invariant](/learn/foundations/problem-solving/invariants-and-loop-reasoning). For bottom-up climbing stairs:

**Invariant.** After the iteration that fills `dp[i]`, every cell `dp[0..i]` holds the exact number of ways to reach that stair.

- *Initially* (`i = 1`): `dp[0] = 1` (one way to be at the bottom: do nothing) and `dp[1] = 1` (one 1-step). True by inspection.
- *Preserved*: suppose it holds up to `i-1`. Every way to reach stair `i` ends with a 1-step from `i-1` or a 2-step from `i-2`; those two sets are disjoint (a sequence has one last move) and exhaustive (there are no other move sizes). Each set is in bijection with the ways to reach `i-1` and `i-2`, which by the hypothesis are `dp[i-1]` and `dp[i-2]`. So `dp[i] = dp[i-1] + dp[i-2]` is exact, and the loop order (increasing `i`) guarantees both cells were already final when read.
- *At the end*: the invariant at `i = n` says `dp[n]` is the answer.

The two words to say in an interview are **disjoint** and **exhaustive**: the last-decision cases must not double-count and must not miss anything. For an optimisation DP the same skeleton works with "exact optimum" in place of "exact count", plus the cut-and-paste sentence from the longest-simple-path section.

Top-down has the same proof turned around: the invariant is "every value in the memo is correct", the transition preserves it because a value is stored only after being computed from correct smaller values, and *termination* needs the arguments to strictly decrease under some well-founded order (`i` shrinks by 1 or 2 towards the base cases). On a state graph with a cycle, such as shortest paths in a graph with cycles, that termination argument fails and the memoised recursion loops or overflows; the fix is a different algorithm ([Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra)), not a bigger cache.

## Complexity: states times transition cost

The running time of a DP is `(number of distinct states) × (work per transition)`, provided each state is computed once. Climbing stairs has `n` states and an `O(1)` transition: `O(n)`. Edit distance on strings of length `m` and `n` has `m·n` states and an `O(1)` transition: `O(mn)`. Longest increasing subsequence in its simple form has `n` states but each transition scans all earlier states: `O(n²)`. Matrix chain multiplication has `O(n²)` interval states and an `O(n)` transition (try every split): `O(n³)`.

This formula is also how you *estimate whether DP will be fast enough* before writing it. A subset-of-`n` state means `2ⁿ` states: feasible for `n ≤ 20` (about a million), not for `n = 100`. A Python inner loop manages on the order of `10⁷` simple transitions per second, so an `O(n³)` DP with `n = 5,000` (`1.25 × 10¹¹`) is hours and `n = 500` (`1.25 × 10⁸`) is seconds. If a candidate proposes a state and cannot say how many of them there are, they have not finished designing the algorithm.

Memory is the number of states you have to keep *simultaneously*, which is often less than the total: the rolling-window trick keeps only the rows the transition reads.

## Under the hood: what a state costs in the runtime

### Calls, probes and the stack

**A memoised call.** Each state in the top-down version costs one Python function call and one cache probe. A CPython call creates a frame, binds arguments and pushes onto the interpreter's frame stack; the overhead is of the order of 50–100 ns on a modern CPU, depending on the Python version (3.11 made calls markedly cheaper) and the number of arguments. `lru_cache` is implemented in C: for a single `int` or `str` argument it stores the argument itself as the key rather than the argument tuple, then performs one dict probe (hash, index, compare), so a cache *hit* is a few tens of nanoseconds and never enters the Python body. A *miss* pays the call, the body, and a dict insert. `functools.cache` (3.9+) is `lru_cache(maxsize=None)` under another name; the bounded variant additionally maintains a doubly linked list for eviction. The memo is a [hash table](/learn/data-structures/hashing/hash-tables), so load factor and resizes apply to it.

**A tabulated cell.** `dp[i] = dp[i-1] + dp[i-2]` compiles to a handful of bytecodes (two subscript loads, one add, one subscript store) with no frame, so a cell costs tens of nanoseconds. Bottom-up is typically several times faster than memoised on a dense state space; the ratio depends on the version and on how much work the transition does.

**The stack.** The default recursion limit is 1,000 (`sys.getrecursionlimit()`), so a memoised chain deeper than that raises `RecursionError` at `n = 10⁴`. `sys.setrecursionlimit` lifts it, but on CPython before 3.11 every Python-level call also consumed C stack, and a raised limit could segfault when the OS thread stack (8 MB by default on Linux) ran out, hence the folk remedy of running in a thread created after `threading.stack_size(256 << 20)`. From 3.11 Python-to-Python calls no longer consume C stack and 3.12 tracks the C recursion limit separately, so raising the limit is safer, at the cost of one frame object per level. JavaScript engines have no configurable frame count; V8 stops at a stack-size limit that corresponds to roughly ten thousand frames for a small function (it depends on frame size and `--stack-size`). The [call-stack lesson](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame layout.

```viz
{"type": "memory", "algorithm": "call-stack", "fn": "ways", "n": 6, "title": "Top-down ways(6): six frames deep before the first base case returns", "caption": "Memoisation removes repeated work, not depth. The chain ways(6) → ways(5) → … → ways(1) is as long as n, which is what hits the recursion limit."}
```

### Bytes per cell

A Python `list` of `int` stores an 8-byte pointer per slot plus, for each value outside the shared singletons `-5..256`, a separate 28-byte int object (values at or above `2³⁰` grow by 4 bytes per further 30-bit digit). So a table of `10⁶` distinct values is about 36 MB. `array('q')` or a NumPy `int64` array stores 8 bytes per cell: 8 MB. A dict memo is the most expensive: on the order of 100 bytes per state once you count the index slot, the 24-byte entry, and the key and value objects. The rolling two-variable version costs two ints. In V8, an array of small integers is a packed array of tagged values (4 bytes each with pointer compression, as in Chrome; 8 bytes in Node's default build); once a value leaves the small-integer range (31 bits with pointer compression, 32 bits without) the array transitions to double storage, and to boxed elements if non-numbers arrive. [Space complexity and the memory hierarchy](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) explains why the contiguous 8-byte layout is also the faster one to scan.

## Production and interview failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| The recursive solution passes `n = 25` in milliseconds and has not returned for `n = 40` after a minute | No memo: add a counter to the function and watch the call count grow by about 1.6× per extra unit of `n` (`2·fib(n+1) − 1`) | Memoise on the state, or tabulate |
| `TypeError: unhashable type: 'list'` on the first call, or, after "fixing" it with `tuple(path)`, the memoised version is as slow as the naive one | The cache key includes a mutable, per-call argument (the path so far). Every call has a different key, so `cache_info()` reports zero hits | Key the memo on the minimal state that determines the answer; carry the path outside the key or reconstruct it afterwards |
| Answers are right on the samples and wrong on one hidden input; results change depending on the order in which states were requested | The memo omits an argument that the answer depends on (the state is too coarse), so the first caller's answer is served to a different situation | Apply the definition test; add the missing dimension (`dp[i][last_was_two]`) |
| `RecursionError: maximum recursion depth exceeded` at `n = 10⁴`, fine at `n = 900` | Top-down depth equals the dependency chain length, which is `n` | Rewrite bottom-up (no stack), or raise the limit and, on Python before 3.11, run in a thread with a bigger stack |
| A service's memory grows without bound although every request's DP is small | `@lru_cache` on a *method* keys on `self`, so every instance stays alive in the cache; a `maxsize=None` memo on a long-lived process never evicts | Cache on a function of plain data, or use a bounded `maxsize`, or store the memo per call |

## Recognising DP in a problem statement

Signals that a problem wants DP:

- It asks for a **count** ("how many ways"), an **optimum** ("minimum cost", "longest", "maximum profit"), or a **yes/no on existence** ("can you partition…"), over sequences of choices.
- The input is a sequence, a grid, a pair of strings, or a set with a small capacity bound, and the constraints (`n ≤ 1000`, `n ≤ 5000`) suggest `O(n²)` is expected rather than `O(n log n)`.
- A brute-force recursion is easy to write and its call tree, drawn for a small input, repeats subtrees.
- Greedy feels plausible but you can construct a counterexample.

Signals that it does *not*: the "optimal" choice is provably safe locally (greedy); subproblems do not overlap (divide and conquer); the state would need the full history (search with pruning, or the problem is NP-hard and the interviewer wants backtracking with heuristics).

## Interviewer follow-ups

**"Your memoised solution is `O(n)`. What happens at `n = 10⁵` in Python?"** Model answer: it raises `RecursionError` at depth 1,000 because the dependency chain is `n` long; convert to bottom-up, which has no stack and also allows the two-variable rolling form. Common wrong answer: "the memo makes it linear, so it is fine"; time and depth are different resources.

**"How do you know the recurrence is correct?"** Model answer: state the invariant ("`dp[i]` is the exact answer for the prefix of length `i`"), show the base cases, and argue the last-decision cases are disjoint and exhaustive, with a cut-and-paste sentence for optimisation problems. Common wrong answer: "I ran it on the examples", which is evidence, not an argument, and misses too-coarse states that only fail on specific inputs.

**"Why is merge sort not dynamic programming?"** Model answer: it has optimal substructure (sort halves, merge) but no overlapping subproblems, since every element belongs to exactly one half at each level; a memo would store every result once and never hit. Common wrong answer: "because it is divide and conquer" restates the label without naming the property.

**"Would you memoise the recursive shortest-path function on a graph with cycles?"** Model answer: no; the state graph has cycles so the recursion has no well-founded order and can loop, and a cache does not fix that. On a DAG it is a valid DP; with cycles and non-negative weights you want Dijkstra. Common wrong answer: "yes, memoisation makes any recursion polynomial".

**"How much memory does your `dp` array use for `n = 10⁶`?"** Model answer: as a Python list of distinct ints, about 36 MB (8-byte pointer plus 28-byte object per cell); 8 MB as `array('q')`; two ints in the rolling form. Common wrong answer: "`O(n)`, so a few megabytes at most", which ignores the per-object cost.

## What mid-level engineers get wrong

- **Writing code before the state sentence.** Consequence: a transition that cannot be justified and a bug that only appears on the input the sentence would have excluded.
- **Treating optimal substructure as automatic.** Consequence: a longest-simple-path style recurrence that returns 4 when the answer is 2, and no way to notice without the cut-and-paste check.
- **Keying the memo on whatever the function happens to take.** Consequence: either `unhashable type` or a cache that never hits because a path or a mutable accumulator is in the key.
- **Believing memoisation removes depth.** Consequence: `RecursionError` on the large test after the small tests passed.
- **Quoting `O(n)` memory as if cells were free.** Consequence: a 36 MB table where two variables would do, or an `O(n²)` boolean table that is 200 MB in a list of lists.
- **Choosing top-down or bottom-up by habit.** Consequence: a bottom-up fill of `2ⁿ` states when only a few thousand are reachable, or a memoised interval DP that overflows the stack.

## Exercises

```exercise
id: count-ways-with-steps
title: Count staircase paths with arbitrary step sizes
prompt: |
  There are `n` stairs and you start at the bottom (stair 0). In one move you
  may climb any number of stairs listed in `steps` (a non-empty list of
  distinct positive integers). Return the number of distinct ordered
  sequences of moves that land exactly on stair `n`.

  `n = 0` has exactly one way (do nothing). Use bottom-up DP: define
  `dp[i]` as the number of ways to reach stair `i` and fill increasing `i`.
  Results fit in a 64-bit integer for the tests.
languages: [python, javascript]
entry: count_ways
starter:
  python: |
    def count_ways(n, steps):
        # dp[i] = number of ways to reach stair i
        return 0
  javascript: |
    function count_ways(n, steps) {
      // dp[i] = number of ways to reach stair i
      return 0;
    }
tests:
  - args: [4, [1, 2]]
    expected: 5
  - args: [5, [1, 2, 3]]
    expected: 13
  - args: [0, [1, 2]]
    expected: 1
    label: zero stairs
  - args: [3, [2]]
    expected: 0
    label: unreachable
  - args: [10, [1, 2]]
    expected: 89
  - args: [7, [1, 3, 5]]
    expected: 12
    hidden: true
  - args: [12, [3, 4]]
    expected: 2
    hidden: true
    label: only 3+3+3+3 and 4+4+4
hints:
  - "dp[0] = 1. For each i from 1 to n, dp[i] = sum of dp[i - s] for every s in steps with s <= i."
  - "Order matters here (1 then 2 differs from 2 then 1), so the outer loop is over i and the inner loop over steps."
```

```exercise
id: min-cost-stairs
title: Minimum cost to climb the stairs
prompt: |
  `cost[i]` is the price of standing on stair `i`. You may start on stair 0
  or stair 1, and from stair `i` you may move to `i + 1` or `i + 2`. The top
  is one past the last stair and costs nothing. Return the minimum total
  cost to reach the top.

  `cost` has at least two elements. Solve it bottom-up in O(n) time and
  O(1) extra space (two rolling variables are enough).
languages: [python, javascript]
entry: min_cost_climbing
starter:
  python: |
    def min_cost_climbing(cost):
        # your code here
        return 0
  javascript: |
    function min_cost_climbing(cost) {
      // your code here
      return 0;
    }
tests:
  - args: [[10, 15, 20]]
    expected: 15
  - args: [[1, 100, 1, 1, 1, 100, 1, 1, 100, 1]]
    expected: 6
  - args: [[5, 5]]
    expected: 5
    label: two stairs
  - args: [[0, 0, 0, 0]]
    expected: 0
    label: all free
  - args: [[3, 2, 9, 1, 4, 7]]
    expected: 7
    hidden: true
  - args: [[8, 1]]
    expected: 1
    hidden: true
hints:
  - "dp[i] = cost[i] + min(dp[i-1], dp[i-2]); the answer is min(dp[n-1], dp[n-2])."
  - "You only ever read the previous two values, so keep them in two variables and shift."
```

## Senior signals

- You state the **state definition as a sentence** before writing any code, and you can compute a cell by hand from that sentence alone.
- You apply the **definition test** (minimal tuple; same tuple must mean same answer) and know that a too-coarse state fails on specific inputs, not on all of them.
- You derive the transition by asking "**what was the last decision?**", say why the cases are **disjoint and exhaustive**, and give the **cut-and-paste** sentence for optimal substructure rather than assuming it.
- You give the running time as **states × transition cost** and use it to sanity-check feasibility against the constraints before coding.
- You choose top-down or bottom-up **deliberately** (sparse states or awkward order → memo; dense table, memory pressure or depth beyond 1,000 → tabulation) and say why.
- You know what a state costs in the runtime: a call plus a cache probe versus an array index, 36 bytes per list cell versus 8 in a typed array, and a recursion limit of 1,000.
- You know the table stores values, not choices, and you can explain how to **reconstruct the solution** when asked.
- You can tell DP apart from divide and conquer (no overlap) and greedy (a safe local choice) and name the property that decides.

## Check yourself

```quiz
- q: >-
    A recursive solution has optimal substructure but its subproblems never overlap. What should you do?
  options: ["Go greedy, since optimal substructure implies a safe local choice", "Add memoisation, since a cache can only ever reduce the call count", "Tabulate bottom-up, since that removes repeated recursive calls", "Use divide and conquer, since no subproblem is ever requested twice"]
  answer: 3
  explanation: >-
    A cache only pays when the same state is requested more than once. With disjoint subproblems (merge sort, quicksort) a memo would store every result once and never hit, costing memory and hashing for nothing. Greedy needs a separate safe-choice property, which optimal substructure does not imply.
- q: >-
    You define dp[i] as "something about the first i elements" and cannot write a transition. What is the most likely fix?
  options: ["Sharpen the state, often adding a dimension the transition needs", "Add more base cases so the recurrence always has somewhere to start", "Precompute prefix sums so each transition reads ranges in O(1)", "Switch from top-down to bottom-up so the fill order is explicit"]
  answer: 0
  explanation: >-
    A transition can only be derived from a precise state. If the last decision depends on information the state does not carry (are you holding a share? was the last move a 2-step?), that information must become part of the state, usually as an extra dimension. Changing the evaluation direction does not help: top-down and bottom-up evaluate the same recurrence.
- q: >-
    A DP has O(n²) states and each transition scans O(n) earlier states. n = 5000. Is it fast enough for a typical 1–2 second limit?
  options: ["No; states × transition cost is n³ ≈ 1.25 × 10¹¹", "Yes; 2.5 × 10⁷ states is comfortably within the limit", "Yes; memoisation computes each state once, so O(n²)", "Only bottom-up; top-down call overhead makes it n³"]
  answer: 0
  explanation: >-
    Running time is states × transition cost = n² × n = n³ ≈ 1.25 × 10¹¹ operations, far too many. Memoisation only guarantees each state is computed once; it does not shrink the O(n) work inside each state. Top-down vs bottom-up changes constants, not the exponent.
- q: >-
    Which is a genuine advantage of top-down memoisation over bottom-up tabulation?
  options: ["It runs faster, since it skips allocating a full table", "It cannot overflow the stack, since results are cached", "It uses less memory, since finished rows can be rolled away", "It computes only states reachable from the initial call"]
  answer: 3
  explanation: >-
    Tabulation fills the whole table including states the answer never depends on; memoisation touches only what the recursion requests. Rolling rows and stack safety are advantages of bottom-up (the memo still recurses as deep as the longest dependency chain), and per-state call and hash overhead usually makes memoisation slower.
- q: >-
    For min-cost climbing stairs with cost = [10, 15, 20], why is the answer 15 and not 10?
  options: ["Because the top is the last stair, so every route must pay its 20", "Because from stair 0 you still pay for stair 1 or 2 before the top", "Because you must start on stair 1; stair 0 is only the ground", "Because the table keeps the shortest path, which starts on stair 1"]
  answer: 1
  explanation: >-
    The top is one past the last stair and is free. Starting on stair 0 costs 10, but you must then land on stair 1 or 2 (total 25 or 30). Starting on stair 1 costs 15 and a single 2-step reaches the top. The answer is min(dp[n-1], dp[n-2]) = min(30, 15) = 15. You may start on either stair 0 or stair 1, so nothing forces stair 1.
- q: >-
    Climbing stairs gains the rule "no two 2-steps in a row". You keep dp[i] = ways to reach stair i with dp[i] = dp[i-1] + dp[i-2]. What happens for n = 4?
  options: ["It raises an error, since dp[i-2] is undefined once a 2-step is forbidden", "It returns 3, since the rule removes one sequence from each of the two terms", "It returns 5 instead of 4, since the state cannot tell how stair i-2 was reached", "It returns 4, since the recurrence never generates the sequence 2 then 2"]
  answer: 2
  explanation: >-
    The coarse state merges 'reached stair 2 by 1+1' with 'reached stair 2 by a 2-step', so the dp[i-2] term counts a 2-step following a 2-step and the table gives 1, 1, 2, 3, 5. Enumeration gives 1111, 112, 121, 211: four. The fix is dp[i][last_was_two], which produces (3, 1) at i = 4 and the correct total of 4.
```
