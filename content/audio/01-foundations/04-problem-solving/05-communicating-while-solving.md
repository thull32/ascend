---
lesson: communicating-while-solving
source: 43883921c89ecdf8
fit: great
desk:
  - "The two full annotated transcripts, Two Sum clean and balanced brackets narrated"
  - "The Two Sum and bracket code with their trace tables"
  - "The table of strategies when stuck, with what each costs"
---
## Introduction

Two candidates solve the same problem in the same time with the same code. One gets a strong hire. The other gets "solid but not senior". The difference is nearly always what was said between the problem statement and the last line of code. Could the interviewer follow the reasoning? Was the approach chosen out loud, or did it appear by magic? Was the complexity discussion crisp or mumbled? And what happened at the moment the candidate got stuck?

This is not a soft skill bolted onto the technical ones. An interview is a forty-five-minute simulation of working with you, and what a senior engineer does at work is make their reasoning visible so other people can check it and build on it.

There is a script, and it follows the problem-solving loop step by step. Coming up: the one principle, what to say at each step, how to state complexity without hedging, what to do when stuck, how to take a hint, and how the round is actually graded.

## Narrate decisions, not keystrokes

Thinking aloud does not mean vocalising every thought. Nobody wants to hear "now I'm typing a for loop". It means saying the decisions and the reasons: what you are about to do, why, and what would change your mind. Keystrokes are visible on the screen. Decisions are not, and decisions are what is being graded.

A useful test: if the interviewer stopped listening for a minute, could they catch up by reading the screen? If yes, you were narrating keystrokes. If no, because the important part was why you chose a hash map over sorting, you were narrating decisions.

## What to say at each step

Understanding. Restate the problem in one sentence, name the input and output types, and ask the three or four questions that change the approach; more than that is stalling. For Two Sum: "I'm given an unsorted array and a target, and I return the indices of two distinct elements that sum to it. Can I assume exactly one answer? Can values be negative? How large is n, roughly, so I know what complexity I'm aiming for?" That last question is the senior one. It says you will choose the approach from the constraints, and it gets you a number to reason against.

Examples. Write one and say the answer before thinking about the algorithm, then add an edge case. "3 and 3 with target 6 should give 0 and 1, which reminds me I can't use the same element twice." Noticing a constraint from your own example is much better than being told it later.

Brute force. One sentence with its complexity, then say you will improve it, and do not code it unless asked. "Every pair is n squared; at a hundred thousand that's 5 billion pair checks, minutes in Python, so I'll look for the repeated work." Naming the number, not only the O, lands well.

Optimising. This is where narration matters most, because it is where the interviewer learns how you think. Say the bottleneck, the idea that removes it, the new complexity, and the cost. "The inner loop is asking: have I seen target minus x before? That's a membership question, so a hash map answers it in constant time. One pass, linear time, linear extra space. If I were told constant space, I'd sort and use two pointers instead, at n log n." That last sentence, an alternative with the condition for switching to it, separates knowing the trick from understanding the space of solutions.

Coding. Say the structure before typing, then go mostly quiet, breaking silence only at decision points. "I check for the complement before inserting, so an element can't pair with itself." An invariant said aloud is the strongest thing you can say in a coding interview.

Testing. Trace the example aloud, row by row, then name the edge cases and dispatch each in a sentence. "Empty array: the loop doesn't run, we fall through to the return. Negative values: nothing here assumes sign."

## Structure and complexity

When asked to explain an approach in full, use the order claim, mechanism, cost, limits. Claim: a single pass with a hash map finds the pair in linear time. Mechanism: for each element, look up its complement; if present, done, otherwise insert. Cost: linear expected time, assuming the hash spreads keys, and linear memory. Limits: if memory is constrained, sort and use two pointers. The order matters because the listener can stop whenever they have enough. A senior interviewer often needs only the claim and the cost. The same structure works for design reviews, postmortems and pull request descriptions.

Complexity without hedging. "It's probably n log n or something" is a mid-level sentence. The senior version has three parts: the bound, what dominates, and the assumption. "n log n, dominated by the sort; the scan afterwards is linear. Space is linear, because Python's sorted allocates a new list."

A few things to get right. Say what n is: for a grid it is rows times columns, and string matching has two lengths. Separate expected from worst case when a hash map is involved. Count recursion depth as space: height of the tree, which is linear for a degenerate tree. And give the number: at a hundred thousand, quadratic is 10 to the 10 and too slow, n log n is about 2 million and fine.

## Getting stuck

Every strong candidate gets stuck. The interviewer is not watching whether it happens; they are watching the ten seconds after.

