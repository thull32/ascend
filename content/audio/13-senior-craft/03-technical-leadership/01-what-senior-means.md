---
lesson: what-senior-means
source: 8947c6f3ed5050c6
fit: great
desk:
  - "The levels rubric and the company ladder table (Google, Meta, Amazon, Microsoft)"
  - "The definition-of-done checklist"
  - "The weak and strong packet paragraphs with a reader's margin notes"
  - "The career failure-modes and where-to-spend-senior-time tables"
  - "Exercise: read a packet like a committee"
---
## Introduction

Two engineers on the same team each pick up a ticket that says "add rate limiting to login". Both ship within a few weeks, with clean, tested code. Six months later one is promoted to senior, and the other is told to keep doing what they are doing.

The code was not the difference. The first engineer asked why the ticket existed. She learned the real problem was credential stuffing from a botnet rotating through thousands of IP addresses, so a per-IP limit alone would barely dent it. She wrote a one-page proposal, shipped per-account and per-IP limits, added an alert and a runbook, and a month later reported the drop in takeover attempts against a number she had agreed in advance. The second engineer implemented a token bucket per IP, exactly as specified.

Both did the task. Only one owned the problem. Senior is not a number of years or a level of coding skill. It is the size and shape of the problems you are trusted with, and what you do around the code.

Here is what is coming. The four axes every levelling guide uses. Two projects done at both levels, side by side. A procedure for growing any ticket to senior scope. And how promotion committees and interviewers actually read the evidence.

## The four axes

Public career frameworks use different words for the same four axes. Think of each as what you are given, and what you produce.

Scope. A mid-level engineer owns a feature inside a project someone else planned, over weeks. A senior owns a project or service end to end, often a quarter, often with two to four other engineers. Staff, for contrast, owns several teams or a whole area, over a year or more.

Ambiguity. Mid-level is given a solution and implements it well. Senior is given a problem, and finds and justifies a solution. Staff is given a goal or an area, and finds the problems worth solving.

Impact. Mid-level produces output: shipped code that works. Senior produces an outcome: a number that moved, measured against a stated goal. Staff produces a direction: a class of problems removed for many teams.

Influence. Mid-level owns their own work and gives good reviews when asked. Senior multiplies the team: design reviews, mentoring, docs, decisions others follow. Staff multiplies the organisation.

Under all four run two traits. Ownership is where you consider the job finished: at merge, at launch, or when the outcome is achieved and someone else can run the system. Judgement is what you decline to do.

Each axis reduces to a question you can ask of your own work. How much of the plan did you write? What were you handed, a spec or a complaint? Which number moved, and who cares? And who changed what they did because of you? A promotion case is an argument that someone has operated one step above their current level for long enough that it is not luck.

## Worked example: login protection

Back to the login ticket, phase by phase. The mid-level version took about a week. The senior version took about three. Most of the numbers here are illustrative, as the lesson says, but two are real: each login runs an Argon2id hash that allocates about 19 mebibytes, and Tokio's blocking pool allows up to 512 threads by default.

The senior engineer started by asking support why the ticket existed: 40 account-takeover reports last month. Then she read the auth logs. The attempts came from about 12 thousand IP addresses, most making under 2 attempts a minute each.

Before I go on: what does a limit of 5 attempts a minute per IP do against that attack?

[pause]

Nothing. It never fires. The mid-level engineer would have shipped a correct control against the wrong attack.

So she rewrote the goal: cut takeover attempts reaching password verification by 90 percent, with the 99th percentile login under 300 milliseconds. That is an outcome with a guardrail, and it leaves the solution open.

Then she found a risk nobody had looked for. A 4-core host completes perhaps 100 to 200 hashes a second, so a burst of 300 attempts a second queues up. If the blocking pool runs 512 hashes at once, at 19 mebibytes each, that is about nine and a half gibibytes of memory. Capping it at one hash per CPU holds it to 76 mebibytes. A bounded hashing pool went into the design.

She launched in shadow mode first, logging but not blocking, for a week. 0.3 percent of real logins would have been limited, all from one office behind a shared address. So the per-IP limit went up, and per-account became the main defence. Then a dashboard, an alert routed to on-call, a runbook, and a 15-minute walk-through with the rotation. And finally a paragraph to security and support: takeover attempts reaching hashing down 92 percent in 30 days, against a 90 percent goal, with the 99th percentile login unchanged at 180 milliseconds.

Two things decided the level. She changed the problem statement before writing code, which is what the ambiguity axis measures. And the work left artefacts other people use: a doc, a runbook, an agreed goal, a result.

## Worked example: search feels slow

The second project starts vaguer, which is where the gap widens. A streaming catalogue's product manager says users complain that search feels slow.

The mid-level engineer opens the server dashboard, sees the median search at 180 milliseconds, and puts a Redis cache in front of the search service. Two weeks later cached queries return in 60 milliseconds. The complaints continue. Nobody asked what slow meant to the people complaining.

The senior engineer asks first: slow while typing, or slow after pressing enter? On which devices? The product manager has no idea; the app-store reviews just say "laggy search". So the senior says, I will measure before proposing, and adds client-side timing from keystroke to results rendered, split by platform, next to the server's numbers. Numbers and a proposal by Thursday.

