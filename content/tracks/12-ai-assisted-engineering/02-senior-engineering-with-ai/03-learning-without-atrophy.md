---
slug: learning-without-atrophy
title: "Learning without atrophy: using AI to get deeper, not shallower"
description: Why answer-mode AI can stop learning (generation, retrieval and the fluency illusion), how to use AI as a tutor instead, the predict-then-verify loop, a deliberate practice plan for busy engineers, and how to tell whether you are actually improving.
minutes: 20
difficulty: medium
tags: [ai-tools, learning, deliberate-practice, career, interview-prep]
---
You ship a feature in an unfamiliar framework in a day, with an agent doing most of the typing. A week later a colleague asks why the component renders twice, and you cannot say. A month later, in an interview with no assistant, you freeze on a problem you "solved" three times with help. You were productive. You did not learn.

For an engineer aiming at senior, that trade is expensive. Seniority is accumulated understanding: mental models of how systems behave, which failure modes to expect, which trade-offs matter. That understanding forms during the effortful parts of the work, the struggling, guessing, getting it wrong and working out why. An AI that does those parts for you makes you faster this week and no stronger next year. The fix is not to avoid AI. It is to choose, deliberately, when you want an answer and when you want to learn.

## Why answer-mode help can stop learning

Four well-established findings from the psychology of learning explain the mechanism.

- **The generation effect.** Information you produce yourself is remembered better than information you read. Writing the function yourself, even badly, builds more than reading a correct one.
- **Retrieval practice.** Recalling something strengthens memory far more than re-reading it. Each time you pull an idea out of your head, it gets easier to pull out next time.
- **Desirable difficulties.** Conditions that make learning feel harder (spacing sessions out, mixing problem types, testing yourself) tend to produce better long-term retention, while conditions that feel smooth often produce an illusion of competence.
- **The fluency illusion.** A clear explanation is easy to follow, and following feels like understanding. The test of understanding is producing the explanation, not recognising it.

Answer-mode AI removes exactly the generation and retrieval steps, and it produces the smoothest, most fluent explanations you have ever read. There is direct evidence that this matters. A 2024 field experiment with high-school maths students (Bastani and colleagues, published as "Generative AI Can Harm Learning") found that students given unrestricted access to a GPT-4 assistant did better on practice problems while they had it, and worse on later exams without it than students who never had access. A tutor-style version designed to give hints instead of answers largely avoided the harm. The tool was the same; the mode was different.

## Two modes: answer and tutor

| You want to | Answer mode | Tutor mode |
|---|---|---|
| Ship a task in a codebase you know | Yes: generate, verify, move on | Unnecessary |
| Learn a new concept or framework | Explanations you will forget | Questions that make you build the model |
| Prepare for interviews | Solutions you can recognise but not produce | Hints, then your own solution, then critique |
| Understand code an agent wrote | "Explain this" (passive) | "I think this does X because Y; where am I wrong?" (active) |

Prompts that put a model in tutor mode:

```text
I am learning how Raft elects a leader. Do not explain it yet. Ask me one
question at a time that leads me towards the mechanism, and tell me when
my answer is wrong but not what the right answer is.

Here is my explanation of consistent hashing. Find the gaps and errors.
Do not rewrite it; point to the sentence and ask me a question about it.

I think this function has a race condition. Do not tell me where. Tell me
whether I am right and give me one hint about which state to look at.

Here is my solution. Give me three inputs, one at a time, that you think
break it. I will trace each one by hand before you tell me the answer.
```

This app's coach is built in tutor mode on purpose. Its instructions tell it to diagnose before explaining, and never to hand over a full solution to an exercise or practice problem you are working on; instead it gives the next hint, the invariant, or the question that unblocks you, and only lays out the approach if you explicitly say you have given up. The in-interview assistant in assisted mock interviews is the opposite: it writes code when asked, because that is what the interview is testing. Same model, different job.

## Predict, then verify

