---
lesson: the-first-90-days
source: 1955923d8a2f790b
---
## 1

In your second week, you notice the deployment tooling is clumsy, and could be replaced by a tool you used before. What is the best move?

A, replace it on a branch, and present the finished result. B, log it, learn why it exists, and revisit it with context. C, drop it, since new hires should not suggest changes. D, propose replacing it this week, while your view is fresh.

[think]

The answer is B: log it, learn why it exists, and revisit it with context.

Early observations are valuable, but often lack history: many oddities come from past incidents or deliberate trade-offs. A fresh-eyes log turns them into credible proposals later. Proposing at once, or rebuilding in secret, is the classic new-senior trap, and dropping them wastes a newcomer's main advantage.

## 2

On your listening tour, the engineer who built the scheduler says it works fine, and the SRE says it is fragile. What does that disagreement most likely tell you?

A, it is noise, since only one person raised the issue. B, one of the two is wrong, so ask the manager to decide. C, the scheduler should be replaced as the top priority. D, there is history and context you do not have yet.

[think]

The answer is D: there is history and context you do not have yet.

Agreement across conversations marks shared pain. Disagreement marks history, ownership and context a newcomer lacks, which is where proposals land worst. The right response is to read the postmortem, and ask the builder how it came to be, before proposing anything.

## 3

Why does a short weekly note to your manager matter for your first review, beyond keeping them informed?

A, it replaces one-to-ones, which saves the manager's time. B, it is required for new hires during their probation period. C, it gives the manager specific examples to defend a rating. D, reviews are scored on how many notes were sent in the cycle.

[think]

The answer is C: it gives the manager specific examples to defend a rating.

Where ratings are calibrated across managers, your manager must argue for yours with specific examples, and in a first cycle those are your first deliveries. A weekly note makes them visible, and written down. Notes are not counted, they do not replace one-to-ones, and they are not a probation rule.

## 4

Your fresh-eyes log scores pain and effort from 1 to 3. The setup doc is pain 2, effort 1. A noisy alert is pain 3, effort 2. Slow CI is pain 3, effort 3. Which do you tackle first?

A, the setup doc, with the highest pain for its effort. B, slow CI, because hard problems show senior ability. C, slow CI, because it has the most pain of the three. D, the noisy alert, because it affects the on-call rota.

[think]

The answer is A: the setup doc, with the highest pain for its effort.

Ranking by pain divided by effort gives 2 for the setup doc, 1.5 for the alert, and 1 for CI. Early wins should remove felt pain quickly, without risking other people's work. A large, risky change in the first weeks spends trust you have not earned yet.

## 5

Of reliability, competence and intent, which do new senior hires most often over-invest in first, and what works better?

A, competence; lead with reliability and intent instead. B, none; all three build at the same rate regardless. C, reliability; show competence first, then keep promises. D, intent; stop building relationships, and show expertise.

[think]

The answer is A: competence; lead with reliability and intent instead.

New seniors often try to show expertise immediately, which reads as judgement without context. Small promises kept, and visible work for the team, come first, and they make later competence land as help rather than criticism.

## 6

A behavioural interviewer asks about your first 90 days in your last role. Which answer carries the most senior evidence?

A, you ramped up quickly, and were taking tickets within the first two weeks. B, who defined success, what you learned, a dated delivery, and a revised proposal. C, you identified what was wrong in week one, and proposed fixing all of it. D, you kept your head down, and learned the codebase before speaking up.

[think]

The answer is B: who defined success, what you learned, a dated delivery, and a revised proposal.

It shows a plan tied to someone else's definition of success, deliberate learning, reliability with a date, and a proposal that changed with feedback. Taking tickets shows no ownership, fixing everything in week one shows no context, and silence shows no influence.
