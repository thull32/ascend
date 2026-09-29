---
slug: cycle-detection
title: Cycle detection
description: Floyd's tortoise and hare with the full proof (when they meet, and why the head-to-start distance equals the meeting-point-to-start distance modulo the cycle length), per-iteration traces, Brent's faster variant with measured evaluation counts, and the same algorithm on arrays, number sequences, generators, factoring and state machines.
minutes: 45
difficulty: medium
tags: [linked-list, cycle-detection, floyd, brent, fast-slow, two-pointers, proof, functional-graph, pollard-rho]
problems: [linked-list-cycle, find-duplicate-number, happy-number]
---
A traversal that should take microseconds is still running an hour later, pinned at 100% CPU. Somewhere a `next` pointer points backwards, and `while node:` will never see a null. The corrupted list is a symptom; the real question is how to *detect* that a sequence of "follow the pointer" steps has entered a loop, using no memory, when the sequence may be a linked list, a chain of array indices, an iterated function, a pseudo-random generator or a state machine.

The obvious answer is a hash set of visited nodes: O(n) time, O(n) space. Floyd's algorithm does it in O(n) time and O(1) space with two pointers, and its proof is short enough to give in an interview, which is why interviewers ask for it. Brent's variant does the same with about a quarter fewer pointer reads, which matters when each step is expensive.

## The hash-set baseline

```python
def has_cycle_set(head):
    seen = set()
    node = head
    while node is not None:
        if id(node) in seen:       # or `node in seen` with identity-hashed nodes
            return True
        seen.add(id(node))
        node = node.next
    return False
```

Correct, simple, O(n) space, and the space is not small: on CPython 3.14.7 a `set` of a million node ids measures 33.6 MB of hash table (2²¹ slots at 16 bytes) plus 32 bytes per boxed id, about 66 MB in total. Say it first; it is the right answer when memory is not a constraint and it is what most production serialisers do (see under the hood). The interviewer will then ask for O(1) space.

## Floyd's algorithm: the tortoise and the hare

Two pointers start at the head. `slow` moves one step per iteration, `fast` moves two. If `fast` or `fast.next` reaches null, there is no cycle. If there is a cycle, the two pointers eventually point at the same node.

```python
def has_cycle(head):
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:          # identity, never value
            return True
    return False
```

```viz
{"type": "linked-list", "algorithm": "cycle-detect", "values": [1, 2, 3, 4, 5, 6], "cycleAt": 2, "title": "Tortoise and hare: node 6 points back to node 3"}
```

## Why they must meet, and when

"Fast laps slow" is the intuition; here is the argument with positions. Let the list have `F` nodes before the cycle (the tail) and a cycle of length `C`, and number the cycle's nodes `0 .. C − 1` starting from the first node of the cycle. After `t ≥ F` iterations, `slow` is at cycle position `(t − F) mod C` and `fast`, having taken `2t` steps, is at `(2t − F) mod C`. They point at the same node exactly when

$$2t - F \equiv t - F \pmod C \quad\Longleftrightarrow\quad t \equiv 0 \pmod C.$$

So the meeting happens at the first `t ≥ F` that is a multiple of `C`: `t* = C · ⌈F / C⌉` (or `t* = C` when `F = 0`), which is always less than `F + C`. Total iterations O(n), two pointers, O(1) space.

The same fact in "gap" language: when `slow` enters the cycle at `t = F`, `fast` is `F mod C` positions ahead of it. Each iteration `fast` gains exactly one position, so the gap reaches `C ≡ 0` within `C − (F mod C) ≤ C` iterations. A gap that grows by exactly one cannot skip over zero.

Why speed 2 and not 3? With speed `s`, `fast` sits at `(st − F) mod C` and the pointers coincide when `(s − 1) t ≡ 0 (mod C)`. They still meet, no later than `t*`, so speed alone does not break detection. What breaks is the *next* step: with `s = 3`, `F = 0`, `C = 4`, the pointers meet at `t = 2` (positions 2 and 6 mod 4), and 2 is not a multiple of `C`. The cycle-start argument below needs the meeting time to be a multiple of `C`, and speed 2 is the choice that guarantees it.