The single most useful habit: before you run the code, ask the model, or press play on a visualisation, **write down your prediction**. Then compare. The gap between prediction and result is exactly what you did not understand, made visible. Predicting also forces retrieval and generation, so it turns passive reading into practice.

Try it on the graph below. Before stepping through, write down the order in which Dijkstra's algorithm finalises the nodes starting from A, and the final distance to F.

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": false, "start": "A", "goal": "F",
 "nodes": [{"id":"A"},{"id":"B"},{"id":"C"},{"id":"D"},{"id":"E"},{"id":"F"}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"C","to":"B","w":1},{"from":"B","to":"D","w":5},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":10},{"from":"D","to":"E","w":2},{"from":"D","to":"F","w":6},{"from":"E","to":"F","w":3}],
 "title": "Predict first, then step", "caption": "Write down the finalisation order and the distance to F before pressing play. Then compare, and explain any difference to yourself before moving on."}
```

The order is A, C, B, D, E, F, and F ends at distance 13 via A-C-B-D-E-F. If you finalised B at distance 4 straight from A, you have just learned, in a way you will remember, why Dijkstra finalises the closest *unvisited* node rather than following the cheapest edge out of the current one: B is reached more cheaply through C. Reading that sentence in a textbook would not have taught you as much. The full mechanism is in [Shortest paths with Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra).

The same loop works everywhere: predict the output of a test before running it, the query plan before `EXPLAIN`, the effect of a config change before deploying it, and what the agent will do with a prompt before you send it.

## Learning a new codebase with AI

Joining a team or inheriting a service is where AI help is most tempting and where the fluency illusion is strongest: an agent can produce a beautiful tour of a repository in a minute, and you will remember almost none of it. Use the tour, but make yourself do the generative part:

1. **Sketch first.** Before asking anything, spend 15 minutes reading the entry points and draw how you think a request flows through the system. Get it wrong; that is the point.
2. **Then compare.** Ask the agent to trace the same request path with file and line references. Every difference between its trace and your sketch is a fact you will now remember, and some differences will be the agent's mistakes, which you should confirm in the code.
3. **Generate questions, not answers.** "Give me ten questions about this service that a new team member should be able to answer after a week" gives you a self-test. Answer them yourself, then check.
4. **Change something small by hand.** A log line, a validation rule, a test. Touching the build, the tests and the deploy path once teaches more than reading about them.

The same pattern works for a new language or framework: attempt, compare with the model's version, and study the differences rather than the model's version alone.

## Deliberate practice with AI

Deliberate practice means working at the edge of your ability on a specific weakness, with fast feedback, and repeating. AI is excellent at two parts of that: feedback on demand and generating variants. You have to supply the other two: the struggle and the repetition.

A weekly plan for a busy engineer, about four hours:

| Session | What you do | Where AI comes in |
|---|---|---|
| 45 min | One coding problem, solo and timed | Afterwards only: review my complexity analysis and edge cases |
| 45 min | Re-derive one concept on paper (say, consistent hashing), then write a one-page explanation | Tutor mode: find the gaps in my explanation |
| 60 min | A work task in an unfamiliar area | Answer mode allowed, under the rule "explain every line or do not merge" |
| 30 min | Spaced review of the week | Quiz me on my notes, one question at a time |
| 30 min | Re-solve a problem from two weeks ago without looking | None until finished |

And a protocol for any practice problem:

1. **Time-boxed solo attempt**, about 20 minutes for a coding problem. Write down where you get stuck.
2. **Hints, not answers.** Ask for the smallest hint that unblocks you, then continue alone.
3. **The answer only after the struggle**, then compare it with your attempt line by line.
4. **Re-solve from scratch** a few days later, without looking. This is the step people skip, and it is where most of the learning is.

[The problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop) gives the structure for each attempt.

## Turning AI-written code into learning

When an agent writes something non-trivial that you accept, extract the learning before you move on:

- **Explain every line or do not merge.** If a line surprises you, find out why it is there, from the documentation and not only from the model.
- **Rewrite the core from memory** the next day: close the file and reproduce the 20 lines that matter. Where you get stuck is what you did not understand.
- **Ask for alternatives and their trade-offs**: "what are two other ways to do this, and when would each be better?" Then decide which you would have chosen, and why.
- **Try to break it**: ask for inputs that would break it, predict the outcome, then run them.

## Measuring whether you are learning

Productivity with the tool is not evidence of learning. Evidence looks like:

- You can solve a **variant** of last week's problem without assistance.
- You can **explain the mechanism** to a colleague, or to the coach, without notes.
- You can **predict** how the code or system will fail before it does.
- Your **solo mock interview** scores improve, not just your assisted ones.

Warning signs are equally concrete: you cannot start a task without opening the assistant; you recognise solutions but cannot produce them; you cannot explain code you merged last week. When you notice them, shift the balance back towards tutor mode and solo reps for a while.

## Senior signals

- You choose **answer mode or tutor mode** deliberately, by whether the goal is output or understanding.
- You know why answer-mode help can stall learning: it removes **generation and retrieval** and creates a **fluency illusion**.
- You **predict before you verify**, and treat the gap as the lesson.
- You run a **time-boxed solo attempt** before asking for hints, and you re-solve problems days later.
- You extract learning from AI-written code by **explaining, rewriting from memory and breaking** it.
- You measure learning by **unassisted performance**, not by throughput with the tool.

## Check yourself

```quiz
- q: >-
    Why can unrestricted answer-mode AI help reduce learning even while it improves performance on practice tasks?
  options: ["AI answers are usually wrong", "It removes the generation and retrieval steps where memory and understanding form, and its fluent explanations create an illusion of competence", "It is too slow to keep learners engaged", "It only helps with easy problems"]
  answer: 1
  explanation: >-
    Producing and recalling are what build durable understanding. Reading a correct, fluent answer feels like understanding but does not build the ability to produce it. The answers being correct is part of why the illusion is convincing.
