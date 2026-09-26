---
slug: communicating-while-solving
title: "Communicating while solving: thinking aloud without losing the thread"
description: What to say at each step of the problem-solving loop, how to structure an explanation an interviewer can follow, how to discuss complexity without hedging, and how to take a hint gracefully.
minutes: 25
difficulty: intro
tags: [communication, interview, thinking-aloud, complexity, hints]
problems: [two-sum, valid-parentheses, contains-duplicate]
---
Two candidates solve the same problem in the same time with the same code. One gets a strong hire; the other gets a "solid but not senior". The difference is nearly always what was said between the problem statement and the last line of code: whether the interviewer could follow the reasoning, whether the approach was chosen out loud or appeared by magic, whether the complexity discussion was crisp or mumbled, and what happened at the moment the candidate got stuck.

This is not a soft skill bolted on to the technical ones. An interview is a forty-five-minute simulation of working with you, and what a senior engineer does at work is make their reasoning visible so that other people can check it, build on it, and trust it. Silence followed by correct code is what a strong mid-level engineer produces. Visible reasoning followed by correct code is what gets someone put in charge of a design.

The good news is that there is a script. It follows the [problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop) step by step, and once you have it, thinking aloud stops competing with thinking.

## The principle: narrate decisions, not keystrokes

Thinking aloud does not mean vocalising every thought. Nobody wants to hear "now I'm typing `for i in range`". It means saying the *decisions* and the *reasons*: what you are about to do, why, and what would change your mind. Keystrokes are visible on the screen; decisions are not, and decisions are what the interviewer is grading.

A useful test: if the interviewer stopped listening for a minute, could they catch up by reading the screen? If yes, you were narrating keystrokes. If no, because the important part was the reason you chose a hash map over sorting, you were narrating decisions.

## What to say at each step

### Understanding

Restate the problem in one sentence, name the input and output types, and ask the questions that change the approach. Keep it to three or four questions; more than that is stalling.

> "So I'm given an unsorted array of integers and a target, and I need to return the indices of two distinct elements that sum to it. Can I assume exactly one answer exists? Can values be negative? How large is n, roughly, so I know what complexity I'm aiming for?"

The last question is the senior one. It tells the interviewer you will choose the approach from the constraints, and it gets you a number to reason against.

### Examples

Write one example and say the answer *before* you think about the algorithm. Then add one edge case and say what you expect.

> "Say `[2, 7, 11, 15]` with target 9: the answer is indices 0 and 1. And `[3, 3]` with target 6 should be `[0, 1]`, which reminds me I can't use the same element twice."

Noticing the constraint from the example is much better than being told it later.

### Brute force

State it in one sentence with its complexity, then say you are going to improve it. Do not code it unless asked.

> "The brute force checks every pair, that's O(n²). For n around 10⁵ that's 10¹⁰ operations, too slow, so I'll look for the repeated work."

Naming the number, not just the O, is a small thing that lands well.

### Optimising

This is the step where narration matters most, because it is where the interviewer learns how you think. Say the bottleneck, say the idea that removes it, say the new complexity, and say the cost.

> "The inner loop is answering 'have I seen `target − x` before?' That's a membership question, so a hash set answers it in O(1). One pass, O(n) time, O(n) extra space. The trade is memory for time; if I were told O(1) space, I'd sort and use two pointers instead, at O(n log n)."

Three things happened there: the bottleneck was named, the idea was justified rather than announced, and an alternative was mentioned with the condition under which you would switch to it. That last sentence is what separates "knows the trick" from "understands the space of solutions".

### Coding

Say the structure before typing, then go mostly quiet and let the code speak. Break the silence only at decision points.

> "I'll keep a dict from value to index, and check for the complement before inserting so an element can't pair with itself."

Then write it. If you make a choice mid-code that is not obvious, say it: "I'm using `lo < hi` because I need two distinct indices." That is an invariant statement, and [invariants](/learn/foundations/problem-solving/invariants-and-loop-reasoning) are the strongest thing you can say aloud in a coding interview.

### Testing

Trace the example aloud, row by row, then name the edge cases and dispatch each one in a sentence.

> "Tracing `[3, 3]`, 6: first 3, complement 3 not in the dict, insert. Second 3, complement 3 is in the dict at index 0, return `[0, 1]`. Empty array: loop doesn't run, we fall through to the return. Negative values: nothing here assumes sign."

The [testing lesson](/learn/foundations/problem-solving/testing-your-own-code) has the full protocol. In the interview, the sentence "let me check the cases that usually break this" is itself a signal.

## Structuring an explanation

When you are asked to explain an approach in full (or a design, or a past project), the order that works is *claim, mechanism, cost, limits*:

