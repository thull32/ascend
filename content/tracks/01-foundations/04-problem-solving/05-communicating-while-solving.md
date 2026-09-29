---
slug: communicating-while-solving
title: "Communicating while solving: thinking aloud without losing the thread"
description: What to say at each step of the problem-solving loop, two annotated transcripts (one clean, one stuck and taking a hint), how to structure an explanation and discuss complexity without hedging, the four-step hint protocol, and how a coding round is actually graded.
minutes: 40
difficulty: intro
tags: [communication, interview, thinking-aloud, complexity, hints]
problems: [two-sum, valid-parentheses, contains-duplicate, daily-temperatures]
---
Two candidates solve the same problem in the same time with the same code. One gets a strong hire; the other gets a "solid but not senior". The difference is nearly always what was said between the problem statement and the last line of code: whether the interviewer could follow the reasoning, whether the approach was chosen out loud or appeared by magic, whether the complexity discussion was crisp or mumbled, and what happened at the moment the candidate got stuck.

This is not a soft skill bolted on to the technical ones. An interview is a forty-five-minute simulation of working with you, and what a senior engineer does at work is make their reasoning visible so that other people can check it and build on it.

There is a script. It follows the [problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop) step by step, and once you have it, thinking aloud stops competing with thinking. This lesson gives the script, two full transcripts with the signals an interviewer records marked in brackets, the protocol for taking a hint, and what happens to your words after the round ends.

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

> "The brute force checks every pair, that's O(n²). For n around 10⁵ that's 5 × 10⁹ pair checks, minutes in Python, so I'll look for the repeated work."

Naming the number, not only the O, is a small thing that lands well.

### Optimising

This is the step where narration matters most, because it is where the interviewer learns how you think. Say the bottleneck, say the idea that removes it, say the new complexity, and say the cost.

> "The inner loop is answering 'have I seen `target − x` before?' That's a membership question, so a hash map answers it in O(1). One pass, O(n) time, O(n) extra space. The trade is memory for time; if I were told O(1) space, I'd sort and use two pointers instead, at O(n log n)."

Three things happened there: the bottleneck was named, the idea was justified rather than announced, and an alternative was mentioned with the condition under which you would switch to it. That last sentence separates "knows the trick" from "understands the space of solutions".

### Coding

Say the structure before typing, then go mostly quiet and let the code speak. Break the silence only at decision points.

> "I'll keep a dict from value to index, and check for the complement before inserting so an element can't pair with itself."

Then write it. If you make a choice mid-code that is not obvious, say it: "I'm using `lo < hi` because I need two distinct indices." That is an invariant statement, and [invariants](/learn/foundations/problem-solving/invariants-and-loop-reasoning) are the strongest thing you can say aloud in a coding interview.

### Testing

Trace the example aloud, row by row, then name the edge cases and dispatch each one in a sentence.

> "Tracing `[3, 3]`, 6: first 3, complement 3 not in the dict, insert. Second 3, complement 3 is in the dict at index 0, return `[0, 1]`. Empty array: loop doesn't run, we fall through to the return. Negative values: nothing here assumes sign."

The [testing lesson](/learn/foundations/problem-solving/testing-your-own-code) has the full protocol. In the interview, the sentence "let me check the cases that usually break this" is itself a signal.

## Walkthrough 1: Two Sum, clean

The six steps above, run end to end on [Two Sum](/practice/two-sum) by a candidate who does not get stuck, with the signals an interviewer writes down in brackets. This is the transcript to imitate.