## Worked trace

List `1 → 2 → 3 → 4 → 5 → 6 → (back to 3)`: `F = 2` (nodes 1, 2), `C = 4` (nodes 3, 4, 5, 6 at cycle positions 0, 1, 2, 3).

| iteration `t` | `slow` | `fast` | slow's cycle position | fast's cycle position | gap |
|---|---|---|---|---|---|
| 0 | 1 | 1 | – | – | – |
| 1 | 2 | 3 | – | 0 | – |
| 2 | 3 | 5 | 0 | 2 | 2 |
| 3 | 4 | 3 | 1 | 0 | 3 |
| 4 | 5 | 5 | 2 | 2 | 0 |

They meet at node 5 at `t = 4`, the smallest multiple of `C = 4` that is at least `F = 2`, as the formula predicts. At `t = 2` the gap is `F mod C = 2` and it grows by one per iteration until it wraps. Each iteration reads three `next` pointers, so detection cost twelve reads.

## Finding where the cycle starts

At the meeting, `slow` has taken `t* = kC` steps for some `k ≥ 1`, and its cycle position is `(kC − F) mod C = (−F) mod C`. Walk `F` more steps from there and the position becomes `kC ≡ 0`: the cycle start. Read that as a statement about distances: **the distance from the head to the cycle start (`F`) is congruent, modulo `C`, to the distance from the meeting point forward to the cycle start.** So a new pointer `p` at the head and `slow` at the meeting point, advanced one step at a time, arrive at the cycle start on the same step: `p` after exactly `F` steps, `slow` after `F` steps too, lapping the cycle `⌊F / C⌋` times on the way.

```python
def cycle_start(head):
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            p = head
            while p is not slow:           # F steps, both at speed 1
                p = p.next
                slow = slow.next
            return p
    return None
```

Continuing the trace from the meeting at node 5 (cycle position 2, which is `(−2) mod 4`):

| step | `p` | `slow` |
|---|---|---|
| 0 | 1 | 5 |
| 1 | 2 | 6 |
| 2 | 3 | 3 |

They meet at node 3 after `F = 2` steps. Two more pointer reads per step, four in total.

### Cycle length and repair

From the meeting point, advance one pointer until it returns to the meeting node, counting steps: that count is `C` (four reads here). With `F` and `C` known you can describe the whole list: the last node of the cycle is `C − 1` steps after the start, and setting its `next` to null breaks the loop. Repairing a corrupted list this way is a recovery tool, not a fix; the writer that created the cycle is the bug. Altogether Floyd spends 12 + 4 + 4 = 20 pointer reads on this list to find `F` and `C`.

## Brent's algorithm

Floyd reads three pointers per iteration and moves both pointers. Brent's variant moves only `hare`, one read per step, and keeps `tortoise` parked at a "teleport" point; whenever `hare` has taken a power-of-two number of steps without meeting `tortoise`, `tortoise` jumps to `hare` and the window doubles. When they meet, the step count within the window *is* the cycle length.

```python
def brent(f, x0):
    power = lam = 1
    tortoise, hare = x0, f(x0)
    while tortoise != hare:
        if power == lam:             # window exhausted: teleport and double it
            tortoise = hare
            power *= 2
            lam = 0
        hare = f(hare)
        lam += 1                     # lam counts hare's steps since the teleport
    tortoise = hare = x0             # lam is now C; find F with a gap of C
    for _ in range(lam):
        hare = f(hare)
    mu = 0
    while tortoise != hare:
        tortoise, hare = f(tortoise), f(hare)
        mu += 1
    return mu, lam                   # (F, C)
```

On the same list (`f` is "follow `next`", nodes named by value):