- q: >-
    Which prompt puts the model in tutor mode for learning how Raft elects a leader?
  options: ["Explain Raft leader election in detail with an example", "Write a Raft implementation I can read", "Ask me one question at a time that leads me towards the mechanism, and tell me when I am wrong without giving the answer", "Summarise the Raft paper in five bullet points"]
  answer: 2
  explanation: >-
    Questions force you to generate and retrieve. The other three produce text for you to read, which is useful for reference but builds much less understanding.
- q: >-
    Why write down a prediction before running code or stepping through a visualisation?
  options: ["It makes the program run faster", "It forces retrieval and makes the gap between your model and reality visible, which is exactly what you need to learn", "Predictions are graded by the platform", "It avoids the need for tests"]
  answer: 1
  explanation: >-
    Without a written prediction, hindsight makes every result feel expected. The prediction turns observation into practice and pinpoints the misunderstanding.
- q: >-
    What is the best protocol for a practice coding problem when you have an AI assistant available?
  options: ["Ask for the solution, read it carefully, move on", "A time-boxed solo attempt, then the smallest useful hint, then the answer only after the struggle, then re-solving from scratch a few days later", "Never use AI for practice", "Ask the AI to solve it three different ways and memorise them"]
  answer: 1
  explanation: >-
    The solo attempt and the later re-solve are where learning happens; hints keep you at the edge of your ability instead of past it. Refusing AI entirely throws away fast feedback, and memorising solutions builds recognition, not skill.
- q: >-
    Which is the strongest evidence that you learned a technique you first used with AI help?
  options: ["You merged three PRs using it", "You can solve an unfamiliar variant without assistance a week later and explain why it works", "The AI said your code was correct", "You have read about it several times"]
  answer: 1
  explanation: >-
    Unassisted performance on a variant after a delay tests durable, transferable understanding. Throughput with the tool, the tool's approval and repeated reading all fit the fluency illusion.
```
