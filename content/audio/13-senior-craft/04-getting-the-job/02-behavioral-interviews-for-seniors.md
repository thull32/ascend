---
lesson: behavioral-interviews-for-seniors
source: 1b988fb050926f91
fit: great
desk:
  - "The anchored rubric, with all five scores for each dimension"
  - "The STAR+ worksheet, filled in for eight stories"
  - "The story-bank matrices: stories against competencies, and questions against stories"
  - "Both stories in full, weak and strong, with the interviewer's note beside every line"
  - "The line-by-line scoring table and both drill-down tables, with the write-ups"
---
## Introduction

"Tell me about a time you disagreed with a technical decision." One candidate describes a library choice on their own team, says the team discussed it and went with their view, and finishes in ninety seconds. Another describes a cross-team decision, the data they gathered, how they took the disagreement to its proposer before the review rather than in it, what they gave up, what happened, and what they now do differently. Both stories are true. Only one of them is evidence of a senior engineer.

The behavioural round is where level is most often decided, and the round senior candidates most often under-prepare, because it feels like a conversation. It is not. It is a structured search for evidence that you have operated at a particular scope, run against a plan, scored against a rubric, by an interviewer trained to dig.

Three ideas. How the round is run and scored. The structure and story bank that prepare you for it. And what happens to a story under the drill-down, weak and strong.

## What the round measures

Behavioural interviewing rests on one premise: past behaviour in similar situations is the best available predictor of future behaviour. So the interviewer asks about specific past situations and scores the evidence against competencies. The names vary by company but cluster around the same things. Ascend's mock interviewer scores five: ownership and impact, judgement, collaboration and conflict, growth and self-awareness, and communication clarity. Amazon's Leadership Principles are the best-known published set, and several of them map directly onto those five.

At senior level, the same competencies are measured at a larger scope: more people and teams, longer horizons, more ambiguity at the start, higher stakes.

## How the round is run

Each interviewer usually arrives with two or three assigned competencies for a 45-minute round. Each competency then gets ten to fifteen minutes: a prompt, your first telling, and a drill-down. Here is the arithmetic that matters. A five-minute monologue spends a third of that budget and leaves a competency with no probe time. Most of the scoring evidence comes from the probes, not from the first telling.

The interviewer wants specific instances only. "What I usually do" and "I would" get redirected to "can you give me a specific time?", because a hypothetical shows what you know is right, not what you do. After a second redirect, the note often reads "no example provided".

After your first telling, they drill several levels: what exactly you did, why, what else you considered, what happened, what you would change. They are looking for the level at which the detail runs out, because invented, inflated or borrowed stories run out early.

And they write near-verbatim notes, tagging each action with who did it. "We migrated the service" goes in the team's column. "I wrote the rollback plan" goes in yours. Only your column is scored for ownership. A story told entirely in "we" leaves nothing to credit, and claiming the team's work is exposed by the next probe. The fix: "I" for your actions, "we" for outcomes, and others named for theirs. "I built the prototype; Priya ran the load test with me; the team shipped the migration."

## From notes to a level

After the round, each competency is scored against an anchored rubric: every score has a written description of the behaviour that earns it, so two interviewers hearing the same story give the same score. On the lesson's illustrative five-point scale, a 3 is a mid-level pass and a 4 is senior.

Take ownership. A 3 owned an outcome within their own team. A 4 owned an outcome across teams, with a business result. Take growth. A 2 names no mistake, or a disguised strength. A 4 names their own mistake, its cost, and a changed behaviour. A 5 also changed the system against a repeat.

Level is argued from scope evidence. A 4 in ownership with "three teams, two quarters, revenue path" in the evidence line reads senior. The same 4 with no scope in the line invites a committee to ask: at what scale?

## STAR plus and the story bank

STAR is situation, task, action, result, in the order the interviewer needs them. The plus adds what most distinguishes senior answers: reflection. The proportions matter. Situation is ten to fifteen percent. Task, about ten. Action, fifty to sixty percent: your decisions, the alternatives you rejected and why, whom you persuaded and how. Result, ten to fifteen, with numbers. Reflection, about ten.

Aim for two to three minutes on the first telling, leaving the interviewer ten minutes to probe. The most common structural mistake is an answer that is 70 percent situation, architecture, org chart and history, with thirty seconds for what you did.

Write each story out once on a worksheet. The part people skip is the follow-up prep: your actions versus the team's, by name; the hardest question someone could ask; your numbers and how you know them; who disagreed and what they would say. That is the material for probes three and four, where weak stories collapse.

Eight to ten stories, each showing two or three competencies, cover almost everything. Good sources: a project you led from an ambiguous start, a disagreement, a real failure, an incident, a decision you changed without authority, mentoring, and a time you cut scope under pressure. Prefer the last three years, and reuse a story at most once per loop, for a different competency. Map stories against competencies. An empty column is a question you are not ready for.

