---
lesson: learning-without-atrophy
source: 007e418c5dbe9fa5
---
## 1

Why can unrestricted answer-mode AI reduce learning, even while it improves performance on practice tasks?

A, it only helps with easy problems, so hard material never gets practised. B, its answers are often subtly wrong, so learners memorise incorrect material. C, it skips generation and retrieval, and its fluent answers feel like understanding. D, it answers too quickly, so learners never form the habit of spacing their sessions.

[think]

The answer is C: it skips generation and retrieval, and its fluent answers feel like understanding.

Producing and recalling are what build durable understanding, and answer-mode AI removes exactly those steps. Reading a correct, fluent answer feels like understanding, but does not build the ability to produce it: an illusion of competence. The answers being correct is part of why the illusion is convincing, and the field experiment found the harm with a working assistant.

## 2

In the 2025 field experiment with high-school maths students, what distinguished the version of the assistant that did not harm exam performance?

A, it limited students to a fixed number of questions per session. B, it was available only during lessons, never during homework. C, it was instructed to give hints, and to withhold final answers. D, it used a larger model that made fewer mistakes on the practice problems.

[think]

The answer is C: it was instructed to give hints, and to withhold final answers.

The tutor-style version used the same underlying model, with instructions to guide rather than answer. Students using it did better on practice and showed no significant harm on the exam, while unrestricted access improved practice and lowered exam scores. The mode was set by the instructions, which is why a skill file or system prompt is the right tool for making tutor mode reliable.

## 3

Which prompt puts the model in tutor mode for learning how Raft elects a leader?

A, write a small Raft implementation I can read through, and step into with a debugger. B, ask me one question at a time towards the mechanism, and tell me when I am wrong. C, explain Raft leader election in detail, with a worked example of a split vote. D, summarise the Raft paper's election section in five bullet points I can review.

[think]

The answer is B: ask me one question at a time towards the mechanism, and tell me when I am wrong.

Questions force you to generate and retrieve, and being told you are wrong, without being given the answer, keeps the work with you. The other three produce text or code for you to read, which is useful for reference, but builds much less understanding.

## 4

Your prediction ledger shows you were right in 18 of your last 20 predictions. What does that most likely mean?

A, your predictions are too vague to be wrong, and should be made more specific. B, the ledger is working, and you should keep the same material for another month. C, you have mastered the area, and should move on to harder material. D, you are not learning much, because you are practising what you already know.

[think]

The answer is D: you are not learning much, because you are practising what you already know.

A very high hit rate means the material is inside your current understanding, which feels good and teaches little; deliberate practice lives where predictions fail about half the time. Vague predictions are a separate problem worth checking, but the direct reading of a 90 percent rate is that the difficulty is too low, so move on to harder material.

## 5

What is the best protocol for a practice coding problem when you have an AI assistant available?

A, ask for the solution, read it carefully line by line, then move on. B, a solo attempt, the smallest hint, the answer after the struggle, and a re-solve later. C, ask for three different solutions, and memorise the trade-offs of each. D, avoid AI during practice entirely, and check answers against the editorial.

[think]

The answer is B: a solo attempt, the smallest hint, the answer after the struggle, and a re-solve later.

A time-boxed solo attempt, and a re-solve from scratch on an expanding schedule, are where learning happens. The smallest useful hint keeps you at the edge of your ability, instead of past it. Refusing AI entirely throws away fast feedback, and memorising solutions builds recognition, not skill.

## 6

Which is the strongest evidence that you learned a technique you first used with AI help?

A, you can solve an unfamiliar variant unassisted a week later, and explain why. B, the AI reviewed your latest code using it, and confirmed it was correct. C, you merged three pull requests using it, and none of them needed a follow-up fix. D, you have read several explanations of it, and every one of them now feels obvious.

[think]

The answer is A: you can solve an unfamiliar variant unassisted a week later, and explain why.

Unassisted performance on a variant, after a delay, tests durable, transferable understanding. Throughput with the tool, the tool's approval, and repeated reading all fit the fluency illusion.
