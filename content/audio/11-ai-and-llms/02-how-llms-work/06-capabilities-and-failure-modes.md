---
lesson: capabilities-and-failure-modes
source: 3d8ab40a04ebd0ea
fit: great
desk:
  - "The temperature and top-p sampling visualisation for The capital of France is"
  - "The entropy and calibration arithmetic, and the mitigation table"
  - "The reasoning cost table, the compounding table and the majority-vote binomial sum"
  - "The lost-in-the-middle position harness, to run against your own model"
  - "The five probes to run yourself, and the eval sample-size arithmetic"
  - "Exercise: what self-consistency buys"
---
## Introduction

Three requests arrive on the same Monday. Support wants an LLM to answer refund disputes automatically. The analytics team wants it to write SQL from plain-English questions. The incident team wants it to draft post-incident timelines from Slack exports.

"Yes, the model is very capable" is the wrong answer to all three. So is "no, LLMs hallucinate". The right answer depends on which failures are structural for each task, how you would detect them, and what an undetected error costs. By the end you will be able to answer all three.

Start with when models are reliably good. Three conditions. The information needed is in the context, or is common knowledge that appears densely in training data. The task is a transformation rather than an act of recall: rewrite, reformat, classify against given criteria, draft in a familiar genre. And the output can be checked, by a reader, a schema, a compiler, a test suite or a database. When all three hold, current models are remarkably dependable. As each one weakens, failures rise, and the kind of failure is predictable.

## Why fluent text can be false

A language model generates plausible continuations. It has no separate step that looks a fact up or checks it against the world. For a well-known fact, the most plausible continuation is the true one, because the training data overwhelmingly agrees. For a long-tail fact, a small company's founding year, an obscure API's parameters, the title of a paper, the learned distribution is diffuse. But sampling still has to emit something, and it emits it in the same confident, fluent voice as a true answer.

Watch it in miniature. After "The capital of France is", the model gives Paris 77 percent at temperature 1. Raise the temperature to 1.5 and the distribution flattens: Paris falls to 58 percent, and Lyon, plausible and wrong, now has about a 9 percent chance of being picked.

So does setting the temperature to zero cure hallucination?

[pause]

No. For a famous fact, the top choice is right and only sampling can go wrong. For an obscure fact, the top choice itself may be invented. Lowering the temperature makes the model consistently give its best guess, and its best guess may be made up.

There is a deeper reason too. The output layer is a softmax over the vocabulary, and a softmax always sums to one. There is no reserved slot for "none of these". Abstaining has to be learned as ordinary text, like "I'm not sure", and training text rarely continues a question that way. Post-training has historically rewarded answers that sound complete, which pushes the same direction.

Hallucination has recognisable shapes: fabricated citations and quotes, wrong numbers and dates, summaries that add a detail the document never contained, and invented APIs. That last one has a security twist. If models keep suggesting the same non-existent package, an attacker can register that name, and developers who install the suggestion get the attacker's code. A 2024 study found that at least 5 percent of packages suggested by commercial models, and over 20 percent by open-source ones, did not exist.

The uncertainty is often visible in the numbers even when the text hides it. Where an API exposes token probabilities, a spread-out distribution over the first answer token is a cheap warning sign. And a second signal needs no probabilities at all: ask several times. Facts the model knows come back the same; invented ones vary. What does not work well is the model's stated confidence. In the lesson's illustrative audit, answers stated at about 95 percent confidence were right 85 percent of the time. Measure calibration on your own labelled data before you route on it.

The theme of every good mitigation: check the output with something that does not share the model's failure modes. Code, a database, a test suite, the source document, or a person. Requiring citations and checking in code that the quoted text really appears in the source costs microseconds and catches fabricated quotes. Asking the model whether it is right does not, because it shares the failure.

## Reasoning, and errors that compound

Each generated token gets a fixed amount of computation: one pass through the network. A problem that needs more serial steps than one pass can perform cannot be answered reliably in a single token. Ask for 23 times 47 with no working, and the model must produce 1081 by pattern-matching alone. Let it write 23 times 40 plus 23 times 7, which is 920 plus 161, and every token is an easy prediction given the ones before it. The written steps are external working memory. That is the mechanism behind chain-of-thought and behind the trained reasoning modes.

The extra computation is paid in tokens, and the cost ratio is the token ratio. A 5-token direct answer against a 300-token chain of thought is 60 times the price. A 4 thousand token reasoning trace is 800 times. At the lesson's assumed prices, that is under 10 cents per thousand queries against 60 dollars, and a decode of a tenth of a second against 80 seconds. Reasoning is a budget to spend where accuracy is worth it, not a default.

Some limits remain whatever you spend. Long exact computation, like big arithmetic or date maths across time zones, degrades with length, so give the model a code tool. Counting letters fails because tokenization hides the characters. Many interacting constraints produce plausible plans that violate one, so let a solver check. And a correct-looking explanation can accompany a wrong answer.

Now multi-step work, which multiplies reliability. If each step of an agent's task succeeds independently 95 percent of the time, the whole task succeeds with 0.95 multiplied by itself once per step. Five steps: 77 percent. Ten steps: 60. Twenty steps: 36 percent. Fifty: 8. Before I go on, how would you get twenty steps back above 90 percent?

