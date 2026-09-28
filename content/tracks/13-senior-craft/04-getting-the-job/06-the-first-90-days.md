---
slug: the-first-90-days
title: "The first 90 days: landing as a senior engineer"
description: How new senior hires are evaluated behind the scenes, a week-by-week plan with checkpoints, the artefacts that carry it (30/60/90 plan, listening-tour notes and synthesis, a corrected system map, a scored fresh-eyes log, weekly notes, the first proposal, a 90-day retrospective), two new seniors compared week by week, failure modes and the questions managers ask at 30, 60 and 90 days.
minutes: 25
difficulty: easy
tags: [career, onboarding, leadership, trust, first-90-days]
---
The offer is signed and the loop is over. You were hired as a senior engineer, which means the organisation expects you to make a visible difference, and soon. It also means you arrive with almost none of the currency that lets senior engineers make a difference: trust. Nobody has seen your judgement yet. You do not know why the system looks the way it does, which of its oddities are scars from past incidents, or who makes which decisions. The first 90 days decide which story people tell about you afterwards: "the senior hire who raised the bar", "the expensive hire who hasn't done much yet", or "the one who tried to rewrite everything in their second week".

The pattern that works is easy to state and hard to follow under pressure to prove yourself: learn before you change things, earn trust with small reliable deliveries, then spend that trust on something that matters. This lesson shows how a new senior is evaluated behind the scenes, turns the pattern into a week-by-week plan with checkpoints, gives a template for each artefact the plan produces, and compares two new seniors week by week with what their teams observed. Every plan, team and person below is illustrative.

## What is expected of you

Expectations vary by company and manager. A common shape for a senior hire:

| By roughly | You are expected to |
|---|---|
| Week 2 | Have shipped a small change to production end to end |
| Day 30 | Understand the team's systems at the whiteboard level; be doing real work |
| Day 60 | Own a meaningful piece of work; take part in on-call |
| Day 90 | Deliver that work; start influencing decisions beyond your own tickets |
| Month 6 | Be a go-to person for part of the system; be improving how the team works |

Do not guess at your manager's version. Ask in your first week:

> "What would make you say, at 90 days, that hiring me was a great decision? And what would worry you?"

Write the answer down and build the plan from it. This one conversation prevents most first-quarter misunderstandings, because every later checkpoint is measured against it.

## Under the hood: how a new senior is evaluated

None of this is written on your first-day checklist, and most of it happens in conversations you are not in.

**The hiring hypothesis.** Your manager hired you at a level, against a story from the interview packet: "they'll own the settlement roadmap", "they'll fix our on-call". Your first months are read against that hypothesis, not against a generic newcomer. The week-one question above is how you find out what it is.

**The informal read.** Managers form a view long before any review. They ask your onboarding buddy and a teammate or two how it is going, and a skip-level manager asks your manager. The evidence is a handful of observable events: your first pull request (its size, its description, how you respond to review), your first estimate against your first delivery, your first on-call shift, your first comment in a design discussion, and how you talk about decisions made before you arrived. Early impressions shape how later evidence is read, so those first events carry more weight than their size suggests.

**The first review cycle.** Many companies have a cut-off date, after which a new joiner gets a partial rating or none in their first cycle. Where ratings are calibrated across managers, your manager has to defend yours with specific examples. In your first cycle those examples are your first deliveries, so they need to be visible and written down; the weekly note below is the source material.

**The onboarding buddy.** Many teams assign a peer to answer your questions. Use them heavily; their impression of how you learn reaches your manager informally.

**Probation.** In several countries, particularly in Europe, a probation period of a few months with a shorter notice period is standard, set by contract or by law. Some companies elsewhere have an introductory period. In the US most employment is at will and a formal probation is less common. Read your contract. At a company that uses something like Netflix's keeper test ([Netflix: culture and interviews](/learn/senior-craft/getting-the-job/netflix-culture-and-interviews)), the check is continuous rather than a single date.

## The plan, week by week

An illustrative 13-week plan for a senior joining a payments platform team. Each week produces an artefact someone else can see, and ends at a checkpoint.