| read | window `power` | `tortoise` | `hare` | `lam` | note |
|---|---|---|---|---|---|
| 1 | 1 | 1 | 2 | 1 | start |
| 2 | 2 | 2 | 3 | 1 | window of 1 exhausted: teleport to 2 |
| 3 | 2 | 2 | 4 | 2 | |
| 4 | 4 | 4 | 5 | 1 | window of 2 exhausted: teleport to 4 |
| 5 | 4 | 4 | 6 | 2 | |
| 6 | 4 | 4 | 3 | 3 | |
| 7 | 4 | 4 | 4 | 4 | met: `C = 4` |

Seven reads to learn `C`, against Floyd's twelve to merely meet. Then `hare` starts `C = 4` ahead of `tortoise` from the head: (1, 5), (2, 6), (3, 3), so `F = 2` after 4 more reads each, 15 reads in total against Floyd's 20. Measured over every shape with `F < 30` and `C < 30`, Brent's full locate uses 24% fewer evaluations than Floyd's; Brent's 1980 paper reports his algorithm "about 36 percent faster than Floyd's (on the average)", and Pollard's rho built on it about 24 percent faster. When one evaluation of `f` is a modular squaring in Pollard's rho or a workflow step that touches a database, that is the difference that matters. In interviews, Floyd is the expected answer; give Brent when asked "can you do better?".

## Beyond linked lists: any iterated function

Floyd never uses the fact that the sequence is a linked list. It uses only that there is a deterministic "next" step: `x → f(x)`, a *functional graph* where every node has out-degree exactly one. Any sequence `x₀, f(x₀), f(f(x₀)), …` over a finite set must repeat, and the picture is always the same "ρ" shape: a tail of `F` distinct values, then a cycle of length `C`.

**Arrays as functions.** An array `nums` of `n + 1` integers each in `1..n` defines `f(i) = nums[i]`. Follow `i → nums[i]` from index 0. No value is 0, so index 0 has no incoming edge and is in the tail, never the cycle; there are `n + 1` indices and only `n` targets, so some target has two incoming edges, and that node is the cycle start and the duplicated value. Floyd finds it in O(n) time, O(1) space, read-only. [Find the Duplicate Number](/practice/find-duplicate-number) is the first exercise.

```viz
{"type": "graph", "algorithm": "cycle-detect", "directed": true, "start": "0", "nodes": [{"id": "0"}, {"id": "1"}, {"id": "3"}, {"id": "2"}, {"id": "4"}], "edges": [{"from": "0", "to": "1"}, {"from": "1", "to": "3"}, {"from": "3", "to": "2"}, {"from": "2", "to": "4"}, {"from": "4", "to": "2"}], "title": "nums = [1, 3, 4, 2, 2] as the functional graph i → nums[i]: the node with two incoming edges is the duplicate"}
```

| iteration | `slow` (index) | `fast` (index) | phase 2 step | `p` | `slow` |
|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 4 |
| 1 | 1 | 3 | 1 | 1 | 2 |
| 2 | 3 | 4 | 2 | 3 | 4 |
| 3 | 2 | 4 | 3 | 2 | 2 |
| 4 | 4 | 4 (meet) | | | |

Tail `0, 1, 3` (`F = 3`), cycle `2, 4` (`C = 2`); phase 2 meets at index 2, and 2 is the duplicate (indices 3 and 4 both map to it). The meeting time 4 is the smallest multiple of 2 that is at least 3. The constraint "values in `1..n`" is load-bearing: a 0 in the array would put index 0 on a cycle and phase 2 could return the wrong node.

## Number sequences, generators, factoring and state machines

**Number sequences.** A "happy number" is one where repeatedly replacing `n` by the sum of the squares of its digits reaches 1; otherwise the process loops. Every number above 243 shrinks under the map (999 → 243), so the sequence lives in a finite set and must cycle. From 2 the sequence is `2, 4, 16, 37, 58, 89, 145, 42, 20, 4, …`: a tail of one and a cycle of eight, which Floyd detects with `slow` and `fast` meeting at 20 after 8 iterations. Every unhappy number falls into that one cycle. [Happy Number](/practice/happy-number) is the second exercise.

