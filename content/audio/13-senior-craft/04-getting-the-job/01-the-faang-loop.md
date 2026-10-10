---
lesson: the-faang-loop
source: 91222209403df458
fit: great
desk:
  - "The stages table and the what-each-round-measures table"
  - "The illustrative coding feedback form, line by line"
  - "Candidate R's packet resolved step by step under a debrief and a committee, and the change-one-line table"
  - "The 74-day application-to-offer timeline"
  - "The week-by-week preparation plan"
---
## Introduction

You have solved two hundred problems and drawn a dozen system designs. Then the loop happens, and the outcome is decided by machinery you never see. Five or six interviewers each write feedback alone. Those forms are assembled into a packet. A debrief or a committee you are not in decides. The level is decided separately from the hire. Sometimes a team-matching phase follows, and then the offer needs its own approval.

Candidates who understand that machinery prepare differently. They know which round decides their level, why one weak round can sink a strong loop, why a trade-off they weighed silently does not exist, and why a rejection is weaker evidence about their ability than it feels.

This is the common shape of a large-company process for a senior engineer, built from what companies have described publicly and what candidates commonly report. Companies differ and change, so treat it as a shape, not a specification, and confirm the specifics with your recruiter. Every packet and timeline here is illustrative.

Three ideas, then. What each round actually measures. The artefacts behind the loop and who decides from them. And how to write your own packet before you walk in.

## The stages and what they measure

The path runs like this: application or referral, a recruiter screen, a technical screen, a loop of four to six rounds, a debrief or hiring committee, team matching at some companies, then level, compensation and offer approval, and finally negotiation.

The recruiter screen is twenty to thirty minutes on fit for the role and level, motivation, logistics and compensation expectations. The technical screen, forty-five to sixty minutes, is a cheap coding bar check before the company spends five or six interviewer-hours on you. The loop is the assessment itself. From first call to signed offer, four to eight weeks is common, and ten or more is not unusual.

Inside the loop, each round looks for different evidence. Coding looks for timestamped lines: who clarified, who tested, who found the bug. The mid-level engineer does the right thing when asked; the senior does it before being asked. System design looks for turning ambiguity into decisions justified by numbers: sizing before choosing, named failure modes, what you would not build. Behavioural looks for specific actions attributed to "I", with scope, results and reflection. Mid-level candidates tell own-team stories; seniors tell cross-team stories with an ambiguous start and real trade-offs.

Two points are easy to miss. First, level is mostly decided outside the coding rounds. At many large companies the coding bar for mid-level and senior is similar, and level is driven by design and behavioural evidence, where scope and judgement show directly. Excellent coding with small-scope stories is the classic down-level.

Second, each round is scored independently. The design interviewer does not know how your coding went, so a bad round does not contaminate the next unless you let it. Candidates are poor judges of their own rounds. Reset between them.

## Under the hood: from requisition to packet

A loop exists because headcount, a requisition, was approved for a team or a pool. The requisition carries a level range. That is why the recruiter asks your level target early: a senior candidate on a requisition capped below senior can only be offered the lower level unless someone moves it.

Before the loop, someone gives each interviewer a focus, so the loop covers every competency once. That interview plan is why two behavioural interviewers ask different questions, and why retelling a story another interviewer already heard can leave a competency with no evidence at all.

Each interviewer then submits a feedback form: a rating on a fixed scale, commonly from strong no hire to strong hire, the evidence behind it, and often a separate level signal. They usually write it before reading anyone else's, so the first strong opinion cannot anchor the rest. Interviewers are calibrated over time, which is why an interviewer who rates everyone "hire" learns to be discounted.

The forms, your resume and the screen notes become the packet. Whoever decides reads the packet. A committee reads only the packet.

Here is the point that matters most. A good coding form ties every line to an observed moment: clarified the edge cases before coding, tested unprompted, found and fixed their own bug. The interviewer can only write what they saw and heard. That is the real reason you are told to narrate your decisions.

## Who decides, and on what

There are three common models. In a debrief, the interviewers and the hiring manager meet, read each other's forms, argue and decide. The hiring manager usually carries the most weight.

In a hiring committee, Google being the best-known example, a group of experienced people who did not interview you reads the packet and decides, and a hiring manager cannot hire on their own. It removes one manager's urgency to fill a seat and keeps the bar consistent across teams. The cost is time, and judging a document rather than a person.

Amazon's Bar Raiser is a trained interviewer, typically from outside the business you would join, who interviews in the loop and guides the debrief, with what former Amazon executives describe as veto power over the hiring manager. Think of it as a debrief with an independent guardian.

