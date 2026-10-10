---
slug: recursion-design
title: "Recursion design: base cases, trust, and the call stack"
description: How to design a recursive function you can prove terminates, what each call costs on the stack, when to convert it to a loop, and why tail calls will not save you in Python or JavaScript.
minutes: 50
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
{"type": "recursion", "algorithm": "factorial", "n": 5, "base": 0,
 "title": "factorial(5): six frames go down, five multiplications come back up"}
```

## Trace: factorial(4) frame by frame

Take `fact(n)` with base case `fact(0) = 1` and step `n * fact(n - 1)`. Each row is one event. The stack column lists the live frames from bottom to top, and what each one is waiting for.

| event | live frames (bottom to top) | value returned |
|---|---|---|
| call `fact(4)` | `fact(4)` waiting on `4 * ?` | |
| call `fact(3)` | `fact(4)`, `fact(3)` waiting on `3 * ?` | |
| call `fact(2)` | `fact(4)`, `fact(3)`, `fact(2)` waiting on `2 * ?` | |
| call `fact(1)` | `fact(4)`, `fact(3)`, `fact(2)`, `fact(1)` waiting on `1 * ?` | |
| call `fact(0)` | five frames; base case, nothing pending | `1` |
| return into `fact(1)` | four frames | `1 * 1 = 1` |
| return into `fact(2)` | three frames | `2 * 1 = 2` |
| return into `fact(3)` | two frames | `3 * 2 = 6` |
| return into `fact(4)` | one frame | `4 * 6 = 24` |

Five pushes, five pops, peak depth five. Every multiplication happens on the way *up*, which is why the frames must stay alive: the only thing `fact(3)` stores between its call and its return is "multiply whatever comes back by 3". Hold on to that observation; the explicit-stack and tail-call sections below are both about what happens when that pending work is removed.

## The correctness argument

The argument is induction on the measure, and it is three lines once you name the measure.

- **Claim $P(m)$:** for every input of measure $m$, the function returns the answer the specification demands.
- **Base:** $P(0)$ holds because the base case returns that answer directly. Check it against the specification, not against the recursive case; `fact(0) = 1` is a fact about factorials, not about the code.
- **Step:** assume $P(k)$ for every $k < m$. A call on measure $m$ recurses only on measures below $m$ (the reduction), so those calls return correct answers by assumption, and the combination turns correct sub-answers into the correct answer for $m$.

For `total_size` the measure is subtree height (children are strictly shorter), the base is a file, and the step is "a directory's size is the sum of its children's sizes". For `power` below the measure is $n$ and the step is the identity $x^n = (x^{\lfloor n/2 \rfloor})^2 \cdot x^{n \bmod 2}$, which you can verify without reading the code. What you read off at the end is $P(m)$ for the measure of the original input.

Termination is the same argument using only the measure: every recursive call strictly decreases a non-negative integer, and a strictly decreasing sequence of non-negative integers is finite. This is why the measure must be a natural number (or something you can map onto one), not a feeling that "the input gets simpler". A graph walk with no visited set has no decreasing measure, and that is precisely the case that loops forever. [Invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning) runs the same three lines for loops; the recursive and iterative versions of one algorithm share the invariant.

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
{"type": "recursion", "algorithm": "binary-search-recursive", "values": [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], "target": 23,
 "title": "Recursive binary search for 23: one call per level",
 "caption": "Each call looks at the middle of its range and recurses into the one half that can still hold 23. Ten values take three calls, and the answer comes back up unchanged."}
```

The general rule from [Recurrences and the master theorem](/learn/foundations/complexity/recurrences-and-master-theorem): count the calls per level, the size reduction per call, and the non-recursive work per call, and the recurrence writes itself.

## What a call actually costs

Each call pushes a frame: the return address, the arguments, the local variables, and in interpreted languages a fair amount of bookkeeping. The frame lives until the call returns. Recursion depth is therefore memory, and in most runtimes that memory is a fixed-size region reserved at thread start.

```viz
{"type": "memory", "algorithm": "call-stack", "n": 4, "base": 0, "name": "fact",
 "title": "Frames pushed on call, popped on return; depth is live memory"}
```

