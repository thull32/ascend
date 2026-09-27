---
slug: resume-and-screens
title: "Resumes, referrals and screens: getting to the loop"
description: How to write a senior resume that shows scope and impact in the first few seconds, a bullet formula with before-and-after examples, how to ask for a referral, and how to handle the recruiter, hiring manager and technical screens.
minutes: 16
difficulty: intro
tags: [career, resume, referrals, recruiter-screen, phone-screen]
---
A recruiter with two hundred applications for one senior role gives yours a first pass that is usually well under a minute. In that time they are trying to answer three questions: is this person at the level we need, have they done work like ours, and is there evidence they did it well? A resume that lists responsibilities ("worked on the payments service; participated in code reviews; responsible for CI") answers none of them, however strong the engineer behind it. A resume whose first three bullets say what you led, at what scale, and what changed as a result answers all three before the recruiter reaches the bottom of the first page.

This lesson covers everything between deciding to look and walking into the loop: a senior resume and the bullet formula that makes it work, referrals and how to ask for one, and the three kinds of screen (recruiter, hiring manager and technical), with scripts for the questions that trip people up, including the salary question.

## What a senior resume must prove

A senior resume has one job: to make a busy reader believe you operate at senior scope, quickly enough that they read further. That means five things should be visible:

1. **Scope.** The size of what you owned: systems, teams, users, traffic, money.
2. **Ownership.** Verbs that show you decided and led, not only participated.
3. **Impact.** What changed because of your work, with numbers.
4. **Relevant depth.** The technologies and problem domains the role needs, visible where a recruiter searching for them will find them.
5. **Trajectory.** Growing scope from one role to the next.

Duties are not evidence. Everyone on a payments team "worked on the payments service". What only you can claim is what you changed.

## Structure

- **Header.** Name, location or "remote", email, LinkedIn. GitHub only if it shows something you would want an interviewer to read.
- **Summary (optional, two lines).** Useful for career changers or when your titles understate your scope. "Senior backend engineer, six years in payments and ledger systems at around 50,000 requests per second. Led a ledger re-architecture across three teams." Skip clichés such as "passionate, results-driven team player".
- **Experience,** in reverse chronological order. Four to six bullets for your current or most recent role, two to four for the one before, one or two for older roles. The most recent three to five years carry nearly all the weight.
- **Skills.** One or two lines, grouped: languages; data stores; infrastructure. No proficiency bars or star ratings.
- **Education.** One line. Certifications only if the role asks for them.

**Length.** One page for most engineers with under about ten years of experience; two pages at most beyond that. A third page tells the reader you could not decide what mattered.

**Format.** A single column, a standard font, a PDF, no photo, no graphics. Applicant tracking systems (ATS) are mostly databases that store and search applications; the widespread belief that software silently rejects resumes for formatting is overstated. What they do mean is that recruiters *search* by keyword, so the technologies you have really used should appear in plain text, and exotic layouts can garble the parsed text a recruiter sees.

## The bullet formula

Every strong bullet has the same parts:

```text
<Verb showing ownership> + <what you built or changed> + <the key technical decision>
  + <scale or context> + <measurable result>  [+ <your role, if it was a team effort>]
```

The verb matters: *led, designed, drove, built, cut, replaced, migrated, introduced*. Avoid *helped with, participated in, was responsible for*.

Before and after:

| Before (a duty) | After (evidence) |
|---|---|
| Worked on the payment retry system | Redesigned payment retries around idempotency keys and exponential backoff, cutting duplicate charges from about 40 a week to zero across 2M monthly transactions |
| Improved API performance | Cut p99 latency of the catalogue API from 850 ms to 210 ms by replacing N+1 ORM queries with batched loaders and adding a read-through cache; unblocked the mobile home-page launch |
| Migrated services to Kubernetes | Led the migration of 14 services from VMs to Kubernetes across 3 teams over 2 quarters; wrote the playbook the other teams followed and cut deploy time from 40 to 8 minutes |
| Mentored junior engineers | Mentored 3 engineers through their first on-call rotations and wrote the team's incident runbooks; median time to mitigate fell from 48 to 19 minutes over two quarters |
| Responsible for CI | Rebuilt CI with test sharding and dependency caching, taking the main pipeline from 35 to 9 minutes for 60 engineers, about 300 engineer-hours a month |

Each "after" bullet can be the opening of a behavioural story, and interviewers will treat it as one: "Tell me about the retry redesign." Write only bullets you can talk about for ten minutes.