[pause]

Check each step. If a check catches 90 percent of step errors and the step is retried, a step now fails only when it errs and the check misses: 5 percent of 10 percent, half a percent. Twenty checked steps then succeed about 90 percent of the time, against 36 unchecked. Per-step verification, with tests, schema checks, or a tool that confirms the state, is how long agent runs stay reliable.

## Voting, tools and the context

Self-consistency attacks single-answer errors instead. Sample several answers at a moderate temperature and take the majority. If each sample is independently right 60 percent of the time, a vote of five is right about 68 percent of the time, eleven about 75, and 25 about 85.

Two caveats decide whether it works. First, voting amplifies whichever side is the majority. If each sample is right only 40 percent of the time, the same vote of five falls to 32 percent: it hurts on questions the model usually gets wrong. Second, real samples are correlated, because the same misconception recurs, so measured gains are smaller than the formula says. And it costs five times the tokens.

Tools convert weaknesses into strengths. With tool use, the model emits a structured request, your code runs it, and the result goes back into the context. The model no longer needs to remember today's exchange rate or multiply eight-digit numbers. But the failure modes move rather than disappear: the wrong tool, subtly wrong arguments, looping, and the most dangerous one, treating tool output as instructions.

Which brings us to failures that come from the context itself. Information buried in the middle of a long context is used less reliably than information near the start or end. Irrelevant material lowers accuracy even when the relevant material is present. The system prompt, the user and a retrieved document can disagree. Prompt injection works because all of the context is just tokens: there is no hard boundary between instructions and data, so a retrieved page saying "ignore previous instructions" can be followed. Push back on a correct answer, and models often give in, a legacy of preference training. And past its knowledge cutoff, a model describes the previous version of your framework.

## Measuring it

The most common way LLM features fail is that nobody measured them. Build a task-specific evaluation set from real inputs, including hard and adversarial cases. Grade automatically where you can: exact match, schema validation, running generated code, checking citations. And run it on every change to the prompt, model, retrieval or tools.

Size it for the difference you care about. At 80 percent accuracy, 100 items gives you a margin of error of nearly 8 points either way. 500 items, three and a half. A thousand, two and a half. Telling two independent runs apart by 3 points needs about 1,400 items each. Grading both prompts on the same items needs far fewer, because the shared difficulty cancels out. A 3-point win on 100 items is noise.

If an LLM judges the answers, know its biases: it tends to favour one position, often the first answer of two; it favours longer answers; and it favours text like its own. Suppose prompt A beats prompt B 64 percent of the time when shown first, and only 46 percent when shown second. The order-averaged win rate is 55 percent. Most of the apparent margin was position. Swap the order, use a specific rubric, and check agreement with human labels on a sample.

Public benchmarks help you pick which models to try, but test sets leak into training data and popular ones saturate, so leaderboard gaps predict your task weakly.

## What to trust

Two questions decide it: what does an undetected error cost, and how checkable is the output? A meeting summary for the people who attended is low cost, and the readers were there: ship it with light review. Invoice field extraction can be validated against a schema and the totals. Customer policy answers should cite the policy text, with an "I don't know" path and escalation to a person. Decisions about people's health, money or legal status get decision support only, with a person accountable. And actions with side effects, refunds, deletions, emails, get narrow permissions, limits, and confirmation for anything irreversible.

So, back to Monday. Incident timelines from Slack: yes, with the incident commander reviewing. SQL generation: yes, as a drafting tool, with the query shown and run read-only. Automatic refund decisions: not autonomously. Draft the response with cited policy, and let a person approve anything that moves money. Trust should rise with verifiability and fall with the cost of an error. The system, not the model, guarantees the outcome.

## In the interview

A follow-up the lesson expects. The new prompt wins 58 percent of pairwise comparisons on 100 items, with an LLM judge. Do you ship it?

[pause]

Not yet. Swap positions to remove position bias, control for length, check the judge against a human-labelled sample, and compute an interval. With 100 items the standard error on a rate near one half is about 5 points, so 58 percent is within two standard errors of a tie. The wrong answer is "58 beats 50, ship it".

And the classic: your agent does 20-step tasks and fails half the time. Where do you look? The arithmetic first: 95 percent per step is 36 percent end to end, so per-step reliability and verification matter more than the model. Find which step types fail in the traces, add checks and retries there, and shorten the plan. The wrong answer is "use a bigger model", with no measurement of where the steps fail.

## Recap

Four things to remember. Hallucination is plausible continuation with no truth check, from a softmax with no slot for not knowing, so lowering the temperature makes a wrong top choice consistent rather than fixing it. Check output with something that does not share the model's failure modes: code, a schema, tests, the source, or a person. Do the reliability arithmetic: steps multiply, voting helps only above one half, and chain-of-thought costs as many times more as it has tokens. And measure on your own evaluation set, sized for the difference you care about, with the judge's order swapped.

At your desk: the sampling visualisation, the entropy and calibration numbers, the cost, compounding and voting tables, the position harness and probes to run against your model, and the self-consistency exercise.