| Week | Focus | Artefact | Checkpoint |
|---|---|---|---|
| 1 | Environment; manager 1:1 on success; meet the buddy | 30/60/90 plan, first draft | Manager comments on the draft by Friday |
| 2 | First production change; listening tour, first 4 people | Listening-tour notes | Change deployed; first weekly note sent |
| 3 | Listening tour, next 4; read a year of postmortems and design docs | System map, version 1 | A teammate corrects the map |
| 4 | Shadow on-call; start the fresh-eyes log | Listening-tour synthesis | Day-30 1:1: what you learned, top three themes |
| 5 | Bounded project scoped | One-page project plan with milestones | Manager agrees scope and date |
| 6 | Project; fix one onboarding problem you hit | Setup script or corrected doc, merged | Buddy confirms it works on a clean machine |
| 7 | Project milestone 1; regular code reviews | System map, version 2 | Weekly note reports the milestone |
| 8 | Join the on-call rotation | Fresh-eyes log, scored | Day-60 1:1 and a skip-level conversation |
| 9 | Project delivered | Launch note to stakeholders | Delivered on the week-5 date |
| 10 | Choose one improvement; talk to its owners first | One-paragraph problem statement | Owners consulted before anything is written |
| 11 | Write the proposal; ask for dissent | First design proposal | Comments addressed in the doc |
| 12 | Decide; start or hand off; pair with a teammate | Decision record | Decision made and announced |
| 13 | Review the quarter | 90-day retrospective | Day-90 review; next quarter agreed |

Read it as three phases, not 13 tasks. Weeks 1 to 4 **learn** (plus one small delivery), weeks 5 to 9 **deliver** something bounded on time, weeks 10 to 13 **propose** something from what you learned. The order is the point: the proposal in week 11 rests on the listening tour, the map and the log, and it is heard because weeks 5 to 9 showed you deliver.

### When the plan has to bend

Some situations change the timings, never the order. If the company runs an onboarding bootcamp before team placement (Meta has described one; see [The FAANG loop](/learn/senior-craft/getting-the-job/the-faang-loop)), week 1 of this plan starts when you reach your team. If you were hired to lead a named initiative from day one, the initiative is your bounded project: compress the listening tour into the first two weeks and hold any proposal until you have heard from the people it affects. If you join during a reorganisation or a run of incidents, your first delivery may be on-call work; say so in the weekly note so that it counts. What never bends is a checkpoint slipping silently. If your environment still does not build on day three, tell your buddy and your manager that day, not in week two.

## Artefacts for learning

### The 30/60/90 plan

Draft it in week one and share it. It shows ownership, surfaces mismatched expectations early and gives the check-ins a structure.

```text
30/60/90 PLAN: <name>, <team>, starting <date>
Manager's definition of success at 90 days:   <from the week-one 1:1>
What would worry them:                         <from the week-one 1:1>

DAYS 1-30 LEARN       1:1s with <names>; map reviewed by <name>;
                      postmortems since <date>; shadow on-call <week>;
                      first production change by <date>
DAYS 31-60 DELIVER    <bounded project>, done by <date>, measured by <metric>;
                      fix <onboarding problem>; join on-call <date>
DAYS 61-90 PROPOSE    <improvement from the fresh-eyes log>, proposal by <date>;
                      <pairing or documentation>; 90-day review <date>
Risks and open questions:
```

### Listening-tour notes

Book 30 minutes with your manager, every teammate, your product manager, any design or data partner, the leads of two or three neighbouring teams, and your skip-level. Ask everyone the same questions so the answers can be compared, and write each conversation up the same day:

```text
LISTENING TOUR: <name>, <role>, <date>
1. What is working well that I should be careful not to break?
2. What is the biggest problem the team has that nobody is working on?
3. What do you wish the previous person in a role like mine had done differently?
4. What surprised you about how this team works when you joined?
5. Who else should I talk to?
Themes (one line each):
Things to verify:
```

Listen more than you talk, and offer no fixes in the room: a newcomer's fix on day ten tells the other person you did not need their context.

### The system map, drawn and corrected

Draw the architecture from memory, then ask a teammate to correct it. Keep the corrections, because each one is a fact the documentation did not give you:

