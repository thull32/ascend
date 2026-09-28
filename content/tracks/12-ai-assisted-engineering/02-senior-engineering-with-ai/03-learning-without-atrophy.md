---
slug: learning-without-atrophy
title: "Learning without atrophy: using AI to get deeper, not shallower"
description: Why answer-mode AI can stop learning (generation, retrieval and the fluency illusion, with the studies behind each), how to put a model in tutor mode with reusable prompts and a skill file, the predict-then-verify loop with a written ledger, a spaced re-solve schedule, a deliberate practice plan for busy engineers, and how to tell whether you are actually improving.
minutes: 25
difficulty: medium
tags: [ai-tools, learning, deliberate-practice, career, interview-prep]
---
You ship a feature in an unfamiliar framework in a day, with an agent doing most of the typing. A week later a colleague asks why the component renders twice, and you cannot say. A month later, in an interview with no assistant, you freeze on a problem you "solved" three times with help. You were productive. You did not learn.

For an engineer aiming at senior, that trade is expensive. Seniority is accumulated understanding: mental models of how systems behave, which failure modes to expect, which trade-offs matter. That understanding forms during the effortful parts of the work, the struggling, guessing, getting it wrong and working out why. An AI that does those parts for you makes you faster this week and no stronger next year. The fix is not to avoid AI. It is to choose, deliberately, when you want an answer and when you want to learn, and to have a mechanism, not a mood, for each.

## Why answer-mode help can stop learning

Four well-established findings from the psychology of learning explain the mechanism.

- **The generation effect.** Information you produce yourself is remembered better than information you read. Writing the function yourself, even badly, builds more than reading a correct one.
- **Retrieval practice.** Recalling something strengthens memory far more than re-reading it. In the classic 2006 experiments by Roediger and Karpicke, students who read a passage and then took one recall test remembered more of it a week later than students who spent the same time re-reading it, roughly 56% against 42% of the ideas in the passage; the re-readers had felt more confident immediately afterwards.
- **Desirable difficulties.** Conditions that make learning feel harder (spacing sessions out, mixing problem types, testing yourself) tend to produce better long-term retention, while conditions that feel smooth often produce an illusion of competence.
- **The fluency illusion.** A clear explanation is easy to follow, and following feels like understanding. The test of understanding is producing the explanation, not recognising it.

Answer-mode AI removes exactly the generation and retrieval steps, and it produces the smoothest, most fluent explanations you have ever read. There is direct evidence that this matters. A field experiment with about a thousand high-school maths students in Turkey (Bastani and colleagues, run in 2023 and 2024 and published in PNAS in 2025 under the title "Generative AI without guardrails can harm learning") compared three conditions. Students with unrestricted access to a GPT-4 assistant did about 48% better on practice problems while they had it, and about 17% *worse* on the later closed-book exam than students who never had access. A tutor-style version that gave hints and withheld final answers did about 127% better on practice and showed no significant harm on the exam. The tool was the same; the mode was different, and the mode was set by a system prompt.

A second study is about you rather than students. In METR's randomised trial published in July 2025, experienced open-source maintainers completed real issues in repositories they knew well; with AI tools they took about 19% longer, having predicted beforehand that they would be about 24% faster, and believing afterwards that they had been about 20% faster. The result depends on the setting and later tools may shift it, but the gap it measured, between felt and measured speed, is the same gap as the fluency illusion: the feeling of progress is produced by the smoothness of the interaction, not by the outcome.

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

Typing that every time is a mood, not a mechanism, and moods lose to deadlines. Make it a command. In Claude Code, at the time of writing, a skill is a Markdown file with front matter under `.claude/skills/<name>/SKILL.md` (personal skills live under `~/.claude/skills/`), invoked as `/<name>`; `$ARGUMENTS` is replaced by whatever you type after the command. Other tools have an equivalent (Cursor and Copilot use prompt files, Gemini CLI custom commands), and a shell alias that pastes the text works everywhere.