1. **Claim.** What the approach achieves. "A single pass with a hash map finds the pair in O(n)."
2. **Mechanism.** How it works, at the level of the data structure and the loop. "For each element, look up its complement; if present, done; otherwise insert."
3. **Cost.** Time and space, with the assumption named. "O(n) expected, assuming the hash function spreads keys; O(n) memory for the map."
4. **Limits.** When it is the wrong choice. "If memory is constrained, sorting plus two pointers is O(1) extra space at O(n log n) time."

The order matters because it lets the listener stop whenever they have enough. A senior interviewer often only needs the claim and the cost; a junior one needs the mechanism. Giving mechanism first and claim last makes everyone wait.

The same structure works for a design review, a postmortem, and a pull request description. It is worth practising until it is automatic.

## Discussing complexity without hedging

"It's probably O(n log n) or something" is a mid-level sentence. The senior version has three parts: the bound, what dominates, and the assumption.

> "O(n log n), dominated by the sort; the scan afterwards is linear. Space is O(n) if the sort isn't in place; Python's `sorted` allocates, so O(n) here."

Some specific things to get right:

- **Say what `n` is.** For a grid it is rows × columns, not "n". For a string-matching problem there are two lengths; name both.
- **Separate expected from worst case** when a hash map is involved. "O(n) expected; adversarial keys could degrade it, which is why runtimes use randomised hashing."
- **Distinguish auxiliary space from total space.** Recursion depth counts. "O(h) stack space for the recursion, where h is the tree height, which is O(n) for a degenerate tree."
- **Give the number.** "n is 10⁵, so O(n²) is 10¹⁰, which is too slow; O(n log n) is about 2 × 10⁶, fine." This converts theory into a decision.
- **Be honest about constants when asked.** "The heap version and the sort version are both O(n log n); the sort will be faster in practice because of memory locality, and I'd measure before choosing." See [Benchmarking reality](/learn/foundations/complexity/benchmarking-reality).

## Getting stuck, and what to say

Every strong candidate gets stuck. The interviewer is not watching for whether it happens; they are watching what you do in the ten seconds after.

**Say that you are stuck, and say what you are stuck on.** Silence is the worst option. "I know I need the next greater element for each index in better than O(n²), and I'm not seeing the structure yet" gives the interviewer something to work with. It also often un-sticks you, because stating the sub-problem precisely is half of solving it.

**Go back a step in the loop.** If the optimisation is not coming, say the brute force again and ask aloud what work it repeats. If the code is not coming, restate the invariant. If the example is not producing the expected answer, re-read the statement. The loop tells you where to go.

**Propose a simpler version.** "Let me solve it for the case with no duplicates first, then extend." Interviewers like this because it is what engineers do with real problems.

**Time-box it.** If two minutes of visible thinking have not produced progress, say "I'll take a hint on this if you have one" before the interviewer has to offer. Asking early and cleanly costs almost nothing; flailing for eight minutes costs a lot.

The full playbook is in [Getting unstuck](/learn/interview-patterns/interview-execution/getting-unstuck); the sentences above are enough to start.

## Taking a hint

A hint is not a failure mark. It is information, and how you use it is graded.

1. **Acknowledge it precisely.** Repeat the hint in your own words so the interviewer knows it landed: "So you're suggesting the stack should hold indices that haven't found their answer yet."
2. **Connect it to what you had.** "That fits the brute force: the inner scan was re-checking indices that were already resolved. The stack is exactly the unresolved ones."
3. **Run with it visibly.** Continue the loop from the step the hint unblocked. Do not restart from scratch, and do not pretend you were about to say it.
4. **Do not argue with it.** If you think the hint leads somewhere worse, say so once, briefly, with a reason, and then follow it anyway unless the interviewer withdraws it. They may be steering you toward the follow-up they want to ask.

Candidates lose the most ground by treating a hint as an interruption to be tolerated rather than a piece of the solution to be integrated.

## Handling "why" questions

Senior interviews contain a lot of "why". Why a hash map and not a sorted array? Why is that loop O(n) and not O(n²)? Why is moving the shorter pointer safe? These are not attacks. They are the interviewer checking that the choice was a decision and not a reflex.

The answer form is the same every time: the property of the problem that justifies the choice, and the alternative that would be right if the property were different.

> "Why a stack for the brackets?" "Because the most recently opened bracket must be the first one closed; that's last-in-first-out, and a stack is the structure whose only operations are push and pop at the same end. If closers could match any opener, I'd need counts, not a stack."

If you do not know, say so and reason from what you do know. "I'm not certain; my intuition is X because Y. Let me check with a small example." Making up an answer is the one thing that is graded lower than not knowing.

## A worked narration

Here is a compressed but complete narration of a real problem, so you can hear the rhythm.