**When you do not have exact numbers.** Estimate honestly and signal it ("about", "roughly"), use relative terms ("halved", "cut by a third"), or use proxies for scale (number of services, teams, users, requests per second). Never invent a figure. A number you cannot explain in the interview is worse than no number at all.

## Tailoring without rewriting

For roles you really want, spend twenty minutes tailoring:

- Read the job description and underline the three or four things they clearly care most about.
- Reorder your bullets so that the ones matching those things come first in each role.
- Use their vocabulary where it is true. If they say "distributed systems" and you wrote "backend services", and your work was genuinely distributed, use their phrase.
- Cut bullets that are irrelevant to this role to make space for relevant ones.

Do not claim experience you do not have. The technical screen will find it.

## Referrals

A referral from someone inside the company typically gets your application a much faster and more careful first look than a cold application. It is not a guarantee, but it is the highest-leverage step in the whole process.

**Who to ask.** Former colleagues first, then people you have worked with in other capacities (open source, conferences, customers). Asking a stranger for a referral rarely works and puts them in an awkward position; ask a stranger for a short conversation about the team instead, and let a referral follow if it fits.

**How to ask.** Make it easy to say yes and easy to say no, and do the work for them:

```text
Hi Priya, hope the new team is treating you well.

I'm starting to look at senior backend roles, and the Streaming Platform
opening at <Company> (<link>) looks like a strong fit: I've spent the last
three years on <closely related work>.

Would you be comfortable referring me? I've attached my resume and a
three-line summary you can paste into the referral form. If it's not a
good fit or you'd rather not, no problem at all, and I'd still love
fifteen minutes to hear how you're finding it there.

Thanks,
Sam
```

Include the summary, because referral forms usually ask "why this person?", and a referrer who has to write it from scratch will write something vague. Then thank them, and tell them how it turned out.

## The recruiter screen

The recruiter screen is usually 20 to 30 minutes. It is not technical, but it is an assessment. The recruiter is checking level fit, motivation, logistics, compensation alignment, and whether you can communicate clearly. They are also your best source of information about the process, and often your advocate inside the company.

### "Tell me about yourself"

Use a 60- to 90-second pitch: present, past, why this role.

> "I'm a backend engineer with six years in payments. For the last two years I've been tech lead on our ledger team: five engineers, the system of record for about 2 million transactions a month. The biggest thing I've done there is re-architect how we handle retries and reconciliation, which took duplicate charges to zero. Before that I spent three years on the checkout platform. I'm looking for a senior role where I can own a larger distributed system, and your streaming platform team's work on <specific thing> is exactly that kind of problem."

The last sentence matters. Show that you have read about the team and the role.

### Questions to ask the recruiter

- What level is this role being considered at, and what does that level mean here?
- What does the loop look like: how many rounds, and of which types?
- Which languages and environments are used in the coding rounds? Can I run code? Are AI tools allowed in any round?
- Is there preparation material you can share?
- What is the timeline, and is there team matching after the loop?
- What is the compensation range for this role?

### The salary question

Sooner or later you will hear "What are your salary expectations?" or "What are you making now?" The rules and norms depend heavily on where you are:

- Several US states and cities, including California, Colorado, New York and Washington, require salary ranges in job postings, and many US jurisdictions prohibit employers from asking about your salary history. The EU's pay transparency directive is pushing in the same direction. Check what applies where you live and where the job is.
- Where the posting includes a range, you have your anchor already.

A reasonable default is to defer early and ask for their range:

> "I'd like to understand the level and the scope of the role before I talk numbers, and I'm confident we'll find something fair if it's the right match. Could you share the range for this role?"

If they press, give a researched range whose bottom is a number you would be happy with, based on public data for that company and level. Do not volunteer your current salary where you are not required to; it anchors the offer to your past rather than to the role. See [Negotiation](/learn/senior-craft/getting-the-job/negotiation) for the full approach.

## The hiring manager screen

Some companies put a conversation with the hiring manager before or alongside the technical screen. It is partly behavioural, partly a project deep-dive, and partly the manager deciding whether they want you on the team. Prepare:

- A two-minute walkthrough of your most relevant project, ready to go several levels deeper on the architecture and on the decisions that were yours.
- A clear, honest answer to "why are you looking?" that is about what you want next, not a complaint about your current employer.
- Your own questions, because this is your future manager: "What would make you say, six months in, that this hire was a great decision?"; "What's the biggest technical problem the team hasn't solved?"; "How are technical decisions made on the team?"; "What's on-call like?"

## The technical screen

The technical screen is usually 45 to 60 minutes of coding in a shared editor, sometimes two problems, and sometimes a practical problem instead. It is a bar check: its main question is "is it worth spending five more interviewers' time on this person?" Treat it with the same seriousness as a loop round.

