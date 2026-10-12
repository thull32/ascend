---
lesson: incidents-and-postmortems
source: 29142ddfb3397caf
---
## 1

Twelve minutes into an incident, the engineer acting as incident commander starts reading application logs to find the bug. What is the problem?

A, nobody is coordinating, so work and communication stall. B, the incident commander should escalate to a manager before any diagnosis. C, debugging should wait until the incident is fully over. D, logs lag too far behind; the incident commander should read metrics.

[think]

The answer is A: nobody is coordinating, so work and communication stall.

The incident commander's job is coordination and decisions. When they switch to debugging, responders duplicate work, updates stop, and nobody approves mitigations. Debugging during the incident is right; the commander doing it is the problem, so hand the command over first.

## 2

In the lesson's worked incident, a semaphore allowed one Argon2 hash per CPU. Why did it not protect the service once hashing moved onto the async workers?

A, the attack came from many IP addresses, so the permits were shared out. B, Tokio runs one worker per core, so every one of them could be hashing. C, the semaphore was released too early, before the hash had finished. D, semaphores only limit memory use, never CPU time on any thread.

[think]

The answer is B: Tokio runs one worker per core, so every one of them could be hashing.

One permit per CPU equals the default number of async worker threads, so a bound designed for memory allowed all the workers to be busy hashing at once, starving every other request. On the blocking pool, the same bound leaves the workers free. The permits are held for the whole hash, and are not tied to IP addresses.

## 3

A 99.9 percent monthly latency objective allows about 43 minutes of error budget. An incident makes 45 percent of requests miss the objective for 26 minutes. Roughly how much budget does it consume?

A, about 43 minutes, all of it. B, about 26 minutes, 60 percent of it. C, about 12 minutes, 27 percent of it. D, about 5 minutes, 12 percent of it.

[think]

The answer is C: about 12 minutes, 27 percent of it.

26 minutes at 45 percent of requests is about 11.7 minutes of full-outage equivalent, roughly 27 percent of the monthly budget. Weighting by the fraction of requests affected is what makes partial degradations comparable with full outages.

## 4

Why does the postmortem list contributing factors, instead of stopping at the five whys chain?

A, five whys is not accepted as evidence in a blameless postmortem. B, contributing factors are needed only when several teams were involved. C, five whys follows one path, and misses why the incident was so large and so late. D, the chain ended in a person, so it had to be replaced entirely.

[think]

The answer is C: five whys follows one path, and misses why the incident was so large and so late.

The chain correctly leads to a missing test, but it cannot explain the canary that saw no logins, the probes that removed healthy instances, or the seven minutes from page to declaration. Asking why it was not caught, and why it was so large, opens those branches. The chain is still useful; it is just not sufficient.

## 5

Which postmortem action item is most likely to reduce future risk?

A, a test that fails if hashing runs on the async workers, owned by a developer, priority 1, due in 7 days. B, hold a meeting about code quality, owned by the tech lead, priority 1, next sprint. C, be more careful when refactoring async code, owned by the whole team, priority 2, ongoing. D, add more monitoring to the auth service, owned by the SRE team, priority 2, this quarter.

[think]

The answer is A: a test that fails if hashing runs on the async workers.

Good action items are specific, verifiable, owned, prioritised and dated. An owner and a date do not rescue an exhortation, a vague monitoring goal or a meeting, because none of them has a done state. The test prevents this exact failure.

## 6

Your burn-rate alert pages when a 30 day error budget burns at 14.4 times the sustainable rate over an hour. What fraction of the monthly budget has that hour consumed?

A, about 50 percent. B, about 2 percent. C, about 14 percent. D, about 0.1 percent.

[think]

The answer is B: about 2 percent.

A sustainable rate spends the budget evenly over 720 hours, so one hour spends one 720th of it. At 14.4 times that rate, one hour spends 14.4 over 720, which is 2 percent. That is fast enough to wake someone, since the whole budget would be gone in about two days.