| What you drew | Correction | Who corrected it | Why it matters |
|---|---|---|---|
| Payments API writes to the ledger database | Writes go through the ledger service; the direct path was removed after an incident | Priya | Explains the extra hop in the latency budget |
| One settlement job | One job per bank, sharing a lock table | Tom | The lock table is why the jobs cannot run in parallel |
| The scheduler is off the shelf | It is homegrown, built after an outage | Priya | The first thing a newcomer proposes replacing |

The map is for you first and then for the team. Version 1 exposes what you misunderstood; version 2 in week 7 adds data flows, owners and the failure modes you saw while shadowing on-call. A corrected map is also the onboarding document most teams lack, so offer it to the next hire: a small, visible piece of intent ([Documentation and ADRs](/learn/senior-craft/software-craft/documentation-and-adrs)).

## Walk-through: synthesising the listening tour

After eight conversations, tally every theme by who raised it. An illustrative synthesis:

| Theme | Mgr | PM | Eng A | Eng B | Eng C | SRE | Neighbour lead | Skip | Count |
|---|---|---|---|---|---|---|---|---|---|
| CI is too slow | ● | | ● | ● | ● | | | ● | 5 |
| Alerts are noisy | | | ● | ● | | ● | | ● | 4 |
| Roadmap priorities unclear | | "clear" | ● | ● | ● | | | | 3, contested |
| The scheduler is fragile | | | | "works fine" | | ● | | | 1, contested |
| Docs out of date | | | ● | | ● | | ● | | 3 |

Read it in two passes.

1. **Agreement marks priorities.** CI (5 of 8) and alerts (4 of 8) are pains the team already feels; fixing either removes friction for everyone and nobody will defend it.
2. **Disagreement marks context you lack.** The PM says priorities are clear while three engineers say they are not: a communication gap, not a tooling problem. On the scheduler, the engineer who built it says it works and the SRE says it is fragile. That is where history lives, and the place a newcomer's proposal is most likely to land badly.
3. **Act on the first pass, investigate the second.** CI and alerts go to the top of the fresh-eyes log; the scheduler goes in with a note to read its postmortem and ask Eng B how it came to be.

Share the synthesis with your manager at day 30, without names attached to the contested themes.

## Artefacts for delivering

### The fresh-eyes log, scored

Write down everything that strikes you as odd, with the date, and act on almost none of it for the first month. The log does two jobs. Writing an observation down replaces the urge to fix it today, before you know its history; and it keeps the observations that fade once the oddities start to look normal. By week 8, score each entry: pain (who feels it, how often; 1 to 3) and effort (1 to 3), then rank by pain divided by effort.

| Entry (week noted) | What you learned since | Pain | Effort | Pain ÷ effort | Rank |
|---|---|---|---|---|---|
| Setup doc skips two steps (1) | Everyone hits it; nobody owns it | 2 | 1 | 2.0 | 1 |
| Daily alert that everyone ignores (2) | Threshold set before a traffic change | 3 | 2 | 1.5 | 2 |
| CI takes 30 minutes (2) | Tests run serially; no caching | 3 | 3 | 1.0 | 3 |
| Homegrown scheduler (3) | Built after an outage the obvious replacement would repeat | 2 | 3 | 0.67 | 4 |

The setup fix goes into week 6, the alert becomes the week-11 proposal, CI waits for a quarter with capacity, and the scheduler stays a note until you can say what any replacement must handle. Scoring is what turns the log from a list of complaints into a plan your manager can agree to.

### The weekly status note

Five minutes on Friday, sent without being asked:

```text
Week 7. Done: settlement retry milestone 1 merged; reviewed 6 PRs.
Next: milestone 2 (idempotent replays), due week 9, on track.
Risk: bank sandbox outages; mitigation: recorded fixtures.
Learned: the lock table is why settlement jobs run serially.
```

It removes the most common manager worry about a new hire, not knowing how they are doing, and it becomes the examples your manager quotes in your first review.

### The first design proposal and the retrospective

The first proposal is the first time you spend the trust you have earned, so choose one with a high ratio of pain removed to disruption, that other people will run with you rather than around you, and that can be reversed. Keep it to one page, with the evidence from your log and the dissent you sought ([Design docs and RFCs](/learn/senior-craft/technical-leadership/design-docs-and-rfcs)):

