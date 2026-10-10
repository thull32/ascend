---
lesson: cross-team-and-organisational-impact
source: 62be67208b2357d9
fit: great
desk:
  - "The adoption plan's segment table and the deprecation schedule"
  - "The tracker over twenty weeks: the funnel by count and by traffic"
  - "The RFC opening and the one-page executive rewrite, side by side"
  - "The before-and-after impact table"
  - "Exercise: read the adoption tracker"
---
## Introduction

Five product teams each wrote their own retry logic for calls to other services. Three retried on every error, including requests that could never succeed. Two used no jitter. One retried forever. Then one afternoon a shared dependency slowed down. With two layers of services each making up to three attempts, a single user request became up to nine calls on the struggling dependency. A slowdown became a two-hour outage.

Nobody's code was wrong by their own team's standards. The organisation had no standard.

The fix was not a sixth retry implementation. A senior engineer wrote an RFC for one shared client, with a retry budget, jittered backoff, and a rule never to retry requests that are unsafe to repeat. Then the engineer made it the default in the service template, opened migration pull requests for other teams, and published adoption and incident numbers every week.

This is about the part after the RFC is accepted. Deciding whether a shared solution is worth it. Getting forty services onto it. Measuring whether it worked. And explaining all of it to people who will read one page.

## When a shared solution is worth it

A shared solution is a product with users. It needs documentation, support, versioning, migrations, and often an on-call rotation, indefinitely. Build one too early and you freeze a guess into a dependency every team must work around.

Four questions decide it. How many teams really have the problem? Generalise after the third real instance, not the first imagined one. How much does it cost each of them today, in engineer time and in incidents? How similar are the needs? Five teams that "all need a queue" may need three different things. And what is the lightest form that solves it?

Picture a line from cheap to expensive. A documented pattern. Then a shared library. Then a paved-road template with tooling. Then a managed platform service, with the most leverage and the highest ongoing cost. Choose the leftmost option that solves the problem.

Then do the arithmetic. Without a standard, five teams spend about two engineer-weeks a year each maintaining retry code, plus two incidents a year: about 11 engineer-weeks a year. With a library, it is 3 weeks to build, half a week per team to migrate, and about a week a year to maintain. Year one costs six and a half weeks, every later year about one. It pays back inside the first year, before you count the outages it prevents. These are estimates; the shape of the comparison is what matters, and it goes in the RFC.

The principle for any shared solution is to make the right thing the easy thing. Netflix engineers call it a paved road: a well-supported default path that teams are free to leave, as long as they take on the cost of owning whatever they build instead. New services generated from the template get the shared client without anyone deciding to. Mandating a platform and forbidding everything else tends to produce a platform that stops improving, because it has no competition.

## The adoption plan and the long tail

The organisation has 40 services owned by nine teams. The plan segments them, because each segment needs a different kind of help.

New services need nothing: the library is the template default. Twenty-five maintained services with standard code migrate themselves, about half a day each, with a codemod, a guide and weekly office hours. Ten with unusual code get a platform squad of two, who open the pull request while the owner reviews. And five are special cases: two need a library feature, and three look unused and are candidates for deletion.

The plan also says how the old way ends. Week 4, CI warns on new uses of the old helpers. Week 8, it fails on them. Week 16, support ends. Week 24, the old code is deleted. And the plan names a sponsor: the director over all nine teams, who has agreed to decide deletions and review the tracker in her weekly staff meeting.

Why a sponsor? Because organisation-wide migrations tend to have the same shape. Actively maintained services move quickly, because their owners want the improvement. A commonly reported pattern is that the last 10 to 20 percent take as long as the rest together: services owned by teams that were reorganised, services nobody fully understands, special cases the new system does not support.

So before I go on: a migration that reaches 90 percent in two months and then sits there for five. What was missing?

[pause]

Funding for the tail. A squad, a sponsor with authority to say "this service is dead", and deprecation dates. Without them, the migration stalls at about 90 percent indefinitely, and the organisation now maintains two clients instead of one, which is worse than either.

## Measuring adoption

Count adoption as a funnel, one row per service, updated weekly. Aware: the owning team has acknowledged the RFC and has a date. Trial: staging runs the library. Adopted: production traffic goes through it. Complete: the old code is deleted and lint enforces it.

Four numbers matter more than the rest. The first is adoption by traffic, not only by count. At week 10 the tracker showed 31 of 40 services adopted, 77 percent. But only 58 percent of outbound calls, because one legacy service that had not moved carried a quarter of all traffic. Count alone would have declared victory while the riskiest caller was still on the old code.

