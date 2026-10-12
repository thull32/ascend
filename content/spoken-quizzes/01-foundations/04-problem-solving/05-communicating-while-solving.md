---
lesson: communicating-while-solving
source: 6e65d0f2b24b7d99
---
## 1

An interviewer asks why a hash map rather than sorting. Which answer best demonstrates senior-level reasoning?

A, it is the standard solution to this problem, so it is the safe choice. B, I need constant-time lookups, not order; if space were capped, I'd sort instead. C, hash maps are faster than sorting, and speed is what the problem needs. D, sorting is n log n while one hash-map pass is linear, so it is faster.

[think]

The answer is B: I need constant-time lookups, not order; if space were capped, I'd sort instead.

The strong answer names the property of the problem that justifies the choice, membership queries with order irrelevant, and the condition under which the alternative wins: with constant extra space required, sorting plus two pointers is right. "Standard solution" and "faster" are assertions without reasons. The n log n comparison is true, but it does not explain why sorting is unnecessary here, or when it would win.

## 2

You have been silent for two minutes and are not making progress on the optimisation. What is the best next move?

A, ask the interviewer for a different problem that suits you better. B, start coding the brute force, so the interviewer sees progress. C, keep thinking silently, since talking would break your focus. D, say exactly what you are stuck on, then ask for a hint if needed.

[think]

The answer is D: say exactly what you are stuck on, then ask for a hint if needed.

Naming the sub-problem gives the interviewer something to steer, and often unblocks you. Restating the brute force and its repeated work, going back one step in the loop, is the protocol's built-in recovery. Silence, and coding a brute force nobody asked for, both waste time without producing anything the interviewer can grade.

## 3

Which complexity statement is the most complete?

A, it's about n log n, which is efficient for this input size. B, it's efficient: roughly linear time and constant extra space. C, n log n time, dominated by the sort, and linear space for the new list that sorted builds. D, n log n or n squared, depending on how the input happens to look.

[think]

The answer is C: n log n time, dominated by the sort, and linear space for the new list that sorted builds.

A complete statement gives the bound, what dominates it, the sort followed by a linear scan, and the implementation detail behind the space figure: Python's sorted allocates a new list. Hedging between two bounds, or offering "efficient", tells the interviewer nothing they can check.

## 4

The interviewer gives a hint that steers toward an approach you think is slightly worse than your own idea. What should you do?

A, explain why your approach is better until the interviewer agrees. B, thank them, then carry on with your own idea, since it is better. C, restate the hint, say once why you differed, then follow it. D, drop your idea without comment, and follow the hint from scratch.

[think]

The answer is C: restate the hint, say once why you differed, then follow it.

Restating the hint in your own words shows it landed. One sentence of disagreement with a reason shows judgement. Following it unless the interviewer withdraws it respects that they may be steering toward a planned follow-up. Ignoring or arguing at length is graded as poor collaboration, and silently restarting hides your reasoning and throws away correct work.

## 5

In the lesson's transcript, a candidate is stuck on finding the next warmer day, and the interviewer gives a hint. Which line turns that hint into a positive entry in the write-up?

A, deriving that the days still waiting for an answer have non-increasing temperatures. B, saying the word stack as soon as the interviewer speaks. C, saying the brute force is order n squared and too slow. D, apologising for needing the hint before continuing.

[think]

The answer is A: deriving that the days still waiting for an answer have non-increasing temperatures.

The graded part of a hint is what happens after it. Restating the hint and deriving the structural fact, that the unanswered days form a non-increasing sequence, shows the candidate understood the nudge and did the reasoning unaided; naming the technique only follows from that. Saying stack immediately is rubber-stamping, which invites a second hint, and apologising records nothing useful.

## 6

Why does a silent minute cost more in a senior coding round than a wrong first idea stated aloud?

A, the debrief records observations: silence yields none, while a stated idea shows reasoning. B, a wrong idea is expected at senior level, while silence signals a memorised solution. C, interviewers are told to penalise any pause that runs past thirty seconds. D, senior rounds are shorter, so each silent minute costs proportionally more time.

[think]

The answer is A: the debrief records observations; silence yields none, while a stated idea shows reasoning.

The hiring decision is made from written debriefs of observable signals, read by people who do not see the code. A wrong idea, stated with its reason and then rejected, is a recordable act of reasoning. A silent minute gives the interviewer nothing to write and nothing to steer, so the estimate can only fall. There is no fixed pause penalty, and silence does not imply memorisation.