```text
PROPOSAL: Replace the daily threshold alert with an SLO burn-rate alert
Problem and evidence: fired 58 times in 8 weeks; 2 needed action
Options: retune threshold / burn-rate alert / delete it; chosen, and why
Who I consulted, and what changed: SRE asked for a slower second window
Rollout and rollback: run both for 2 weeks; compare pages
```

```text
90-DAY RETROSPECTIVE
Success definition (week 1) vs what happened:
Delivered: <project, date promised, date shipped>
What I learned that changed my plan:
Feedback received at 30 / 60 days and what I did with it:
Next quarter: what I want to own, and why the team needs it
```

The retrospective closes the loop. It compares what happened with the definition of success from week one, in writing, and it becomes the source for both your next-quarter plan and your first self-review, so the examples in it are the ones you want quoted.

## Building trust: the mechanics

Trust between colleagues rests on three things, and new seniors usually over-invest in one:

1. **Reliability.** You do what you said, when you said. Built with small promises kept early: the week-2 change, the week-9 delivery on the week-5 date.
2. **Competence.** Your judgement is good. Built by being right about things that matter, visibly: reviews, incidents, design discussions.
3. **Intent.** You work for the team's success, not your own profile. Built by crediting others, fixing unglamorous things, and asking before changing what other people care about.

New seniors tend to lead with competence, showing early how much they know. It works better the other way round: reliability and intent first make your competence welcome when you show it. Bring past experience as questions rather than verdicts: "At my last company this pattern hurt us under load; has that come up here?" ([Code review as mentorship](/learn/senior-craft/technical-leadership/code-review-as-mentorship)).

## Trade-offs: choosing early wins

| Option | Time to finish | Pain removed for the team | Risk to others' work | What it signals |
|---|---|---|---|---|
| Fix a flaky test | Days | Moderate, felt daily | None | Cares about shared pain |
| Correct the setup doc or script it | A day | Every future hire | None | Improves things rather than complaining |
| Retune or replace a noisy alert | 1–2 weeks | High for on-call | Low, with a parallel run | Operational judgement |
| The assigned bounded project | 4–5 weeks | Whatever the roadmap says | Low | Reliability: the main evidence |
| Cut CI time substantially | Weeks | High | Moderate: touches everyone's pipeline | Leverage, if landed carefully |
| Large refactor of code you have known for three weeks | Months | Unclear | High | Did not learn the context |
| Introduce a new framework or language | Months | None the team feels | High | Priorities are your own |

The pattern in the top rows: each removes pain the team already feels, finishes quickly, and leaves other people's work intact. The assigned project matters most of all, because it is what your manager will quote.

Cutting CI is high pain and high leverage, and it still waits until the assigned project is delivered: it touches every engineer's pipeline, so a mistake in your first month lands on the whole team. The noisy alert makes a better first proposal, because a two-week parallel run makes it measurable and reversible.

## Two new seniors, side by side

Two engineers join the same organisation in the same month, on similar teams.

| Week | Engineer A | Engineer B | What the team observed |
|---|---|---|---|
| 1 | Reads code | Asks the manager the success question; drafts a plan | B: "knows what they're aiming at" |
| 2 | Drafts a proposal to replace the homegrown scheduler | Ships a small fix; starts one-to-ones | A: "second week, already rewriting our stuff"; B: "delivered already" |
| 3–4 | Proposal lands badly: the scheduler exists because of an outage the replacement would repeat; its author takes it personally | Reads postmortems, finds the scheduler outage; keeps a fresh-eyes log (scheduler, 30-minute CI, noisy alert) | A: "didn't ask why"; B: "asks good questions" |
| 5–9 | Works on a feature quietly; no updates | Delivers the assigned project on time with weekly notes; fixes the setup doc along the way | A: "not sure what they're working on"; B: "reliable" |
| 9 | Feature ships a week late; the manager hears about the slip on the due date | Launch note to stakeholders | A: "surprises"; B: "no surprises" |
| 10–12 | Starts another feature | Proposes the alert fix; writes what any future scheduler replacement must handle | B: "understands the history" |
| Day 90 | Hears the team "isn't sure how to work with them yet" | Asked to lead the scheduler work next quarter | |

