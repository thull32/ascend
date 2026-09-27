---
slug: the-first-90-days
title: "The first 90 days: landing as a senior engineer"
description: What is expected of a new senior hire, a 30/60/90 plan with a template, the listening tour and its questions, early wins that build trust versus ones that burn it, and the traps that derail new seniors.
minutes: 17
difficulty: easy
tags: [career, onboarding, leadership, trust, first-90-days]
---
The offer is signed and the loop is over. You were hired as a senior engineer, which means the organisation expects you to make a visible difference, and soon. It also means you arrive with almost none of the currency that lets senior engineers make a difference: trust. Nobody has seen your judgement yet. You do not know why the system looks the way it does, which of its oddities are scars from past incidents, or who actually makes decisions. The first 90 days decide which story people tell about you afterwards: "the senior hire who raised the bar", or "the expensive hire who hasn't done much yet", or, worst of all, "the one who tried to rewrite everything in their second week".

The pattern that works is simple to describe and hard to follow under the pressure to prove yourself: learn before you change things, earn trust with small reliable deliveries, and then spend that trust on something that matters. This lesson turns that into a plan with a template, the questions to ask, the early wins worth pursuing, and the traps to avoid.

## What is expected of you

Expectations vary by company and manager, but a common shape for a senior hire looks like this:

| By roughly | You are expected to |
|---|---|
| Week 2 | Have shipped a small change to production end to end |
| Day 30 | Understand the team's systems at the whiteboard level; be doing real work |
| Day 60 | Own a meaningful piece of work; take part in on-call |
| Day 90 | Deliver that work; start influencing decisions beyond your own tickets |
| Month 6 | Be seen as a go-to person for part of the system; be improving how the team works |

Do not guess at your manager's version. Ask directly in your first week:

> "What would make you say, at 90 days, that hiring me was a great decision? And what would worry you?"

Write the answer down, and turn it into the plan below. This one conversation prevents most first-quarter misunderstandings.

## Days 1–30: learn

### The listening tour

Book a 30-minute one-to-one with your manager, every teammate, your product manager, any designer or data partner, the leads of the two or three teams you depend on or that depend on you, and your skip-level manager. Ask everyone roughly the same questions, so that you can compare the answers:

- What is working well that I should be careful not to break?
- What is the biggest problem the team has that nobody is working on?
- What do you wish the previous person in a role like mine had done differently?
- What is something about how this team works that surprised you when you joined?
- Who else should I talk to?

Listen more than you talk. Where people agree, you have found the real priorities. Where they disagree, you have found the politics, and the places where a thoughtful senior engineer can eventually help.

### Learn the system

- **Ship something small in the first week or two.** A bug fix or a small feature, all the way to production. It proves your development environment, teaches you the deploy path, and gives the team an early signal that you deliver.
- **Draw the architecture from memory,** then ask a teammate to correct it. The corrections are the most efficient learning you will do all month.
- **Read the last six to twelve months of postmortems and design documents.** Postmortems tell you where the system actually hurts; design documents tell you why it looks the way it does, and which alternatives were already rejected. See [Incidents and postmortems](/learn/senior-craft/technical-leadership/incidents-and-postmortems) and [Design docs and RFCs](/learn/senior-craft/technical-leadership/design-docs-and-rfcs).
- **Shadow on-call** before you join the rotation. The alerts and dashboards show you what the team considers important in practice, which is not always what the documentation says.

### Keep a fresh-eyes document

You will notice things in your first month that nobody on the team notices any more: confusing setup steps, a strange naming convention, a slow test suite, an alert that fires every day and gets ignored. Write every one of them down, with the date, in a private document. **Do not act on most of them yet.** Some will turn out to have good reasons. Others will be real problems that you now have the context to fix well. By day 60 this document is a prioritised list of improvements that only a newcomer could have seen, and it becomes the source of your most valuable early work.

## Days 31–60: contribute

- **Own a meaningful but bounded project,** ideally one your manager identified in the week-one conversation. Deliver it reliably, communicate status without being asked, and finish it properly, including documentation, tests and a note to stakeholders.
- **Fix the onboarding friction you hit.** Update the setup documentation, script the manual step, fix the broken link. It is small, it helps every future hire, and it shows you improve things rather than just complain about them.
- **Review code thoughtfully.** Reviews are one of the fastest ways to learn the codebase and to show your judgement. Bring experience from past jobs as questions rather than verdicts: "At my last company we had trouble with this pattern under load; has that come up here?" See [Code review as mentorship](/learn/senior-craft/technical-leadership/code-review-as-mentorship).
- **Join the on-call rotation.** Nothing builds credibility with a team faster than handling incidents calmly and well.

