---
lesson: ticket-booking
source: b838fae0ca644053
fit: great
desk:
  - "The oversell race and the conditional update, as two timelines"
  - "The conditional UPDATE and the best-available SKIP LOCKED query"
  - "The measured throughput table and the hold-through-payment trace"
  - "Exercise: holds with lazy expiry and payment"
---
## Introduction

A stadium tour goes on sale at ten o'clock. There are 50 thousand seats and two million people with the page open, hitting refresh at one second to ten. The system can fail in two opposite ways. It can sell seat 14C in section 112 to two people: a refund, a furious customer and a news story. Or it can protect correctness so conservatively, or collapse so completely, that it sells nothing for twenty minutes: a different news story.

The data is tiny and the contention is extreme. The whole inventory is 50 thousand rows, a few megabytes. The load is concentrated in time, the first five minutes, and on the same keys, the best seats. And 99 percent of the people generating it will leave with nothing. Treat this as e-commerce checkout at larger scale and you miss the point. The job is to decide who gets to try, and then to make each try atomic.

Three deep dives after the numbers: the oversell race and the one statement that fixes it, a hold traced through expiry and payment, and the waiting room.

## Requirements and the numbers

Browse a seat map, hold up to 8 seats for 10 minutes during checkout, pay, get tickets, and for high-demand sales, wait in a virtual waiting room that admits people in a fair order. Never sell a seat twice, and never charge for seats not issued. Holds answer within half a second at the 99th percentile for admitted users. The seat map may be up to 2 seconds stale, because the hold is the truth and the map is only a hint.

Now the arithmetic. 50 thousand seats at about 2.5 seats per order is 20 thousand orders. Against two million fans, that is 1 percent who can succeed. Unqueued, two million fans each trying three times in the first minute is 100 thousand hold attempts a second against 50 thousand rows, 99 percent of them doomed.

Now admit people instead. Let in 125 users a second, each taking about four minutes to check out, and Little's law gives 30 thousand active users, enough to sell the 20 thousand orders allowing for abandonment. At about 10 requests each over those four minutes, the booking tier sees 1,250 requests a second. Four to six stateless instances. One Postgres primary, measured at 8 to 9 thousand durable holds a second, runs at about 15 percent.

Here is the number to remember: the waiting room turns a 100 thousand a second write problem into 1,250 a second. This is a coordination and admission problem, not a data-volume problem. The inventory database never needs sharding within an event; it needs protecting.

## The architecture in words

Fans hit a CDN for pages, the seat map and queue status. A waiting room hands out queue tokens and positions; an admission controller advances the "now serving" number. For a flagged event, every booking request must carry a signed access token that only the waiting room issues, verified locally by the booking service, so unadmitted traffic never reaches the inventory.

The booking service talks to Postgres with a synchronous standby, so no confirmed order is lost on failover. Availability flows out of the database by change data capture into a bitmap, one bit per seat, 6.25 kilobytes per event, published to the CDN every second. Confirmed orders write an outbox row in the same transaction, and a worker issues tickets and email from it.

Holds are all-or-nothing, because four friends want four adjacent seats, not three. Both mutating calls take an idempotency key, because people click Buy three times when the spinner spins. And checkout is asynchronous: it returns "pending" and the client polls, because the payment provider's latency is outside your control.

## The oversell race, and one statement

The naive code reads the seat's status, sees it is available, does some work, then writes the hold. The lesson reproduced it on Postgres. Session A reads seat 14: available. A hundred milliseconds later, session B reads seat 14: available. A writes its hold and commits. B writes its hold and commits. Two holds recorded, both users told the seat is theirs, and nothing errored. The oversell is found at the gate.

The fix is one conditional update. Set the seat to held, with your hold ID and an expiry ten minutes from the database's clock, where the seat is available, or held with an expiry already in the past. If fewer rows come back than you asked for, roll back; the hold is all-or-nothing.

[pause]

Now replay the race. A's update claims the seat and holds the row lock. B's identical update blocks on that lock. When A commits, Postgres wakes B, re-checks B's condition against the newly committed row, finds it held, and updates zero rows. There is no window between check and write, because they are one statement. And because expiry uses the database's clock, application clocks never matter.

Two refinements. Lock order: when two multi-seat holds take seats in opposite orders, they deadlock, and Postgres waits a second before aborting one. During an on-sale, that is a one-second stall and a failed hold for every such pair. Lock seats in sorted order, and the cycle cannot form. And best available: if every request ranks the same four seats first, they all queue on the same locks. Skip locked rows instead, and take the next-best unlocked seats. Measured with 32 connections, plain locking managed 590 claims a second at 54 milliseconds; skipping locked rows managed 11 thousand at under 3 milliseconds.