**Pseudo-random generators.** A linear congruential generator `x → (ax + c) mod m` is a function on a finite set; its period is a cycle length. `x → (5x + 3) mod 16` from 1 visits all 16 residues before repeating (it satisfies the Hull–Dobell conditions), while `x → (6x + 2) mod 16` from 1 goes `1, 8, 2, 14, 6, 6, 6, …`: Brent reports `F = 4`, `C = 1` after 17 evaluations. That is the smoke test for a home-made generator or a hash-based "next shard" function. Real generators are trusted on proof, not measurement: Java's `java.util.Random` is a 48-bit LCG with period 2⁴⁸ ≈ 2.8 × 10¹⁴, and CPython's Mersenne Twister has period 2¹⁹⁹³⁷ − 1.

**Pollard's rho.** Factoring `N` by iterating `x → x² + 1 mod N` with a slow and a fast pointer and testing `gcd(|x − y|, N)` after each step: the sequence taken mod an unknown prime factor `p` cycles after about `√p` steps, and the gcd exposes `p` when the two pointers collide mod `p` but not mod `N`. For `N = 8051` the factor 97 appears after three iterations (nine evaluations); for `N = 10403 = 101 × 103` after 27 evaluations. [Number theory essentials](/learn/foundations/math-for-engineers/number-theory-essentials) has the arithmetic.

**A `next` function in a system.** A build graph, a retry policy or a saga that transitions deterministically between states can loop forever. Running two simulators at speeds 1 and 2 over the transition function detects it with O(1) memory, which matters when states are large objects you would rather not hash. Symlink chains and HTTP redirects are the same shape, and there the systems choose a hop cap instead: Linux resolves at most 40 nested symlinks and then returns `ELOOP`; `curl -L` stops after 50 redirects by default.

## Under the hood: identity, and what real systems do instead

`slow is fast` compares object identity: in CPython `id()` is the object's address, and `is` compares those addresses; in JavaScript `===` on two objects compares references. Two distinct nodes with equal `val` are not the same node, and two `id(node.val)` calls can be equal for distinct nodes because small integers are shared objects. Compare the nodes, never their contents.

A cycle of list nodes in Python is not a memory leak. CPython's cyclic garbage collector finds unreachable reference cycles by a different algorithm (it subtracts internal references from each container's refcount and collects what remains at zero), so the nodes are freed when the last external reference goes. The damage is the infinite traversal, not the memory.

Most production code that must survive cyclic input uses the hash-set baseline or a cap, not Floyd, because the input is a general object graph rather than a functional one. CPython's `json.dumps` keeps a `markers` dict of the `id()` of every container on the current path and raises `ValueError: Circular reference detected` (disable with `check_circular=False`); V8's `JSON.stringify` keeps a stack of the objects being serialised and throws `TypeError: Converting circular structure to JSON`; `pickle` memoises every object by id so a cycle serialises once. Floyd applies when every node has exactly one successor, and that is precisely a linked list, an iterated function, or a state machine, where a visited set would cost O(n) memory for nothing. The cheapest production use is the debug assertion: an LRU list whose `prev`/`next` were updated in the wrong order forms a cycle, and a Floyd check on the list after each operation in tests catches it for two extra pointers.

## Trade-offs