Same organisation, same skill, similar ideas: both thought the scheduler should change. A proposed it in week 2 with no context and no trust; B learned why it existed, delivered first, and was handed the same change with both. The difference was sequence.

Read the right-hand column as your manager's raw material. By day 90, every line about B is something a manager can quote in a calibration discussion: delivered on the date, no surprises, understands the history. Every line about A is an impression without an example, and the one concrete fact is a late delivery nobody saw coming. Neither engineer was judged on the scheduler idea, which was the same. They were judged on the events around it.

## Failure modes

**Symptom: at day 60 your manager says "I'm not sure what you're working on".** Diagnosis: invisible work; you are busy, but nothing reaches your manager except your absence from their worries. Fix: a weekly note from now on, and a one-paragraph summary of the last month at your next 1:1.

**Symptom: your first proposal meets defensiveness, and a teammate takes it personally.** Diagnosis: you proposed changing something before learning its history or talking to its owner. Fix: talk to the owner privately first, acknowledge why it was built, and bring the evidence ([Leading without authority](/learn/senior-craft/technical-leadership/leading-without-authority)).

**Symptom: your first project slips and your manager finds out on the due date.** Diagnosis: overcommitment to prove yourself, and no milestones anyone could see. Fix: commit to less, split the work into dated milestones in the weekly note, and report a slip the week you see it ([Estimation, planning and prioritisation](/learn/senior-craft/technical-leadership/estimation-planning-and-prioritisation)).

**Symptom: by week 8 you are in every review and meeting, and your own project has barely moved.** Diagnosis: saying yes to everything to build goodwill turned you into the team's help desk. Fix: agree a split of your time with your manager and protect the project's hours; decline with a pointer to who else can help.

**Symptom: your first review rating surprises you.** Diagnosis: you never asked for feedback, so your manager's picture formed from other people's impressions. Fix: ask a specific question at 30, 60 and 90 days: "What is one thing I should do more of, and one thing I should stop?"

## Follow-ups you will face

**Your manager, at day 30: "What have you learned so far?"** Model answer: the top three themes from the listening tour, one contested area you are still learning about, and your first delivery. Common wrong answer: a list of what is wrong with the codebase, which tells the manager you judged before you learned.

**A skip-level, around day 60: "What would you change about the team?"** Model answer: one or two things from the scored log that the team already feels, framed as questions you are testing, with what you have learned about why things are as they are. Common wrong answer: a critique of your manager or teammates, which reaches them within the week.

**Your manager, at day 90: "What do you want to own next quarter?"** Model answer: a specific area, why the team needs it, and the evidence you gathered: "the scheduler, because on-call and its author both have a stake, and I now know what the replacement must handle". Common wrong answer: "whatever is most useful", which hands your scope back to your manager.

**Your manager, at any point: "How can I help?"** Model answer: one concrete ask, such as an introduction to the neighbouring team's lead or context on a past decision. Common wrong answer: "I'm fine", which wastes the offer and hides the problem you will need help with later.

**In a behavioural interview: "Tell me about your first 90 days in your last role."** Model answer: what success meant and who defined it, what you did to learn, the first delivery and the date it landed, one proposal and how it changed after feedback, and what you would do differently. Common wrong answer: "I ramped up and started taking tickets", which shows no plan and no ownership. Practise it with a behavioural mock on `/interviews`; the structure is the one in [Behavioural interviews for seniors](/learn/senior-craft/getting-the-job/behavioral-interviews-for-seniors).

## What mid-level engineers get wrong

- **Proposing a rewrite in the first weeks.** The proposal ignores history, and its author becomes an opponent.
- **"At my last company, we…" as a verdict.** The team hears that their choices were uninformed.
- **Going quiet to deliver something impressive.** The manager hears nothing for six weeks and assumes nothing is happening.
- **Overcommitting to justify the hire.** The first delivery slips, and reliability is the first impression.
- **Assuming the title gives authority.** Senior titles bring expectations of influence, not formal power ([What senior means](/learn/senior-craft/technical-leadership/what-senior-means)).
- **Talking only to engineers.** Product and data partners form their view of you without you.
- **Waiting for the review to learn where they stand.** The rating is the first feedback, and it is too late to act on.

