---
lesson: reversal-and-runner-techniques
source: 3c3265ecafde647f
fit: partial
desk:
  - "The iterative reversal code and trace, and the reversal visualiser"
  - "The recursive reversal call-stack trace"
  - "The reverse-between code and trace, and the k-group code"
  - "The middle-node tables: odd against even, and the three loop variants"
  - "The nth-from-end code, trace and visualiser, and the palindrome table"
  - "Exercises: reverse a linked list, and the k-th node from the end"
---
## Introduction

You are asked to reverse a singly linked list in place. It is four lines of code, and a large share of candidates write one of the four in the wrong order on the whiteboard. Then the interviewer asks for the middle node in one pass, or the seventh node from the end without knowing the length.

Two techniques cover most linked list questions: rewiring pointers as you walk, and walking two pointers at different speeds or with a fixed gap. Neither is deep. Both are unforgiving, because a singly linked list gives you no way back. Overwrite the wrong next pointer and the rest of the list is gone, with no exception to tell you.

So the discipline is the subject. Name what each pointer means, state the invariant, and trace by hand before you run. This episode gives you the invariants and the traps; the step-by-step traces are on the page.

## Iterative reversal

Three pointers. Previous is the reversed part so far. Current is the node being rewired. And next is saved, so the rest of the list is not lost. Each iteration does four things in this order: save current's next, point current back at previous, move previous up to current, move current up to the saved next.

The invariant: at the top of each iteration, previous is the head of a correctly reversed list of exactly the nodes already visited, and current is the head of the untouched remainder. When current becomes null, previous is the whole list, reversed. Return previous.

Say it on 1, 2, 3. First iteration: save the 2, point 1 at nothing, previous is 1, current is 2. Second: save the 3, point 2 at 1, previous is 2. Third: save nothing, point 3 at 2, previous is 3, current is null. The reversed list is 3, 2, 1. Linear time, constant space, no allocation.

Now the line everyone gets wrong. What happens if you rewire current before saving its next?

[pause]

On the first iteration, the 1 now points at nothing. Then you read "1's next" to move forward, and it is nothing. The loop ends after one node, returns a list of just 1, and the 2 and 3 are unreachable. In a garbage-collected language, gone. No error is raised, so this reaches production as missing data. Say "save next" out loud before you touch the pointer.

## Recursive reversal and its cliff

The recursive version is elegant. Reverse everything after the head, trusting the call. When it returns, the head's old successor is now the last node of the reversed rest, so point that successor back at the head, and point the head at nothing, making it the new tail.

The cost is one stack frame per node. On a four-node list, four frames are alive at the deepest point. On a long list, that is the problem. CPython's default recursion limit is 1,000 frames, so reversing 50 thousand nodes recursively fails immediately. With the limit raised far enough, it completed in 6.9 milliseconds against 2.5 for the loop, about 2.8 times slower for the call overhead alone. Node threw a stack overflow at a depth of 9,634 frames. A JVM thread's default stack gives on the order of ten thousand frames of a small method.

And no optimiser will save you. The function does work after the recursive call returns, so it is not tail-recursive, and even a language with tail-call elimination would keep every frame. Raising the limit moves the cliff; it does not remove it. In an interview, write the iterative version and mention the recursive one. In production, never recurse over a list whose length you do not control. The unit tests use ten nodes, and the first real input has ten thousand.

## Reversing part of a list

Reverse positions 2 through 4 of 1, 2, 3, 4, 5, and the answer is 1, 4, 3, 2, 5. The core is the same loop. The work is in reconnecting. Before reversing, hold two more pointers: the node just before the sublist, which is the 1, and the sublist's first node, the 2, which will become its last. A sentinel in front of the head means a sublist starting at position one is not a special case.

During the loop, the list is temporarily in two pieces, which is normal. When the loop ends, previous holds the new front of the sublist, the 4, and current holds the node after it, the 5. Two writes make it whole: the 1 points at the 4, and the 2 points at the 5.

Forget that second write, and the 2 still points at nothing from the first iteration. The list comes out as 1, 4, 3, 2, and the 5 and everything after it are silently dropped. The production symptom is a list that is shorter after the operation than before, so a length assertion around the call is the cheapest test there is.

Reversing in groups of k applies this repeatedly. The rule that keeps it linear: count k nodes ahead before reversing, so a short final group is left alone, never reversed and then reversed back.

