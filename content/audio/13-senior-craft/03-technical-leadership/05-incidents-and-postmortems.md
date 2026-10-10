---
lesson: incidents-and-postmortems
source: 19462b5b5ecd9d25
fit: great
desk:
  - "The severity matrix and the response each severity requires"
  - "The mitigation table: time to effect, risk and evidence for each option"
  - "The incident timeline, minute by minute, and the intervals table"
  - "The postmortem in full: summary, contributing factors, action items at day 30"
  - "Exercise: classify an incident by severity and response"
---
## Introduction

At 14:07 every API endpoint slows to several seconds. By 14:15, eleven engineers are in the incident channel. Four are staring at the same database dashboard. Two are restarting different services. Nobody has told customer support. Someone proposes a database failover while someone else is halfway through rolling back an unrelated service. The actual cause, a deploy from 13:40, sits in the deploy log the whole time.

The outage lasts 70 minutes. With coordination, it would have lasted 25.

Incidents are coordination problems before they are technical problems. The skills that shorten them are the ones a senior engineer is expected to bring: declaring early, separating command from debugging, mitigating before understanding, communicating on a clock, and learning afterwards without blaming anyone. We will run one incident minute by minute, write its postmortem, follow the action items to done, and finish with how paging and on-call work underneath.

## Severity and roles

A shared severity scale decides who gets woken up and how much process applies. Severity comes from two questions: how important is the broken function, and how many users does it hit? Data loss, corruption or a security breach is sev one at any size. A core flow, like sign-in or checkout, is sev one above a quarter of users, sev two from 5 to 25 percent, sev three below that. Anything with no user impact yet, a disk at 80 percent, a near miss, is sev four.

Sev one means a page right away, an incident commander, leadership and support told within 15 minutes, updates every 15 minutes, and a postmortem reviewed by leadership. Sev two pages on-call, gets a commander, and updates every 30 minutes.

The thresholds are illustrative; every organisation tunes its own. Two rules make any version work. First, declare early and downgrade freely. A false alarm costs a few minutes of process. A late declaration costs uncoordinated responders and silent stakeholders. Google's SRE book gives a simple trigger: declare if a second team is needed, if customers can see the problem, or if it is still unsolved after an hour of focused analysis. Second, severity follows user impact, not technical interest. A fascinating kernel bug that nobody notices is a sev four.

The roles come from the Incident Command System, developed by Southern California fire agencies after the disastrous 1970 fire season. Four of them are the common core. The incident commander owns coordination and decisions: priorities, assignments, which mitigation to try. The commander does not debug. The moment the commander starts reading logs, nobody is coordinating. The operations lead directs the technical investigation. The communications lead posts updates on a fixed cadence and shields responders from "any update?" messages. And the scribe keeps a timestamped log, which becomes the postmortem timeline.

In a small incident one person holds several roles, and the first one to hand off is commander. Hand-offs are said out loud: "Maya, you are commander as of 14:40, and the current state is this."

## Mitigate before you understand

The goal during an incident is to stop user harm, not to find the root cause. The most useful question is "what changed?" Deploys, config, flags, traffic, dependencies. Google's SRE book reports that roughly 70 percent of outages are due to changes in a live system.

So the mitigations, roughly from safest to riskiest. Turning off a feature flag takes seconds and is the lowest risk. Rolling back a deploy takes minutes and is low risk, unless the deploy ran an irreversible migration. Failing over takes minutes too, at medium risk, because failovers fail too. Adding capacity is low risk but can hide the cause. And fixing forward is the riskiest: new code, written under pressure, taking tens of minutes or more.

The rule that goes with all of them: one change at a time, announced. Two simultaneous mitigations make it impossible to know which one worked, and they can interact badly.

Canaries limit how big an incident can get. Progressive delivery turns many would-be incidents into a failed canary and an automatic rollback. But only if the canary sees representative traffic. Hold onto that, because it is exactly what failed next.

## One incident, minute by minute

Here is the incident from the opening, built on this app's own login code, imagined at a hundred times its scale: four API instances behind a load balancer. The app hashes passwords with Argon2id, tens of milliseconds of CPU per call, on Tokio's blocking pool, behind a semaphore with one permit per CPU.

At 13:40, a refactor moves the hash off the blocking pool and onto the async worker threads. Tokio starts one worker per core by default, so the semaphore that was there to bound memory now lets every single worker be busy hashing at once. The canary saw 3 logins in its 10-minute window, and passed.

At 14:05, a credential-stuffing attack starts from about 12 thousand IP addresses, each staying under the per-IP limit. Login attempts go from about 2 a second to about 300. By 14:07, the 99th percentile on every endpoint climbs from 90 milliseconds to two and a half seconds, because ordinary lesson reads are waiting behind hashing on the same threads. At 14:09 readiness probes time out on two instances, and the load balancer removes them. Now two instances take all the traffic.

At 14:12 a burn-rate alert pages Dev, the primary on-call. Dev opens the database dashboards. They look normal. At 14:17 he notices API CPU at 100 percent and posts "something weird with the API". At 14:19, Maya takes command: impact, severity, sev one, Dev as ops lead, Sam on comms, Lee as scribe.