## Senior signals

- You ask in week one what success and failure look like at 90 days, and build a written plan from the answer.
- You run a listening tour with the same questions for everyone and read agreement as priority and disagreement as missing context.
- You ship something small in the first two weeks and deliver the first bounded project on the date you gave.
- Your work is visible without being performed: a weekly note, a corrected map, a scored log.
- You propose change only after learning its history and talking to its owners, and you seek dissent before deciding.
- You ask for specific feedback at 30, 60 and 90 days rather than waiting for the review.

## Check yourself

```quiz
- q: >-
    In your second week you notice the deployment tooling is clumsy and could be replaced by a tool you used before. What is the best move?
  options: ["Replace it on a branch and present the finished result", "Log it, learn why it exists, and revisit it with context", "Drop it, since new hires should not suggest changes", "Propose replacing it this week, while your view is fresh"]
  answer: 1
  explanation: >-
    Early observations are valuable but often lack history, since many oddities come from past incidents or deliberate trade-offs. A fresh-eyes log turns them into credible proposals later. Proposing immediately or rebuilding in secret is the classic new-senior trap, and dropping them wastes a newcomer's main advantage.
- q: >-
    In your listening tour, the engineer who built the scheduler says it works fine and the SRE says it is fragile. What does that disagreement most likely tell you?
  options: ["It is noise, since only one person raised the issue", "One of the two is wrong, so ask the manager to decide", "The scheduler should be replaced as the top priority", "There is history and context you do not have yet"]
  answer: 3
  explanation: >-
    Agreement across conversations marks shared pain; disagreement marks history, ownership and context a newcomer lacks, which is where proposals land worst. The right response is to read the postmortem and ask the builder how it came to be before proposing anything.
- q: >-
    Why does a short weekly note to your manager matter for your first review, beyond keeping them informed?
  options: ["It replaces one-to-ones, which saves the manager's time", "It is required for new hires during their probation period", "It gives the manager specific examples to defend a rating", "Reviews are scored on how many notes were sent in the cycle"]
  answer: 2
  explanation: >-
    Where ratings are calibrated across managers, your manager must argue for yours with specific examples, and in a first cycle those are your first deliveries. A weekly note makes them visible and written down. Notes are not counted, do not replace one-to-ones, and are not a probation rule.
- q: >-
    Your fresh-eyes log scores pain and effort from 1 to 3. The setup doc is pain 2, effort 1; a noisy alert is pain 3, effort 2; slow CI is pain 3, effort 3. Which do you tackle first?
  options: ["The setup doc, with the highest pain for its effort", "Slow CI, because hard problems show senior ability", "Slow CI, because it has the most pain of the three", "The noisy alert, because it affects the on-call rota"]
  answer: 0
  explanation: >-
    Ranking by pain divided by effort gives 2.0 for the setup doc, 1.5 for the alert and 1.0 for CI. Early wins should remove felt pain quickly without risking other people's work; a large, risky change in the first weeks spends trust you have not earned yet.
- q: >-
    Of reliability, competence and intent, which do new senior hires most often over-invest in first, and what works better?
  options: ["Competence; lead with reliability and intent instead", "None; all three build at the same rate regardless", "Reliability; show competence first, then keep promises", "Intent; stop building relationships and show expertise"]
  answer: 0
  explanation: >-
    New seniors often try to show expertise immediately, which reads as judgement without context. Small promises kept and visible work for the team come first, and they make later competence land as help rather than criticism.
- q: >-
    A behavioural interviewer asks about your first 90 days in your last role. Which answer carries the most senior evidence?
  options: ["You ramped up quickly and were taking tickets within the first two weeks", "Who defined success, what you learned, a dated delivery, a revised proposal", "You identified what was wrong in week one and proposed fixing all of it", "You kept your head down and learned the codebase before speaking up"]
  answer: 1
  explanation: >-
    It shows a plan tied to someone else's definition of success, deliberate learning, reliability with a date, and a proposal that changed with feedback. Taking tickets shows no ownership, fixing everything in week one shows no context, and silence shows no influence.
```