> "Indices of two distinct elements summing to target; one answer guaranteed. Can values be negative, and how big is n? [Interviewer: yes, and up to 10⁵.] Then anything quadratic is 5 × 10⁹ and out."
>
> *[restates, asks the two questions that matter, converts the constraint into a budget]*
>
> "Examples: `[2, 7, 11, 15]`, 9 gives `[0, 1]`. `[3, 3]`, 6 gives `[0, 1]`, so equal values at different indices are fine and one element used twice is not."
>
> *[an example chosen to expose a rule the statement implies]*
>
> "Brute force is every pair, n(n−1)/2, about 5 × 10⁹ here. Correct and too slow. Its inner loop answers one question for each i: is target − nums[i] somewhere to the right?"
>
> *[brute force with a count, then the repeated question, not a technique name]*
>
> "That's a membership query, so a map from value to index answers it in O(1). I'll walk left to right and look backwards: at each x, is target − x already in the map? O(n) time, O(n) space. If space were constrained I'd sort pairs of value and index and use two pointers at O(n log n)."
>
> *[derives the map from the bottleneck; states cost and the alternative with its trigger]*
>
> "Coding. One decision: I check the complement before inserting the current value, so `[3, 3]` can't pair index 0 with itself."
>
> *[names the one non-obvious line before writing it]*
>
> "Trace `[3, 1, 4, 2]`, target 6: 3, need 3, absent, insert. 1, need 5, absent, insert. 4, need 2, absent, insert. 2, need 4, present at index 2, return `[2, 3]`. Then `[3, 3]`: second 3 finds the first at 0, `[0, 1]`. Empty: loop skipped, I'd return an empty list, which the statement rules out but the code shouldn't crash on."
>
> *[traces two examples and dispatches the edge case in a sentence]*

The code and the trace table it narrates:

```python
def two_sum(nums, target):
    seen = {}                        # value -> index
    for i, x in enumerate(nums):
        if target - x in seen:       # check before insert: no self-pairing
            return [seen[target - x], i]
        seen[x] = i
    return []
```

| `i` | `x` | `target − x` | in `seen`? | `seen` after |
|---|---|---|---|---|
| 0 | 3 | 3 | no | `{3: 0}` |
| 1 | 1 | 5 | no | `{3: 0, 1: 1}` |
| 2 | 4 | 2 | no | `{3: 0, 1: 1, 4: 2}` |
| 3 | 2 | 4 | yes, at 2 | return `[2, 3]` |

About four minutes of speech. Every sentence is the deliverable of one step of the loop, and every bracket is a line the interviewer can quote in the write-up.

## Walkthrough 2: balanced brackets, narrated

The same rhythm on [Valid Parentheses](/practice/valid-parentheses), compressed, so you can hear it on a second problem.

> "Balanced means every opener has a matching closer of the same type in the right order, so `([])` is fine and `([)]` is not. Input is a string; output a boolean. Only bracket characters? Length up to 10⁴? [Yes.]
>
> Example: `([]{})` is true. Edge cases: empty string, which I'll treat as balanced, and a single closer like `)`.
>
> Brute force: repeatedly delete any adjacent matching pair until nothing changes. Each pass is O(n) and a fully nested string needs n/2 passes, so O(n²): 5 × 10⁷ character visits at n = 10⁴, which is fine in C and seconds in Python.
>
> The repeated work is rescanning characters whose fate is known. The structure: the most recent unmatched opener is the one the next closer must match. Last in, first out: a stack. Push openers; for each closer, if the stack is empty return false, else pop and compare types. Balanced if the stack is empty at the end. O(n) time, O(n) space when the input is all openers.
>
> Trace `([]{})`: push `(`, push `[`, `]` pops `[` matches, push `{`, `}` pops `{`, `)` pops `(`, empty, true. `)`: empty stack on a closer, false. Empty string: loop skipped, stack empty, true. `(`: never popped, false."

```python
PAIRS = {")": "(", "]": "[", "}": "{"}

def is_valid(s):
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif not stack or stack.pop() != PAIRS[ch]:
            return False
    return not stack
```

| `ch` | Action | Stack after |
|---|---|---|
| `(` | push | `(` |
| `[` | push | `( [` |
| `]` | pop `[`, matches | `(` |
| `{` | push | `( {` |
| `}` | pop `{`, matches | `(` |
| `)` | pop `(`, matches | empty |

About ninety seconds of talking, and the interviewer knows what you understood, what you considered, why you chose the stack, what it costs, and that you tested the cases that matter.

