---
slug: behavioral-interviews-for-seniors
title: "Behavioural interviews for seniors: STAR+, the story bank and follow-ups"
description: What the behavioural round measures at senior level, the STAR+ structure and worksheet, how to build a story bank that covers every common question, what makes a story senior, and how to handle the follow-up drill-down.
minutes: 23
difficulty: easy
tags: [career, interviews, behavioural, star, storytelling, leadership]
---
"Tell me about a time you disagreed with a technical decision." One candidate describes a disagreement about a library choice on their own team, says the team discussed it and went with their view, and finishes in ninety seconds. Another describes a cross-team decision, the data they gathered, how they took the disagreement to the person who proposed the change before the review rather than in it, what they gave up to reach agreement, what happened afterwards, and what they now do differently. Both stories are true. Only one of them is evidence of a senior engineer.

The behavioural round is where level is most often decided, and it is the round senior candidates most often under-prepare, because it feels like a conversation about things they already know. It is not a conversation. It is a structured search for evidence that you have operated at a particular scope, and the interviewer is trained to dig until they find out whether you have. This lesson gives you a structure (STAR+), a worksheet, a method for building a bank of stories that covers almost any question, and the techniques for the follow-ups where most answers fall apart.

## What the round measures

Behavioural interviews rest on one premise: past behaviour in similar situations is the best available predictor of future behaviour. So the interviewer asks about specific past situations, not hypotheticals, and scores the evidence against a set of competencies. The names vary by company, but they cluster around the same things. Ascend's behavioural mock interviewer scores five:

| Dimension | What the interviewer is looking for |
|---|---|
| Ownership and impact | You took responsibility for an outcome, not just a task, and the outcome mattered |
| Judgement and decision-making | You weighed real alternatives, decided with incomplete information, and can explain why |
| Collaboration and conflict | You worked through disagreement productively and kept the relationship intact |
| Growth and self-awareness | You can describe your own mistakes honestly and what changed as a result |
| Communication clarity | The story is structured, specific and easy to follow |

Some companies publish their competencies. Amazon's Leadership Principles are the best-known example, and reading them is useful preparation even if you are not interviewing there, because they are a concrete, public statement of what one large company looks for.

At senior level the same competencies are measured at a larger **scope**: more people, more teams, longer time horizons, more ambiguity at the start, and higher stakes. That is what makes the difference in the opening example.

## STAR+

STAR is the standard structure: Situation, Task, Action, Result. It works because it answers the interviewer's questions in the order they need them. The "+" adds the part that most distinguishes senior answers: reflection.

| Part | What it contains | Share of the answer |
|---|---|---|
| **Situation** | Just enough context: the team, the system, the scale, what was at stake | 10–15% |
| **Task** | Your specific responsibility, and why it was hard or ambiguous | 10% |
| **Action** | What *you* did, step by step: the decisions, the alternatives you rejected and why, the people you had to persuade and how | 50–60% |
| **Result** | What happened, with numbers where possible: business outcome, technical outcome, effect on people | 10–15% |
| **+ Reflection** | What you learned, what you would do differently, and what you now do as a result | 10% |

Aim for two to three minutes on the first telling. That is long enough to include the decisions and short enough to leave time for follow-ups, which is where the interviewer gets most of their evidence. A five-minute monologue uses up the round and leaves them nothing to probe.

The most common structural mistake is an answer that is 70% situation. Candidates explain the architecture, the org chart and the history, and have thirty seconds left for what they did. Cut the context to what the listener needs to understand the actions.

## The STAR+ worksheet

Fill this in once per story. Writing it out, rather than keeping it in your head, is what makes the numbers and details available under pressure.

```text
STORY: <short memorable title, e.g. "Checkout stays synchronous">
Competencies it shows: <primary>, <secondary>, <secondary>
Scope: <people / teams involved>, <duration>, <users, requests, money at stake>

SITUATION (2 sentences)
  -
TASK: my responsibility, and what made it hard (1-2 sentences)
  -
ACTIONS (3-5 bullets; each is a decision or an influence move)
  - Decision:              Alternative rejected, and why:
  - Who I had to persuade: How:
  - What I did when it went wrong / someone disagreed:
RESULT (numbers; business outcome; what happened to people)
  -
+ REFLECTION
  - What I learned:
  - What I'd do differently:
  - What I do now because of this:

FOLLOW-UP PREP
  - Hardest question someone could ask about this:
  - The numbers (and how I know them):
  - Who disagreed, and what they would say about it:
```

