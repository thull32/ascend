---
lesson: learning-without-atrophy
source: 7b4079629a378048
fit: great
desk:
  - "The tutor-mode prompts and the tutor skill file, to copy"
  - "The Dijkstra predict-then-step visualisation"
  - "The sample prediction ledger, the re-solve schedule and the weekly practice plan as tables"
---
## Introduction

You ship a feature in an unfamiliar framework in a day, with an agent doing most of the typing. A week later a colleague asks why the component renders twice, and you cannot say. A month later, in an interview with no assistant, you freeze on a problem you "solved" three times with help. You were productive. You did not learn.

For an engineer aiming at senior, that trade is expensive. Seniority is accumulated understanding: mental models of how systems behave, which failures to expect, which trade-offs matter. That understanding forms during the effortful parts of the work: struggling, guessing, getting it wrong and working out why. An AI that does those parts for you makes you faster this week and no stronger next year.

The fix is not to avoid AI. It is to choose deliberately when you want an answer and when you want to learn, and to have a mechanism, not a mood, for each. Three ideas: why answer-mode help can stop learning, with the evidence. How to switch a model into tutor mode and keep it there. And the habits that turn practice into durable skill: predicting before you check, re-solving on a schedule, and measuring the right thing.

## Why answer mode can stop learning

Four well-established findings from the psychology of learning explain the mechanism.

The generation effect: what you produce yourself, you remember better than what you read. Writing the function yourself, even badly, builds more than reading a correct one.

Retrieval practice: recalling something strengthens memory far more than re-reading it. In Roediger and Karpicke's classic 2006 experiments, students who read a passage and took one recall test remembered about 56 percent of its ideas a week later, against 42 percent for students who spent the same time re-reading. And in their second experiment, the students who had only re-read predicted they would remember best, and a week later remembered least.

Desirable difficulties: conditions that feel harder, like spacing sessions out, mixing problem types and testing yourself, tend to produce better long-term retention. Smooth conditions often produce an illusion of competence.

And the fluency illusion: a clear explanation is easy to follow, and following feels like understanding. But the test of understanding is producing the explanation, not recognising it.

Answer-mode AI removes exactly the generation and retrieval steps, and it produces the smoothest, most fluent explanations you have ever read. There is direct evidence that this matters. A field experiment with about a thousand high-school maths students in Turkey, by Bastani and colleagues, published in June 2025 under the title "Generative AI without guardrails can harm learning", compared three conditions. Before I give you the numbers: what do you think unrestricted access to the assistant did to the closed-book exam?

[pause]

Students with unrestricted access to an assistant built on GPT-4 did about 48 percent better on practice problems while they had it, and about 17 percent worse on the later exam than students who never had it. A tutor-style version that gave hints and withheld final answers did about 127 percent better on practice and showed no significant harm on the exam. Same tool, different mode, and the mode was set by a system prompt.

A second study is about you rather than students. In a randomised trial from the research group METR, published in July 2025, experienced open-source maintainers worked on real issues in repositories they knew well. With AI tools they took about 19 percent longer. They had predicted they would be about 24 percent faster, and afterwards believed they had been about 20 percent faster. A February 2026 update with later tools estimated returning developers at about 18 percent faster, with a wide range, from 38 percent faster to 9 percent slower, and called its own data unreliable because many developers now declined to work without AI. The sign moves with the tools. The gap between felt speed and measured speed is the fluency illusion again: the feeling of progress comes from the smoothness of the interaction, not from the outcome.

## Two modes, and making tutor mode a command

Answer mode is right when you are shipping a task in a codebase you know: generate, verify, move on. Tutor mode is right when you are learning a concept, preparing for interviews, or trying to understand code an agent wrote. In tutor mode, instead of "explain this", you say "I think this does X because Y; where am I wrong?"

The tutor-mode prompts share a shape. "I am learning how Raft elects a leader. Do not explain it yet. Ask me one question at a time that leads me towards the mechanism, and tell me when my answer is wrong but not what the right answer is." Or: here is my explanation of consistent hashing; find the gaps, but do not rewrite it, point to the sentence and ask me a question.

Typing that every time is a mood, and moods lose to deadlines. Make it a command. In Claude Code, a skill file turns those rules into a slash command, so "tutor, Raft leader election" starts a session that cannot slide into answer mode because you were tired. The rules: one question at a time, say which part is wrong but not the answer, never write the solution unless I type "give up", ask for the failure mode or trade-off a senior engineer would name next, and end by making me write a five-sentence summary from memory and grading it. Other tools have equivalents, and a shell alias that pastes the text works everywhere.

This app's coach is built in tutor mode on purpose. Its instructions tell it to diagnose before it explains, to go one level deeper to the mechanism, the trade-off and the failure mode, and never to hand over a full solution to an exercise the learner is working on. The assistant in the assisted mock interview is the opposite: it is told to write code when asked, because that is what the interview tests. Same model, different job, set by about ten lines of instructions.