Say that you are stuck, and what on. "I know I need the next greater element for each index in better than quadratic time, and I'm not seeing the structure yet." That gives the interviewer something to steer, and stating the sub-problem precisely often un-sticks you. Then go back a step in the loop: if the optimisation is not coming, say the brute force again and ask aloud what work it repeats. Propose a simpler version: "let me solve it with no duplicates first, then extend." And time-box it. If two minutes of visible thinking have produced nothing, say "I'll take a hint if you have one" before the interviewer has to offer.

Why does a silent minute cost more than a wrong first idea stated aloud?

[pause]

Because the round is graded from observations, and silence produces none. A wrong idea stated with its reason and then rejected is a recordable act of reasoning. A silent minute gives the interviewer nothing to write and nothing to steer, so the estimate can only fall.

## Taking a hint

A hint is information, not a failure mark, and how you use it is graded. Four steps. Stop: finish your sentence, then stop talking and typing. Restate it and place it in the loop: "you're pointing at the repeated work in my brute force, so this is the optimise step." Derive the consequence aloud, working from the hint to the change in your plan rather than guessing a technique's name. Then confirm the new plan on an example and resume at the step the hint addressed, not from the start.

Here is what that sounds like. Daily temperatures: for each day, how many days until a warmer one. The candidate has stated the quadratic brute force, rejected sorting because it loses order, and says: "I'm stuck. When a warm day arrives it answers some earlier, colder, unanswered days, and I don't see how to find them without scanning." The interviewer asks: which earlier days can still be waiting when a new day arrives?

[pause]

The strong candidate restates it and derives the fact. If an older day and a newer day are both still waiting, the newer one cannot be warmer, or it would have answered the older one. So the waiting days, oldest to newest, never get warmer. Therefore a new day answers waiting days only at the newest end: pop while colder, and everything older stays. That is a stack, named only after it was derived. Each day is pushed once and popped at most once, so it is linear. The hint cost about forty seconds, and the write-up reads "given a nudge about the waiting set, derived the monotone property and the stack unaided".

Three ways to mishandle a hint. Ignoring it, "right, but let me finish this first": the write-up says did not incorporate feedback. Rubber-stamping it, "oh yes, a stack, of course", followed by code that scans anyway: a second, larger hint follows, and two hints on one problem reads as guided. Treating it as a verdict, apologising and clearing the editor: correct work is thrown away. And if you disagree with a hint, say so once, briefly, with a reason, then follow it unless it is withdrawn; the interviewer may be steering toward the follow-up they want to ask.

## How the round is graded

Your words outlive the round. Typically, the interviewer scores a handful of competencies, commonly problem solving, coding, verification, communication and collaboration, each as a list of observable signals rather than a feeling. Asked about constraints before choosing an approach. Stated the brute force and its cost. Derived the optimisation from the repeated work. Traced an example through the final code. Took a hint and extended it unaided.

Within hours the interviewer writes a debrief, and strong interviewers write observations before judgments, with quotes and timestamps. Where there is a hiring committee, it decides from those debriefs, read side by side, by people who never see your editor. At senior level, communication and collaboration are core competencies, not tie-breakers.

Three consequences follow. Silence is unrecordable. A hint is recorded together with what you did after it, and the after is the grade. And narrating decisions is what makes the debrief writable at all: the reasons you say aloud are the quotes; the code you type is an attachment.

"Why" questions are the interviewer collecting those quotes. Why a hash map rather than sorting? The answer form is always the same: the property of the problem that justifies the choice, and the alternative you would use if it did not hold. "Because I need constant-time membership and order doesn't matter; if space were capped, I'd sort and use two pointers." If you do not know, say so and reason from what you do know. Making up an answer is the one thing graded lower than not knowing.

## In the interview

Here is a follow-up the lesson expects. You said linear time, expected. What would make it worse?

[pause]

The hash map's average case assumes keys spread across buckets. Adversarial or degenerate keys collide and degrade lookups toward linear, which is why CPython randomises its string hashes per process. So the whole pass is quadratic in the worst case and linear in expectation. The wrong answer is "nothing, hash maps are constant time".

And another: you've been quiet for a while; what are you thinking? Name the sub-problem and the two options you are weighing, with what would decide between them: "I'm choosing between a count map and a stack; the interleaved case decides it, because counts can't see order." The wrong answer is "sorry, still thinking", which records nothing.

## Recap

Four things to remember. Narrate decisions and reasons, not keystrokes, and go quiet through routine code. At each step of the loop there is one deliverable to say aloud: the restatement and the size of n, an example with its answer, the brute force with a number, the bottleneck and the idea that removes it with its cost and an alternative, and a spoken trace. State complexity as bound, what dominates and the assumption, and explain with claim, mechanism, cost, limits. And when stuck, say what you are stuck on within seconds; when given a hint, stop, restate, derive and resume, because the round is graded from a written debrief, and only what you say can be written down.

At your desk: the two annotated transcripts, the Two Sum and bracket traces, and the table of strategies when stuck.