Numbers to carry around, with what they depend on:

| Runtime | Default limit or stack | Depth for a small function | On overflow |
|---|---|---|---|
| CPython | `sys.getrecursionlimit()` returns 1,000 | 1,000 Python frames; `sys.setrecursionlimit` raises it (what that means depends on the version, see below) | `RecursionError`, catchable |
| Node / V8 | about 1 MB (`--stack-size`, given in KB) | measured on Node 24: 12,546 frames for a zero-argument function, 5,702 with four arguments and four locals | `RangeError: Maximum call stack size exceeded`, catchable |
| JVM | `-Xss`: 1 MB on Linux and macOS x64, 2 MB on their Aarch64 builds (JDK 21) | order of $10^4$ frames | `StackOverflowError`, catchable |
| Go | goroutine stacks start at a few KB and grow by copying, up to 1 GB (10⁹ bytes) on 64-bit | bounded by memory | `fatal error: stack overflow` at the cap |
| Rust / C on Linux | main thread 8 MB (`ulimit -s`); Rust spawned threads 2 MB unless set | order of $10^4$ to $10^5$ frames depending on frame size | guard-page fault: `SIGSEGV`; Rust prints "thread has overflowed its stack" |

The consequence for design: a recursive function whose depth is proportional to the *input size* (a linked-list walk, a DFS on a path graph, a `sum` that recurses on the tail) is a latent crash. A function whose depth is proportional to $\log n$ (binary search, balanced-tree traversal, `power`) is safe for any input you can store. Depth proportional to the *height of a tree* is safe when the tree is balanced and a crash when it degenerates; that is why production tree code either balances the tree or uses an explicit stack.

Recursion also costs time per call. In CPython a call is on the order of 10 to 100 ns depending on the version and the argument count (a one-argument call measured about 10 ns on 3.14 here; 3.11's release notes report a 1.7× speedup on simple recursive functions such as factorial, so 3.10 and earlier are slower); in V8 after JIT it is a few nanoseconds. For $10^6$ calls that is tens of milliseconds versus a few. It rarely matters in interviews and occasionally matters in a hot loop.

## Under the hood: where the frames live

### CPython

Before 3.11, every Python-to-Python call re-entered the C function that runs the bytecode loop, so each Python frame also consumed a C stack frame. That is why the recursion limit exists: it protects the interpreter thread's C stack, and a limit raised into the tens of thousands could overrun that stack and segfault. 3.11 changed the call path: when Python code calls Python code, the interpreter pushes a new frame and jumps to it inside the same C loop, so pure-Python recursion no longer consumes C stack. Frames are carved out of per-thread heap chunks (16 KiB each), one after another, and a frame costs its header plus 8 bytes per local, cell and evaluation-stack slot: order of 100 to 300 bytes for a small function. A four-argument function with one local measured about 240 bytes of resident memory per frame on 3.14 here, chunk slack included; the figure depends on the number of locals and the version.

3.12 then separated the two limits. `sys.setrecursionlimit` bounds Python frames only, while C code that calls back into Python (the `json` decoder, `repr` of nested lists, `__eq__` on nested containers) is protected by its own C recursion guard that Python code cannot raise. On 3.14 here, a pure-Python recursion 100,000 deep runs with the limit set to 200,000, while `json.loads` on 100,000 nested brackets raises `RecursionError` at the same limit. The mechanism behind the C guard has been reworked more than once since 3.12, so check the "What's New" for your minor version before relying on a specific number.

The 1,000 default is a sanity check, not a memory limit: a thousand frames is a few hundred KB. Raising it is legitimate when the depth is bounded and known (a recursive walk over your own configuration files). It is the wrong tool when depth is proportional to untrusted input, because it moves the crash threshold rather than removing it.

### V8, JVM, Go, Rust

V8's default stack limit is slightly under 1 MB (984 KB on 64-bit builds, chosen to fit Windows' 1 MB main-thread stack) and its frames are native-sized, so the depth you get depends on how many arguments and locals each frame holds (the 12,546 versus 5,702 measurement above). Overflow throws a catchable `RangeError`; the handler runs on a full stack, so it must not recurse further.