Why do model explanations feel so convincing? Preference tuning rewarded answers that people rated highly: well-structured, confident, complete-sounding. Human raters prefer a convincingly written wrong answer over a correct one a non-negligible fraction of the time, so confidence and correctness were partly decoupled in training. A fluent answer is evidence about the model's training, not about your understanding.

## Predict, then verify

The single most useful habit: before you run the code, ask the model, or step through a visualisation, write down your prediction. Then compare. The gap between prediction and result is exactly what you did not understand, made visible. And predicting forces retrieval and generation, so it turns passive reading into practice.

The lesson's example is Dijkstra's algorithm. From node A, an edge to B costs 4, and an edge to C costs 2, and from C to B costs 1. If you predict that B is finalised at distance 4, straight from A, you are wrong: it is finalised at 3, through C. And now you know, in a way you will remember, that Dijkstra finalises the closest unvisited node rather than following the cheapest edge out of the current one.

Keep a prediction ledger: one line per prediction, the result, and the reason for any gap. A test you predicted would fail on the assertion fails on an import error, so it was never exercising the code; check the failure reason, not the colour. You predict an agent will edit one file, and it also rewrites a second one, because your spec named no non-goal. Gaps like these teach things about tools and systems that no explanation installs as firmly.

The ledger is also a calibration measure. If your predictions are right nine times in ten, you are practising what you already know. That feels good and teaches little. The edge, where deliberate practice lives, is where you are right about half the time.

The same pattern works on a new codebase, where the fluency illusion is strongest: an agent produces a beautiful tour in a minute and you remember almost none of it. So sketch first. Spend 15 minutes on the entry points and draw how you think a request flows. Then ask the agent to trace the same path with file and line references. Every difference is a fact you will now remember, and some differences will be the agent's mistakes, which you confirm in the code. Then change something small by hand, through build, test and deploy.

## Spacing and deliberate practice

Re-solving a problem days later is the step people skip, and it is where most of the retention comes from. Each retrieval after partial forgetting strengthens memory more than a retrieval while it is still fresh. The schedule expands: solve on day zero, with hints only after a 20-minute solo attempt. Re-solve from a blank file on day one. A variant on day three. Explain the pattern from memory and re-solve on day seven. A harder problem that uses it on day fourteen. And a timed re-solve, unassisted, on day thirty. If any re-solve fails, that problem restarts from day zero. The exact days matter less than the expansion.

Deliberate practice means working at the edge of your ability on a specific weakness, with fast feedback, and repeating. AI is excellent at two parts of that: feedback on demand, and generating variants. You have to supply the other two: the struggle and the repetition.

So the protocol for any practice problem has four steps. A time-boxed solo attempt, about 20 minutes, noting where you get stuck. The smallest hint that unblocks you, then continue alone. The answer only after the struggle, compared with your attempt line by line. And a re-solve from scratch days later. The lesson builds that into a weekly plan of about four hours for a busy engineer.

When an agent writes something non-trivial you accept, extract the learning. Explain every line or do not merge. The next day, close the file and rewrite the 20 lines that matter from memory; where you get stuck is what you did not understand. Ask for two alternatives and when each would be better. And try to break it, predicting the outcome before you run it.

## Measuring whether you are learning

Productivity with the tool is not evidence of learning. Evidence is unassisted: you can solve a variant of last week's problem without help, explain the mechanism without notes, predict how the system will fail before it does, and your solo mock interview scores rise, not only your assisted ones.

The warning signs are just as concrete. You cannot start a task without opening the assistant. You recognise solutions instantly but cannot write them in a blank file. You cannot explain a design decision in code you merged last month, because the model's defaults made it and nobody recorded why. When you notice them, shift back towards tutor mode and solo reps for a while.

## In the interview

A follow-up the lesson expects: you said the assistant made you faster on that project. How do you know?

[pause]

The model answer: by a measurement, such as tasks completed per week with review turnaround, against a baseline, plus an admission that felt speed is unreliable, citing the METR result where people believed they were 20 percent faster and were 19 percent slower. The wrong answer is restating the feeling with more confidence.

And: an agent wrote most of a module you own, and a colleague asks why it uses a heap. You do not know. What do you do? Say so, find out from the code and the documentation, and change the workflow so that decisions the spec did not cover are reported and recorded next time. The wrong answer is asking the agent and repeating its explanation as your own understanding.

## Recap

Four things to remember. Answer-mode help removes generation and retrieval and creates a fluency illusion: in the field experiment, unrestricted access helped practice and hurt the exam, while the hint-only tutor did not. Choose the mode deliberately, and make tutor mode a command rather than a mood. Predict before you verify, keep a ledger, and aim for material where you are right about half the time. And re-solve on an expanding schedule, measuring learning by unassisted performance, not by how fast the day felt.

At your desk: the tutor prompts and skill file, the Dijkstra visualisation to predict and step through, and the ledger, re-solve schedule and weekly plan.