## Structuring an explanation

When you are asked to explain an approach in full (or a design, or a past project), the order that works is *claim, mechanism, cost, limits*:

1. **Claim.** What the approach achieves. "A single pass with a hash map finds the pair in O(n)."
2. **Mechanism.** How it works, at the level of the data structure and the loop. "For each element, look up its complement; if present, done; otherwise insert."
3. **Cost.** Time and space, with the assumption named. "O(n) expected, assuming the hash function spreads keys; O(n) memory for the map."
4. **Limits.** When it is the wrong choice. "If memory is constrained, sorting plus two pointers is O(1) extra space at O(n log n) time."

The order matters because it lets the listener stop whenever they have enough. A senior interviewer often needs only the claim and the cost; a junior one needs the mechanism. Giving mechanism first and claim last makes everyone wait. The same structure works for a design review, a postmortem and a pull request description; [Presenting a design](/learn/system-design/senior-design-skills/presenting-a-design) applies it to an hour-long review.

## Discussing complexity without hedging

"It's probably O(n log n) or something" is a mid-level sentence. The senior version has three parts: the bound, what dominates, and the assumption.

> "O(n log n), dominated by the sort; the scan afterwards is linear. Space is O(n) if the sort isn't in place; Python's `sorted` allocates, so O(n) here."

Specific things to get right:

- **Say what `n` is.** For a grid it is rows × columns, not "n". For a string-matching problem there are two lengths; name both.
- **Separate expected from worst case** when a hash map is involved. "O(n) expected; adversarial keys could degrade it, which is why runtimes use randomised hashing."
- **Distinguish auxiliary space from total space.** Recursion depth counts. "O(h) stack space for the recursion, where h is the tree height, which is O(n) for a degenerate tree."
- **Give the number.** "n is 10⁵, so O(n²) is 10¹⁰, too slow; O(n log n) is about 2 × 10⁶, fine." This converts theory into a decision, and the [pattern lesson](/learn/foundations/problem-solving/pattern-recognition) shows where the per-second figure the number is measured against comes from.
- **Be honest about constants when asked.** "The heap version and the sort version are both O(n log n); the sort will be faster because of memory locality, and I'd measure before choosing." See [Benchmarking reality](/learn/foundations/complexity/benchmarking-reality).

## Getting stuck, and what to say

Every strong candidate gets stuck. The interviewer is not watching for whether it happens; they are watching what you do in the ten seconds after.

**Say that you are stuck, and say what you are stuck on.** Silence is the worst option, for a reason the grading section below makes concrete: it produces nothing the interviewer can write down. "I know I need the next greater element for each index in better than O(n²), and I'm not seeing the structure yet" gives the interviewer something to work with. It also often un-sticks you, because stating the sub-problem precisely is half of solving it.

**Go back a step in the loop.** If the optimisation is not coming, say the brute force again and ask aloud what work it repeats. If the code is not coming, restate the invariant. If the example is not producing the expected answer, re-read the statement.

**Propose a simpler version.** "Let me solve it for the case with no duplicates first, then extend." Interviewers like this because it is what engineers do with real problems.

**Time-box it.** If two minutes of visible thinking have not produced progress, say "I'll take a hint on this if you have one" before the interviewer has to offer. The full playbook is in [Getting unstuck](/learn/interview-patterns/interview-execution/getting-unstuck).

## Taking a hint: the protocol

A hint is not a failure mark. It is information, and how you use it is graded. Four steps, the same four as in the [problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop):

1. **Stop.** Finish the sentence, then stop talking and typing. A hint delivered over your continued typing is one you did not hear.
2. **Restate it and place it in the loop.** Say the hint back in your own words and name the step it addresses: "You're pointing at the repeated work in my brute force, so this is the optimise step."
3. **Derive the consequence out loud.** Work from the hint to the change in your plan. Do not guess the name of the technique it points at; work out what it does to your algorithm.
4. **Confirm and resume.** State the new plan and its complexity, check it on an example, and continue from the step the hint addressed, not from the start. If you think the hint leads somewhere worse, say so once, briefly, with a reason, then follow it unless the interviewer withdraws it; they may be steering toward the follow-up they want to ask.