## Days 61–90: lead

- **Propose one improvement from your fresh-eyes document,** chosen for the ratio of impact to disruption. Write a short design document with the evidence, circulate it, and actively look for disagreement before you commit. You now have enough context to be right, and enough trust to be heard.
- **Start multiplying.** Pair with a less experienced teammate, unblock a stuck piece of work, or write down knowledge that currently lives in one person's head.
- **Hold a 90-day check-in** with your manager. Review the goals from week one, ask for direct feedback, and agree what the next quarter looks like.

## The 30/60/90 plan template

Draft this in your first week and share it with your manager. It shows ownership, it surfaces mismatched expectations early, and it gives the check-ins a structure.

```text
30/60/90 PLAN: <name>, <team>, starting <date>

Manager's definition of success at 90 days (from week-one 1:1):
  - 
What would worry them:
  - 

DAYS 1-30: LEARN
  Relationships: 1:1s with <names/roles>
  Systems:       architecture diagram reviewed by <name>; read postmortems
                 since <date>; shadow on-call week of <date>
  Delivery:      first production change by <date>
  Output:        fresh-eyes document started

DAYS 31-60: CONTRIBUTE
  Project:       <bounded project>, done by <date>, measured by <metric>
  Team:          fix <onboarding friction>; regular code reviews
  Operations:    join on-call rotation on <date>

DAYS 61-90: LEAD
  Proposal:      <improvement from fresh-eyes doc>, design doc by <date>
  Multiplying:   <pairing / documentation / unblocking>
  Check-in:      90-day review with manager on <date>

Risks and open questions:
  - 
```

## Building trust: the mechanics

Trust between colleagues is built from three things, and new seniors usually over-invest in one of them:

1. **Reliability.** You do what you said you would, when you said you would. This is built with small promises kept early, which is why the first-week production change and the bounded project matter so much.
2. **Competence.** Your judgement is good. This is built by being right about things that matter, often visibly, through reviews, incident handling and design discussions.
3. **Intent.** You are working for the team's success, not your own profile. This is built by crediting others, fixing unglamorous things, and asking before changing things other people care about.

New seniors tend to lead with competence, trying to show early how much they know. It works better the other way round. Reliability and intent come first, and they make your competence welcome when you show it.

Communicate status before anyone has to ask. A two-line weekly note to your manager (what you did, what is next, any risk) costs five minutes and removes the most common manager worry about a new hire, which is not knowing how they are doing.

## Early wins that count, and ones that backfire

| Builds trust | Burns trust |
|---|---|
| Fixing a flaky test that wastes everyone's time | A large refactor of code you have known for three weeks |
| Cutting CI time, or scripting a manual step | Introducing a new framework or language nobody asked for |
| Documenting a system that only one person understands | Building a tool for a problem the team does not feel it has |
| Fixing a noisy alert with a high false-positive rate | Rewriting the on-call process before you have been on call |
| Taking a bug in the area everyone avoids | Reopening a decision the team made last quarter, without new information |

The pattern in the left column is that each item removes a pain the team already feels, is small enough to finish quickly, and leaves other people's work intact.

## The traps

| Trap | Why it happens | What to do instead |
|---|---|---|
| Proposing a rewrite in your first weeks | You see problems without the context of why they exist | Write it in the fresh-eyes document; revisit at day 60 with context |
| "At my last company, we…" | Your past experience is your main asset, so you reach for it | Use it sparingly, and as a question: "One thing that worked at X was Y; would that fit here?" |
| Going quiet for six weeks to deliver something impressive | Wanting a big reveal | Deliver small and often; send a weekly status note |
| Overcommitting to prove yourself | Anxiety about justifying the hire | Commit to less and deliver all of it |
| Assuming the title gives you authority | Senior titles often come with expectations of influence, not formal power | Earn influence the way [Leading without authority](/learn/senior-craft/technical-leadership/leading-without-authority) describes |
| Talking only to engineers | Engineers are the easiest people for you to talk to | Build relationships with product, design and data partners early |
| Waiting for the first performance review for feedback | Feedback feels like something that happens to you | Ask for it at day 30, 60 and 90 |

The last trap matters most in high-expectation cultures. At a company that publicly uses something like Netflix's keeper test (see [Netflix: culture and interviews](/learn/senior-craft/getting-the-job/netflix-culture-and-interviews)), you want to know where you stand long before any formal cycle. Asking your manager at around day 60, "If I were thinking of leaving, how hard would you work to keep me, and what would make that an easier yes?", is uncomfortable, and it is the most useful question you can ask.

