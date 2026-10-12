---
lesson: cross-team-and-organisational-impact
source: 0f35db18885d8b83
---
## 1

Two teams have built similar internal caching wrappers. A colleague proposes a company-wide caching platform service. What is the strongest senior response?

A, build the platform now, before more teams diverge and the migration grows. B, mandate the better of the two wrappers, and forbid new caching code. C, a documented pattern or library first, and generalise at the third need. D, leave both wrappers alone, since two copies cost less than sharing.

[think]

The answer is C: a documented pattern or library first, and generalise at the third need.

Two instances is thin evidence that the needs are the same, and a platform carries a permanent cost: documentation, support, migrations, and often on-call. A pattern or library captures the common part cheaply, and leaves room to learn. Building the platform now freezes a guess from two data points into a dependency every team must work around.

## 2

The migration tracker shows 31 of 40 services adopted, but only 58 percent of outbound calls go through the new client. What does that tell you?

A, the services not yet migrated carry heavy traffic, so the risk remains. B, adoption is complete enough to announce, and to start deprecation. C, the count is what matters, so the migration is 77 percent successful. D, the traffic figure is noise, since call volumes vary daily.

[think]

The answer is A: the services not yet migrated carry heavy traffic, so the risk remains.

Risk follows traffic, not service count. One legacy service carrying a quarter of the calls still retries the old way, so the class of outage has not been removed. Reporting by count alone is the vanity-adoption failure mode.

## 3

An organisation-wide migration reached 90 percent of services in two months, and has been stuck there for five. What was most likely missing from the plan?

A, more frequent announcements, so lagging teams know the deadline. B, a more capable codemod to migrate the remaining services. C, funding for the tail: a squad, a sponsor, and deprecation dates. D, a second reference implementation, so teams could choose.

[think]

The answer is C: funding for the tail, with a squad, a sponsor, and deprecation dates.

The last services are the ones without active owners, or with special cases, and they do not respond to announcements or codemods, which only speed up services that were going to move anyway. A funded squad, a sponsor with the authority to decide deletions, and deprecation dates are what finish migrations.

## 4

Flaky tests cost your team about 14 engineer hours a week. Fixing the worst of them would take about 80 hours. How should you pitch it to your product manager?

A, as a six-week payback, then a third of an engineer back every week. B, by fixing them quietly inside feature estimates, to avoid a debate. C, as an engineering quality principle, since flakes erode trust in CI. D, by asking the engineering manager to mandate it over the roadmap.

[think]

The answer is A: as a six-week payback, then a third of an engineer back every week.

Framing technical work in the same currency as features lets the product manager compare honestly: 80 divided by 14 is about 5.7 weeks to break even, then roughly a third of an engineer returned every week. A principle gives the product manager nothing to weigh, and padding estimates hides the trade-off from the person who owns the priorities.

## 5

In the lesson's rewrite of the RFC for the director, what is the most important change from the RFC's opening?

A, every technical term is removed, including all of the numbers. B, the document is shortened by moving the risks into an appendix. C, the mechanism is explained in plainer words, so she can review it. D, the decision needed comes first, with explicit asks and a date.

[think]

The answer is D: the decision needed comes first, with explicit asks and a date.

The reader's job is to decide, so the decision and the asks lead, and each remaining number supports them. Four numbers stay in, the mechanism moves to the appendix rather than being explained again, and the main risk stays on the page with its mitigation, because surprises cost more trust than bad news.

## 6

Every new feature in your area needs coordinated changes by three teams, and planning is slow and contentious. What might a senior engineer suspect?

A, the teams need a shared channel and backlog, to cut hand-offs. B, the product manager writes tickets too vague to split cleanly. C, the service boundaries are misaligned with how the product changes. D, the teams need more planning meetings, to align roadmaps earlier.

[think]

The answer is C: the service boundaries are misaligned with how the product changes.

Conway's law links communication structure and system structure. Persistent coupling across teams for routine changes often means the boundaries are in the wrong place, which is an architecture problem as much as a process one. More meetings or shared channels treat the symptom, and leave the coupling in place.