### A transcript: stuck on the next warmer day

[Daily Temperatures](/practice/daily-temperatures): for each day, how many days until a strictly warmer one. The candidate stalls at the optimise step and takes a hint.

> "For each day I need the next day with a higher temperature. Brute force: scan right from each day, O(n²); n is 10⁵ so about 5 × 10⁹, too slow. I want to avoid rescanning. Sorting loses the order, so no."
>
> *[brute force with a count against the budget; rejects a wrong idea with a reason]*
>
> "I'm stuck on how to avoid the rescans. What I know: when a warm day arrives, it answers some earlier days: the colder ones that haven't been answered yet. I don't see how to find them without scanning."
>
> *[states the sub-problem precisely instead of going silent; this is what the interviewer can steer]*
>
> **Interviewer:** "Which earlier days can still be waiting when a new day arrives?"
>
> "Let me restate that: you're asking what the set of unanswered days looks like, so this is about the optimise step. If day i is unanswered and a later day j is also unanswered, then temps[j] must be at most temps[i], because otherwise j would have answered i. So the unanswered days, oldest to newest, have non-increasing temperatures."
>
> *[stops, restates the hint, places it in the loop, and derives the structural fact rather than guessing a technique name]*
>
> "So when a new day comes, the days it answers are at the newest end: pop while colder, and everything older is at least as warm and stays. That's a stack. Each day is pushed once and popped at most once, so O(n) total, O(n) space if temperatures fall all the way."
>
> *[names the technique only after deriving it; states cost with the amortised argument]*
>
> "Check on `[73, 74, 75, 71, 69, 72]`: 73 pushed; 74 pops 73, answer 1; 75 pops 74, answer 1; 71 and 69 pushed; 72 pops 69, answer 1, pops 71, answer 2, and 75 stays. That matches the brute force. Coding it now."
>
> *[confirms on an example, then resumes at the code step rather than restarting]*

```viz
{"type": "array", "algorithm": "monotonic-stack-next-greater", "values": [73, 74, 75, 71, 69, 72, 76, 73], "title": "What the hint pointed at", "caption": "The unanswered days sit on the stack with non-increasing temperatures; a warmer day pops every one it answers."}
```

The hint cost the candidate about forty seconds and produced three quotable lines. That is what a well-taken hint looks like in the write-up: not "needed a hint" but "given a nudge about the waiting set, derived the monotone property and the stack unaided".

### Three ways to mishandle it

| Mishandling | What it looks like | Consequence in the write-up |
|---|---|---|
| Ignoring it | "Right, but let me finish this first", and the original approach continues | "Did not incorporate feedback"; the remaining time is spent on an approach the interviewer has ruled out |
| Rubber-stamping it | "Oh yes, a stack, of course", followed by code that scans anyway | "Did not understand the hint"; a second, larger hint follows, and two hints on one problem reads as guided |
| Treating it as a verdict | Apologising, clearing the editor, restarting from the restatement | "Lost composure"; correct work from steps 1 to 3 is thrown away and five minutes with it |

## When to ask, and what each choice costs

| Strategy when stuck | Time cost | What gets recorded | Risk | Use it when |
|---|---|---|---|---|
| Name the sub-problem, then keep reasoning aloud | 1–2 min | the recovery protocol itself, often self-unblocking | small | always first |
| Go back a step: restate the brute force and its repeated work | 30 s | "returned to the method" | none | the optimisation is not coming |
| Propose a simpler sub-case | 1–3 min | "reduced the problem" | may not extend to the general case | a special case is known to be solvable |
| Ask to confirm a direction ("is a stack the right shape?") | seconds | "checked direction" once; "sought validation" if repeated | over-use | once, at a genuine fork |
| Ask for a hint after a visible time-box | 2 min | "asked cleanly" and what you did with it | small | two minutes of visible thinking produced nothing |
| Keep trying in silence | unbounded | nothing | large: the write-up has no material | never |

