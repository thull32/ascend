---
lesson: ai-in-design-and-review
source: e14115aeb25f00fd
fit: great
desk:
  - "The helps-and-hurts table, and the full webhook-ingestion arithmetic table"
  - "The pre-mortem skill file and the sample ADR, as written"
  - "The CI workflow for an AI reviewer, and its three safety details"
  - "The untuned and tuned review-bot table"
---
## Introduction

An AI can produce a twelve-page design document in forty seconds, complete with goals, non-goals, three alternatives and a risk table. It looks finished, and that is the danger. The value of a design document was never the text. It is the thinking that writing it forces on the author, the decisions it records with their reasons, and the alignment it creates among the people who read it. A generated document can skip all three while looking as if it did them.

Senior engineers are judged on the quality of their decisions, and on whether the people around them understood and agreed with them. Used one way, AI is a strong tool for both. Used the other way, it is a way to fake both.

Three ideas. A workflow where you frame, the AI expands, and you decide, with the two confident errors a model made in a real design. How to keep the decision yours, in a pre-mortem and in an architecture decision record. And code review, where cheap generation has changed the economics of the reviewer's attention.

## You frame, the AI expands, you decide

Design is choosing under constraints: your traffic, your team's skills, your budget, your existing systems, your organisation's appetite for risk. The model knows none of these unless you tell it, so by default it designs for an imaginary average company.

So the workflow starts with you. Write the problem statement and constraints yourself, in half a page; that is where the thinking happens. Then ask for divergent options along explicit axes, so you get real alternatives rather than three variations of one idea. Interrogate each with one question: what would make this wrong? Red-team with roles: the on-call engineer, the security reviewer, the finance partner, the team that has to migrate. Then decide, and write the decision and its rationale yourself. Only after that does the AI draft the connective prose, which you edit until it says what you mean.

The worked example is ingestion for a payment provider's webhooks. Peaks of 2,000 events a second during sales. The provider retries for up to three days, delivers at least once, and can deliver out of order. A refund must never be applied twice. A team of four, already running Postgres and Kafka.

You ask for three designs that differ in where durability and deduplication happen, and tell the model not to recommend one yet. You get a useful spread. Option A: a synchronous handler that inserts each event into Postgres with a unique constraint on the provider's event id, and applies it in the same transaction. Option B: a thin handler that acknowledges and enqueues to Kafka, with consumers applying events. Option C: a serverless function with conditional writes to a managed key-value store.

It also contains two claims you must catch. Before I give you the first: the model says option B gives exactly-once refunds, because Kafka supports exactly-once semantics. What is wrong with that?

[pause]

Kafka's exactly-once guarantee covers reading from Kafka, processing, and writing back to Kafka inside a transaction. Applying a refund in Postgres, or calling the provider's API, is a side effect outside Kafka. A consumer that crashes after the database commit and before the offset commit will process the event again. You still need idempotency keyed on the provider's event id, at the point of the side effect.

The second claim: at 2,000 events a second of about 1 kilobyte each, ingest is roughly 2 gigabytes a second. Do it by hand. 2,000 times 1 kilobyte is 2,000 kilobytes, which is 2 megabytes a second. The model was wrong by a thousand times.

Two design facts fall out of the corrected number. First, 2 megabytes a second, and 2,000 small inserts a second, sit comfortably inside what one well-provisioned Postgres primary handles. The streaming platform is not required for the load, and the model's number would have argued for it. Second, retention is a decision. An average day of 300 events a second is about 26 gigabytes of raw events, and a year is about 9 and a half terabytes, so you need a policy for archiving applied events after the provider's three-day retry window.

Unit slips by a factor of a thousand are among the most common errors in generated estimates, because the model produces the shape of an estimate without carrying the units. Recompute every generated number by hand, in steps small enough to check.

## Keeping the decision yours

With the corrections made, you choose option A. The unique constraint gives idempotency at exactly the point of the side effect, the load fits the database you already operate, and a team of four should not add moving parts it does not need. And you record the trigger for revisiting as a number: if sustained ingest approaches 10,000 events a second, or the handler's 99th percentile approaches 40 percent of the provider's delivery timeout, move to option B, keeping the same idempotency key.

That paragraph is yours. The AI widened the options and you caught its errors; neither of those is the decision. The failure the lesson names is decision laundering: "the AI recommended it" standing in for a rationale, and nobody in the review able to explain the trade-off.

To make the AI a useful critic, be specific. "Review my design" gets generic praise with a few safe suggestions. A pre-mortem gets real criticism: assume this design failed badly 18 months after launch, and write the incident report, saying what failed, why review missed it, and what the first warning sign was. Or an assumption audit: list every assumption about load, data shape, dependencies and team capacity, say what happens if each is off by ten times, and which is least certain.

Each produces a list you triage. Most items are irrelevant or already handled; the one or two that are not are worth the whole exercise. Keep the triage visible in the document, as "considered, not applicable because", since reviewers trust a design more when they can see what was ruled out.

A prompt you retype is a habit. A prompt in a file is a process the whole team runs. In Claude Code, the lesson turns the pre-mortem into a skill: a Markdown file invoked as a slash command with the design document's path, which reads the whole document and names the section of this document that should have raised the failure. Other tools have equivalents, and where there is none, pasting the same text with the document attached works.