> **Problem:** given a string of brackets `()[]{}`, is it balanced?
>
> "Balanced means every opener has a matching closer of the same type in the right order, so `([])` is fine and `([)]` is not. Input is a string; output is a boolean. Can I assume only bracket characters? Any length limit? Assume up to 10⁴ and only brackets.
>
> Example: `([]{})` is true. Edge cases: empty string, which I'll treat as balanced, and a single closer like `)`.
>
> Brute force: repeatedly remove any adjacent matching pair until nothing changes; that's O(n²) in the worst case because each pass is O(n) and there can be O(n) passes.
>
> The repeated work is rescanning for pairs. The structure here is that the most recent unmatched opener is the one the next closer must match, which is last-in-first-out. So a stack of openers: push openers, and for each closer, pop and check the type. Balanced if the stack is empty at the end. O(n) time, O(n) space in the worst case of all openers.
>
> Code: iterate; if opener, push; if closer, if stack empty return false, else pop and compare. Return `len(stack) == 0`.
>
> Trace `([]{})`: push `(`, push `[`, `]` pops `[` matches, push `{`, `}` pops `{`, `)` pops `(`, stack empty, true. Edge case `)`: stack empty on a closer, false. Empty string: loop doesn't run, stack empty, true. `(`: never popped, stack non-empty, false."

That is about ninety seconds of talking, and every sentence carries information. The interviewer knows what you understood, what you considered, why you chose the stack, what it costs, and that you tested the cases that matter.

## Senior signals

- You ask for the input size before choosing an approach and you convert the resulting Big-O into an operation count against that size.
- You narrate decisions and their reasons, and go quiet while typing routine code.
- You name the bottleneck in the brute force before naming the technique that removes it, so the optimisation looks derived rather than recalled.
- You state complexity with what dominates and what is assumed, and you separate expected from worst case and auxiliary from total space.
- You say "I'm stuck on X" within seconds, go back a step in the loop, and ask for a hint before the interviewer has to offer one.
- You answer every "why" with the property of the problem that justifies the choice and the alternative you would use if it did not hold.

## Check yourself

```quiz
- q: >-
    An interviewer asks "why a hash map rather than sorting?" Which answer best demonstrates senior-level reasoning?
  options: ["Hash maps are faster", "Because I need O(1) membership checks and the order of elements does not matter to the answer; if I were required to use O(1) extra space, sorting plus two pointers would be the right choice instead", "Because that is the standard solution to this problem", "Because sorting is O(n log n)"]
  answer: 1
  explanation: >-
    The strong answer names the property of the problem that justifies the choice (membership queries, order irrelevant) and the condition under which the alternative wins. "Standard solution" and "faster" are assertions without reasons; the last option is true but does not explain why sorting is unnecessary here.
- q: >-
    You have been silent for two minutes and are not making progress on the optimisation. What is the best next move?
  options: ["Keep thinking silently until the idea comes", "Start coding the brute force to show activity", "Say precisely what you are stuck on, restate the brute force and its repeated work aloud, and ask for a hint if that does not unblock you", "Ask the interviewer to give you a different problem"]
  answer: 2
  explanation: >-
    Naming the sub-problem gives the interviewer something to steer and often unblocks you; returning to the previous step of the loop is the protocol's built-in recovery. Silence and unrequested brute-force coding both waste time without producing information the interviewer can grade.
- q: >-
    Which complexity statement is the most complete?
  options: ["It's about O(n log n)", "O(n log n) time because of the sort, then a linear scan; O(n) space because Python's sorted allocates a new list", "O(n log n) or O(n^2) depending", "It's efficient"]
  answer: 1
  explanation: >-
    A complete statement gives the bound, what dominates it, and the assumption or implementation detail behind the space figure. Hedging between two bounds or offering "efficient" tells the interviewer nothing they can check.
- q: >-
    The interviewer gives a hint that steers toward an approach you think is slightly worse than your own idea. What should you do?
  options: ["Ignore it and continue with your idea", "Restate the hint in your own words, say briefly why you were considering something else, then follow the hint unless the interviewer withdraws it", "Abandon your idea without comment and start over", "Argue for your approach until the interviewer agrees"]
  answer: 1
  explanation: >-
    Acknowledging the hint shows it landed; one sentence of disagreement with a reason shows judgement; following it respects that the interviewer may be steering toward a planned follow-up. Ignoring or arguing at length is graded as poor collaboration.
- q: >-
    What is the difference between narrating keystrokes and narrating decisions?
  options: ["There is none; both count as thinking aloud", "Keystroke narration describes what is visible on the screen; decision narration states what you are choosing, why, and what would change your mind, which is the part the interviewer cannot see", "Decision narration is for design interviews only", "Keystroke narration is preferred because it is more detailed"]
  answer: 1
  explanation: >-
    The interviewer can read the code; they cannot read the reasons. Narrating decisions makes the reasoning gradable. Narrating keystrokes adds noise and slows you down.
```
