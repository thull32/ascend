---
lesson: the-first-90-days
source: 732cce8155dbddee
fit: great
desk:
  - "The 13-week plan, with each week's artefact and checkpoint"
  - "The templates: 30/60/90 plan, listening-tour questions, weekly note, first proposal and 90-day retrospective"
  - "The corrected system map table and the listening-tour synthesis grid"
  - "The scored fresh-eyes log"
  - "Engineers A and B compared week by week"
---
## Introduction

The offer is signed and the loop is over. You were hired as a senior engineer, which means the organisation expects you to make a visible difference, and soon. It also means you arrive with almost none of the currency that lets senior engineers make a difference: trust. Nobody has seen your judgement yet. You do not know why the system looks the way it does, which of its oddities are scars from past incidents, or who makes which decisions.

The first 90 days decide which story people tell about you afterwards. "The senior hire who raised the bar." "The expensive hire who hasn't done much yet." Or "the one who tried to rewrite everything in their second week."

The pattern that works is easy to state and hard to follow under pressure to prove yourself. Learn before you change things. Earn trust with small, reliable deliveries. Then spend that trust on something that matters. Three parts: how you are evaluated behind the scenes, the plan that follows from it, and two new seniors who show why the order matters.

## What is expected, and how you are read

Expectations vary, but a common shape for a senior hire runs like this. By week two, you have shipped a small change to production end to end. By day 30, you understand the team's systems at the whiteboard level and are doing real work. By day 60, you own a meaningful piece of work and take part in on-call. By day 90, you have delivered it and are starting to influence decisions beyond your own tickets.

Do not guess at your manager's version. Ask in your first week: "What would make you say, at 90 days, that hiring me was a great decision? And what would worry you?" Write the answer down and build the plan from it. That one conversation prevents most first-quarter misunderstandings.

Why does it matter so much? Because your manager hired you against a hypothesis from the interview packet: "they'll own the settlement roadmap", "they'll fix our on-call". Your first months are read against that hypothesis, not against a generic newcomer.

And the read starts early. Managers ask your onboarding buddy and a teammate or two how it is going. The evidence is a handful of observable events: your first pull request, its size, its description, and how you respond to review; your first estimate against your first delivery; your first on-call shift; your first comment in a design discussion; and how you talk about decisions made before you arrived. Early impressions shape how later evidence is read, so those first events carry more weight than their size suggests.

Then the first review cycle. Where ratings are calibrated across managers, your manager has to defend yours with specific examples, and in your first cycle those examples are your first deliveries. They need to be visible and written down.

## The plan: learn, deliver, propose

The lesson's illustrative plan has 13 weeks, but read it as three phases. Weeks one to four, learn, plus one small delivery. Weeks five to nine, deliver something bounded, on time. Weeks ten to thirteen, propose something from what you learned. Each week produces an artefact someone else can see, and ends at a checkpoint.

The order is the point. The proposal in week eleven rests on everything you learned, and it is heard because weeks five to nine showed you deliver. Circumstances can change the timings, never the order. If you were hired to lead a named initiative from day one, it becomes your bounded project, and you compress the listening into two weeks. What never bends is a checkpoint slipping silently. If your environment still does not build on day three, say so that day, not in week two.

In week one, draft a 30, 60, 90 day plan and share it. It shows ownership and surfaces mismatched expectations early. In week two, ship your first change and send your first weekly note.

## Learning: the listening tour and the map

Book thirty minutes with your manager, every teammate, your product manager, the leads of two or three neighbouring teams, and your skip-level. Ask everyone the same questions, so the answers can be compared. What is working well that I should be careful not to break? What is the biggest problem nobody is working on? What do you wish the previous person in a role like mine had done differently? And who else should I talk to?

Listen more than you talk, and offer no fixes in the room. A newcomer's fix on day ten tells the other person you did not need their context.

After eight conversations, tally every theme by who raised it, and read it in two passes. Agreement marks priorities. In the illustrative tour, slow CI came up five times out of eight, and noisy alerts four times. Those are pains the team already feels, and nobody will defend them. Disagreement marks context you lack. The engineer who built the scheduler says it works fine; the SRE says it is fragile. Before I tell you: what does that disagreement tell you?

[pause]

That there is history and context you do not have yet. That is exactly where a newcomer's proposal is most likely to land badly. So you act on the agreement and investigate the disagreement: read the scheduler's postmortem, and ask its builder how it came to be.