The "follow-up prep" section is the part people skip and the part that saves them. If you cannot say how you know a number, or what the person who disagreed with you would say, you will find out in the interview.

## Building a story bank

You cannot prepare an answer for every question, and you do not need to. Eight to ten well-prepared stories, each showing two or three competencies, cover almost everything a behavioural round will ask. The work is choosing them and mapping them.

Sources for strong stories:

- A project you led from an ambiguous start to delivery.
- A disagreement with a peer, a manager or another team.
- A real failure: a bad call, a missed deadline, an incident you caused.
- A production incident you handled or led; see [Incidents and postmortems](/learn/senior-craft/technical-leadership/incidents-and-postmortems).
- A time you changed a decision you did not own, without authority; see [Leading without authority](/learn/senior-craft/technical-leadership/leading-without-authority).
- Mentoring someone through a hard stretch.
- A time you said no, or cut scope, under pressure.
- A technical decision with a real trade-off that you would defend today, or would not.

Prefer stories from the last three years; older stories invite "what have you done recently?" Then map them in a matrix so you can see the gaps:

| Story | Ownership | Judgement | Conflict | Failure | Influence | Mentoring | Ambiguity |
|---|---|---|---|---|---|---|---|
| A. Checkout stays synchronous | ● | ● | ● | | ● | | |
| B. Search migration, 3 teams | ● | | | | ● | | ● |
| C. The cache I sized wrong | ● | ● | | ● | | | |
| D. Ramping a new engineer onto on-call | | | | | | ● | |
| E. Cutting the launch scope by half | ● | ● | ● | | | | ● |
| F. The 4-hour payments outage | ● | ● | | ● | | | |

An empty column is a question you are not ready for. Fill it before the interview, not during.

## What makes a story senior

The same competency can be shown at very different levels. These are the features interviewers use to tell them apart.

- **Scope beyond your own tasks.** Several teams, several quarters, a system other people depend on. "I fixed the flaky test" is not a senior story; "I got three teams to agree on a test-ownership model after flaky tests cost us two release days a month" might be.
- **You set the direction, not just executed it.** At the start the problem was fuzzy, and you turned it into a plan others followed.
- **Real trade-offs.** You chose between options that each had real costs, and you can say what you gave up.
- **Influence without authority.** You changed the minds of people you did not manage, with data, prototypes, written arguments and one-to-one conversations.
- **Business outcomes.** The result is described in terms of users, revenue, cost, reliability or time, not only "the code was cleaner".
- **Multiplier effects.** Other people got better because of what you did: a runbook, a mentee, a pattern another team adopted.
- **Honest failure.** Your failure stories involve real stakes, your own real mistakes, and a concrete change in how you work.

## A weak and a strong answer

Question: "Tell me about a time you disagreed with a technical decision."

**Weak:**

> "We had a disagreement on my team about moving to Kafka. I thought it was a bad idea for our service because it would add latency. We discussed it in a meeting, and eventually the team agreed with me, so our service didn't move. It worked out well."

No scope, no numbers, "we" throughout, no actions beyond "discussed", no trade-off, no reflection. The interviewer has to extract everything with follow-ups, and what they find is probably small.

**Strong** (a model answer; the details are illustrative):

> **Situation.** "Two years ago our organisation decided to move service-to-service communication onto a new event bus. I was the tech lead for checkout, six engineers, handling about 40,000 orders a day."
>
> **Task.** "I agreed with the direction in general but thought it was wrong for the payment-authorisation step, where the customer is waiting on the answer. My job was to work out whether that concern was real and, if it was, to get an exception without undermining a migration the architecture group had already announced."
>
> **Actions.** "First, I checked whether I was right. I built a small prototype of authorisation over the bus and load-tested it: p99 went from 180 milliseconds to about 1.4 seconds, mostly because of consumer batching, and we'd need idempotency keys and an outbox to avoid double charges. Second, I wrote a two-page document with those numbers, what would have to be true for async to work, and a proposal: authorisation stays synchronous, and everything after it, such as receipts, fulfilment and analytics, moves to the bus as planned. Third, before the review, I met the architect who led the migration one-to-one so the proposal wouldn't surprise him in public. He pushed back on having an inconsistent pattern, which was fair, so we agreed on written criteria for when an exception is allowed, instead of a one-off carve-out for checkout."
>
> **Result.** "The exception and the criteria were accepted. The migration went ahead for about thirty other services on schedule, checkout latency and conversion were unaffected, and two quarters later another team used the same criteria to justify their own exception in a day instead of a month."
>
> **Reflection.** "What I'd do differently: I raised it after the decision was announced, which cost two weeks and some goodwill. I now read organisation-level proposals during the comment period, and when I disagree, I bring numbers and talk to the author privately before any meeting."

