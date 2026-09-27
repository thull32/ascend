---
slug: recursion-design
title: "Recursion design: base cases, trust, and the call stack"
description: How to design a recursive function you can prove terminates, what each call costs on the stack, when to convert it to a loop, and why tail calls will not save you in Python or JavaScript.
minutes: 40
difficulty: medium
tags: [recursion, call-stack, induction, tail-calls, iteration]
problems: [pow-x-n]
---
You have a function that needs to process a tree, a nested JSON document, a directory hierarchy, or a search space of choices. The structure is self-similar: a directory contains directories, a JSON object contains JSON objects, a decision leads to a smaller decision. Writing a loop over that shape means managing your own stack of "where was I". Recursion lets the language manage it for you: the function calls itself on the smaller piece and the runtime remembers where to resume.

That convenience has a price and a discipline. The price is a stack frame per call, and the runtime will kill your process when it runs out of them. The discipline is that a recursive function is only correct if you can state, without running it, why every call is smaller than the last and what the smallest one returns. Engineers who skip the discipline write functions that work on the example and blow the stack in production on the first deeply nested input.

## The three-part contract

Every recursive function you write should be readable as three sentences.

1. **Base case.** For the smallest inputs, return the answer directly. No recursion.
2. **Reduction.** For any other input, produce one or more *strictly smaller* inputs by the same measure (shorter list, smaller number, subtree, fewer remaining choices).
3. **Combination.** Assume the recursive calls return correct answers for their smaller inputs and combine them into the answer for this input.

```python
def total_size(node):
    if node.is_file():                      # 1. base case
        return node.size
    return sum(total_size(c) for c in node.children)   # 2 + 3
```

The sentence for part 3 is "*assuming* `total_size(c)` is correct for each child, the directory's total is their sum". You do not trace into the child call. You trust it. That trust is mathematical induction, and it is the single habit that separates people who write recursion fluently from people who mentally simulate three levels of calls and get lost.

Two things must be true for the trust to be justified:

- The measure strictly decreases on every recursive call (children are strictly smaller subtrees than the parent). If any call is on an input that is not smaller, you have infinite recursion. The classic bug is `f(n)` calling `f(n)` when `n` is already 0, or a graph walk that revisits a node without a visited set.
- Every decreasing chain eventually hits a base case. A function on integers that recurses on `n - 2` with a base case only at `n == 0` never terminates for odd `n`; you need `n <= 1` or two base cases.

Watch the shape of this on the simplest possible function. Each frame waits for the one below it, and the answers are combined on the way back up.

```viz
{"type": "recursion", "algorithm": "factorial", "n": 5,
 "title": "factorial(5): five frames go down, five multiplications come back up"}
```

## Reading a recurrence off the code

Once you trust the calls, complexity analysis is a recurrence, and you can read it straight off the function.

```python
def power(x, n):             # x^n for n >= 0
    if n == 0:
        return 1
    half = power(x, n // 2)  # one call on n/2
    return half * half if n % 2 == 0 else half * half * x
```

One recursive call on an input of half the size plus constant work: $T(n) = T(n/2) + O(1) = O(\log n)$. Compare with the version that writes `power(x, n // 2) * power(x, n // 2)`: two calls on half the size, $T(n) = 2T(n/2) + O(1) = O(n)$, which is no better than a loop. Same maths, one repeated call, exponentially more work. Storing the result in `half` is the whole difference; you will meet this idea again as memoisation in [From backtracking to memoisation](/learn/algorithms/recursion-backtracking/from-backtracking-to-memoisation).

Trace `power(2, 10)` with the good version:

| call | n | returns |
|---|---|---|
| `power(2, 10)` | 10 | `32 * 32` = 1024 |
| `power(2, 5)` | 5 | `4 * 4 * 2` = 32 |
| `power(2, 2)` | 2 | `2 * 2` = 4 |
| `power(2, 1)` | 1 | `1 * 1 * 2` = 2 |
| `power(2, 0)` | 0 | 1 |

Five frames for $n = 10$; for $n = 10^{18}$ it would be about 60. This is the algorithm behind modular exponentiation in RSA and Diffie-Hellman, and it is [Pow(x, n)](/practice/pow-x-n) in interview form, where the follow-up is negative exponents and the overflow behaviour of `n = -2^31`.

Binary search is the same recurrence with a different reduction: discard the half that cannot contain the target.

```viz
{"type": "recursion", "algorithm": "binary-search-recursive", "values": [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], "target": 23}
```