| Method | Time | Extra memory | Finds start and length | Needs mutable nodes | Works on an implicit `f` | Pointer reads on the `F = 2, C = 4` list |
|---|---|---|---|---|---|---|
| Hash set of visited | O(F + C) | O(F + C): ~66 MB per 10⁶ nodes on CPython | start (first repeat); length by counting | no | yes, if states are hashable | 7 |
| Floyd | O(F + C) | O(1) | both | no | yes | 20 |
| Brent | O(F + C) | O(1) | both | no | yes | 15 |
| Hop cap (`ELOOP`, `--max-redirs`) | O(cap) | O(1) | neither | no | yes | at most the cap |
| Mark bit in each node | O(F + C) | one bit per node | start | yes | no | F + C |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A worker pins one CPU inside a list traversal and never returns | A cycle created by a pointer update in the wrong order: a partition that never terminated its second sublist, or two threads updating an LRU list; `py-spy dump` or `jstack` shows the same frame with addresses repeating | Terminate every re-threaded list; take the lock on both `get` and `put`; add a Floyd assertion to the list's test suite ([Merging and partitioning](/learn/data-structures/linked-lists/merging-and-partitioning)) |
| The cycle checker reports cycles on a valid list of repeated values | It compares `slow.val == fast.val` | Compare identity (`is`, `===`) |
| The checker throws a null dereference on even-length lists only | The loop tests `fast.next` without testing `fast` | `while fast and fast.next` |
| A workflow bounces between two states forever, retrying with backoff | The transition function has a two-state cycle for some input; a test that runs Floyd over the transition function reproduces it in O(1) memory | Fix the transition; in production add a transition cap that fails the workflow loudly |
| A home-made generator or "next shard" function produces repeats far too soon | Short period: Brent over the generator reports `C` in a test (`(6x + 2) mod 16` collapses to a fixed point after four steps) | Use a generator with a proven period; test the period of anything home-made |
| `IndexError` or a wrong duplicate from the array-as-function trick | The array violated the precondition (a 0, or a value above `n`), so index 0 sat on a cycle or an index fell outside the array | Validate the precondition before applying the reduction |
| A serialiser runs out of memory on a large cyclic object graph | The visited set is proportional to the graph; Floyd does not apply because nodes have many successors | Depth or size caps, or a DFS with a visited set of ids ([Connectivity and cycles](/learn/data-structures/graphs/connectivity-and-cycles)) |

## Interviewer follow-ups

**Q: "Would speeds 1 and 3 work?"**

Model answer: they still meet, because the pointers coincide whenever `(s − 1) t ≡ 0 (mod C)` and `t` a multiple of `C` satisfies that; but the first meeting can come earlier, at a `t` that is not a multiple of `C` (with `C = 4` and no tail, speed 3 meets at `t = 2`), and then walking a head pointer and the meeting pointer together does not land on the cycle start. Speed 2 makes the meeting time a multiple of `C`, which is what phase 2 relies on. Common wrong answer: "faster is better, it meets sooner" without noticing phase 2 breaks.

**Q: "Why identity and not value?"**

Model answer: a list can hold duplicate values, so equal values do not mean the same node; `is` in Python compares addresses and `===` on JavaScript objects compares references. Common wrong answer: comparing `id(slow.val)`, which is equal for distinct nodes holding the same small integer because CPython shares those objects.

**Q: "The values are in `0..n − 1` instead of `1..n`. Does the trick still work?"**

Model answer: index 0 may now sit on the cycle, so starting there can return the wrong node. Start from an index with no incoming edge instead: index `n` (the array has `n + 1` entries and no value equals `n`), which is guaranteed to be in the tail. Common wrong answer: starting from 0 regardless, which passes most tests and fails on `[0, 1, 1]`-style inputs.

**Q: "Now the structure is a general directed graph, not a list."**

Model answer: Floyd needs a single successor per node; with out-degree above one there is no "the next node", so use depth-first search with three colours (white, grey, black) and report a back edge to a grey node, O(V + E) time and O(V) memory. Common wrong answer: running fast and slow pointers along "the first edge" of each node, which finds only cycles along that one path.

**Q: "You found a cycle in a production LRU list. Do you repair it in place?"**

Model answer: find the start and length, set the last cycle node's `next` to null, and treat that as a recovery step for the incident; then find the writer that created it, because the same race will do it again. Common wrong answer: shipping the repair as the fix.

## What mid-level engineers get wrong

- **Giving Floyd first.** The hash set is the correct baseline; skipping it reads as memorisation. Say it, cost it (about 66 MB per million CPython node ids), then improve on it.
- **Comparing values.** False positives on any list with repeated values.
- **Half the loop condition.** `while fast.next` alone crashes on even-length lists; `while fast` alone crashes on odd-length ones.
- **Hand-waving the proof.** "Fast will catch slow" is not the proof; the proof is `t ≡ 0 (mod C)` for meeting and `(−F) mod C` for the cycle start. Interviewers ask for the second step because most candidates cannot derive it.
- **Reaching for Floyd on a general graph.** With more than one successor per node there is no iterated function; use DFS.
- **Applying the array trick without checking the precondition.** A 0 in the array, or a value above `n`, silently breaks the reduction.

