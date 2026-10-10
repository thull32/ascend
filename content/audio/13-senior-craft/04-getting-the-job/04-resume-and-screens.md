---
lesson: resume-and-screens
source: 6295d8148c218b2a
fit: great
desk:
  - "The application pipeline diagram, from record to loop"
  - "The bullet formula and the five before-and-after rewrites, side by side"
  - "Sam's role scored, mined, rewritten and re-scored, as tables"
  - "The referral message template"
  - "The minute-by-minute recruiter screen and the hiring-manager screen exchanges"
---
## Introduction

A recruiter working several open roles gives a new application a first pass that recruiters commonly describe as well under a minute. In that pass they are answering three questions. Is this person at the level we need? Have they done work like ours? Is there evidence they did it well?

A resume that lists responsibilities, "worked on the payments service, participated in code reviews, responsible for CI", answers none of them, however strong the engineer behind it. A resume whose first three bullets say what you led, at what scale, and what changed as a result answers all three before the recruiter reaches the bottom of the page.

Then come the screens, and each one is a small assessment with its own note. This covers everything between deciding to look and walking into the loop: what happens to an application, the formula behind a senior bullet, referrals, and the three screens.

## Where an application goes

Before a role opens, the recruiter and the hiring manager usually agree the must-haves, the nice-to-haves and the level range. That list is what the recruiter scans for, which is why a posting's first few requirements deserve your first few bullets.

Your application then becomes a record in an applicant tracking system. Greenhouse, Lever and Workday are common ones. The system is a database with a search interface. It parses your resume into fields, employers, titles, dates and skills, keeps the original file, and records a source: applied, referral, sourced by a recruiter, or agency. Recruiters then search and filter those records by keyword, title and employer, including past applicants. And notes and outcomes stay attached, so a later recruiter can read how your last process went.

Here is a popular belief worth dropping. The idea that the system silently rejects resumes for their formatting is, by recruiters' common accounts, mostly a misunderstanding. Automatic rejection usually comes from knockout questions: work authorisation, location, yes-or-no questions. Answer those accurately. Formatting matters for a different reason: a garbled parse is what the recruiter sees and searches, and a skill buried in a graphic cannot match a search. So: a single column, standard headings, a PDF, no text inside images.

## What a senior resume must prove

A senior resume has one job: to make a busy reader believe you operate at senior scope, quickly enough that they read further. Five things should be visible. Scope: the size of what you owned. Ownership: verbs that show you decided and led. Impact: what changed, with numbers. Relevant depth: the technologies the role needs, in plain text. And trajectory: growing scope from one role to the next.

Duties are not evidence. Everyone on a payments team worked on the payments service. What only you can claim is what you changed.

The formula for a bullet: a verb showing ownership, what you built or changed, the key technical decision, the scale, and a measurable result, plus your role if it was a team effort. Each slot answers a reader's question. The verb answers "did they lead it?" Led, designed, drove, cut, replaced. Not helped with, participated in, was responsible for. The decision answers the hiring manager's "do they know why it worked?" The scale answers the recruiter's "is this our size?" The result answers "did it matter?"

Hear the difference. Before: "Worked on the payment retry system." After: "Redesigned payment retries around idempotency keys and exponential backoff, cutting duplicate charges from about 40 a week to zero across 2 million monthly transactions." The first says you were on the team. The second says you owned a design, know the mechanism, work at payment scale, and have a result worth asking about.

One warning. A bullet that fills every slot is also the opening line of a behavioural story, and interviewers will treat it as one. Write only bullets you can talk about for ten minutes. And know every number's derivation. "About 300 engineer-hours a month" should come with "26 minutes saved per run, times roughly 700 runs a month, from the CI dashboard". Never invent a figure. A number you cannot explain costs more credibility than no number.

Length: one page for most engineers with under about ten years, two at most beyond that. A third page says you could not decide what mattered.

## Mining one role

Picture Sam, a payments engineer, whose current role has five bullets: worked on the ledger service, participated in the reconciliation project, responsible for on-call, did code reviews and helped with hiring, improved performance of the settlement batch job. Scored one point for each of scope, ownership, impact and depth, that section gets 1 out of 20. The only point is the tech stack.

So Sam interviews themselves. For each bullet, four questions: what changed, what did I decide, how big was it, and how do I know?

The settlement job turns out to have run five hours forty minutes, sometimes missing the six in the morning bank cut-off. Sam partitioned it by merchant and ran the partitions in parallel, and it now takes one hour fifty, with no missed cut-off since. The rewritten bullet: "Cut the nightly settlement job from five hours forty to one hour fifty by partitioning by merchant and running partitions in parallel, ending missed bank cut-offs."