The general rule from [Recurrences and the master theorem](/learn/foundations/complexity/recurrences-and-master-theorem): count the calls per level, the size reduction per call, and the non-recursive work per call, and the recurrence writes itself.

## What a call actually costs

Each call pushes a frame onto the call stack: the return address, the arguments, the local variables, and in interpreted languages a fair amount of bookkeeping. The frame lives until the call returns. Recursion depth is therefore memory, and the memory is a fixed-size region that the runtime reserves at thread start.

```viz
{"type": "memory", "algorithm": "call-stack",
 "title": "Frames pushed on call, popped on return; depth is live memory"}
```

Orders of magnitude worth knowing:

| Runtime | Default recursion limit | What happens when you exceed it |
|---|---|---|
| CPython | 1,000 frames (`sys.getrecursionlimit()`); raising it helps until the C stack (~8 MB on Linux main thread) runs out at tens of thousands | `RecursionError`, catchable |
| Node / V8 | Depends on frame size; roughly 10,000 frames for small functions on the default ~1 MB stack | `RangeError: Maximum call stack size exceeded`, catchable |
| Java | Depends on frame size; typically 10,000 to 20,000 frames on the default 512 KB to 1 MB thread stack | `StackOverflowError` |
| Go | Goroutine stacks grow dynamically from a few KB up to 1 GB by default | Very deep recursion just works until 1 GB |
| Rust / C | Main thread ~8 MB on Linux, spawned threads often 2 MB | Segfault or abort; not catchable |

The consequence for design: a recursive function whose depth is proportional to the *input size* (a linked-list walk, a DFS on a path graph, a naive `sum(list)` that recurses on the tail) is a latent crash. A function whose depth is proportional to $\log n$ (binary search, balanced-tree traversal, `power`) is safe for any input you can store. Depth proportional to the *height of a tree* is safe when the tree is balanced and a crash when it degenerates; that is why production tree code either balances the tree or uses an explicit stack.

Recursion also costs time per call: in CPython a function call is on the order of 100 ns, in V8 after JIT it is a few nanoseconds. For $10^6$ calls that is 100 ms versus a few ms. It rarely matters in interviews and occasionally matters in a hot loop.

## Converting recursion to iteration

Any recursive function can be rewritten with an explicit stack, because the call stack *is* a stack. The rewrite is mechanical when you see what each frame stores.

Recursive in-order traversal of a binary tree:

```python
def inorder(node, out):
    if node is None:
        return
    inorder(node.left, out)
    out.append(node.val)
    inorder(node.right, out)
```

Each frame remembers "which node am I on, and have I finished the left subtree yet?" The iterative version stores exactly that.

```python
def inorder_iter(root):
    out, stack, node = [], [], root
    while stack or node:
        while node:                 # go left as far as possible, remembering the path
            stack.append(node)
            node = node.left
        node = stack.pop()          # leftmost unvisited node
        out.append(node.val)
        node = node.right           # now do its right subtree
    return out
```

```javascript
function inorderIter(root) {
  const out = [], stack = [];
  let node = root;
  while (stack.length || node) {
    while (node) { stack.push(node); node = node.left; }
    node = stack.pop();
    out.push(node.val);
    node = node.right;
  }
  return out;
}
```

The explicit stack lives on the heap, so its size is bounded by memory rather than by the thread stack; a tree a million nodes deep is fine. This is the standard fix when a recursive DFS overflows: same algorithm, same complexity, frames moved to a `list`. [Stack applications](/learn/data-structures/stacks-queues/stack-applications) covers the general recipe, including the trick of pushing a "post-visit" marker to simulate work that happens after the recursive call returns.

For the special case where the recursive call is the *last* thing the function does, you do not need a stack at all.

## Tail calls and accumulators