## Exercises

```exercise
id: find-duplicate
title: Find the duplicate with Floyd's algorithm
prompt: |
  `nums` has `n + 1` integers, each in the range `1..n`, and exactly one
  value appears two or more times. Return that value using O(1) extra
  space without modifying the array, by treating `i -> nums[i]` as a
  linked list starting at index 0 and finding the start of its cycle.
languages: [python, javascript]
entry: find_duplicate
starter:
  python: |
    def find_duplicate(nums):
        # your code here
        return -1
  javascript: |
    function find_duplicate(nums) {
      // your code here
      return -1;
    }
tests:
  - args: [[1, 3, 4, 2, 2]]
    expected: 2
  - args: [[3, 1, 3, 4, 2]]
    expected: 3
  - args: [[1, 1]]
    expected: 1
    label: smallest input
  - args: [[2, 2, 2, 2]]
    expected: 2
    label: value repeated many times
  - args: [[1, 4, 6, 3, 2, 5, 6]]
    expected: 6
    hidden: true
  - args: [[4, 3, 1, 4, 2]]
    expected: 4
    hidden: true
hints:
  - "Phase 1: `slow = nums[slow]`, `fast = nums[nums[fast]]` until they are equal (use a do-while shape: step once before comparing)."
  - "Phase 2: reset one pointer to 0 and advance both by one step until they meet; that index value is the duplicate."
```

```exercise
id: is-happy
title: Happy number without a set
prompt: |
  A number is happy if repeatedly replacing it by the sum of the squares of
  its decimal digits eventually reaches 1. Otherwise the process loops
  forever. Return `true`/`True` if `n` is happy. Detect the loop with slow
  and fast pointers over the digit-square-sum function, using no set or
  list of seen values.
languages: [python, javascript]
entry: is_happy
starter:
  python: |
    def is_happy(n):
        # your code here
        return False
  javascript: |
    function is_happy(n) {
      // your code here
      return false;
    }
tests:
  - args: [19]
    expected: true
  - args: [2]
    expected: false
  - args: [1]
    expected: true
    label: already 1
  - args: [7]
    expected: true
  - args: [4]
    expected: false
    hidden: true
    label: start of the unhappy cycle
  - args: [100]
    expected: true
    hidden: true
hints:
  - "Write `step(n)` that sums the squares of the digits. Then `slow = step(slow)`, `fast = step(step(fast))` until `fast == 1` or `slow == fast`."
  - "Return `fast == 1`: if the pointers met at 1 the number is happy; if they met elsewhere it is in the cycle."
```

## Senior signals