Level is its own decision, set from the whole packet and weighted towards design depth and behavioural scope. "Hire, one level below" is a common outcome. Then compensation is set within the band for that level and approved outside the team, which is why a yes takes days to become a number.

## One packet, two outcomes

Picture candidate R, targeting senior, with six rounds. Every round clears the bar: one strong hire, three hires, two lean hires, no negatives. Senior signals come from the first coding round, the design round, the second behavioural round and the hiring manager. Mid-level signals come from the second coding round, which needed a hint, and the first behavioural round, where the line reads: "migration story told in we; at the third probe could not say which decisions were theirs."

The hiring manager's form says: "great fit for our roadmap; very excited about the problem space." Before I tell you: what does that line do in front of a committee that never met R?

[pause]

Almost nothing. It records enthusiasm, not anything R did. In a debrief led by the manager, that advocacy plus the second behavioural round's quote about leading a schema change across three teams carries the room, and R is hired at senior. In a committee, the manager's form is read as advocacy, not data. Coding weighs little for level. That leaves one behavioural round each way, and the first one's line is specific. The result is hire, one level below, or one more leadership round to settle the level.

Same six forms, two outcomes. Now change one line. If that first behavioural form instead read "claimed to lead the migration; at the third probe a colleague had designed it", both models likely say no hire. A credibility doubt taints every other story. A thin story lowers your level; an inflated one ends loops.

Large companies commonly describe accepting false negatives to avoid false positives. So a single well-evidenced no sinks a loop, and a packet of lean hires with no advocate is often a no. In every variant, the argument was settled by specific lines, not adjectives. "Strong" and "solid" are easy to discount. "Could not say which decisions were theirs" is hard to argue with.

## Writing your own packet

You cannot see the forms, but you can decide which lines they are likely to contain. Before the loop, write the line you want in each form, then plan the moment that produces it.

In coding, you want "tested the breaking case unprompted", so name the case that breaks your solution before the interviewer picks one. You want "follow-up answered with mechanism and cost", which means reaching the follow-up by about minute 25, which means clarifying in under five. In design, you want "sized the problem before choosing", from a two-minute estimate that changes a decision, and "named what they would not build", from one explicit cut. In behavioural, you want "said which decisions were theirs": I decided this, the team decided that, I lost the argument on the third. And you want scope numbers in the first twenty seconds.

This is not performance. Each line describes something senior engineers do at work, and the form can only record it if it happens where the interviewer can see it.

The timeline matters too. The lesson's illustrative hire-then-match process ran 74 days from referral to signature, with under eight hours of actual interviewing. The rest was waiting: scheduling, committee cadence, team matching and approvals. When a recruiter gives you a date, follow up the day after it passes, and ask what the decision is waiting on.

And prepare for the loop as a system. Ask the recruiter for the exact format, environment and AI policy. Allocate time by what decides the outcome: an illustrative split is 40 percent coding, 35 percent design and 25 percent behavioural. Returning candidates overspend on coding because it is measurable, and underspend on behavioural because it feels like it needs no practice. Keep final loops within two to three weeks so offers overlap, and keep a log after every round.

## In the interview

Here is a recruiter question the lesson expects. What level are you targeting, and why?

[pause]

Name the level on their ladder, for example "senior, which I understand is L5 here", give two lines of scope evidence, such as leading a migration across three teams, and ask how the loop assesses it. The wrong answer is "whatever you think fits", which hands the anchor to the company and often lands one level low. Citing your current title is also wrong, because titles do not travel between companies.

And a second: what other processes are you in? Give honest stage and timing without figures: two others, both at the loop stage, decisions expected within three weeks, and you would like to align timelines. That gives the recruiter a reason to move your packet. Bluffing about offers collapses when they ask for details, and saying "none" removes your only timing lever.

One last thing. Each round is one interviewer's judgement of 45 minutes on one problem on one day. A rejection is real information and a noisy sample. Strong engineers are turned down by one top company and hired by another in the same month.

## Recap

Four things to remember. Coding is largely a bar check; level is argued from design depth and behavioural scope. The packet is what gets judged, so every round should produce at least one quotable, unprompted line. A committee discounts enthusiasm without evidence, while a debrief gives the hiring manager the most weight. And a credibility doubt ends loops, so attribute "I" and "we" exactly.

At your desk: the stage and round tables, the sample coding form, candidate R's packet under both models, the 74-day timeline, and the preparation plan.