## The runner: fast and slow

Two pointers start at the head. Slow moves one node per step, fast moves two. When fast reaches the end, slow is at the middle. One pass, no length count, constant space. The invariant: when slow is k nodes from the head, fast is 2k.

The loop condition is "while fast is not null and fast's next is not null", and both checks are load-bearing. On 1 through 5, an odd length, the pairs go 1 and 1, then 2 and 3, then 3 and 5. Fast is on the last node and its next is null, so the loop stops, and slow is on 3, the exact middle. On 1 through 4, an even length, they go 1 and 1, 2 and 3, then 3 and null. Fast itself is null. Slow is on 3, the second of the two middles. Drop either check and you dereference null on one of the two parities. The common wrong answer, "checking fast's next is enough", crashes on every even-length list.

That second-middle behaviour is a choice, not an accident. Start fast one node ahead instead, and you get the first middle on even lengths. Which you want depends on the problem. The palindrome check wants the second middle. Splitting a list for merge sort wants the first, so that a two-node list splits into two non-empty halves. Use the second middle there, and one half is empty, never shrinks, and the sort recurses forever. Each problem needs one specific variant, so choose deliberately before writing the loop.

## A fixed gap: nth from the end

The other shape keeps a fixed gap instead of a speed ratio. To delete the nth node from the end, start a lead pointer and a trail pointer at a sentinel. Move lead n nodes ahead. Then move both together until lead is on the last node. Trail is now immediately before the target, which is exactly what deletion needs.

Say it on 1 through 5, deleting the second from the end. Lead moves two, onto the 2, with trail on the sentinel. Then both step together until lead reaches the 5; trail is on the 3. Unlink: the 3 points at the 5. The result is 1, 2, 3, 5.

Why the sentinel? When n equals the length, the target is the head, and the head has no predecessor. With the sentinel, the second loop never runs, trail stays on the sentinel, and deleting the head is an ordinary unlink.

Be honest about "one pass". Counting the length and then walking is also linear, and you should say so first. The gap version earns its keep when visiting a node is expensive. But on a true stream you cannot rewind, it does not work unchanged: you need a ring buffer of the last n records, which is the same memory the gap occupied on the list.

## Compositions

The two techniques combine. A palindrome check in constant space finds the middle, reverses the second half in place, compares the halves, and, if the caller expects the list intact, reverses the second half back. Use the second-middle variant and compare while the reversed pointer is non-null, and odd lengths need no special branch; the middle node just compares with itself.

Reorder List, which turns 1, 2, 3, 4, 5 into 1, 5, 2, 4, 3, is all of it at once: find the middle, reverse the second half, interleave.

One production note. Real libraries mostly avoid reversing at all. A doubly linked list is read backwards through its previous pointers, writing nothing. Rewiring is the interview technique. In production, the first question is whether the list needs to be reversed or only read in reverse. And remember that reversal changes the head: anyone still holding the old head now holds the tail, a list of one.

## In the interview

A follow-up the lesson expects. Your recursive version passes all the tests. Would you ship it?

[pause]

Not for input whose length you do not control. The depth equals the length. CPython's default limit is 1,000 frames and V8's stack gives about ten thousand, and the failure is an exception in production, not a slow path. The iterative loop is the same four lines with constant space. The wrong answer is "raise the recursion limit", which moves the cliff, and on a runtime that uses the native stack turns a clean exception into a crash.

And: now reverse a doubly linked list. Walk it once and swap previous and next on every node, then swap the head and tail references. No saved-next variable is needed, because after the swap the old next sits in previous. Then ask whether the caller needs a reversed list or just a backward walk, which needs no writes at all.

## Recap

Four things to remember. Iterative reversal is save next, rewire, advance previous, advance current, and rewiring before saving silently drops the rest of the list. Recursive reversal costs a frame per node and hits a wall near 1,000 in CPython and ten thousand in V8 and the JVM, so do not ship it on untrusted lengths. Reversing a sublist is the same loop plus two reconnection writes you budget before you start. And the runner's loop guard checks both fast and fast's next; it gives the second middle on even lengths, which suits the palindrome check, while merge sort needs the first.

At your desk: the iterative and recursive traces, the sublist and k-group code, the middle-node tables, the nth-from-end trace and the palindrome table, and the two exercises, reversing a list and the k-th node from the end.