- **Setup.** A wired or reliable connection, a headset, a quiet room, and your editor font large enough to read over screen share. Test the platform link the day before if you can.
- **Language.** Use the language you are fastest and most accurate in; see [Choosing an interview language](/learn/senior-craft/languages-for-senior-engineers/choosing-an-interview-language).
- **Execution.** Everything in the [interview execution](/learn/interview-patterns/interview-execution/the-45-minute-protocol) module applies: the time budget, clarifying questions, live testing and recovery when stuck.
- **Practice.** Run solo coding mocks at medium difficulty on `/interviews`, which is the difficulty the app describes as a typical senior screen, until you finish and test inside 35 minutes consistently.

## Senior signals

- Your resume bullets state ownership, the key decision, the scale and a measurable result, and each one opens a story you can tell.
- Your first page shows senior scope within seconds; duties and outdated detail have been cut.
- You ask for referrals in a way that is easy to accept or decline, and you supply the summary.
- In the recruiter screen you give a tight pitch, ask about the level and the loop format, and handle the salary question deliberately.
- You treat the hiring manager screen as a two-way interview and ask what success looks like.
- You prepare for the technical screen as seriously as for the loop.

## Check yourself

```quiz
- q: >-
    Which resume bullet is strongest for a senior role?
  options: ["\"Worked closely with the team to improve payment reliability, which significantly reduced customer-facing incidents\"", "\"Expert in Go, Kafka, Postgres, Kubernetes, Redis and AWS, applied daily to build and run high-volume, low-latency payment systems\"", "\"Owned the payments service end to end, including its on-call rotation, roadmap and 2M monthly transactions\"", "\"Redesigned payment retries around idempotency keys, cutting duplicate charges from ~40 a week to zero on 2M monthly transactions\""]
  answer: 3
  explanation: >-
    It shows ownership, the key technical decision, scale and a measurable result, and it opens a story you can tell. The others list duties (a scale number attached to a duty is still a duty), blur your role behind an unmeasured "significantly", or list keywords without evidence.
- q: >-
    You do not have an exact figure for the latency improvement you delivered. What should you do?
  options: ["Pick a plausible precise figure, since specific numbers read as more credible", "Replace it with the technologies used, since those match recruiter searches", "Leave the result out, since an unverifiable number weakens the whole bullet", "Give an honest estimate or relative change, such as \"roughly halved\""]
  answer: 3
  explanation: >-
    Interviewers treat resume bullets as story prompts, and a number you cannot explain damages your credibility, so estimate honestly, signal it ("about", "roughly") and be ready to explain how you know. Leaving the result out throws away the impact; an honest approximation or relative change still shows it. Never invent a figure.
- q: >-
    What is the most effective way to ask a former colleague for a referral?
  options: ["Send your resume with a short note and let them decide what to write in the form", "Explain why the role fits and attach your resume plus a short summary they can paste in", "Ask them to forward your resume to as many teams as possible to widen your chances", "Ask them to put in a good word with the hiring manager personally before you apply"]
  answer: 1
  explanation: >-
    A specific, low-effort request that is easy to decline gets better referrals. The pasteable summary matters because referral forms ask why the referrer recommends you, and a referrer who has to write that from scratch will write something vague.
- q: >-
    Early in a recruiter screen you are asked for your salary expectations. What is a sound default approach?
  options: ["State your current salary exactly, so the offer is anchored to a verifiable figure", "Ask for the role's range; if pressed, give a researched range you would accept", "Name the highest figure you have heard for the role, so the offer is anchored high", "Refuse to discuss compensation at all until you have a written offer in hand"]
  answer: 1
  explanation: >-
    Defer until you understand the level and scope, and ask for the role's range; if pressed, give a researched range whose bottom you would be happy with. That avoids anchoring the offer to your past pay, and in many places employers must post ranges or may not ask about salary history. Refusing outright creates friction, and an unfounded extreme number damages credibility.
- q: >-
    How should you treat the technical phone screen compared with the loop?
  options: ["As a low-stakes chance to try out the new language you want to use in the loop", "As a bar check that gates the loop, prepared for with the same timed practice", "As a formality, since the loop is where the hiring decision is really made", "As mainly a test of speed, so aim to finish as many problems as possible"]
  answer: 1
  explanation: >-
    The screen decides whether the company invests a whole loop in you, so it deserves the same execution protocol and timed practice. Trying a new language or treating it as a formality are common and avoidable ways to fail it.
```