## Two new seniors, two different month threes

Two engineers join the same organisation in the same month, on similar teams.

The first spends week one reading code and week two drafting a proposal to replace the team's homegrown job scheduler with an open-source one, which is, on the merits, a reasonable idea. The proposal lands badly: the scheduler exists because of an outage two years ago that the open-source option would have caused, and a teammate who built it takes the proposal personally. The engineer spends the rest of the quarter on a feature, delivers it slightly late with little communication, and at the 90-day check-in hears that the team "isn't sure how to work with them yet".

The second spends the first month on one-to-ones, ships a small fix in week one, and reads two years of postmortems, which is how they find the scheduler outage. They keep a fresh-eyes document that includes the scheduler, a 30-minute CI run and an alert that fires daily. In month two they deliver their assigned project on time with weekly updates and cut CI to 12 minutes along the way. In month three they write a short proposal to fix the noisy alert and, having now understood the scheduler's history, a careful note on what a future replacement would need to handle. At the 90-day check-in their manager asks them to lead the scheduler work next quarter.

Same organisation, same level of skill, and similar ideas. The difference was sequence: learn, deliver, then propose.

## Senior signals

- You ask your manager in week one what success and failure look like at 90 days, and build your plan from the answer.
- You run a listening tour across engineering, product and neighbouring teams, and compare the answers.
- You ship something small within the first two weeks and keep a fresh-eyes document instead of acting on first impressions.
- You earn reliability and show good intent before spending trust on changes, and you choose early wins that remove pain the team already feels.
- You use past experience as questions, not verdicts, and you ask for feedback early and often.

## Check yourself

```quiz
- q: >-
    In your second week you notice the team's deployment tooling is clumsy and could be replaced by a tool you used at your last job. What is the best move?
  options: ["Write a proposal to replace it this week, while your perspective is fresh", "Replace it quietly on your own branch and present the finished result", "Record it in your fresh-eyes document, learn why it looks the way it does, and revisit it around day 60 with context", "Ignore it, since new hires should not suggest changes"]
  answer: 2
  explanation: >-
    Early observations are valuable but often lack context, since many oddities are the result of past incidents or deliberate trade-offs. Recording them and returning with context turns them into credible proposals. Proposing immediately or rebuilding in secret risks the classic new-senior trap, and ignoring them wastes a newcomer's main advantage.
- q: >-
    Which early win is most likely to build trust with a new team?
  options: ["Fixing a flaky test that wastes everyone's time", "Introducing a new language for a greenfield service", "Reopening a design decision the team made last quarter", "Building a dashboard nobody asked for"]
  answer: 0
  explanation: >-
    Good early wins remove pain the team already feels, finish quickly, and leave other people's work intact. The other options create work or friction for others before you have earned the trust to justify it.
- q: >-
    Of the three components of trust (reliability, competence and intent), which do new senior hires most often over-invest in first, and what works better?
  options: ["Reliability; they should show competence first", "Competence; leading with reliability and intent makes their competence welcome when they show it", "Intent; they should focus only on technical work", "None; trust comes automatically with a senior title"]
  answer: 1
  explanation: >-
    New seniors often try to demonstrate expertise immediately, which can read as arrogance without a track record. Keeping small promises and visibly working for the team first makes later demonstrations of competence land as help rather than criticism.
- q: >-
    What is the main purpose of asking your manager in week one what would make the hire a great decision at 90 days?
  options: ["To negotiate a raise", "To find out who else is being hired", "To show that you are confident", "To surface their expectations early, so your plan targets them and misunderstandings appear in week one rather than at the review"]
  answer: 3
  explanation: >-
    Most first-quarter problems come from mismatched expectations. Asking directly and building your 30/60/90 plan around the answer aligns your effort with what your manager will actually judge.
- q: >-
    You want to use experience from your previous company in a design discussion. Which phrasing works best?
  options: ["\"At my last company we did it properly, like this.\"", "\"One thing that worked at my last company was X. Would that fit here, or is there a reason it wouldn't?\"", "Stay silent, because past experience is not relevant", "\"This is wrong; it will fail under load.\""]
  answer: 1
  explanation: >-
    Framing experience as a question invites the team's context and avoids implying that their choices are uninformed. Past experience is valuable, but delivered as a verdict it is one of the fastest ways for a new senior to lose goodwill.
```