On Thursday: the server's 95th percentile is 220 milliseconds, and fine. On Android, keystroke to results is 1.8 seconds at the 95th percentile. The app sends a request on every keystroke, never cancels the stale ones, and each response is about 400 kilobytes. The proposal: debounce at 150 milliseconds, cancel in-flight requests, and trim the payload. That is mostly the Android team's code, so the senior books 30 minutes with their lead, with a target of under 600 milliseconds.

Three weeks later, Android sits at 550 milliseconds. And the cache was never built, which saved an operational dependency nobody needed. The mid-level engineer optimised what was measurable. The senior made the right thing measurable first, and moved work across a team boundary with a number instead of a request.

## Growing a ticket to senior scope

Both examples followed the same six steps, and you can run them on any ticket. They typically add a day or two before the first line of code.

First, find who feels the problem and a number that describes it. Second, rewrite the ticket as an outcome with a guardrail, move X by Y without breaking Z, and get the requester to agree in one written message. Third, find the fact that would make the obvious solution wrong, and check it first: the IP spread killed the per-IP limit; the client timing killed the cache. Fourth, name everyone outside your team who must change something, and talk to them before you build. Fifth, decide when and to whom you will report the result, and put the date in the calendar. Sixth, leave one artefact other people will use.

Here is the step to remember: the second one. Steps three to six on a task-shaped goal produce excellent task-level work. The reframed goal is what makes the rest count as project scope.

On ownership, the lesson's definition of done goes past merge: rolled out gradually with a tested rollback, alerts routed to on-call, a runbook, docs, the flag removed and the old path deleted, the result measured and shared, and follow-ups ticketed with owners. The last three are where most engineers stop early. Dead flags and half-migrated paths are how systems rot, and "we shipped it" without "here is what changed" is how good work stays invisible.

## Leverage and judgement

Leverage is arithmetic. Say your own output is 1 unit a week. Spend 20 percent of your time on reviews, docs and unblocking that make six teammates each 10 percent more effective, and the team gets 0.8 from you plus 0.6 from them: 1.4, not 1. A script that saves each of 10 engineers 10 minutes a day saves about 370 hours a year, nine engineer-weeks.

The same arithmetic shows when leverage is fake. If that 20 percent goes into approvals with no comments, or lists of nits, the teammates gain nothing and your contribution drops to 0.8. Leverage is measured at the receiving end: a review that teaches a pattern, a flaky test fixed at the root, a new hire productive in two weeks instead of six. None of it shows in a commit count, which is why seniors write it down.

Judgement signals are subtractive. Not building a generic plugin system when two hard-coded cases will do. Choosing the boring database. Separating reversible decisions, like a library behind an interface or a feature flag, from hard-to-reverse ones, like a public API or a data model, and spending review effort in proportion. Saying the remaining 5 percent is not worth two weeks, and being right. The search example contains one: the cache that was not built.

## How the evidence is read

A promotion case is usually a written packet: the manager's summary, the candidate's account, peer feedback, and links to artefacts. At several large companies, by widely reported accounts, the people deciding are not your manager. They are senior people from elsewhere, reading many packets from strangers in one session.

They look for three properties. The claim is at the next level, a project and not a ticket. It is attributable: "I designed", not "we shipped". And it is sustained, across several quarters, not one heroic month. "Worked on login security, collaborated with security and support, received positive feedback" fails all three. "Reframed the ticket after finding the attack came from 12 thousand IPs, wrote the design, ran it in shadow mode, cut takeover attempts 92 percent against a 90 percent goal, runbook adopted by on-call" passes.

Calibration meetings work the same way. Managers compare ratings across teams, and a manager who cannot point to artefacts loses the argument to one who can. Your manager represents you in a room you are not in, armed only with what exists in writing.

Five failure patterns follow from this. The hero, paged for everything, a single point of failure the organisation cannot move. The ticket machine, with great velocity and no evidence on ambiguity. The architecture astronaut, designing for a hundred times the load. The gatekeeper, influencing by veto. And the invisible senior, doing senior work with no artefacts. Glue work is the trap: essential, and uncredited unless you tie it to a project you own and report it as part of that project's result.

## In the interview

Seniority is assessed in every round. Here is a follow-up the lesson expects. Tell me about something you decided not to build.

[pause]

The option, why it was tempting, the number that argued against it, and the trigger that would reopen it. "I did not add the search cache: the server's 95th percentile was 220 milliseconds, and the problem was client-side. I would revisit if it passed 400." The wrong answer is a feature product vetoed, which is someone else's judgement.

And: what is the most ambiguous problem you have owned? The vague input, the first thing you did to reduce the ambiguity, the reframed goal with a number, and the result against it. "Laggy search" became Android keystroke to results from 1.8 seconds to under 600 milliseconds. The wrong answer is a hard technical problem with a clear spec. That is difficulty, not ambiguity.

## Recap

Four things to remember. Senior is scope, ambiguity, impact and influence, not years or difficulty. The step that changes the level is rewriting the ticket as an outcome with a guardrail, then checking the fact that would make the obvious solution wrong. Done means operated, cleaned up, measured and reported. And promotion runs on written, attributable, sustained evidence, so produce it as a by-product of the work.

At your desk: the rubric and ladder tables, the definition-of-done checklist, the two packet paragraphs with their margin notes, and the packet-reading exercise.
