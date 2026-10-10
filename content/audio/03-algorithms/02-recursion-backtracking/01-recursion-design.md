---
lesson: recursion-design
source: d6921793546460db
fit: great
desk:
  - "The factorial frame-by-frame trace and the power trace"
  - "The runtime stack limits table, and the CPython 3.11 and 3.12 frame changes"
  - "Converting recursion to an explicit stack: the list-sum trace and the iterative in-order traversal"
  - "The failure-modes table and the recursion, explicit stack or loop comparison"
  - "Exercises: fast modular exponentiation, and flatten a nested list"
---
## Introduction

You have to process a tree, a nested JSON document, a directory hierarchy, or a search space of choices. The structure is self-similar: a directory contains directories, a JSON object contains JSON objects. Writing a loop over that shape means managing your own stack of "where was I". Recursion lets the language manage it: the function calls itself on the smaller piece, and the runtime remembers where to resume.

That convenience has a price and a discipline. The price is a stack frame per call, and the runtime will kill your process when it runs out. The discipline is that a recursive function is only correct if you can say, without running it, why every call is smaller than the last and what the smallest one returns. Skip the discipline and you write functions that work on the example and blow the stack in production on the first deeply nested input.

Three ideas, then. The contract that makes recursion provable. Reading the cost straight off the code. And what depth really costs, and what to do when it is too much.

## The three-part contract

Every recursive function should read as three sentences. The base case: for the smallest inputs, return the answer directly. The reduction: for anything else, produce strictly smaller inputs, by some measure you can name. The combination: assume the recursive calls return correct answers, and combine them.

Take the size of a directory. A file is the base case: return its size. A directory reduces to its children, which are strictly smaller subtrees. And the combination: assuming each child's total is right, the directory's total is their sum.

The key word is "assuming". You do not trace into the child call. You trust it. That trust is mathematical induction, and it is the single habit that separates people who write recursion fluently from people who simulate three levels of calls in their head and get lost.

Two things must hold for the trust to be justified. The measure must strictly decrease on every call. If any call is on an input that is not smaller, you have infinite recursion. The classic case is a graph walk that revisits a node because there is no visited set. And every decreasing chain must reach a base case. A function that recurses on n minus 2 with a base case only at zero never stops for odd n.

## The proof, and why "it stops at the base case" is not one

The correctness argument is induction on the measure, and it takes three lines once the measure is named. The claim: for every input of measure m, the function returns the right answer. The base: the base case returns that answer directly, and you check it against the specification, not against the code. Factorial of zero is one because of what factorials are. The step: assume the claim for everything smaller than m. A call on m only recurses on smaller measures, so those return correct answers, and the combination turns correct sub-answers into the correct answer.

Termination is the same argument, using only the measure. Every call strictly decreases a non-negative integer, and a strictly decreasing sequence of non-negative integers is finite. That is why the measure must be a whole number, or something you can map onto one, and not a feeling that the input gets simpler.

Here is how that comes up. An interviewer asks: how would you prove your function terminates?

[pause]

Name a non-negative integer measure that strictly decreases on every recursive call. For a graph walk, the measure is the number of unvisited nodes, and it only decreases if you mark a node visited before you recurse. The wrong answer is "it stops when it hits the base case", which assumes the thing you are trying to prove.

## Reading the cost off the code

Once you trust the calls, the complexity is a recurrence, and you read it off the function. Count the calls per frame, how much smaller each call's input is, and the work done outside the calls.

Fast exponentiation is the example. To compute x to the n, compute x to the half of n once, store it, and square it, multiplying by x once more if n is odd. One call on half the input, plus constant work. That is log n. Say it for 2 to the 10. That asks for 2 to the 5, which asks for 2 squared, then 2 to the 1, then 2 to the 0, which is 1. Coming back up: 1 squared times 2 is 2. 2 squared is 4. 4 squared times 2 is 32. 32 squared is 1024. Five frames for n of 10, and about 60 for n of 10 to the 18. This is the algorithm behind modular exponentiation in RSA.

Now write it carelessly, as power of half n, times power of half n. Same maths. But now there are two calls on half the input, and that recurrence is linear, no better than a loop. Storing the result in a variable is the whole difference. You will meet that idea again as memoisation.

Keep two numbers apart in your head: depth and call count. Depth is the longest chain of nested calls, and it costs stack. Call count is the total number of calls, and it costs time. Towers of Hanoi with 20 discs makes about a million moves, because each frame makes two calls, one after the other. But its depth is only 20. The tree is wide, not deep. Exponential time, tiny stack.

## What a frame costs