```markdown
---
name: tutor
description: Socratic tutor mode for learning a concept without being handed the answer
---
You are tutoring me on: $ARGUMENTS

Rules for this session:
- Ask one question at a time that leads me towards the mechanism.
- When I am wrong, say so and say which part, but do not give the answer.
- Never write the solution or the full explanation unless I type GIVE UP.
- After I explain something correctly, ask for the failure mode or the
  trade-off a senior engineer would name next.
- End by asking me to write a five-sentence summary from memory, then grade it.
```

Then `/tutor Raft leader election` starts a session that cannot slide into answer mode because you were tired. Put the same rules in a rules file if you want them to apply to every session in a learning repository.

This app's coach is built in tutor mode on purpose. Its system prompt in `crates/core/src/ai/coach.rs` tells it to "diagnose before you explain", to "go one level deeper than the obvious answer: mechanism, trade-off, and the failure mode a senior engineer would name", and never to "hand over a full solution to an exercise or practice problem the learner is working on. Give the next hint, the invariant, or the question that unblocks them. If they explicitly say they have given up, give the approach in prose first, then code." The in-interview assistant in assisted mock interviews is the opposite: it is told to "write code when asked", because that is what the interview is testing. Same model, different job, and the job is set by about ten lines of instructions. How those instructions are assembled and cached is in [Building the AI coach](/learn/case-study-ascend/product-systems/building-the-ai-coach).

## Under the hood: why the explanations feel so convincing

The fluency illusion is stronger with a model than with a textbook, and the reason is mechanical. A model's output is sampled from the most probable continuations of the prompt, and the training that made it helpful (preference tuning on human judgements) rewarded answers that people rated highly: well-structured, confident, complete-sounding. Human raters prefer such answers even when they are wrong, so confidence and correctness were partly decoupled during training. The prose you read has been optimised to feel like understanding. Nothing in the process checks whether *you* could reproduce it, and nothing penalises an explanation that skips the step you actually needed. The mechanics are in [Training LLMs](/learn/ai-and-llms/how-llms-work/training-llms) and [Capabilities and failure modes](/learn/ai-and-llms/how-llms-work/capabilities-and-failure-modes); the consequence for learning is that a fluent answer is evidence about the model's training, not about your understanding.

## Predict, then verify

The single most useful habit: before you run the code, ask the model, or press play on a visualisation, **write down your prediction**. Then compare. The gap between prediction and result is exactly what you did not understand, made visible. Predicting also forces retrieval and generation, so it turns passive reading into practice.

Try it on the graph below. Before stepping through, write down the order in which Dijkstra's algorithm finalises the nodes starting from A, and the final distance to F.

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": false, "start": "A", "goal": "F",
 "nodes": [{"id":"A"},{"id":"B"},{"id":"C"},{"id":"D"},{"id":"E"},{"id":"F"}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"C","to":"B","w":1},{"from":"B","to":"D","w":5},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":10},{"from":"D","to":"E","w":2},{"from":"D","to":"F","w":6},{"from":"E","to":"F","w":3}],
 "title": "Predict first, then step", "caption": "Write down the finalisation order and the distance to F before pressing play. Then compare, and explain any difference to yourself before moving on."}