The second is time in stage. A service four weeks in trial is stuck, and the blocker is usually not technical: a team with no capacity, or no owner at all. The third is the bottleneck stage: whichever stage holds the most services is where next week's effort goes. Early on it was "aware", because teams had not scheduled it. By week 10 it was "trial", because what was left was unusual code.

The fourth is the outcome. Adoption is a means. The end is the incident class: peak load on a dependency during its slowdowns went from up to 9 times to about 1.2 times. Report both, and lead with the outcome.

Read the twenty weeks the way a sponsor would. Weeks 2 to 8 are the self-serve segment, and the count climbs fast. From week 8 the curve bends, and effort moves to the squad. Traffic trails count until the legacy service moves between weeks 16 and 20, the single most important event in the whole migration, and the one a count-only report would have hidden. By week 20, 99 percent of traffic is through the library, and the two services left are the ones waiting on a feature the plan named in week zero.

## Conway's law and product managers

Melvin Conway wrote in 1968 that organisations are "constrained to produce designs which are copies of the communication structures of these organizations". Two teams that rarely talk produce a clumsy interface between their services. One team owning two services tends to couple them.

For a senior engineer, that means cross-team friction is often an architecture signal. If every feature needs coordinated changes by three teams, the boundaries are probably in the wrong place, and more meetings treat the symptom. Team design is architecture design. And a platform team needs the right interaction mode: stuck collaborating on every change, it becomes a bottleneck; offering itself as a self-service product with good defaults, it scales. The adoption plan was deliberately self-service for 25 of 40 services.

Product managers own what and why. Engineers own how, and the long-term health of the system. The two share when. Technical work competes for the same capacity as features, so frame it in the same currency: outcome, cost, payback.

The lesson's example: engineers re-run CI about 70 times a week, at about 12 minutes each. That is about 14 engineer-hours a week. Fixing the ten flakiest tests costs about two engineer-weeks, 80 hours. Payback is under six weeks, and then about a third of an engineer comes back every week. Few product managers say no to that. "Tests should not be flaky" loses to a feature; a six-week payback does not.

## Writing for executives

Executives have little time and many contexts. What works for them leads with the conclusion, makes the ask explicit, uses a few numbers, and never surprises them.

The RFC opened like this, for engineers: a shared client with full-jitter exponential backoff, a token-bucket retry budget, rules on retrying non-idempotent methods, and nine times amplification from three attempts across two layers. The mechanism first. The ask never stated.

The rewrite for the director who must fund the squad opens with "Decision needed: fund a two-person migration squad for one quarter." Then why it matters, in one sentence of plain words: our services retry failed calls in ways that multiply load up to nine times. Then the gap: 15 services cannot migrate alone, and without help, migrations like this stall at about 90 percent. Then two explicit asks with a date: two engineers for a quarter, and a decision on deleting three dead services by August 1. Then what she gets. Then the risk, with its mitigation, on the page.

Only four numbers survive: nine times, 25 of 40, 90 percent, and 24 engineer-weeks. Each one supports the decision. The vocabulary goes to the appendix. And the risk stays visible, because surprises cost more trust than bad news.

The same discipline applies to status. Go amber the week you see risk, not the week before the date. An executive who sees red without amber first stops trusting the colours.

Underneath, staff-level impact is judged by other teams: feedback from the leads who adopted your work, adoption and outcome numbers, and the written trail. An engineer who shipped a library and cannot show who uses it has shown senior scope, not staff scope. So capture the baseline before the work starts; after the fact, nobody can reconstruct it. At organisational scale, work that is not written down did not happen.

## In the interview

"How do you get teams to adopt something they did not ask for?"

[pause]

Evidence that the problem is theirs too. A reference implementation better than what they have. The new way as the default. You doing much of the work. Visible progress, and deprecation dates for the end. The wrong answer is "get leadership to mandate it", which buys compliance and backlash. Most successful migrations combine incentives with the platform doing the work, and hold the mandate in reserve for the last few services.

"How do you tell an executive that your project is slipping?" Early, in one page, conclusion first: status and reason, what changed, options with costs, your recommendation, and the decision you need by a date. Not a detailed chronology, and not waiting until the date is certain to be missed.

## Recap

Four things to remember. Choose the lightest shared solution that works, after the third real need, and show the payback arithmetic. Plan for the tail from day one: segments, a funded squad, a sponsor for deletions, and deprecation dates, or you stall at 90 percent with two systems. Measure adoption by traffic as well as count, with time in stage, and lead with the outcome metric. And write for executives with the decision first, a few numbers, an explicit ask, and the risk named.

At your desk: the segment table and deprecation schedule, the twenty-week tracker, the RFC and its one-page rewrite side by side, the impact table, and the adoption-tracker exercise.