The same mining turns "participated in the reconciliation project" into "proposed and led automated reconciliation against bank settlement files", taking finance's month-end check from two days to two hours and finding three classes of silent mismatch. On-call becomes cutting pages from about 45 a week to 12. The re-scored section gets 19 out of 20.

Nothing was invented. Every point came from Sam's notes, and every number has a source Sam can name. Tailoring is mostly reordering: for a reliability role, the on-call and settlement bullets move to the top; for a ledger role, the ledger and reconciliation bullets. About twenty minutes per role you care about.

## Referrals

Cold applications arrive in the largest volume and are read in bulk. Referrals arrive tagged with the source and the referrer's answers to a short form, commonly how they know you and whether they would work with you again. Many companies ask recruiters to review referred candidates promptly. A referral changes how fast and how carefully you are read. It does not change the bar.

Here is a detail that catches people. Before I tell you: you applied cold last week, and now a former colleague offers to refer you. What might go wrong?

[pause]

Recruiters commonly report that the first recorded source sticks unless someone edits it by hand. Your application may stay tagged as cold and lose the referral's faster, more careful review. Ask for the referral first, and let the referral create the record.

Ask former colleagues first. A stranger cannot answer "would you work with them again?", so ask a stranger for fifteen minutes about the team instead. Make the ask easy to say yes to and easy to say no to, and write three lines they can paste into the form. A strong referral says how the referrer knows your work: "I worked with Sam for two years; they led our reconciliation redesign." A weak one says "I know of them". Recruiters read the difference.

## The three screens

The recruiter screen is usually 20 to 30 minutes, not technical, and still an assessment of level fit, motivation, logistics and compensation. Open with a 75-second pitch: present, past, why this role. Four minutes of chronology gets the note "rambled; scope unclear".

When asked your level, name it on their ladder with evidence: "Senior, which I understand is L5 here. I designed our ledger's multi-currency schema across three teams." "Whatever fits" gets the note "open to mid; consider the mid-level requisition". When asked about salary expectations, a sound default is to defer politely and ask for the range: "I'd like to understand the level and scope before we talk numbers. Could you share the range for this role?" If pressed, give a researched range whose bottom you would be happy with. Where you are not required to, do not volunteer current pay; it anchors the offer to your past. Rules vary: several US states require ranges in postings, many jurisdictions bar salary-history questions, and the EU pay transparency directive gives applicants the right to the starting pay or its range. And ask your own questions: loop format, environment, AI policy, timeline. No questions gets "low engagement".

Some companies add a hiring-manager screen, built around "walk me through your most relevant project". The weak answer is an architecture tour. The strong one is the problem, its cost, your decision, and the result, in two minutes. Then expect a probe like "why partition by merchant?" The strong answer gives the mechanism and its limit: one merchant's settlement never touches another's rows, so partitions need no coordination, but the largest merchant is about a third of the volume, so its partition is most of the remaining time. Treat it as two-way: this is your future manager, and their answers are data for you.

The technical phone screen is usually 45 to 60 minutes of coding in a shared editor. It is a bar check: is this person worth five more interviewers' time? But the form carries a level signal even here, so use the loop habits: clarify, state complexity, test unprompted, and reach the follow-up with time left. Practise until you finish and test inside 35 minutes consistently.

## In the interview

Here is a follow-up the lesson expects. An interviewer points at a number on your resume and asks: how did you measure that?

[pause]

The source and the derivation. "26 minutes saved per run, about 700 runs a month from the CI dashboard, so roughly 300 hours." The wrong answer is "it was in a report somewhere", which turns a strong bullet into a credibility question.

And another: why three jobs in four years? One honest sentence per move, each a pull towards something, such as a reorganisation or a scope you wanted, and why you intend to stay. Blaming former employers, or a vague "wanted a change" three times, is the wrong answer.

## Recap

Four things to remember. Tracking systems store and search your resume; knockout questions, not formatting, do the automatic rejecting. Every bullet needs an ownership verb, the key decision, the scale and a measured result, and you must be able to derive every number. Ask for a referral before you apply, because the first source sticks, and a referral changes how carefully you are read, never the bar. And in the recruiter screen, state your target level with evidence and ask for the range rather than volunteering your pay.

At your desk: the pipeline diagram, the before-and-after bullets, Sam's scoring and rewrite tables, the referral message, and the screen exchanges.
