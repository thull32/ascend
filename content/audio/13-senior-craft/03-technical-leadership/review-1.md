---
review: technical-leadership
source: 87b8c5dfb8086baf
---
## Introduction

Twelve questions from the technical-leadership module. Answer out loud before the answer comes.

They run in the order of the lessons: what senior means, leading without authority, code review, design docs, incidents, estimation, and cross-team impact. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

An engineer is the only person who can debug the payments service, and fixes every incident personally. Why can this stall their promotion?

A, fixing incidents is reactive, and promotions reward only new features. B, they are a single point of failure, and seniors spread the knowledge. C, incident work does not count as engineering output in most rubrics. D, payments is a maintenance area, so its work rarely shows senior scope.

[think]

The answer is B: they are a single point of failure, and seniors spread the knowledge.

Heroics are visible, but they create risk and cap leverage: the organisation cannot move someone it cannot do without. Seniors turn the same expertise into runbooks, pairing and a shared rotation. Incident work itself is valued. Hoarding it is the problem.

## Question 2

Three teams agree your migration matters, but none has scheduled it. What is the most effective next step?

A, wait for an incident to prove the risk and create the urgency. B, lower their cost: a codemod, your own pull requests, and dates in their plans. C, ask a director to mandate it so it lands on every team's roadmap. D, send a firmer email to the leads with a deadline and the risks.

[think]

The answer is B: lower their cost, with a codemod, your own pull requests, and dates in their plans.

Agreement without scheduling is a cost problem, not a persuasion problem. Lowering the cost of saying yes, and getting the work into their planning, produces commitment. A mandate buys compliance and spends goodwill, and waiting for an incident accepts the very risk you are trying to remove.

## Question 3

A mid-level engineer's pull request has a subtle race condition in a background job that is not urgent. Which review comment teaches best?

A, approve now, and quietly fix the race yourself in a follow-up later. B, a blocking comment: this is racy, add a lock around the job pickup before merge. C, push a fix to their branch yourself, so the race never reaches main. D, a question: what happens if two workers pick up the same job at once?

[think]

The answer is D: ask what happens if two workers pick up the same job at once.

For an issue that is not urgent, a leading question lets the author find the race themselves, and remember it. Stating the fix outright is right for urgent or security problems. Pushing a fix, or quietly fixing it later, removes both the learning and the author's ownership.

## Question 4

A change touches a database migration, an auth module, and 300 lines of ordinary code. How should its review be staffed?

A, two reviewers who each read the whole diff, top to bottom, to be safe. B, one reviewer who knows the module, since the total is under 400 lines. C, the owners of the data and auth paths review those parts with the risk checklist. D, an AI first pass, then a human approves anything the tool did not flag.

[think]

The answer is C: the owners of the data and auth paths review them, with the risk checklist.

Review depth follows risk, not size. Migrations and authentication are high-risk areas with their own checklists and owners. A single generalist, or two people reading top to bottom, tend to find the typos rather than the timing leak or the table lock. An AI pass is a filter before human review, not a replacement for the owner's judgement.

## Question 5

Reviewers keep criticising your design for not supporting multi-region failover, which you never intended to build this quarter. What was most likely missing from the doc?

A, a clearer architecture diagram. B, a longer executive summary. C, more alternatives considered. D, an explicit non-goals section.

[think]

The answer is D: an explicit non-goals section.

Non-goals tell readers what is deliberately out of scope, which keeps the review on the problem being solved. Without them, reviewers fill the gap with their own assumptions. No diagram, summary or extra alternative says that the omission was deliberate.

## Question 6

Two layers of services each make up to three attempts, and the dependency behind them fails every call. How many calls does the dependency receive per user request? And what does a 10 percent retry budget at each layer change that to?

A, 9, reduced to about 1.21. B, 9, reduced to about 3. C, 3, reduced to about 1.1. D, 6, reduced to about 1.1.

[think]

The answer is A: 9, reduced to about 1.21.

Retries multiply across layers. Three attempts at the outer layer each cause three at the inner one, nine in all. A budget caps retries at 10 percent of requests per layer, so each layer adds at most 1.1 times its load, and two layers give 1.1 times 1.1, about 1.21. Adding the layers instead of multiplying them is the mistake behind 6.

## Question 7

Twelve minutes into an incident, the engineer acting as incident commander starts reading application logs to find the bug. What is the problem?