## Under the hood: how the round is graded

Your words outlive the round. What follows is how coding interviews are typically graded at large companies, stated generically; individual rubrics vary and none is being quoted.

**A rubric of signals per competency.** The interviewer scores a handful of competencies, commonly problem solving, coding, verification, communication and collaboration, and each competency is a list of observable signals rather than a feeling: "asked about constraints before choosing an approach", "stated the brute force and its cost", "derived the optimisation from the repeated work", "traced an example through the final code", "took a hint and extended it unaided". Each competency gets a rating on a small scale, then an overall recommendation.

**A written debrief, built from observations.** Within hours the interviewer writes it up, and the strong ones write observations before judgments: "at minute twelve, said the inner loop was a membership query and proposed a map; at minute thirty, traced `[3, 3]` unprompted". Quotes and timestamps carry more weight than adjectives, because they let a reader who was not in the room check the judgment.

**A committee that reads the debriefs, not the code.** Where a company uses a hiring committee, the decision is made by people who never see your editor. They read the debriefs side by side, look for consistency between interviewers, and weigh the level: at senior, communication and collaboration are not tie-breakers but core competencies, because the job is to make reasoning visible to other people. Interviewers are calibrated against each other over time, which dampens one idiosyncratic scorer.

Three consequences follow directly. Silence is unrecordable: a minute of it produces no observation, so it can only lower the estimate. A hint is recorded together with what you did after it, and the "after" is the grade; a hint followed by an unaided derivation is a positive line. And narrating decisions is what makes the debrief writable at all: the reasons you say out loud are the quotes; the code you type is an attachment.

## Handling "why" questions

Senior interviews contain a lot of "why". Why a hash map and not a sorted array? Why is that loop O(n) and not O(n²)? Why is moving the shorter pointer safe? These are not attacks. They are the interviewer checking that the choice was a decision and not a reflex, and collecting a quotable line for the write-up.

The answer form is the same every time: the property of the problem that justifies the choice, and the alternative that would be right if the property were different.

> "Why a stack for the brackets?" "Because the most recently opened bracket must be the first one closed; that's last-in-first-out, and a stack is the structure whose only operations are push and pop at the same end. If closers could match any opener, I'd need counts, not a stack."

If you do not know, say so and reason from what you do know. "I'm not certain; my intuition is X because Y. Let me check with a small example." Making up an answer is the one thing graded lower than not knowing.

## Failure modes in interviews

**The silent minute.** *Symptom:* sixty seconds without speech, typing stopped, eyes on the screen. *Diagnosis:* thinking is happening internally with nothing externalised; the interviewer has no observation to write and cannot steer. *Fix:* say the sub-problem in one sentence ("I need the unanswered days without rescanning"), then go back a step in the loop; the sentence is often enough to unblock you and always enough to record.

**The rubber-stamped hint.** *Symptom:* "Oh yes, of course" within a second of the hint, followed by code that does not use it. *Diagnosis:* the hint was acknowledged socially and not understood; the interviewer now has to give a second, larger hint, and two hints on one problem reads as guided in the debrief. *Fix:* restate it, place it, derive the consequence aloud before touching the keyboard; forty seconds of derivation is cheaper than a second hint.

**Keystroke narration.** *Symptom:* "now I'm writing a for loop... now I'll initialise the dictionary"; the interviewer's attention visibly drops. *Diagnosis:* narrating what is already on the screen, which adds noise and hides the decisions among it. *Fix:* speak at decision points only ("I check before inserting so an element can't pair with itself") and stay quiet through routine lines.

**The hedged complexity.** *Symptom:* "probably O(n log n) or so, maybe O(n)"; the write-up says "unsure of own solution's cost". *Diagnosis:* the bound was recalled rather than derived, so the dominant term and the assumption are missing. *Fix:* the three-part form, bound, what dominates, assumption, and the number against the stated n.

## The same narration outside the room