That is about two and a half minutes. It has scope (an organisation-wide migration, a revenue-critical path), a real trade-off (consistency against latency and correctness), influence without authority (data, a document, a private conversation, a compromise), measurable results, a multiplier (the criteria another team reused), and a reflection that includes a genuine mistake.

## Handling follow-ups

The first telling is the invitation. The follow-ups are the assessment. Interviewers probe in predictable ways:

| Follow-up type | Example | What it tests | How to handle it |
|---|---|---|---|
| Drill-down | "What exactly did you do in the load test?" | Whether the actions were yours | Answer with specifics: tools, numbers, what you personally did |
| Counterfactual | "What if the architect had refused?" | Judgement beyond the happy path | Give your real fallback: escalate with data, or accept and mitigate, and say why |
| Reflection | "What would you do differently?" | Self-awareness | A genuine mistake, not a disguised strength |
| Challenge | "Wasn't an exception just creating inconsistency?" | Whether you can hold a position under pressure and concede good points | Acknowledge what is fair in it, then explain the trade-off you made |
| Scope | "How many teams were affected?" | Whether the scope is real | Exact numbers; if you are unsure, say roughly and why |
| Other people | "How did your manager see it?" | Collaboration, political awareness | Describe their view fairly, including where it differed from yours |

Four techniques make follow-ups go better:

1. **Answer the question asked.** Do not retell the story. A drill-down question wants one level more detail on one part.
2. **Pause before answering hard ones.** Three seconds of thought reads as care, not weakness.
3. **Be precise about what you do not know.** "I don't remember the exact figure; it was around 1.4 seconds at p99, from the load-test dashboard" is much better than a confident invented number.
4. **Concede fair points.** When a challenge has merit, say so. Interviewers are testing whether you can hear criticism, and defensiveness is the most common way to fail this part.

## "I" and "we"

Use "we" for the team's outcome and "I" for your own actions. Interviewers mentally strike out every "we did" when scoring your contribution, so a story told entirely in "we" leaves them nothing to credit. The opposite failure is claiming the team's work as yours, which follow-ups expose quickly ("who wrote the prototype?"). Be exact: "I built the prototype; Priya ran the load test with me; the team shipped the migration."

## Failure and conflict questions

"Tell me about a failure" is not a trap, and it is not a request for a humblebrag. "I cared too much about code quality" fails the question. A good failure story has four parts: what went wrong and what it cost, your specific part in it without deflecting to others, how you fixed or contained it, and what changed in your behaviour or in the system afterwards. A failure with real consequences, owned cleanly, is one of the strongest signals of seniority you can give, because it shows the self-awareness that makes someone safe to give autonomy to.

Conflict stories fail in two ways: the other person is a villain, or the conflict was trivial. Describe the other side's position fairly, show that you understood why they held it, and show how you reached a resolution that kept the working relationship intact.

## Common senior questions

Map each of these to a story in your bank before the interview:

- Tell me about the most complex project you have led.
- Tell me about a time you disagreed with your manager.
- Tell me about a decision you made with incomplete information.
- Tell me about a time you failed, or a mistake that had real consequences.
- Tell me about a time you influenced a decision you did not own.
- Tell me about a time you had to push back on a product or business request.
- Tell me about a time you helped someone else grow.
- Tell me about the hardest feedback you have received.
- Tell me about a time you had to deliver under a tight deadline, and what you cut.
- Tell me about a time you changed your mind.
- Tell me about a production incident you handled.
- Why are you leaving your current role, and why this one?

## Honesty is non-negotiable

Do not invent stories, merge several into one that never happened, or inflate your role. Apart from the ethics, it does not work. Follow-ups drill three or four levels down, and fabricated details fall apart under that pressure in ways experienced interviewers recognise. Many companies also run reference checks, and industries are smaller than they look. If your honest stories feel too small for a senior role, that is useful information: either you need to present your real scope better, which is usually the problem, or you need a year of bigger scope before the move.