A, nobody is coordinating, so work and communication stall. B, the commander should escalate to a manager before any diagnosis. C, debugging should wait until the incident is fully over. D, logs lag too far behind, and the commander should read metrics instead.

[think]

The answer is A: nobody is coordinating, so work and communication stall.

The commander's job is coordination and decisions. When they switch to debugging, responders duplicate work, updates stop, and nobody approves mitigations. Debugging during the incident is right. The commander doing it is the problem, so hand over command first.

## Question 8

Why does the postmortem list contributing factors, instead of stopping at the five-whys chain?

A, five whys is not accepted as evidence in a blameless postmortem. B, contributing factors are needed only when several teams were involved. C, five whys follows one path, and misses why the incident was so large and so late. D, the chain ended in a person, so it had to be replaced entirely.

[think]

The answer is C: five whys follows one path, and misses why it was so large and so late.

The chain correctly leads to a missing test. But it cannot explain the canary that saw no logins, the readiness probes that removed healthy instances, or the seven minutes from page to declaration. Asking why it was not caught, and why it was so large, opens those branches. The chain is still useful. It is just not sufficient.

## Question 9

At the initial concept stage, you estimate 20 ideal days. Three weeks later, nobody has decided the scope. What range should you still quote?

A, about 10 to 40 days, as three weeks have passed. B, about 5 to 80 days, as nothing has been decided. C, about 16 to 24 days, as three-point ranges apply. D, about 18 to 22 days, as the team knows the code.

[think]

The answer is B: about 5 to 80 days, because nothing has been decided.

McConnell's cone of uncertainty runs from a quarter of the estimate to four times it at the initial concept. It narrows only when decisions remove sources of variability, such as approving the product definition. Time passing with no decisions leaves the range where it was. A narrow range at this stage prices only the unknowns someone has listed.

## Question 10

A VP says the CEO has announced a launch in five weeks. Your 90 percent forecast for the full scope is twelve weeks. What is the strongest first response?

A, decline, since the forecast shows the date cannot be met. B, accept the date, ask what was promised, and size a slice. C, agree to the date, and trim the testing and rollout plan. D, commit to five weeks, and add two engineers to the team.

[think]

The answer is B: accept the date, ask what was promised, and size a slice.

A public date is a constraint, so the negotiation moves to scope. Find what was actually promised, size a slice to the date at a stated confidence, and name what it displaces. Adding people late costs ramp-up, and when four people become six the pairs who must coordinate go from 6 to 15, which is Brooks's point. A flat refusal leaves the VP no options, and cutting tests moves the cost into the next incident.

## Question 11

The adoption tracker shows 31 of 40 services on the new client, but only 58 percent of outbound calls go through it. What does that tell you?

A, the services not yet migrated carry heavy traffic, so the risk remains. B, adoption is complete enough to announce, and to start deprecation. C, the count is what matters, so the migration is 77 percent successful. D, the traffic figure is noise, since call volumes vary daily.

[think]

The answer is A: the services not yet migrated carry heavy traffic, so the risk remains.

Risk follows traffic, not service count. One legacy service carrying a quarter of the calls still retries the old way, so the outage class has not been removed. Reporting by count alone is the vanity-adoption failure mode.

## Question 12

Every new feature in your area needs coordinated changes by three teams, and planning is slow and contentious. What might a senior engineer suspect?

A, the teams need a shared channel and backlog to cut hand-offs. B, the product manager writes tickets too vague to split cleanly. C, the service boundaries are misaligned with how the product changes. D, the teams need more planning meetings to align their roadmaps earlier.

[think]

The answer is C: the service boundaries are misaligned with how the product changes.

Conway's law links an organisation's communication structure to its system structure. Persistent cross-team coupling for routine changes often means the boundaries are in the wrong place, which is an architecture problem as much as a process one. More meetings or shared channels treat the symptom and leave the coupling in place.

## Recap

Three ideas kept coming back. Leverage over heroics: the senior move spreads knowledge, lowers other people's cost of saying yes, and teaches through questions rather than fixes. Structure before effort: non-goals, an incident commander who does not debug, contributing factors beyond one causal chain, and service boundaries that match how the product changes. And measure what carries the risk: the cone narrows only with decisions, retries multiply across layers, and adoption counts by traffic, not by services.