Each call pushes a frame: the return address, the arguments, the locals, and in interpreted languages a fair amount of bookkeeping. The frame lives until the call returns. So depth is memory, and in most runtimes that memory is a fixed region reserved when the thread starts.

The numbers to carry. CPython's default recursion limit is 1,000 frames, and it raises a catchable recursion error. Node's stack is about a megabyte: on Node 24, roughly 12 thousand frames for a function with no arguments, and about 5,700 with four arguments and four locals. A JVM thread defaults to a megabyte of stack on Linux and macOS x64, order of 10 thousand frames. Go grows goroutine stacks by copying, up to a gigabyte. Rust and C get 8 megabytes on a typical Linux main thread, and overflow is a segmentation fault.

The design consequence. A function whose depth is proportional to the input size, a linked-list walk, a depth-first search on a path-shaped graph, is a latent crash. Depth proportional to log n, like binary search or fast power, is safe for any input you can store. Depth proportional to the height of a tree is safe when the tree is balanced and a crash when it degenerates.

A word on CPython's limit. Since 3.11, a Python function calling a Python function no longer uses the C stack; frames live in heap chunks, so a raised limit is honoured for pure-Python recursion. Since 3.12, C code that calls back into Python, the JSON decoder for instance, has its own guard that you cannot raise from Python. And the 1,000 default is a sanity check, not a memory limit. Raising it is fine when the depth is bounded and known. It is the wrong tool when depth follows untrusted input, because it moves the cliff instead of removing it.

## Tail calls, and the real fix

A tail call is one whose result the function returns unchanged. Nothing is left to do in the caller's frame, so a compiler could reuse it, and run any depth in constant stack. Scheme requires that. Rust and C compilers do it sometimes, with no guarantee. CPython never does: Guido van Rossum rejected it in 2009, partly because it destroys tracebacks. V8 does not either; outside Safari, proper tail calls in JavaScript are effectively dead. Assume your recursion depth is real.

What tail form does give you is a mechanical conversion to a loop. Carry the partial answer down the calls in an accumulator, instead of building it up on the way back, and once all the state is in the arguments, the loop writes itself. But in Python or Node, the tail-recursive version still overflows on a two-thousand-element list. Only the loop does not.

And any recursion at all can be rewritten with an explicit stack, because the call stack is a stack. Push what each frame would remember, pop in return order. The explicit stack lives on the heap, so a tree a million nodes deep is fine. That is the standard fix when a recursive depth-first search overflows: same algorithm, same complexity, frames moved into a list.

Two quiet bugs to watch for. Recursing on a slice of the list, everything after the first element, copies the list on every call, and turns a linear algorithm quadratic: about 50 million element copies at 10 thousand elements. Pass an index instead. And a mutable default argument used as an accumulator persists across top-level calls, so the second call returns stale results.

Finally, mutual recursion. A recursive-descent parser has parse-expression calling parse-term calling parse-factor, which calls parse-expression again for a parenthesised sub-expression. No function calls itself, but the cycle is recursion, and its depth is the nesting depth of the input. That is why JSON parsers have nesting limits: an attacker sends thousands of opening brackets and crashes a naive parser.

## In the interview

A follow-up the lesson expects. Your depth-first search is recursive. What happens on a graph of a million nodes arranged in a single path?

[pause]

The depth is a million. CPython raises a recursion error at 1,000 frames, and Node throws a range error at around 10 thousand. Convert it to an explicit stack, pushing neighbours in reverse to keep the same visit order. The wrong answer is "raise the recursion limit". On 3.10 and earlier that can segfault the interpreter. On any version it keeps a million frames resident, order of 200 megabytes. And it still crashes on the next larger input.

The lesson also gives you a checklist to say out loud whenever you reach for recursion: the base case is this; each call reduces this measure; assuming the calls are right, I combine them like this; the depth is this, so the stack is this; and the recurrence is this, so the time is this. Say the depth sentence unprompted. Interviewers who run large services want to hear that you know the difference between a solution that is correct and one that survives a bad input.

## Recap

Four things to remember. A recursive function is three sentences, base case, a strictly decreasing measure, and a combination you trust by induction. Read the recurrence off the code, and watch for a repeated call that turns log n into n. Depth costs stack and call count costs time, and a depth proportional to input size is a crash waiting for a bad input. And Python and JavaScript do not eliminate tail calls, so the real fix is a loop or an explicit stack.

At your desk: the factorial and power traces, the runtime limits table, the explicit-stack conversions, the failure-modes table, and the two exercises, fast modular exponentiation and flattening a nested list.