- You give the hash-set solution first with its memory cost, then Floyd for O(1) space, and you can prove both the meeting time (`t ≡ 0 mod C`) and the cycle-start step (`(−F) mod C`) without hand-waving.
- You know why speed 2 specifically makes the meeting time a multiple of `C`, and what breaks at speed 3.
- You compare nodes by identity, not value, and can say why `id(node.val)` is wrong.
- You recognise the "`n + 1` values in `1..n`, read-only, O(1) space" phrasing as a functional graph, and you know which precondition makes index 0 a safe start.
- You can run Brent's algorithm by hand, know it reads one pointer per step against Floyd's three, and choose it when `f` is expensive.
- You can name uses beyond lists (happy numbers, generator periods, Pollard's rho, state-machine loops, list-corruption assertions) and know that serialisers and the kernel choose visited sets or hop caps instead, and why.
- You know Floyd does not apply to general graphs and reach for DFS there.

## Check yourself

```quiz
- q: >-
    In Floyd's algorithm, why is it guaranteed that the fast pointer does not "jump over" the slow pointer without landing on it?
  options: ["The cycle length is always even, so a jump of two lands on every node", "The list is finite, so fast must eventually visit every node in the cycle", "The gap between them changes by exactly one node each iteration", "The gap between them shrinks by two nodes each iteration, reaching zero"]
  answer: 2
  explanation: >-
    With speeds 1 and 2 the relative speed is 1, so the distance from slow forward to fast grows by one each iteration and must pass through a multiple of C within C iterations of slow entering the cycle. A gap that changed by two could skip the multiple of C on cycles of even length, and cycles can have any length.
- q: >-
    After the pointers meet, one pointer is reset to the head and both advance one step at a time. They meet at the cycle start because:
  options: ["The cycle length always equals the tail length, so both walks take F steps", "Both pointers move at the same speed, so they are bound to meet somewhere", "slow sits at cycle position (−F) mod C, so F more steps land it on the start", "The first meeting point is always the cycle start, so the walk confirms it"]
  answer: 2
  explanation: >-
    The meeting time is a multiple of C, so slow's position in the cycle is (kC − F) mod C = (−F) mod C; adding F steps gives a multiple of C, the start, on the same step the head pointer arrives there after F steps. Same speed alone does not guarantee meeting: two pointers at different cycle positions moving at equal speed never meet.
- q: >-
    Which of these lets you apply Floyd's algorithm to an array of n + 1 integers in the range 1..n?
  options: ["Sort the array first, so equal values become adjacent nodes in the chain", "Link index i to nums[i]; the duplicate is where slow and fast first meet", "Treat index i as a node whose next is nums[i]; the duplicate starts the cycle", "Use the array as a hash set, negating nums[v] to mark each value v seen"]
  answer: 2
  explanation: >-
    Values in 1..n are valid indices, so i → nums[i] defines a function on a finite set with n + 1 nodes and only n targets; some target has two incoming edges, and that node is where the cycle begins. The first meeting point is somewhere inside the cycle, not necessarily its start, so the second phase is still needed. Sorting and negation both modify the array.
- q: >-
    Which comparison correctly tests whether the two pointers have met in a linked list of node objects?
  options: ["slow is fast, since only identity proves they are the same node", "slow.val == fast.val, since meeting means reaching the same value", "id(slow.val) == id(fast.val), since ids are unique per node", "slow.next is fast.next, since equal successors mean the same node"]
  answer: 0
  explanation: >-
    Two distinct nodes may hold equal values, so value comparison gives false positives, and small ints share one object, so their ids match too. Identity comparison (`is` in Python, `===` on objects in JavaScript) checks that both references point at the same node. Equal successors do not prove it either: the cycle's first node has two predecessors.
- q: >-
    Speeds 1 and 3 are used instead of 1 and 2 on a list with no tail and a cycle of length 4. What happens?
  options: ["The pointers never meet, since a gap that changes by two skips every node", "The pointers meet at the cycle start directly, so the second phase is unnecessary", "The pointers meet only after the fast one has lapped the cycle four times", "The pointers meet after two iterations, but the cycle-start walk then fails"]
  answer: 3
  explanation: >-
    With speed 3 the pointers coincide when 2t is a multiple of 4, so at t = 2 they meet at cycle position 2. Because 2 is not a multiple of the cycle length, slow is not at (−F) mod C, and advancing a head pointer and slow together never lands both on the start. Speed 2 guarantees the meeting time is a multiple of C, which is what the second phase needs.
- q: >-
    You need to know the period of a deterministic state machine whose step function is expensive and whose states are large. The most appropriate method is:
  options: ["Store every state in a hash set until the first repeated state appears", "Serialise every state to disk and compare checksums of each new one", "Run Brent's cycle detection over the step function, one evaluation per step", "Run for a fixed large number of steps, then scan the log for repeats"]
  answer: 2
  explanation: >-
    Cycle detection over an iterated function stores O(1) states. Brent's variant evaluates the step function once per step, against three for Floyd, and reports the cycle length directly. A hash set costs memory proportional to the tail plus cycle length and requires hashing large states; a fixed run may stop before the cycle closes.
```