Then it moves fast. A profile shows Argon2 frames on the async worker threads. Maya asks what changed in the last two hours. Lee answers: the auth refactor at 13:40, and login attempts up 150 times since 14:05. At 14:24 Maya decides: roll back now, about five minutes and known-good, with an edge block as a second track, and nobody else deploys to the API. By 14:33 the 99th percentile is 140 milliseconds and falling. The edge rule lands at 14:52. At 15:20, after thirty minutes green, she closes it.

Why did it get this bad? Each instance was taking about 75 attempts a second at about 40 milliseconds of CPU per hash: three cores' worth of hashing every second, on a four-core machine. On the blocking pool, that is heavy but survivable. On the workers, it leaves roughly one core for everything else. And the load balancer, by removing busy instances, concentrated the same attack onto half the capacity.

Now the intervals. Five minutes to detect. Twelve minutes to declare. Twenty-six to mitigate. The biggest lever was the seven minutes between the page and the declaration, five of them spent investigating alone.

Error budget turns that into a number. A 99.9 percent monthly objective allows about 43 minutes of full burn. About 45 percent of requests missed the objective for 26 minutes, which is about 12 minutes of budget. Over a quarter of the month, in one afternoon. That number, not the drama of the call, sets how much the action items deserve.

## The blameless postmortem

A postmortem is a written analysis whose goal is learning, not judgement. It is blameless for a practical reason: the people closest to a failure know the most about it, and if describing their actions honestly gets them punished, they stop describing them honestly. Blameless does not mean accountability-free. People are accountable for finishing the action items.

The five whys for this incident. Requests were slow because the workers were busy. They were busy running Argon2 hashes. The hashes were on the workers because the refactor removed the call that sent them to the blocking pool. Review missed it because the diff looked like a tidy-up and nothing in the checklist asks about blocking work on async threads. And nothing tests or lints for it.

That chain is true, and it ends in a useful fix: a test. But it misses most of what made this an outage rather than a blip, because five whys follows one causal path. Ask a different question and you get a different branch.

[pause]

Why was it not caught before full rollout? The canary saw three logins and compared totals, not the changed path. Why did an existing defence not help? The semaphore's size equalled the worker count. Why was it so large? Readiness probes ran on the saturated runtime, so the load balancer removed busy instances. Why did it take 12 minutes to declare? There was no runtime-saturation dashboard, so the first responder spent his first minutes on the database. Those are the contributing factors.

And one more line every postmortem should have: where we got lucky. This happened in working hours, with the refactor's author online. Luck is an unfixed contributing factor.

## Action items and on-call

Good action items are specific, owned, dated, prioritised, and tracked in the normal backlog, not in the postmortem document, where they go to die. "Be more careful with async code" is not an action item. Neither is "add more monitoring". Neither has a done state. Compare: restore the blocking pool and add a test that fails if hashing runs on an async worker, owner Dev, priority one, seven days.

Cover detection and mitigation as well as prevention. You will not prevent every failure, but you can always shorten the next one. So the list also had probes served from a path independent of request saturation, canaries that fail if a changed path saw no traffic, and an alert on worker saturation.

Follow-through is a mechanism, not a virtue. A weekly operations review walks the open priority-one items from every postmortem. Any item past its date needs an explanation from its owner in that meeting. A re-scoped item links to its replacement so it does not silently vanish. An organisation that writes excellent postmortems and closes 30 percent of the actions is not learning.

Underneath it all is paging. Page on symptoms users feel, when a human must act now; everything else becomes a ticket. Google's SRE Workbook recommends burn-rate alerts: page when the error budget burns at 14.4 times the sustainable rate over an hour, which is 2 percent of a 30-day budget gone, or 6 times over six hours. The 14:12 page was a fast-burn alert.

And rotations have numbers too. An incident with its follow-up takes about six hours on average, so a 12-hour shift absorbs about two. On-call should take no more than a quarter of an SRE's time. Beyond that load, responders stop investigating and start silencing. A senior engineer treats a noisy alert as a bug to fix, not weather to endure.

## In the interview

A question the lesson expects: how do you keep a postmortem blameless when one person's change caused it?

[pause]

Treat the error as the start of the analysis: what made it easy to make, hard to detect, and expensive. Name conditions and actions, not people. Accountability means owning the action items. The wrong answers are "we leave names out", which is anonymised blame, and "we held them accountable", which ends honest reporting.

Another: your team gets 30 pages a week. What do you do? Sort a month of pages by source and by whether anyone acted. Delete or demote the non-actionable ones to tickets. Replace cause alerts, like CPU above 80 percent, with symptom and burn-rate alerts. Fix the top sources, and report pages per shift against a target. The wrong answer is "add people to the rotation", which spreads the noise without reducing it.

And for "tell me about the worst incident you were part of": your role, the minute you knew it was serious, what you decided and why, how you communicated, the contributing factors, and one action item you drove to done. Not a debugging war story that ends in "the root cause was a bug in someone's code".

## Recap

Four things to remember. Incidents are coordination problems first: declare early, downgrade freely, and keep the commander out of the logs. Ask "what changed?" and mitigate before you understand, one announced change at a time. Five whys follows one path; contributing factors answer why it was not caught, why it was so large and why it was late, and luck is one of them. And action items live in the backlog, with an owner, a date and a weekly review, or they do not happen.

At your desk: the severity matrix, the mitigation table, the minute-by-minute timeline, the full postmortem with its action items, and the classification exercise.