## Practising

Behavioural answers improve dramatically with rehearsal out loud, and hardly at all with rereading notes.

1. Fill in the worksheet for eight stories and build the matrix.
2. Tell each story aloud against a timer. If it is over three minutes, cut the situation, not the actions.
3. Run a behavioural mock on `/interviews`. It is 30 minutes of senior-level questions with follow-ups that probe ownership, judgement and conflict, and the report scores the five dimensions above with quoted evidence from your answers. Read which follow-ups exposed thin spots, and add the answers to the "follow-up prep" section of that story's worksheet.
4. Record yourself once. Watching it is uncomfortable and very effective: you will hear the "we", the filler and the missing numbers immediately.

## Senior signals

- Your stories have cross-team scope, a fuzzy start you turned into a plan, and results stated in business terms.
- The action section dominates the story and names decisions, rejected alternatives and how you influenced people you did not manage.
- You use "I" for your actions and "we" for team outcomes, precisely.
- Your failure stories involve real consequences, clean ownership and a concrete change in behaviour.
- You handle follow-ups by answering the specific question, conceding fair challenges and being exact about what you do not know.
- You arrive with a mapped story bank rather than improvising.

## Check yourself

```quiz
- q: >-
    Your answer to "tell me about a challenging project" spends two minutes on the system's architecture and history and thirty seconds on what you did. What is the most important fix?
  options: ["Cut the situation to what the listener needs and spend most time on your decisions", "Add more technical depth to the architecture part, since depth is what impresses most", "Drop the result section, since the interviewer already knows the outcome", "Keep the context but speak faster so the action section fits in the time"]
  answer: 0
  explanation: >-
    The action section is where the interviewer finds evidence of ownership and judgement (your decisions, the alternatives you rejected and how you influenced people), so it should be about half the answer or more. Context only matters insofar as it explains the actions. More technical detail or more speed does not fix the imbalance.
- q: >-
    What does the "+" in STAR+ add, and why does it matter at senior level?
  options: ["A hypothetical plan for next time, which shows you can think beyond the story", "A second example of the same competency, which shows the behaviour is consistent", "A summary of the team's contributions, which shows that you share credit generously", "Reflection on what you learned and now do differently, which shows self-awareness"]
  answer: 3
  explanation: >-
    The "+" is reflection: what you learned, what you would do differently and what you now do as a result. It shows the self-awareness that makes it safe to give someone autonomy, and it answers the most common follow-up before it is asked. It must describe a real change, not a disguised strength or a hypothetical.
- q: >-
    An interviewer challenges you with "Wasn't that exception just creating inconsistency?" What is the strongest response?
  options: ["Acknowledge what is fair in the concern, then explain the trade-off you made", "Agree with the concern and say you would make a different call next time", "Move on to the result, since the outcome shows the decision was right", "Defend the decision firmly and explain why the interviewer's concern is mistaken"]
  answer: 0
  explanation: >-
    Challenges test whether you can hold a reasoned position and still hear criticism. Conceding the fair part and then explaining the trade-off, including how you limited its cost, shows both. Defensiveness is the most common way to fail this part, and abandoning a sound decision under mild pressure suggests weak judgement.
- q: >-
    Which story shows senior scope most clearly?
  options: ["You wrote more tests than anyone else on your team for two quarters running", "You got three teams to agree on test ownership, ending two lost release days each month", "You fixed a flaky test that had been annoying your whole team for several months", "You attended a testing conference and ran a session sharing the notes across your org"]
  answer: 1
  explanation: >-
    Senior stories involve influence beyond your own team, a problem framed in business terms, and a measurable outcome. Fixing a flaky test is a good task but a mid-level scope; writing the most tests or sharing conference notes shows effort rather than impact.
- q: >-
    Your honest stories feel too small for a senior role. What should you do?
  options: ["Shift preparation to coding and design, where small stories matter less", "Check first whether you are underselling your scope; if not, go and gain more", "Inflate your role slightly, since interviewers expect some exaggeration anyway", "Combine several real stories into one composite that shows the scope you need"]
  answer: 1
  explanation: >-
    Most candidates undersell their scope by leaving out the influence, decisions and numbers, so check that first. Composite or inflated stories collapse under multi-level follow-ups and are an integrity problem. If the scope genuinely is small, treat it as a sign you need more scope before the move; the honest fix is to gain it.
```