A call is a **tail call** when the function returns the call's result unchanged. Nothing remains to be done in the caller's frame, so a compiler could reuse that frame for the callee: constant stack space for any depth. Scheme requires this. Rust, C and Go compilers do it opportunistically at high optimisation levels. **CPython never does** (Guido rejected it on purpose: it destroys tracebacks) and **V8 does not** (it shipped behind a flag and was removed; only Safari's JavaScriptCore implements the ES2015 proper-tail-call spec). Assume your recursion depth is real.

What you *can* do is write the function in tail form with an accumulator, because that form is trivially convertible to a loop.

```python
def sum_list(xs):                 # not tail-recursive: the + happens after the call
    if not xs:
        return 0
    return xs[0] + sum_list(xs[1:])

def sum_list_acc(xs, acc=0):      # tail-recursive: nothing left to do after the call
    if not xs:
        return acc
    return sum_list_acc(xs[1:], acc + xs[0])

def sum_list_loop(xs):            # the same accumulator, as the loop it always was
    acc = 0
    for x in xs:
        acc += x
    return acc
```

The accumulator carries the partial answer *down* the calls instead of building it *up* on the return path. Once every piece of state is in the arguments, the loop is `while not base_case: args = next_args`. Both `sum_list` versions still blow the stack in Python on a 2,000-element list; the loop does not. Recognising which of your recursive functions are already in tail form tells you which ones convert to loops for free.

The first version also copies the list on every call (`xs[1:]`), making it $O(n^2)$ time in a way that is easy to miss. Pass an index instead of a slice.

## Two harder shapes

**Multiple recursion.** Towers of Hanoi makes two recursive calls per frame; the call tree has $2^n - 1$ nodes and the function makes exactly that many moves, which is optimal. The depth is only $n$, so the stack is fine; the *time* is exponential because the tree is wide, not deep. Keep depth and total call count separate in your head: depth is the stack cost, call count is the time cost.

```viz
{"type": "recursion", "algorithm": "hanoi", "n": 3,
 "caption": "Depth 3, but 7 moves: the call tree is a full binary tree"}
```

**Mutual recursion.** A recursive-descent parser has `parse_expr` calling `parse_term` calling `parse_factor` calling `parse_expr` for a parenthesised sub-expression. No single function calls itself, but the cycle of calls is still recursion, the measure that decreases is "characters remaining", and the depth is the nesting depth of the input. This is why JSON parsers in every language have a nesting limit (Python's is the recursion limit; many C parsers hard-code a few hundred): an attacker can send `[[[[[[...` and crash a naive parser with a stack overflow. Real parsers that must accept arbitrary nesting use an explicit stack.

## Recursion checklist for interviews

When you reach for recursion in a coding round, say these out loud, in order:

1. "The base case is …" and it must be an input you can name (`n == 0`, `node is None`, `start == len(s)`).
2. "Each call reduces …" and name the measure.
3. "Assuming the calls return correct results, I combine them by …".
4. "The depth is … so the stack is …" and if the depth is $O(n)$ for $n$ up to $10^5$, say you would convert to an explicit stack or a loop in production.
5. "The recurrence is … so the time is …".

Say step 4 unprompted. Interviewers at companies that run large services want to hear that you know the difference between a solution that is correct and one that survives a bad input.

## Exercises

```exercise
id: modular-power
title: Fast exponentiation by halving
prompt: |
  Implement `mod_pow(base, exp, mod)` returning `base ** exp % mod` for
  integers `base >= 0`, `exp >= 0`, `mod >= 1`, using the halving recursion
  (`x^n = (x^(n/2))^2`, times `x` when `n` is odd). Take the remainder after
  every multiplication so intermediate values stay small.

  The recursion depth must be O(log exp): do not make two recursive calls
  per frame, and do not loop `exp` times.
languages: [python, javascript]
entry: mod_pow
starter:
  python: |
    def mod_pow(base, exp, mod):
        # base case, then one recursive call on exp // 2
        return 0
  javascript: |
    function mod_pow(base, exp, mod) {
      // base case, then one recursive call on Math.floor(exp / 2)
      return 0;
    }
tests:
  - args: [2, 10, 1000]
    expected: 24
  - args: [3, 13, 1000]
    expected: 323
  - args: [5, 3, 13]
    expected: 8
  - args: [7, 0, 5]
    expected: 1
    label: zero exponent
  - args: [10, 18, 7]
    expected: 1
    label: large exponent, tiny modulus
  - args: [2, 30, 1000000007]
    expected: 73741817
    hidden: true
  - args: [3, 1, 1]
    expected: 0
    hidden: true
    label: modulus 1
hints:
  - "Base case: exp == 0 returns 1 % mod (not 1, because mod may be 1)."
  - "Store the recursive result in a variable and square it; calling the function twice makes the work O(exp)."
  - "When exp is odd, multiply by base once more, then take the remainder."
```

```exercise
id: flatten-nested
title: Flatten a nested list
prompt: |
  Implement `flatten(nested)`: `nested` is a list whose elements are either
  integers or further nested lists, to any depth. Return a flat list of the
  integers in left-to-right order.

  Design it as a recursion on structure: an integer is a base case, a list
  is a reduction to its elements.
languages: [python, javascript]
entry: flatten
starter:
  python: |
    def flatten(nested):
        # your code here
        return []
  javascript: |
    function flatten(nested) {
      // Array.isArray(x) tells you whether x is a list
      return [];
    }
tests:
  - args: [[1, [2, [3, 4]], 5]]
    expected: [1, 2, 3, 4, 5]
  - args: [[[1, 2], [3], []]]
    expected: [1, 2, 3]
    label: empty inner list
  - args: [[]]
    expected: []
    label: empty input
  - args: [[[[[[7]]]]]]
    expected: [7]
    hidden: true
    label: deep nesting
  - args: [[0, [], [[], [0]], 0]]
    expected: [0, 0, 0]
    hidden: true
hints:
  - "For each element: if it is a list, extend the result with flatten(element); otherwise append it."
  - "An accumulator parameter (or a closure over the output list) avoids building and concatenating many small lists."
```

## Senior signals

- You explain a recursive function by its **base case, decreasing measure and inductive step**, and you never trace more than one level to justify it.
- You state the **recursion depth** separately from the **call count**, and you know which one costs stack and which one costs time.
- You know the default stack limits of your runtime to an order of magnitude and that Python and V8 **do not eliminate tail calls**, so any depth proportional to input size is a crash waiting for a bad input.
- You can convert a recursive DFS to an **explicit stack** on demand, and you say when you would (deep trees, untrusted nesting, linked structures).
- You spot the **repeated recursive call** (`f(n/2) * f(n/2)`) that turns $O(\log n)$ into $O(n)$, and the **slice-per-call** that turns $O(n)$ into $O(n^2)$.
- You know that recursive-descent parsers have nesting limits for a reason, and you would not accept untrusted JSON with a naive recursive parser.

## Check yourself

```quiz
- q: >-
    A function computes the length of a linked list recursively: return 0 for None, else 1 + length(node.next). In CPython, on a list of 5,000 nodes it will:
  options: ["Return a wrong answer due to integer overflow", "Return 5000, since 8 MB of stack holds 5,000 frames", "Segfault, since CPython cannot catch stack overflow", "Raise RecursionError at about 1,000 frames deep"]
  answer: 3
  explanation: >-
    Depth equals list length, and CPython's default recursion limit is about 1,000 frames, so it raises a catchable RecursionError long before the C stack would run out. The algorithm is correct but the depth is proportional to input size, which is exactly the shape that needs a loop or explicit stack.
- q: >-
    Which change turns power(x, n) = power(x, n//2) * power(x, n//2) * (x if n odd) from O(n) to O(log n)?
  options: ["Calling it once and squaring the stored result", "Adding a second base case to stop at n == 1", "Replacing the recursion with an explicit stack", "Rewriting it in tail form with an accumulator"]
  answer: 0
  explanation: >-
    Two calls per frame on n/2 gives T(n) = 2T(n/2) + O(1) = O(n). One stored call gives T(n) = T(n/2) + O(1) = O(log n). An explicit stack or tail form changes where frames live, not how many calls are made, and an extra base case trims one level at most.
- q: >-
    Why does writing a function in tail-recursive accumulator form NOT reduce its stack usage in Python or Node?
  options: ["Tail form only helps functions with one argument", "The accumulator argument makes each frame bigger", "They eliminate tail calls only once the JIT warms up", "Neither runtime reuses the frame for a tail call"]
  answer: 3
  explanation: >-
    Tail-call elimination is a runtime optimisation that reuses the frame, so every call no longer needs its own. CPython and V8 deliberately do not do it at all, JIT or not. The value of tail form is that it converts mechanically to a loop, which you then write yourself.
- q: >-
    Towers of Hanoi with n = 20 discs makes about a million moves via two recursive calls per frame. The maximum stack depth is:
  options: ["About a million, one per move", "About 40, two per disc", "About 20, one per disc", "About 400, n² for n discs"]
  answer: 2
  explanation: >-
    Depth is the longest chain of nested calls, which is n. The two calls per frame run one after the other, so they widen the tree rather than deepen it, and the million moves are the total number of calls in that tree. Time is exponential, stack is linear in n.
- q: >-
    A recursive-descent JSON parser in a web service crashes on some requests with a stack overflow. The root cause is most likely:
  options: ["A missing base case for the empty document", "Malformed UTF-8 bytes inside long string values", "Very long flat arrays with millions of elements", "Deeply nested arrays or objects in untrusted input"]
  answer: 3
  explanation: >-
    Mutual recursion between parse functions has depth equal to nesting depth of the input, and attacker-controlled input can nest arbitrarily; the fix is a nesting limit or an explicit stack. A long flat array is parsed by a loop, so its length does not add depth. A missing base case would fail on every input, not some.
```