```

The order is A, C, B, D, E, F, and F ends at distance 13 via A-C-B-D-E-F. If you finalised B at distance 4 straight from A, you have learned, in a way you will remember, why Dijkstra finalises the closest *unvisited* node rather than following the cheapest edge out of the current one: B is reached more cheaply through C. Reading that sentence in a textbook would not have taught you as much. The full mechanism is in [Shortest paths with Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra).

Keep a **prediction ledger**: one line per prediction, with the result and the reason for any gap. A week of one engineer's ledger, as an illustration of the shape:

| Before | Prediction | Result | Gap and what it taught |
|---|---|---|---|
| Running the new test | Fails on the assertion | Fails with `ImportError` | The test was not exercising the code at all; check the failure reason, not the colour |
| `EXPLAIN` on the orders query | Index scan on `(tenant_id, created_at)` | Sequential scan | The `LOWER(email)` filter defeated the index; expression indexes exist for this |
| Stepping the Dijkstra viz | A, B, C, D, E, F | A, C, B, D, E, F | Confused "cheapest edge" with "closest node" |
| Sending a prompt to the agent | It will edit `list.py` only | It also rewrote `pagination.py` | My spec did not name a non-goal; add "do not modify" lines |
| Deploying the pool-size change | p99 drops, error rate unchanged | Error rate rises | Fewer connections meant queue timeouts under peak; the pool was not the bottleneck |

Three of the five gaps are lessons about tools and systems that no explanation would have installed as firmly. The ledger also gives you a calibration measure: if your predictions are right nine times in ten, you are working in territory you already know, and it is time to practise something harder.

## Learning a new codebase with AI

Joining a team or inheriting a service is where AI help is most tempting and where the fluency illusion is strongest: an agent can produce a beautiful tour of a repository in a minute, and you will remember almost none of it. Use the tour, but make yourself do the generative part:

1. **Sketch first.** Before asking anything, spend 15 minutes reading the entry points and draw how you think a request flows through the system. Get it wrong; that is the point.
2. **Then compare.** Ask the agent to trace the same request path with file and line references. Every difference between its trace and your sketch is a fact you will now remember, and some differences will be the agent's mistakes, which you should confirm in the code.
3. **Generate questions, not answers.** "Give me ten questions about this service that a new team member should be able to answer after a week" gives you a self-test. Answer them yourself, then check.
4. **Change something small by hand.** A log line, a validation rule, a test. Touching the build, the tests and the deploy path once teaches more than reading about them.

The same pattern works for a new language or framework: attempt, compare with the model's version, and study the differences rather than the model's version alone.

## Spacing: the re-solve schedule

Re-solving a problem days later is the step people skip, and it is where most of the retention comes from. Spacing works because each retrieval after partial forgetting strengthens the memory more than a retrieval while it is still fresh. A schedule that expands the gap each time is the common practical form; the exact days matter less than the expansion.

| Day | What you do | Assistance allowed |
|---|---|---|
| 0 | Solve the problem; note where you got stuck and what unblocked you | Hints only, after a 20-minute solo attempt |
| 1 | Re-solve from a blank file | None until finished |
| 3 | Solve a **variant** (different constraint, same pattern) | None until finished; then ask for two more variants |
| 7 | Explain the pattern to the coach or a colleague from memory, then re-solve the original | Tutor mode to find gaps in the explanation |
| 14 | Solve a harder problem that uses the pattern as one step | Hints only |
| 30 | Re-solve the original, timed, as if in an interview | None |

If a re-solve fails at any row, the schedule restarts from day 0 for that problem. Track a handful of problems at a time; the aim is depth on patterns, not breadth of problems seen. [The problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop) gives the structure for each attempt, and this app's practice set groups problems by pattern so variants are easy to find.

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
4. **Re-solve from scratch** a few days later, without looking, on the schedule above.

## Turning AI-written code into learning

When an agent writes something non-trivial that you accept, extract the learning before you move on:

- **Explain every line or do not merge.** If a line surprises you, find out why it is there, from the documentation and not only from the model.
- **Rewrite the core from memory** the next day: close the file and reproduce the 20 lines that matter. Where you get stuck is what you did not understand.
- **Ask for alternatives and their trade-offs**: "what are two other ways to do this, and when would each be better?" Then decide which you would have chosen, and why.
- **Try to break it**: ask for inputs that would break it, predict the outcome, then run them.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| You recognise the solution to a problem instantly but cannot write it in a blank file | Recognition without production; the fluency illusion from reading solutions | Re-solve from blank files on the spaced schedule; no reading solutions before a solo attempt |
| You cannot start a task without opening the assistant | The hypothesis and planning steps have been outsourced so long that they feel impossible | First 15 minutes solo on every task for a month; write the plan before the first prompt |
| Your assisted mock interview scores rise while solo scores stay flat or fall | You are getting better at directing the tool and no better at the underlying skill | Alternate solo and assisted runs of the same problem type; treat the solo score as the real one |
| A month after shipping a feature you cannot explain a design decision in it | The decision was made by the model's defaults and accepted without a reason being recorded | Ask agents to report every decision the spec did not cover; write the reason next to each in the pull request |
| Your predictions are right nine times in ten | You are practising what you already know, which feels good and teaches little | Move to material where you are right about half the time; that is the edge |
| You feel much faster with the tool but your throughput of finished, reviewed work has not changed | Felt speed and measured speed have diverged, as in the METR result | Measure with a ledger of completed tasks and review turnaround, not with how the day felt |

## Measuring whether you are learning

Productivity with the tool is not evidence of learning. Evidence looks like:

- You can solve a **variant** of last week's problem without assistance.
- You can **explain the mechanism** to a colleague, or to the coach, without notes.
- You can **predict** how the code or system will fail before it does, and your ledger shows the hit rate improving on new material.
- Your **solo mock interview** scores improve, not only your assisted ones.

Warning signs are equally concrete: you cannot start a task without opening the assistant; you recognise solutions but cannot produce them; you cannot explain code you merged last week. When you notice them, shift the balance back towards tutor mode and solo reps for a while.

## Interviewer follow-ups

**"How do you use AI when you are learning something new, as opposed to shipping?"** Model answer: in tutor mode, with the model asking questions and withholding answers, after a solo attempt; predictions written down before checking; re-solves on a spaced schedule; success measured by unassisted performance. Common wrong answer: "I ask it to explain things and it is a great teacher", which describes answer mode and the fluency illusion.

**"You said the assistant made you faster on that project. How do you know?"** Model answer: by a measurement, such as tasks completed per week with review turnaround, compared with a baseline; and an admission that felt speed is unreliable, citing the METR result. Common wrong answer: restating the feeling with more confidence.

**"An agent wrote most of a module you own. A colleague asks why it uses a heap. What do you do if you do not know?"** Model answer: say so, then find out from the code and the documentation, and change the workflow so that decisions the spec did not cover are reported and recorded next time. Common wrong answer: asking the agent to explain and repeating the explanation as your own understanding.

**"How would you onboard a new engineer onto this service now that agents can generate a tour of it?"** Model answer: have them sketch the request flow first, then compare with an agent's trace, then make a small change by hand through build, test and deploy; the tour is a comparison target, not the lesson. Common wrong answer: "give them the generated tour and the agent; they will pick it up faster".

**"What is the difference between the coach and the interview assistant in a platform like this one?"** Model answer: the same model with different instructions: the coach withholds solutions and asks questions because its job is learning; the assistant writes code because the interview tests whether you can direct and verify it; the mode is set by the system prompt, and the platform enforces which one is available. Common wrong answer: "the assistant is a more capable model".

## What mid-level engineers get wrong

- **Reading solutions as practice.** They read five editorials an evening and recognise every pattern, then cannot produce one under time pressure; recognition and production are different memories.
- **Skipping the re-solve.** The first solve feels like the learning; the retention comes from retrieval after partial forgetting, so the skipped step was the one that mattered.
- **Trusting felt speed.** They report the assistant doubled their output without a measurement, and the review queue tells a different story.
- **Explaining with the model's words.** Asked why a design choice was made, they reproduce the explanation the model gave, which is evidence of the model's training, not their understanding.
- **Practising what they already know.** Predictions right nine times in ten feel like mastery and teach almost nothing; the edge is where the hit rate is about half.
- **Letting the mode be a mood.** Tutor mode requires typing a paragraph of rules each time, so under deadline it becomes answer mode; a skill file or alias makes the mode a mechanism.

## Senior signals

- You choose **answer mode or tutor mode** deliberately, by whether the goal is output or understanding, and you have made tutor mode a command rather than a habit.
- You know why answer-mode help can stall learning: it removes **generation and retrieval** and creates a **fluency illusion**, and you can cite the field evidence for it.
- You **predict before you verify**, keep a ledger, and treat the gap as the lesson and the hit rate as a calibration signal.
- You run a **time-boxed solo attempt** before asking for hints, and you re-solve problems on an **expanding schedule**.
- You extract learning from AI-written code by **explaining, rewriting from memory and breaking** it.
- You measure learning by **unassisted performance**, not by throughput with the tool or by how fast the day felt.

## Check yourself

```quiz
- q: >-
    Why can unrestricted answer-mode AI help reduce learning even while it improves performance on practice tasks?
  options: ["It only helps with easy problems, so hard material never gets practised", "Its answers are often subtly wrong, so learners memorise incorrect material", "It skips generation and retrieval, and its fluent answers feel like understanding", "It answers too quickly, so learners never form the habit of spacing their sessions"]
  answer: 2
  explanation: >-
    Producing and recalling are what build durable understanding, and answer-mode AI removes exactly those steps. Reading a correct, fluent answer feels like understanding but does not build the ability to produce it: an illusion of competence. The answers being correct is part of why the illusion is convincing, and the field experiment found the harm with a working assistant.
