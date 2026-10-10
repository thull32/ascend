---
lesson: designing-for-failure
source: 24dc29fd8e29c702
fit: great
desk:
  - "The failure taxonomy and the availability simulation script with its results table"
  - "The FMEA of the playback path, row by row"
  - "The DR tier table and the regional evacuation timeline"
  - "Exercise: an availability calculator"
---
## Introduction

A configuration change goes out to every region at once. It is valid, it passed review, and it sets a client timeout to zero. Within ninety seconds, every region is failing. The architecture had three regions, redundant instances, replicated databases and a four-nines target, and none of it helped. The failure was not a machine dying. It was a change that every copy shared.

Large outages mostly look like this: a deploy, a config push, an overload or a common dependency, hitting all the redundancy at once. Google's SRE book puts a number on it: roughly 70 percent of outages are due to changes in a live system.

Designing for failure means treating failure as an input to the design, alongside requirements and load. Four parts: the arithmetic of what redundancy actually buys, how to find the failures that redundancy misses, how far a failure may spread and what users see, and what happens when a whole region is gone.

## What do the copies share?

Start with a taxonomy. A crash is the least dangerous failure: clean and detectable, and redundancy handles it. The dangerous ones are different. A gray failure is a node that passes its health checks but is slow, or fails 5 percent of requests, so the load balancer keeps feeding it. Overload can sustain itself after the trigger is gone. A poison input crashes every replica that touches it, one after another. A bad change is the most common trigger of major incidents. And logical corruption, a bug writing wrong data, gets copied by replication to every replica.

Redundancy protects only against independent failures. Most of the dangerous classes are correlated. So the senior habit is to ask of every redundant pair: what do these two copies share?

## Availability arithmetic

Three rules. Serial components, where every one must work, multiply their availabilities. Five dependencies at three nines each come to about 99.5 percent: 3.6 hours of downtime a month instead of 43 minutes. Parallel components, where any one suffices, multiply their unavailabilities. Two at three nines fail together a millionth of the time, about 2.6 seconds a month. And a two-of-three quorum fails when any two members are down, so it is three times worse than a plain pair: about 8 seconds a month.

Now the two that set the real number. Put that redundant pair behind one shared database at 99.95 percent, and the whole thing is 99.95 percent. The pair's six nines vanish into the database's three and a half.

Second, common cause. Two regions, each 99.9 percent available, but a tenth of each region's downtime comes from a global config push that takes both down together. What is the pair's availability?

[pause]

About 99.99 percent, not six nines. Model the shared cause as its own serial component: it alone is down a ten-thousandth of the time. Both regions failing independently adds almost nothing on top. The common-mode term is more than a hundred times the independent one. That is why removing a shared dependency is worth more than adding a copy.

The lesson checks these with a simulation over 20 thousand simulated years, and it adds three things the formulas hide. Serial dependencies multiply pages, not only downtime: five dependencies meant about 44 outages a year to diagnose. Six nines cannot be verified by observation: the parallel pair had about one outage every 60 years. And the shared-dependency rows set the real number, so every design review should find the component playing the role of that 99.95 percent database.

Error budgets make targets concrete. Three nines is 43 minutes a month: a human can be paged, diagnose and roll back, about once. Four nines is 4.3 minutes: recovery must be automatic, because paging, acknowledging and deciding take longer than the whole budget. Five nines is 26 seconds. Put another way, at four nines, incidents that take 30 minutes to resolve can happen about once every seven months. Incidents that resolve in two minutes can happen twice a month.

## Walk every box and every arrow

A failure mode and effects analysis, an FMEA, is the tedious method that finds what redundancy misses. For every component and every arrow, ask what happens if it is down, slow, erroring, returning wrong data, or overloaded. Record the effect, how you would detect it, the mitigation and the blast radius. Classic FMEA scores severity, occurrence and detectability from one to ten and ranks by their product. The scores are judgements; the ranking is the point.

The lesson runs it over the start-playback path of a streaming service. Before I tell you: which three rows come out on top?

[pause]

First, a synchronous call from playback to recommendations that nobody meant to add, so playback fails when recommendations fail. Second, the config pipeline pushing a bad value everywhere. Third, the licence service's 99th percentile rising to two seconds while its health checks still pass. None is a machine dying. Critical paths accumulate hidden dependencies, and each lowers the core action to the reliability of the weakest thing it touches. The fix for the top row is found by reading traces, not by adding replicas.

## Blast radius and degradation

Blast radius is the fraction of users a single failure affects. Bulkheads give each dependency its own pool, so one slow dependency exhausts only its own compartment. Circuit breakers turn slow failure into fast failure.