## Story one: the disagreement

The weak telling is about a company-wide push to move from RabbitMQ to Kafka. The candidate felt it would add latency to checkout. "We had a lot of discussions; some people agreed with me and some didn't. In the end we decided not to move checkout, and it worked out well. The lesson is: don't follow the hype." About 40 percent context, latency never measured, no personal action identifiable, the other side absent, a platitude for reflection. Nothing in it is false, and nothing in it scores above the bar.

The strong telling opens with scope: tech lead for checkout, six engineers, about 40 thousand orders a day. The disagreement is precise: right direction, wrong for payment authorisation, where the customer waits. Then three actions. First, they checked whether they were right: a prototype over the event bus took the 99th percentile from 180 milliseconds to about 1.4 seconds, and would need idempotency keys and an outbox to avoid double charges. Second, a two-page document with the numbers, what would have to be true for async to work, and a proposal: authorisation stays synchronous, everything after it moves. Third, a one-to-one with the lead architect before the review, so there was no public surprise. He pushed back on inconsistency, which was fair, so they wrote criteria for when an exception is allowed instead of a one-off carve-out.

The result: about thirty other services migrated on schedule, checkout unaffected, and two quarters later another team used the criteria to get an exception in a day instead of a month. The reflection owns a mistake: they raised it after the decision was announced, which cost two weeks and some goodwill, and now they read proposals during the comment period.

Scored line by line against the rubric, the weak telling gets 10 out of 25. The strong one gets 22. Before I tell you: which single line earns the strong version the top judgement score?

[pause]

"What would have to be true for async to work." The top judgement anchor asks for alternatives with costs, a decision under uncertainty with evidence, and what would have changed the decision. That line is the last element.

Then the drill-down. Probe one: what exactly did you measure, and how? The strong candidate names the load generator, credits Priya, and knows the limit of the number: tuning got it to about 600 milliseconds and no lower. The weak candidate says "we saw in testing that it was slower." Probe three: didn't the exception create the inconsistency the migration was meant to remove? The strong candidate concedes it, then bounds the cost with the criteria. The weak candidate gets defensive. Those two probes settle the round: lean no hire for the weak version, hire at senior for the strong.

## Story two: the costly mistake

"Tell me about a mistake you made that had real consequences." The weak version: an outage during a sale, the cache ran out of memory, traffic was twice the forecast so nobody could have predicted it, "I jumped on the call and helped", and the lesson is "I care about reliability maybe too much, so now I over-provision everything." That is a deflection to product, an unclear role, unstated impact, and a disguised strength.

The strong version owns it in the first sentence. They designed the catalogue cache, about 3 thousand requests a second at peak, and sized it from the average item size with 30 percent headroom. During the biggest sale of the year, bundle products arrived whose entries were ten to forty times the average. The hit rate fell from about 95 percent to about 60, product pages ran at three seconds at the 99th percentile for forty minutes, and conversion dropped. They found the evictions, shed a call that doubled cache reads, failed over to a larger node, and in the postmortem put their own sizing decision first among the causes: sized on the mean when the risk was in the tail. Then they fixed the system: sizing from measured distributions, an eviction-rate alert, a production-shaped load test, and a template two other teams now use.

The interviewer then asks: traffic beat the forecast, so why is this your mistake? The strong answer separates the trigger from the cause. Traffic was about 1.7 times forecast, but even at forecast the bundle entries would have exceeded memory. The forecast was an input; the method was mine. The weak candidate deflects again, and that line becomes no hire on the competency.

A failure story done well is one of the strongest senior signals, because clean ownership of a real mistake is what makes someone safe to give autonomy.

## In the interview

Four techniques carry most follow-ups. Answer the question asked: a drill-down wants one level more detail, not a retelling. Pause before hard ones; three seconds of thought reads as care. Be precise about what you do not know. And concede fair points, because the challenge probe is where defensiveness most often ends a round.

Here is a follow-up the lesson expects. What was your part, specifically, versus the team's?

[pause]

Two or three decisions that were yours, one argument you lost, and teammates credited by name. "It was really a team effort" reads as no contribution, and claiming everything is exposed by the next probe.

And if your honest stories feel too small, check first whether you are underselling them, which is usually the problem. If the scope really is small, gain it before the move. Never inflate it: composites collapse at probe three, and a credibility doubt sinks the whole packet.

## Recap

Four things to remember. The round is a structured search for evidence, and most of it comes from the drill-down, so keep the first telling to two or three minutes. Only your "I" column is scored for ownership; credit others by name. Make the action half the story, and prepare the follow-ups as carefully as the telling. And a failure story should own a real decision, separate the trigger from the cause, and show a changed habit and a changed system.

At your desk: the anchored rubric, the STAR plus worksheet, the story-bank matrices, and both stories with their notes, scores, drill-downs and write-ups.