A JVM thread reserves its stack at creation (`-Xss`), and `StackOverflowError` is thrown when a guard page at the end is touched. Go goroutines start with a stack of a few KB; when a function prologue finds the next frame will not fit, the runtime allocates a stack twice the size, copies the old one across and fixes up pointers, up to a 1 GB cap on 64-bit. That copying is what lets Go afford a million goroutines with tiny initial stacks. Rust and C get whatever the OS gives the thread: 8 MB for the main thread on a typical Linux (`ulimit -s`), 2 MB for Rust's spawned threads unless you ask for more, and overflow is a segmentation fault from the guard page rather than an exception. [Stack, heap and the call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame layout.

### Tail calls

Guido van Rossum [rejected tail-call elimination for CPython in 2009](http://neopythonic.blogspot.com/2009/04/tail-recursion-elimination.html) on four stated grounds: it destroys tracebacks (the eliminated frames are gone when an exception fires), code would come to depend on it and then fail on Python implementations without it, sequences and loops rather than recursion are the foundation he wants the language built on, and dynamic name binding means the compiler cannot know that `return f(x)` calls the function it is in. ES2015 specified proper tail calls in strict mode; JavaScriptCore (Safari) [implemented them in 2016](https://webkit.org/blog/6240/ecmascript-6-proper-tail-calls-in-webkit/) and ships them, V8 implemented them behind flags and then removed the flags, and SpiderMonkey's tracking bug is still open, so outside Safari the feature is effectively dead. Python 3.14's "tail-calling interpreter" build option is unrelated: it is a way of dispatching bytecode inside the C interpreter, not tail-call elimination for your functions.

## Converting recursion to iteration

Any recursive function can be rewritten with an explicit stack, because the call stack *is* a stack. The rewrite is mechanical once you see what each frame stores. Take the `fact(4)` trace: each frame stored one pending multiplication. Here is the same idea on a list sum, with the stack written out per iteration.

```python
def sum_rec(xs, i=0):
    if i == len(xs):
        return 0
    return xs[i] + sum_rec(xs, i + 1)      # xs[i] is pending until the call returns

def sum_stack(xs):
    stack, acc, i = [], 0, 0
    while i < len(xs):                       # descend: push what each frame would remember
        stack.append(xs[i]); i += 1
    while stack:                             # unwind: combine in return order
        acc += stack.pop()
    return acc
```

| iteration | phase | stack | acc |
|---|---|---|---|
| 1 | push `xs[0]` | `[3]` | 0 |
| 2 | push `xs[1]` | `[3, 1]` | 0 |
| 3 | push `xs[2]` | `[3, 1, 4]` | 0 |
| 4 | push `xs[3]` | `[3, 1, 4, 1]` | 0 |
| 5 | base case (`i == 4`) | `[3, 1, 4, 1]` | 0 |
| 6 | pop, add | `[3, 1, 4]` | 1 |
| 7 | pop, add | `[3, 1]` | 5 |
| 8 | pop, add | `[3]` | 6 |
| 9 | pop, add | `[]` | 9 |

The two loops mirror the recursive trace line for line: a push per call, a pop per return, and the pending `xs[i] +` becomes a value sitting on the stack. Addition is commutative, so this particular stack collapses into the accumulator loop in the next section. When the combination is not commutative (building a string, an in-order traversal), the pop order is the return order, and the stack must stay.

Recursive in-order traversal of a binary tree is the case people are asked to convert most often:

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

The explicit stack lives on the heap, so its size is bounded by memory rather than by the thread stack; a tree a million nodes deep is fine. This is the standard fix when a recursive DFS overflows: same algorithm, same complexity, frames moved to a `list`. [Stack applications](/learn/data-structures/stacks-queues/stack-applications) covers the general recipe, including pushing a "post-visit" marker to simulate work that happens after the recursive call returns, and [Tree recursion patterns](/learn/data-structures/trees/tree-recursion-patterns) applies it to the traversals.

## Tail calls and accumulators

A call is a **tail call** when the function returns the call's result unchanged. Nothing remains to be done in the caller's frame, so a compiler could reuse that frame for the callee: constant stack space for any depth. Scheme requires this. Rust and C compilers do it opportunistically at higher optimisation levels (LLVM's and GCC's sibling-call optimisation), with no guarantee. CPython never does and V8 does not, for the reasons above. Assume your recursion depth is real.

What you *can* do is write the function in tail form with an accumulator, because that form converts mechanically to a loop.

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

The accumulator carries the partial answer *down* the calls instead of building it *up* on the return path. Once every piece of state is in the arguments, the loop is `while not base_case: args = next_args`. Both recursive versions still raise `RecursionError` in Python on a 2,000-element list; the loop does not. Recognising which of your recursive functions are already in tail form tells you which ones convert to loops for free.

The first two versions also copy the list on every call (`xs[1:]`), making them $O(n^2)$ time in a way that is easy to miss: on $10^4$ elements that is about $5 \times 10^7$ element copies. Pass an index instead of a slice.

## Two harder shapes

**Multiple recursion.** Towers of Hanoi makes two recursive calls per frame; the call tree has $2^n - 1$ nodes and the function makes exactly that many moves, which is optimal. The depth is only $n$, so the stack is fine; the *time* is exponential because the tree is wide, not deep. Keep depth and total call count separate in your head: depth is the stack cost, call count is the time cost.

```viz
{"type": "recursion", "algorithm": "hanoi", "n": 3,
 "title": "Towers of Hanoi with 3 discs: shallow but wide",
 "caption": "Depth 3, but 7 moves: the call tree is a full binary tree"}
```

**Mutual recursion.** A recursive-descent parser has `parse_expr` calling `parse_term` calling `parse_factor` calling `parse_expr` for a parenthesised sub-expression. No single function calls itself, but the cycle of calls is still recursion, the measure that decreases is "characters remaining", and the depth is the nesting depth of the input. This is why JSON parsers in every language have a nesting limit (CPython's `json` module stops at the C recursion guard; C libraries hard-code limits in the low thousands, 1,000 levels in cJSON and 2,048 in Jansson): an attacker can send `[[[[[[...` and crash a naive parser with a stack overflow. Real parsers that must accept arbitrary nesting use an explicit stack.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| `RecursionError` (Python), `RangeError: Maximum call stack size exceeded` (Node), `StackOverflowError` (JVM) or a bare segfault (C, Rust) on one input while every test passes | Depth is proportional to input size: a linked-list walk, a DFS on a path-shaped graph, a `sum(xs[1:])`-style recursion, a degenerate tree. Reproduce with a synthetic input ten times larger than the largest test | Rewrite in tail form as a loop, or move the frames to an explicit stack; keep recursion only where depth is $O(\log n)$ or a known small bound. Last resort: run the work in a thread created after `threading.stack_size(256 * 1024 * 1024)` and call `sys.setrecursionlimit(10**6)` inside it (500,000 frames ran on 3.14 here). It is a last resort because it moves the cliff rather than removing it, and every frame stays resident |
| A service crashes on specific request bodies; the bodies are `[[[[...` thousands deep | Mutual recursion in a parser, depth driven by untrusted nesting | A nesting limit checked at parse time, or an iterative parser; never a raised limit |
| An $O(n)$ recursion takes seconds at $n = 10^4$ | `xs[1:]` copies on every call: $n$ calls times an $O(n)$ copy | Pass an index, never a slice |
| Exponential time with a recurrence that reads as $O(\log n)$ | The same recursive call appears twice in one expression | Store the result once; or memoise (next lesson) |
| The second top-level call returns accumulated or stale results | A mutable default used as an accumulator (`def go(xs, acc=[])`) persists across calls | Create the accumulator inside the outer function, or default to `None` and initialise |

## Recursion, explicit stack, or loop

| Axis | Recursion | Explicit stack | Loop with accumulator |
|---|---|---|---|
| Stack usage | one runtime frame per level; bounded by the thread stack or recursion limit | one heap entry per level; bounded by memory | $O(1)$ |
| Applies to | any shape | any shape; post-order work needs a marker entry | tail-form functions only |
| Readability | shortest; reads as the inductive argument | the "which phase am I in" state is explicit and longer | shortest for linear shapes |
| Debuggability | the traceback shows the path | you print the stack yourself | two variables hold all the state |
| Cost per level | a call: CPython order of 10 to 100 ns; V8 a few ns | a list push and pop: CPython order of tens of ns | one loop iteration |
| Choose when | depth is $O(\log n)$ or bounded and small | depth is proportional to input; untrusted nesting | linear recursion: list walks, `gcd`, fast power |

## Interviewer follow-ups

1. **"Your DFS is recursive. What happens on a graph of $10^6$ nodes arranged in one path?"** Model answer: depth is $10^6$, so CPython raises `RecursionError` at 1,000 frames and Node throws `RangeError` around $10^4$; convert to an explicit stack, pushing neighbours in reverse to keep the visit order. Common wrong answer: "raise `sys.setrecursionlimit`": on 3.10 and earlier that can segfault the interpreter, on any version it keeps $10^6$ frames resident (order of 200 MB at 240 bytes each), and it still crashes on the next larger input.
2. **"Is this function tail-recursive, and does it matter here?"** Model answer: it is tail-recursive if the recursive call's result is returned untouched; in Python and JavaScript that does not reduce stack usage, but it means the function converts to a `while` loop mechanically, which is the real fix. Wrong answer: "yes, so the stack is $O(1)$", which is true in Scheme and in optimised C or Rust when the compiler sees the pattern, not in CPython or V8.
3. **"How would you prove it terminates?"** Model answer: name a non-negative integer measure that strictly decreases on every recursive call; for a graph walk the measure is "unvisited nodes", which only decreases if you mark before recursing. Wrong answer: "it stops when it hits the base case", which assumes the thing to be proved.
4. **"What is the complexity of `power` written with two recursive calls?"** Model answer: $T(n) = 2T(n/2) + O(1) = O(n)$; the call tree has about $2n$ nodes; storing `half` makes it $O(\log n)$. Wrong answer: "$O(\log n)$ because $n$ halves each call", which ignores that the tree doubles in width per level.
5. **"Where is the depth in a recursive-descent parser?"** Model answer: the nesting depth of the input, so untrusted input needs a nesting limit or an iterative parser. Wrong answer: "each function is small, so the stack is fine", which confuses frame size with frame count.

## What mid-level engineers get wrong

- Simulating three levels of calls instead of trusting the call, then writing a combination step that is wrong at level four.
- Treating depth and call count as the same number, so Hanoi "cannot be recursive" (depth $n$, calls $2^n - 1$) and a path-shaped DFS "is fine" (calls $n$, depth $n$).
- Raising the recursion limit as the first fix; the cliff moves, the crash stays.
- Slicing in the reduction (`xs[1:]`), turning a linear algorithm quadratic.
- Believing accumulator form saves stack in Python or Node; it saves nothing until you write the loop.
- Recursing before marking a graph node visited, which removes the decreasing measure and loops on the first cycle.
- Catching `RecursionError` and retrying with the same input, which recurses to the same depth again.

## Recursion checklist for interviews

When you reach for recursion in a coding round, say these out loud, in order:

1. "The base case is ..." and it must be an input you can name (`n == 0`, `node is None`, `start == len(s)`).
2. "Each call reduces ..." and name the measure.
3. "Assuming the calls return correct results, I combine them by ...".
4. "The depth is ... so the stack is ..." and if the depth is $O(n)$ for $n$ up to $10^5$, say you would convert to an explicit stack or a loop in production.
5. "The recurrence is ... so the time is ...".

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
- You know the default stack limits of your runtime to an order of magnitude, that Python and V8 **do not eliminate tail calls**, and that a depth proportional to input size is a crash waiting for a bad input.
- You know what changed in CPython 3.11 (Python frames off the C stack) and 3.12 (a separate C recursion guard), so you can say when raising the limit is safe and when it is a moved cliff.
- You can convert a recursive DFS to an **explicit stack** on demand, and you say when you would (deep trees, untrusted nesting, linked structures).
- You spot the **repeated recursive call** (`f(n/2) * f(n/2)`) that turns $O(\log n)$ into $O(n)$, and the **slice-per-call** that turns $O(n)$ into $O(n^2)$.
- You know that recursive-descent parsers have nesting limits for a reason, and you would not accept untrusted JSON with a naive recursive parser.

## Check yourself

```quiz
- q: >-
    A function computes the length of a linked list recursively: return 0 for None, else 1 + length(node.next). In CPython, on a list of 5,000 nodes it will:
  options: ["Segfault, since CPython cannot catch stack overflow", "Raise RecursionError at about 1,000 frames deep", "Return a wrong answer due to integer overflow", "Return 5000, since 8 MB of stack holds 5,000 frames"]
  answer: 1
  explanation: >-
    Depth equals list length, and CPython's default recursion limit is 1,000 frames, so it raises a catchable RecursionError long before any memory limit matters. The algorithm is correct but the depth is proportional to input size, which is exactly the shape that needs a loop or explicit stack.
- q: >-
    Which change turns power(x, n) = power(x, n//2) * power(x, n//2) * (x if n odd) from O(n) to O(log n)?
  options: ["Calling it once and squaring the stored result", "Adding a second base case to stop at n == 1", "Replacing the recursion with an explicit stack", "Rewriting it in tail form with an accumulator"]
  answer: 0
  explanation: >-
    Two calls per frame on n/2 gives T(n) = 2T(n/2) + O(1) = O(n). One stored call gives T(n) = T(n/2) + O(1) = O(log n). An explicit stack or tail form changes where frames live, not how many calls are made, and an extra base case trims one level at most.
- q: >-
    Why does writing a function in tail-recursive accumulator form NOT reduce its stack usage in Python or Node?
  options: ["The accumulator argument makes each frame bigger", "Neither runtime reuses the frame for a tail call", "They eliminate tail calls only once the JIT warms up", "Tail form only helps functions with one argument"]
  answer: 1
  explanation: >-
    Tail-call elimination is a runtime optimisation that reuses the frame, so every call no longer needs its own. CPython and V8 deliberately do not do it at all, JIT or not. The value of tail form is that it converts mechanically to a loop, which you then write yourself.
- q: >-
    Towers of Hanoi with n = 20 discs makes about a million moves via two recursive calls per frame. The maximum stack depth is:
  options: ["About 20, one per disc", "About 400, n² for n discs", "About 40, two per disc", "About a million, one per move"]
  answer: 0
  explanation: >-
    Depth is the longest chain of nested calls, which is n. The two calls per frame run one after the other, so they widen the tree rather than deepen it, and the million moves are the total number of calls in that tree. Time is exponential, stack is linear in n.
- q: >-
    A recursive-descent JSON parser in a web service crashes on some requests with a stack overflow. The root cause is most likely:
  options: ["Malformed UTF-8 bytes inside long string values", "A missing base case for the empty document", "Very long flat arrays with millions of elements", "Deeply nested arrays or objects in untrusted input"]
  answer: 3
  explanation: >-
    Mutual recursion between parse functions has depth equal to nesting depth of the input, and attacker-controlled input can nest arbitrarily; the fix is a nesting limit or an explicit stack. A long flat array is parsed by a loop, so its length does not add depth. A missing base case would fail on every input, not some.
- q: >-
    On CPython 3.12 or later you call sys.setrecursionlimit(200000) and run a pure-Python recursion 100,000 deep in the main thread. What happens?
  options: ["It segfaults, because every Python frame also consumes a frame of the 8 MB C stack", "It raises RecursionError, because the limit cannot be raised above 10,000 without a new thread", "It runs only after threading.stack_size is raised, because frames still live on the C stack", "It runs, because Python frames live in heap chunks and only C recursion has a separate guard"]
  answer: 3
  explanation: >-
    Since 3.11 Python-to-Python calls do not re-enter the C interpreter loop, so their frames are allocated from heap chunks and a raised limit is honoured; 3.12 added a separate guard for C code that calls back into Python, which a Python-level limit cannot lift. A segfault from a raised limit was the pre-3.11 behaviour. The thread trick matters when C recursion or an older interpreter is involved, not for this case.
```