- q: >-
    In the 2025 field experiment with high-school maths students, what distinguished the version of the assistant that did not harm exam performance?
  options: ["It limited students to a fixed number of questions per session", "It was available only during lessons, never during homework", "It was instructed to give hints and withhold final answers", "It used a larger model that made fewer mistakes on the practice problems"]
  answer: 2
  explanation: >-
    The tutor-style condition used the same underlying model with instructions to guide rather than answer; students in it did better on practice and showed no significant harm on the exam, while unrestricted access improved practice and lowered exam scores. The mode was set by the instructions, which is why a skill file or system prompt is the right tool for making tutor mode reliable.
- q: >-
    Which prompt puts the model in tutor mode for learning how Raft elects a leader?
  options: ["Write a small Raft implementation I can read through and step into with a debugger", "Ask me one question at a time towards the mechanism, and tell me when I am wrong", "Explain Raft leader election in detail, with a worked example of a split vote", "Summarise the Raft paper's election section in five bullet points I can review"]
  answer: 1
  explanation: >-
    Questions force you to generate and retrieve, and being told you are wrong without being given the answer keeps the work with you. The other three produce text or code for you to read, which is useful for reference but builds much less understanding.
- q: >-
    Your prediction ledger shows you were right in 18 of the last 20 predictions. What does that most likely mean?
  options: ["Your predictions are too vague to be wrong and should be made more specific", "The ledger is working and you should keep the same material for another month", "You have mastered the area and should move on to harder material", "You are not learning much, because you are practising what you already know"]
  answer: 3
  explanation: >-
    A very high hit rate means the material is inside your current understanding, which feels good and teaches little; deliberate practice lives where predictions fail about half the time. Vague predictions are a separate problem worth checking, but the direct reading of a 90% rate is that the difficulty is too low, so move on to harder material.
- q: >-
    What is the best protocol for a practice coding problem when you have an AI assistant available?
  options: ["Ask for the solution, read it carefully line by line, then move on", "Solo attempt, smallest hint, answer after the struggle, re-solve later", "Ask for three different solutions and memorise the trade-offs of each", "Avoid AI during practice entirely, and check answers against the editorial"]
  answer: 1
  explanation: >-
    A time-boxed solo attempt and a re-solve from scratch on an expanding schedule are where learning happens; the smallest useful hint keeps you at the edge of your ability instead of past it. Refusing AI entirely throws away fast feedback, and memorising solutions builds recognition, not skill.
- q: >-
    Which is the strongest evidence that you learned a technique you first used with AI help?
  options: ["You can solve an unfamiliar variant unassisted a week later, and explain why", "The AI reviewed your latest code using it and confirmed it was correct", "You merged three PRs using it, and none of them needed a follow-up fix", "You have read several explanations of it, and every one of them now feels obvious"]
  answer: 0
  explanation: >-
    Unassisted performance on a variant after a delay tests durable, transferable understanding. Throughput with the tool, the tool's approval and repeated reading all fit the fluency illusion.
```