Then the architecture decision record, the ADR. Michael Nygard's widely used format has a title, a status, the context, the decision and its consequences, and he asks for all the consequences, not just the positive ones. The AI is good at drafting the context from meeting notes. You own the decision and the consequences, and especially the negative ones, because models list advantages generously and costs sparingly. The minus lines are what a future engineer most needs. Verify every factual claim in the context, make each rejected alternative say why, and write the revisit trigger as a number, not an adjective. "Revisit if load grows" never gets revisited.

## What an AI reviewer sees

AI shows up in code review in three roles. As a reviewer on pull requests, it is good at local defects: a missing await, an unchecked null, a leaked file handle, an off-by-one, an error path without a test. It is weak at intent, cross-system consequences, product correctness, and whether the code should exist at all. As the author's pre-review, it catches the mechanical findings before a human looks, so human attention goes on design. And as the subject of review: when an agent wrote most of a pull request, the person who opened it owns every line.

Why is the bot weak at intent? Look at what it is given. It works from the unified diff: the changed hunks with a few lines of context on each side, three by default in git, plus whatever files its harness chooses to read, and usually the title and description. It does not get the ticket, the design document, the conversation where the approach was chosen, or the running system.

Large pull requests are split into chunks, per file or per group of hunks, to fit a token budget, and each chunk is reviewed with limited knowledge of the others. So a rename in one file and a stale caller in another land in different chunks, and the bot sees two locally fine changes. And the code host's review API only allows inline comments on lines in the diff, so the bot cannot annotate the unchanged function the change silently broke. It can only mention it in a summary, where it is easy to miss.

The division of labour follows. Machines catch formatting, types, known insecure patterns, missing tests and local defects. Humans spend their time on whether this is the right problem and the right fix, whether the design fits, cross-service effects, migrations and rollout risk, and the names and API shapes future readers must live with.

When you run a reviewer in CI, the lesson's configuration has three safety details: the job's permissions are only what a reviewer needs, the allowed tools are read-only plus the one command that posts a comment, so an injected instruction in the description cannot make it push code, and a maximum number of turns bounds the loop.

## The review burden and the acted-on rate

Generation got cheap; review did not. A team of six each opens 4 pull requests a week at 30 minutes of review each: 24 pull requests and 12 hours of review. With agents, each opens 10: 60 pull requests and 30 hours. Something gives. Either reviews get shallower, which is rubber-stamping, or the queue grows until throughput is back where it started.

Add a review bot and the attention economics sharpen. The lesson's illustrative numbers, the kind you should measure for your own team. An untuned bot leaves 120 comments a week. 40 are wrong, 50 are right but not worth a change, and 30 lead to a change. A tuned bot leaves 30: 3 wrong, 5 nits, 22 acted on.

Which is better? The untuned one finds more true problems in absolute terms. Hold that thought.

[pause]

The tuned one is better. The untuned bot costs reviewers about 360 minutes a week to read and dismiss, against 69 for the tuned one. Worse, it teaches every reviewer within a week that three comments in four need no action, and a reviewer who has learned that skims the fourth. In the tuned stream, the 22 findings get read because nearly every comment has earned it.

Here is the number to track: the acted-on rate, comments that led to a change divided by comments. 25 percent for the untuned bot, 73 percent tuned. Track it weekly. When it falls under about half, tighten the configuration: changed lines only, higher severity, no style, fewer paths. Accept that the tuned bot reports fewer things. It is the same reason alert fatigue is fixed by deleting alerts, not adding dashboards.

The senior response to the burden is to change the system, not to review faster. Cap pull request size and stack small ones, which also keeps each under the bot's chunking threshold. Move mechanical checks into CI. Prefer codemods to mass edits, so reviewers read the program, not its 200 outputs. Hold authors to explaining every line. And watch review latency, comments per pull request, the bot's acted-on rate, and escaped defects. Falling comments with rising volume is a warning, not a win.

## In the interview

A follow-up the lesson expects: you used an AI to help with this design. Which parts did it do, and which did you?

[pause]

The model answer: I wrote the problem statement and constraints. The model produced divergent options and red-teamed them. I caught two errors in its output, an overstated exactly-once claim and a thousand-fold unit slip. I decided, and I wrote the rationale and the negative consequences. The wrong answer is describing the model's recommendation as the decision, which is decision laundering said out loud.

And a second: pull requests per engineer went from 4 to 10 after adopting agents. What do you watch? Review latency, comments per pull request, the bot's acted-on rate and escaped defects. Falling comments with rising volume means rubber-stamping, and the fix is size caps, CI gates, codemods and author accountability, not faster reviewing. The wrong answer is celebrating the throughput.

## Recap

Four things to remember. Write the problem and constraints yourself, use AI to diverge and red-team, and decide yourself, with the negative consequences and a numeric revisit trigger in the ADR. Catch confident errors by hand: a guarantee stretched past its boundary, like Kafka's exactly-once, and a unit slipped by a thousand. A review bot sees chunked diff hunks, not intent, so keep pull requests small and keep humans on design. And measure a bot by its acted-on rate, not by how much it finds.

At your desk: the helps-and-hurts table and the full arithmetic, the pre-mortem skill and the sample ADR, the CI reviewer configuration, and the tuned-bot table.