Cells split the whole stack into independent copies, each serving a fixed subset of users. With 20 cells, a poison request, bad deploy or corrupted cache in one cell reaches 5 percent of users. The router that maps users to cells is the one thing they all share, so it must be the simplest component in the system.

Shuffle sharding limits what one bad tenant can do. Give each customer a random five workers out of 100. That is about 75 million possible subsets. A random neighbour shares all five with a crashing customer one time in 75 million, and shares at least one only 23 percent of the time; it retries on its other four workers and never notices.

Staged rollouts limit the blast radius of change: one cell, then one region, then the rest, with config shipped through the same pipeline as code. The opening config push would have broken one cell. And regional isolation means no synchronous cross-region calls on the request path; two three-nines regions in series are 99.8 percent.

Blast radius limits who is affected. Degradation decides what they see. Classify every feature as critical, degradable or optional, and build a ladder. For a home page: personalised rows; then the last computed rows from cache; then popular-in-your-region rows; then a minimal page from the client's local state, with playback still working. Protect the core action at the expense of everything else. Netflix did exactly this at its API gateway, classing each request as non-critical, degraded-experience or critical, and shedding the lowest priority first. Two rules make a ladder real: the fallback must be cheaper than the primary, or it collapses under the same load; and it must be exercised, because a fallback that has never run in production has a bug in it.

One more: retries decide whether a partial failure stays partial. Three layers each making three attempts send 27 requests to a failing database for every user request. Retry at one layer, with a budget and jittered backoff.

## Recovery and multi-region

Two numbers define recovery, set per dataset. The recovery point: how much data, in time, you can afford to lose. The recovery time: how long until service is back. The tiers run from backup and restore, hours to a day; through pilot light, tens of minutes; warm standby, minutes; to active-active, seconds to minutes. Restore time is arithmetic you should do aloud: 10 terabytes at 500 megabytes a second is 5.6 hours, before log replay and cache warm-up.

Replication protects against losing a region, not against a bug that writes bad data. The corruption replicates in milliseconds. Only point-in-time recovery, a delayed replica, or an immutable log gets you back. Ask in every review: if a bug corrupted this table at 2 p.m., how do we get back to 1:59?

For multi-region, the data layer decides the design. With asynchronous replication, lost writes on failover are the write rate times the lag. At 20 thousand writes a second and a typical 200 milliseconds of lag, promoting a replica loses about 4 thousand acknowledged writes. The dangerous case is a degrading link: if it had been failing for 60 seconds before the primary died, lag had grown to a minute, and 1.2 million writes are gone. So monitor lag as a recovery-point signal, and act before the failure.

Active-active brings conflicts. Two devices change the subtitle language within the lag of each other; last-writer-wins keeps the later one, and the earlier write vanishes with no error. For a setting, tolerable. For a downloads-remaining counter decremented in both regions, one decrement is silently lost. Counters need a CRDT that merges per-region counts, and money needs a home region.

And evacuation needs headroom. With N regions, each must absorb a failed region's share, so total capacity is N over N minus one times peak: double with two regions, one and a half with three. Each region runs at no more than 50, 67 or 75 percent. Survivors also get users whose data is not in their caches, so warm them; and scale the receiving regions first, shift traffic second. Netflix described a failover that used to take about 50 minutes; keeping capacity ready brought it under 10. An evacuation you have never run is a hypothesis, so drill it, in business hours, with the team watching.

## In the interview

Here is one the lesson expects: would you run payments active-active across regions?

[pause]

Not with asynchronous multi-leader writes, because two regions can each accept a charge against the same balance, and last-writer-wins drops one. Each account gets a home region that owns its writes, replicated synchronously to a second region, or through consensus if no loss is acceptable, paying cross-region latency on the small fraction of traffic that is payments. The wrong answer is "yes, with conflict resolution", with no answer to which of two charges wins.

And: how would you make a four-nines target credible? Show that no single failure needs a human: automated detection within a minute, automated rollback, traffic failover without promotion decisions, few serial dependencies each with a fallback, no shared dependency below four nines. Then show the budget, 4.3 minutes a month, and ask whether the product needs it. "Add more replicas" is the wrong answer, because it does nothing for the common-cause term that dominates.

## Recap

Five things to remember. Of every redundant pair, ask what the copies share, and model the shared cause as its own serial term: it turns six nines into four. Serial dependencies multiply both downtime and pages, and four nines means automated recovery. Walk every box and arrow; the top risks are hidden dependencies, config pushes and gray failures. Shrink blast radius with cells, shuffle sharding and staged rollouts, and degrade to fallbacks that are cheaper and exercised. And lost writes are rate times lag, replication is not a backup, and active-active needs a conflict story per data type.

At your desk: the taxonomy and the availability simulation, the playback FMEA, the recovery tiers and evacuation timeline, and the availability calculator exercise.