Alongside the tour, draw the architecture from memory and ask a teammate to correct it. Keep the corrections. The scheduler you assumed was off the shelf turns out to be homegrown, built after an outage. One settlement job turns out to be one per bank, sharing a lock table, which is why they cannot run in parallel. Each correction is a fact the documentation did not give you, and the corrected map becomes the onboarding document most teams lack.

## Delivering: the fresh-eyes log and the weekly note

Write down everything that strikes you as odd, with the date, and act on almost none of it for the first month. The log does two jobs. Writing an observation down replaces the urge to fix it today, before you know its history. And it keeps the observations that fade once the oddities start to look normal.

By week eight, score each entry for pain and effort, each from one to three, and rank by pain divided by effort. The illustrative log: a setup doc that skips two steps, pain 2, effort 1, ratio 2. A daily alert everyone ignores, pain 3, effort 2, ratio 1.5. CI at thirty minutes, pain 3, effort 3, ratio 1. The scheduler comes last. So the setup fix happens in week six, the alert becomes the first proposal, CI waits for a quarter with capacity, and the scheduler stays a note until you can say what any replacement must handle. Scoring turns a list of complaints into a plan your manager can agree to.

Then the weekly note: five minutes on Friday, sent without being asked. What got done, what's next and whether it is on track, one risk with its mitigation, and one thing you learned. It removes the most common manager worry about a new hire, not knowing how they are doing, and it becomes the examples your manager quotes in your first review.

Your first proposal is the first time you spend the trust you have earned. Choose something with a high ratio of pain removed to disruption, that others will run with you rather than around you, and that can be reversed. The noisy alert fits: it fired 58 times in eight weeks and only two needed action, and a two-week parallel run makes the change measurable and reversible. Cutting CI is high pain and high leverage, but it touches every engineer's pipeline, so it waits until your assigned project is delivered.

## Building trust, and two new seniors

Trust between colleagues rests on three things. Reliability: you do what you said, when you said. Competence: your judgement is good. Intent: you work for the team's success, not your own profile. New seniors tend to lead with competence, showing early how much they know. It works better the other way round. Reliability and intent first make your competence welcome when you show it. Bring past experience as questions rather than verdicts: "At my last company this pattern hurt us under load; has that come up here?"

Now picture two engineers joining the same organisation in the same month. Both think the homegrown scheduler should change.

Engineer A reads code in week one, and in week two drafts a proposal to replace the scheduler. It lands badly: the scheduler exists because of an outage the replacement would repeat, and its author takes it personally. A then works on a feature quietly with no updates, ships it a week late, and the manager hears about the slip on the due date. At day 90, A hears the team "isn't sure how to work with them yet".

Engineer B asks the success question in week one, ships a small fix in week two, reads the postmortems and finds the scheduler outage, delivers the assigned project on time with weekly notes, and proposes the alert fix with a written list of what any scheduler replacement must handle. At day 90, B is asked to lead the scheduler work next quarter.

Same organisation, same skill, the same idea. The difference was sequence. And notice what the manager can quote. Every line about B is an example: delivered on the date, no surprises, understands the history. Every line about A is an impression, and the one concrete fact is a late delivery nobody saw coming.

## In the interview

This comes up in your next loop, too. A behavioural interviewer asks: tell me about your first 90 days in your last role.

[pause]

The strong answer: what success meant and who defined it, what you did to learn, the first delivery and the date it landed, one proposal and how it changed after feedback, and what you would do differently. "I ramped up and started taking tickets" shows no plan and no ownership.

And from your own manager, at day 90: what do you want to own next quarter? A specific area, why the team needs it, and the evidence you gathered: "the scheduler, because on-call and its author both have a stake, and I now know what the replacement must handle." "Whatever is most useful" hands your scope back to your manager.

Finally, do not wait for the review to learn where you stand. Ask a specific question at 30, 60 and 90 days: what is one thing I should do more of, and one thing I should stop?

## Recap

Four things to remember. Ask in week one what would make your hire a great decision at 90 days, and build a written plan from it. Learn, deliver, propose, in that order: the timings bend, the order does not. In the listening tour, agreement marks priorities and disagreement marks history you lack. And make your work visible without performing it: a weekly note, a corrected map, a scored log, and a first project delivered on the date you gave.

At your desk: the 13-week plan, the templates, the system map and synthesis grid, the scored log, and engineers A and B week by week.
