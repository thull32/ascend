---
lesson: estimation-planning-and-prioritisation
source: 10232b6dcb37c5e8
---
## 1

In the lesson's estimate, the backend task has the largest mean, five and a half days, and the migration has the widest range, 2 to 12 days. You have two days for one spike. Which task should it target?

A, the migration: it holds over half the total variance. B, the rollout: its tail is the longest relative to its most likely value. C, the frontend: it comes last, so it absorbs every slip. D, the backend: it holds the largest share of the mean.

[think]

The answer is A: the migration, because it holds over half the total variance.

The migration contributes 2.78 of the 5.28 total variance, 53 percent. Narrowing it to 3, 4 and 6 days cuts the total standard deviation from 2.3 to 1.66 days, and the 90 percent point from 21.3 to 19.6 ideal days. The backend is longer, but better understood. A spike buys information, and information is worth most where the spread is.

## 2

A simulation gives each of three tasks a 30 percent chance of a 50 percent slowdown. In one variant, the three draws are independent. In the other, one shared draw, a messy legacy schema, applies to all three. How do the totals compare?

A, a lower mean and a narrower tail with the shared draw. B, a higher mean with the shared draw, and the same 95th percentile. C, the same mean, but the shared draw widens the 95th percentile tail. D, the same mean and the same 95th percentile, since each task matches.

[think]

The answer is C: the same mean, but the shared draw widens the tail.

Each task has the same chance of the same slowdown in both variants, so the means match, at 20.4 days in the lesson's run. The shared draw makes the slowdowns arrive together or not at all: the median falls from 20.1 to 19.5 days, while the 95th percentile rises from 26.4 to 28.7. Matching distributions per task do not imply a matching total; the dependence between tasks shapes the tail you commit to.

## 3

At the initial concept stage, you estimate 20 ideal days. Three weeks later, nobody has decided the scope. What range should you still quote?

A, about 10 to 40 days, as three weeks have passed. B, about 5 to 80 days, as nothing has been decided. C, about 16 to 24 days, as three-point ranges apply. D, about 18 to 22 days, as the team knows the code.

[think]

The answer is B: about 5 to 80 days, as nothing has been decided.

McConnell's cone of uncertainty runs from a quarter to four times the estimate at initial concept, and it narrows only when decisions remove sources of variability, such as approving the product definition. Elapsed time with no decisions leaves the range where it was. A narrow range at this stage prices only the unknowns someone has listed.

## 4

A single sign-on item, for an enterprise deal closing this quarter, ranks fifth of seven by RICE, and second by WSJF. What explains the gap?

A, RICE double-counts effort, while WSJF divides by size. B, WSJF inflates reach for any item linked to revenue. C, RICE has no term for a deadline, and WSJF scores one. D, RICE applies confidence, while WSJF assumes certainty.

[think]

The answer is C: RICE has no term for a deadline, and WSJF scores one.

RICE multiplies reach, impact and confidence, and none of those changes as a contract date approaches, so 800 users at high impact score 320. SAFe's WSJF adds time criticality, 13 here, to value and risk reduction, for a cost of delay of 23 over a job size of 2. Both divide by size, and WSJF has no reach term at all. The senior move goes further: treat a real contract date as a constraint before ranking anything.

## 5

PERT sets the standard deviation to the pessimistic estimate minus the optimistic one, divided by six. You discover your team's pessimistic values are exceeded about one time in ten, and its optimistic values are undercut about as often. What should you do to the standard deviation you present?

A, shrink it: divide the range by about 12 instead. B, widen it: divide the range by about 2.56 instead. C, ignore it: only the mean feeds the commit date. D, keep it: PERT already assumes that level of risk.

[think]

The answer is B: widen it, by dividing the range by about 2.56 instead.

Dividing by 6 treats the two values as about three standard deviations from the middle: near-certain bounds. If they are really the 10th and 90th percentiles, the range spans 2 times 1.28 standard deviations, so you divide by 2.56. For the lesson's table, the total standard deviation becomes 5.38 days rather than 2.3. The commitment is the mean plus a multiple of the standard deviation, so understating it pulls the date in directly.

## 6

A VP says the CEO has announced a launch in five weeks. Your 90 percent forecast for the full scope is twelve weeks. What is the strongest first response?

A, decline, since the forecast shows the date cannot be met. B, accept the date, ask what was promised, and size a slice. C, agree to the date, and trim the testing and rollout plan. D, commit to five weeks, and add two engineers to the team.

[think]

The answer is B: accept the date, ask what was promised, and size a slice.

A public date is a constraint, so the negotiation moves to scope: find what was actually promised, size a slice to the date at a stated confidence, and name what it displaces. Adding people late costs ramp-up, and grows the coordination pairs from 6 to 15 when four people become six, which is Brooks's point. A flat refusal leaves the VP no options, and cutting tests moves the cost into the next incident.