The claim-mechanism-cost-limits structure and the hint protocol are how senior engineers operate in design reviews, not only interviews. A reviewer's "have you considered the write path?" is a hint, and the four steps apply unchanged: stop, restate, derive what it changes in the design, confirm and continue from the affected section. Netflix's [published culture memo](https://jobs.netflix.com/culture) asks for "context not control" and expects the person making a decision to seek out different opinions first, which it calls "farming for dissent"; the engineer who narrates reasons and integrates challenges cleanly is the one who functions in that environment, and [Netflix culture and interviews](/learn/senior-craft/getting-the-job/netflix-culture-and-interviews) covers what that looks like in the loop itself.

## Interviewer follow-ups

**"You asked for n before choosing an approach. Why does it matter that much?"** *Model answer:* because the constraint decides which complexity class is acceptable, and the class decides the technique: at n = 20 an exponential search is fine, at 10⁵ anything quadratic is 10¹⁰ operations and out; asking first means I choose from the constraints rather than pattern-match and retrofit. *Common wrong answer:* "to show I'm thorough", which names the impression instead of the reason.

**"You said O(n) expected. What would make it worse?"** *Model answer:* the hash map's average case assumes keys spread across buckets; adversarial or degenerate keys collide and degrade lookups toward O(n), which is why CPython randomises its string hashes per process; for integer keys with a bad pattern the same can happen, so worst case is O(n²) for the whole pass and expected O(n). *Common wrong answer:* "nothing, hash maps are O(1)".

**"If I gave you a hint you disagreed with, what would you do?"** *Model answer:* restate it so I know I understood it, say once and briefly why I would have gone another way and what I think it costs, then follow the hint unless you withdraw it, because you may be steering toward the follow-up you want to ask; arguing past one sentence costs more than either approach. *Common wrong answer:* "I'd explain why my approach is better" with no stopping rule.

**"Explain your bracket solution to a junior engineer in three sentences."** *Model answer:* claim, mechanism, cost: "A stack tells you whether brackets are balanced in one pass. Push each opener; when a closer arrives it must match the most recent unmatched opener, which is the top of the stack, so pop and compare. It's linear time and uses at most one stack entry per character." *Common wrong answer:* starting with the loop and the variable names and never stating what the approach achieves.

**"You've been quiet for a while. What are you thinking?"** *Model answer:* name the sub-problem and the two options being weighed, with what would decide between them: "I'm choosing between a count map and a stack; the interleaved case `([)]` decides it, because counts can't see order." *Common wrong answer:* "sorry, still thinking", which records nothing.

## What mid-level engineers get wrong

- **Going silent to think.** The thinking may be excellent, but a minute without speech is a minute with no observation in the debrief, and the estimate can only move down.
- **Announcing the technique instead of deriving it.** "This is a sliding window" with no bottleneck named reads as recall; the same answer preceded by "the brute force rechecks every window from scratch" reads as reasoning.
- **Arguing with a hint.** One sentence of disagreement is judgment; a paragraph is a collaboration flag.
- **Ending without a summary.** Nobody says what was tested and what was not, so the debrief assumes nothing was.

## Senior signals

- You ask for the input size before choosing an approach and you convert the resulting Big-O into an operation count against that size.
- You narrate decisions and their reasons, and go quiet while typing routine code.
- You name the bottleneck in the brute force before naming the technique that removes it, so the optimisation looks derived rather than recalled.
- You state complexity with what dominates and what is assumed, and you separate expected from worst case and auxiliary from total space.
- You say "I'm stuck on X" within seconds, go back a step in the loop, and ask for a hint before the interviewer has to offer one.
- When a hint arrives you stop, restate it, place it in the loop, derive its consequence aloud and resume at that step, and you can say what each mishandling costs in the write-up.
- You know that the round is graded from a written debrief of observations read by people who never see your code, and you speak so that the debrief has quotes in it.
- You answer every "why" with the property of the problem that justifies the choice and the alternative you would use if it did not hold.

## Check yourself

```quiz
- q: >-
    An interviewer asks "why a hash map rather than sorting?" Which answer best demonstrates senior-level reasoning?
  options: ["It is the standard solution to this problem, so it is the safe choice", "I need O(1) lookups, not order; if space were capped I'd sort instead", "Hash maps are faster than sorting, and speed is what the problem needs", "Sorting is O(n log n) while one hash-map pass is O(n), so it is faster"]
  answer: 1
  explanation: >-
    The strong answer names the property of the problem that justifies the choice (membership queries, order irrelevant) and the condition under which the alternative wins: with O(1) extra space required, sorting plus two pointers is right. "Standard solution" and "faster" are assertions without reasons; the O(n log n) comparison is true but does not explain why sorting is unnecessary here or when it would win.
- q: >-
    You have been silent for two minutes and are not making progress on the optimisation. What is the best next move?
  options: ["Ask the interviewer for a different problem that suits you better", "Start coding the brute force so the interviewer sees progress", "Keep thinking silently, since talking would break your focus", "Say exactly what you are stuck on, then ask for a hint if needed"]
  answer: 3
  explanation: >-
    Naming the sub-problem gives the interviewer something to steer and often unblocks you; restating the brute force and its repeated work, returning to the previous step of the loop, is the protocol's built-in recovery. Silence and unrequested brute-force coding both waste time without producing information the interviewer can grade.
- q: >-
    Which complexity statement is the most complete?
  options: ["It's about O(n log n), which is efficient for this input size", "It's efficient: roughly linear time and constant extra space", "O(n log n) time, dominated by the sort; O(n) space for sorted()", "O(n log n) or O(n^2), depending on how the input happens to look"]
  answer: 2
  explanation: >-
    A complete statement gives the bound, what dominates it (the sort, then a linear scan), and the implementation detail behind the space figure (Python's sorted allocates a new list). Hedging between two bounds or offering "efficient" tells the interviewer nothing they can check.
- q: >-
    The interviewer gives a hint that steers toward an approach you think is slightly worse than your own idea. What should you do?
  options: ["Explain why your approach is better until the interviewer agrees", "Thank them, then carry on with your own idea since it is better", "Restate it, say once why you differed, then follow the hint", "Drop your idea without comment and follow the hint from scratch"]
  answer: 2
  explanation: >-
    Acknowledging the hint in your own words shows it landed; one sentence of disagreement with a reason shows judgement; following it unless the interviewer withdraws it respects that they may be steering toward a planned follow-up. Ignoring or arguing at length is graded as poor collaboration, and silently restarting hides your reasoning and throws away correct work.
- q: >-
    In the transcript where the candidate is stuck on the next warmer day, which line is the one that turns the hint into a positive entry in the write-up?
  options: ["Deriving that the unanswered days have non-increasing temperatures", "Saying the word stack as soon as the interviewer speaks", "Saying the brute force is O(n squared) and too slow", "Apologising for needing the hint before continuing"]
  answer: 0
  explanation: >-
    The graded part of a hint is what happens after it. Restating the hint and deriving the structural fact, that unanswered days form a non-increasing sequence, shows the candidate understood the nudge and did the reasoning unaided; naming the technique only follows from that. Saying "stack" immediately is rubber-stamping, which invites a second hint, and apologising records nothing useful.
- q: >-
    Why does a silent minute cost more in a senior coding round than a wrong first idea stated aloud?
  options: ["The debrief records observations; silence yields none, a stated idea shows reasoning", "A wrong idea is expected at senior level, while silence signals a memorised solution", "Interviewers are told to penalise any pause that runs past thirty seconds", "Senior rounds are shorter, so each silent minute costs proportionally more time"]
  answer: 0
  explanation: >-
    The hiring decision is made from written debriefs of observable signals, read by people who do not see the code. A wrong idea stated with its reason and then rejected is a recordable act of reasoning; a silent minute gives the interviewer nothing to write and nothing to steer, so the estimate can only fall. There is no fixed pause penalty, and silence does not imply memorisation.
```