Then a surprising measurement. Holds spread over all 50 thousand seats ran at 8 to 9 thousand a second. Holds aimed at the best 2 thousand seats ran at 66,600 a second. Before I tell you why: how can contention make it faster?

[pause]

Because 97 percent of those attempts matched no rows, and an update that changes nothing writes nothing to the write-ahead log, so it commits without waiting for a flush. The doomed attempts are the cheap ones. What is expensive is a single hot row. General admission as one counter row managed 377 holds a second, every hold serialised on one lock held through the log flush. Split it into 100 bucket rows and pick one at random: 6,610 a second, and each bucket still enforces its own capacity.

And the alternatives. A Redis lock per seat can have two holders after a pause or failover, so it is safe only with fencing, at which point the database check is doing the work. Inventory in Redis is fast, but asynchronous replication can lose acknowledged holds on failover; use it as a pre-filter, never the record.

## A hold, through expiry and payment

Expiry is lazy. The clause that treats an expired hold as claimable means the next person who asks gets the seat, whether or not a sweeper has run. The sweeper only keeps the seat map accurate. If it stalls, seats look held a little longer and nothing oversells.

How long should a hold be? Illustratively, with a median checkout of 3 minutes, a 5-minute hold times out about 15 percent of genuine buyers mid-payment; 10 minutes, under 1 percent. Meanwhile abandoned holds, maybe 30 percent of them, lock up 15 thousand seats until they expire, which is the second wave at minute ten. Measure the real checkout times from the last on-sale and set the hold near the 99th percentile, not a round number.

Now the dangerous interleaving. A user's hold expires at 10:10. They click Pay at two seconds to, and the payment provider takes three seconds. Without care, someone claims the seats at 10:10 and one second, and the first user pays for seats that belong to another fan.

The fix has three parts. Checkout first runs its own conditional update: move the seats to "payment pending" only if the hold is still live, and extend the deadline. Payment pending is a state the lazy-expiry clause does not match, so nobody can claim those seats. Then authorise the card, not capture: funds reserved, none taken, with the order ID as the idempotency key. When approval comes back, one transaction marks the seats sold, inserts tickets and writes the outbox row. Only then capture.

Had the user clicked half a second after expiry, checkout's update would match zero rows and they would be told before any card call. If confirmation fails after authorisation, void it: "payment not taken", not a refund days later. And a provider timeout is an unknown outcome: query the provider by the idempotency key, and let a reconciliation job resolve anything stuck in pending.

## The waiting room

Fairness first. Users who arrive before the on-sale get a random position when it opens; later arrivals join in order. That removes the advantage of refreshing at the last tenth of a second, or of bots with faster connections. Tokens are signed and bound to an account. The arithmetic: a scalper with a thousand verified accounts among 1.6 million early arrivals, and a first wave of 30 thousand. In arrival order, the bots could take the first thousand places and 4 thousand tickets. With random positions they expect about 19 admissions and 75 tickets.

Waiting is cheap. A queued client polls every 15 to 30 seconds with jitter, and the answer comes from the position inside its signed token plus one cached "now serving" integer. Two million waiting users cost a small stateless fleet and a CDN, not a database.

The admission controller is a token bucket whose refill rate follows feedback: booking-tier latency and errors, and remaining inventory. It admits 125 a second while hold latency stays under half a second, pauses when every seat is held or in checkout, admits more as holds expire, and tells every queued user "sold out" the moment it is true.

And if the waiting room fails, it fails closed: admit nobody and show a holding page. Failing open sends two million users at a database sized for thirty thousand.

## In the interview

Why not keep the inventory in Redis?

[pause]

Speed is not the constraint once the waiting room exists: 1,250 requests a second against a primary measured at 8 to 9 thousand holds a second. And Redis's asynchronous replication can lose acknowledged holds on failover, which here means two fans with one seat. Use it for the seat map and as a pre-filter. The wrong answer is "Lua scripts are atomic, so it is safe", which ignores failover.

And: how do you know it will work at ten on Saturday? Rehearse it. Replay two million synthetic users against a production-sized staging stack, check that admission backs off when hold latency rises, fail the primary over mid-test, and afterwards compare seats sold with tickets issued and payments captured. "We autoscale" is the wrong answer, because the constraint is a single inventory primary that autoscaling does not touch.

## Recap

Five things to remember. Only about 1 percent of fans can win, so size admission from inventory, not from peak traffic. Make the check and the write one conditional update, and back it with a unique constraint on tickets. Failed claims are cheap and hot single rows are not, so split general admission counters into buckets. Make expiry lazy, and protect an in-flight payment with a state the claim cannot match; authorise, confirm, then capture. And fail the waiting room closed.

At your desk: the two race timelines, the conditional update and best-available queries, the measured throughput table with the payment trace, and the holds exercise.
