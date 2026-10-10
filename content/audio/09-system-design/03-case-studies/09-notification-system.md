---
lesson: notification-system
source: e31a93c680701205
fit: great
desk:
  - "The API, the data model and the architecture diagram"
  - "The duplicate trace, millisecond by millisecond, across three dedupe layers"
  - "The one-user's-day trace and the offline-phone trace"
  - "The semantics-per-category, failure-mode, trade-off and evolution tables"
  - "Exercise: dedupe and cap a notification stream"
---
## Introduction

Sending one push notification is an HTTP call to Apple or Google. Sending a billion a day is a different problem. A one-time login code must arrive in seconds, even while a 50 million recipient marketing campaign is draining. A user who unsubscribed thirty seconds ago must not get the next message. A phone that was offline for two hours must not wake up to "your driver is arriving". And all of it depends on third-party providers that rate-limit you, go down, and never tell you for certain whether a human saw the message.

The failures that matter here are rarely "the system was slow". They are four. Duplicates: the same receipt three times. Wrong audience: the test push that went to everyone. Wrong time: 3 in the morning. And silent loss: the password reset that never arrived. A strong design is organised around preventing those four, and it chooses a different delivery guarantee for each kind of message.

So: requirements and numbers, the architecture, then three deep dives. Dedupe, from the producer to the lock screen. Caps and quiet hours per user. And priority lanes against provider limits.

## Requirements and the numbers

Internal services send a notification to a user by category: security, transactional, social, marketing. The platform picks the channels, push, email, SMS or an in-app inbox, from the user's preferences and devices. Producers never choose channels. There are templates, opt-outs per category and channel, quiet hours in the user's time zone, frequency caps for marketing, rate limits for social, campaigns to segments of tens of millions, and aggregation of bursts, like "Ana and 36 others liked your photo".

The targets differ by category, and that is the point. Security codes reach the provider within 5 seconds at the 99th percentile, even during campaigns. Social within 30 seconds, unless deliberately digested. A campaign of 50 million within 30 minutes. No visible duplicates for receipts and marketing within 24 hours, but duplicates tolerated for security codes. And accepting requests is four nines: delivery may be delayed, never silently dropped. In the interview, ask which categories exist and what each tolerates, because that answer drives the delivery semantics.

Scale: a billion notifications a day, to 300 million users on 450 million devices, mostly push. That is about 11,600 a second, 29 thousand at the organic peak. One campaign of 50 million in 30 minutes adds 28 thousand a second on top. So the design peak is about 60 thousand a second, and half of it is one campaign.

Two more numbers. SMS is only 1 percent, but at about a cent each, that is roughly 100 thousand dollars a day. And the dedupe keys for a 24-hour window are about 120 gigabytes live.

The sentence that matters: the throughput is ordinary. The design is dominated by per-user correctness, meaning duplicates, caps, quiet hours and preferences bound late, and by isolating a login code from a campaign that is half the peak.

## The architecture

A producer calls the API with a user, a category, a template and a dedupe key. The dedupe key is built by the producer from the domain event, like "order 8812 shipped", and scoped to the recipient. So a producer retry, a replayed event, or the same event from two services all collapse into one notification. Each request also carries an expiry, so a message can die rather than arrive late and wrong.

The API authenticates the producer, claims the dedupe key, and appends to Kafka on the topic for its lane, keyed by user ID. It returns once the broker acknowledges. A planner owns each partition. It loads preferences, applies opt-outs, the suppression list, quiet hours and caps, digests bursts, renders the template, writes the inbox row, and emits one delivery job per channel and device. Messages that must wait go to a scheduler, which re-injects them when due. And the senders are thin: check expiry, take a provider token, call, record.

Campaigns start pending approval, with the audience size shown, because the most damaging bug in this system is the right message to the wrong 48 million people.

## Deep dive one: dedupe, from producer to lock screen

Every hop is at-least-once. Producers retry, Kafka redelivers after a consumer crash, senders retry provider timeouts. Duplicates enter at three places, and each needs its own fix.

First, producer retries and replays. The API claims the key with an atomic set-if-not-exists, with a 24 hour expiry. A later request with the same key gets the original notification ID back. Second, planner redelivery. The inbox write is an upsert, and each delivery job has a deterministic ID, the notification, the channel and the device, so a sender drops a job it already completed. Third, the provider boundary. A sender calls Apple's push service, Apple accepts, and the sender dies before recording it. No protocol fixes this, because the provider is not in your transaction. What you can do is set Apple's collapse identifier to the notification ID, so a resend replaces the first copy on the device instead of adding a second. On Android, the notification tag does the same in the drawer.

Now trace it. The order service's consumer reads "order 8812 shipped" and calls the API. The key is claimed, the request is appended, and the planner emits two jobs, push and email. Then two crashes. The order service's consumer is killed before it commits its Kafka offset. And the push sender gets a success from Apple, then dies before writing "sent". Thirty seconds later, a rebalance. Before I tell you: how many notifications does the user see?

[pause]

One. The new consumer re-reads the event and calls the API, but the key is taken, so it gets back the original ID and nothing is appended. The new push sender sees the job is not marked sent, and since it is a transactional message, resends it with the same collapse identifier, so the phone still shows one notification. And the email job was already marked sent, so it is dropped. Each layer caught a different duplicate.

The edge case is the dedupe store itself. Redis replicates asynchronously, so a failover can lose keys written in the last second, and a replay inside that second passes the first layer. Push is still saved by the job IDs and collapse identifiers. Email has no collapse identifier, which is why email senders record "sending" before the call. For payments-grade categories, claim keys with a conditional write in a replicated database instead.

The 24 hour window covers retries and restarts, which arrive within minutes. It does not cover a deliberate replay of a topic from three days ago. So reject requests whose event time is older than the window, and honour the expiry, so a replayed "order shipped" from Monday dies at the planner on Thursday.

Because the provider hop can never be exactly-once, you pick the semantics per category. A security code: not arriving is worse, so at-least-once, and a duplicate just carries the same code. A receipt: at-least-once with collapse. Marketing: a duplicate promotion is worse than a miss, so at-most-once. Do not retry an ambiguous send; record it as sent.

## Deep dive two: caps and quiet hours per user

Caps, social rate limits, digests and quiet hours are all read-modify-write on per-user state. With 30 planners handling the same user, two can both read "2 sent today", both send, and a cap of 3 becomes 4. Atomic Redis counters fix the race at a network call per check. The simpler fix is partitioning by user ID. Every request for a user lands in one partition, one planner owns it, and the state is local, single-threaded and race-free. It also keeps a user's messages in order inside the platform.

Trace one user's day. She is in New York, with quiet hours from 10 at night to 8 in the morning, a marketing cap of 3 in any rolling 24 hours, and two marketing pushes already sent yesterday.

At 10:30 at night her time, a campaign arrives. Quiet hours: it is deferred to 8 in the morning, and since its expiry is later than that, it goes to the scheduler. At 11:10, a new-login security alert arrives, and security ignores quiet hours and caps: sent in a second. At 8 in the morning, the scheduler re-injects the campaign. The planner re-reads her preferences, still subscribed, checks suppression and the cap, and sends it: 3 of 3. Five minutes later, a second campaign is capped and recorded. Then at 10, the first like on her photo is sent at once and opens a 10-minute digest window. 36 more likes are buffered, and when the window closes, one push: "Ana and 36 others liked your photo".

Three rules sit in that trace. Quiet hours are a delay, not a drop; the message is only dropped if its expiry comes first. "8 in the morning" is computed with the time-zone database from the zone the device reports, because profile zones are often years stale and a fixed offset is wrong for half the year wherever daylight saving applies. And preferences are bound late: checked at plan time and again when a scheduled message comes due, so an unsubscribe at 7:55 would have stopped the campaign.

## Deep dive three: lanes and provider pacing

Put the campaign and a login code in one FIFO queue and do the arithmetic. At 28 thousand a second, the campaign takes 30 minutes to drain, and a code behind it waits 30 minutes. A priority field does not help; the campaign is already ahead in the log. The fix is a bulkhead: separate topics, planners and senders for critical, normal and bulk lanes, and a reserved share of each provider's rate limit for the critical lane.

Campaigns are paced at their approved rate and split into waves by time zone. Each sender takes a token per call from a bucket shared by every instance using that provider credential, and treats a "too many requests" response as a signal to slow down, not to retry at once.

One more thing the lesson insists on: providers are not queues you can rely on. Apple stores only one notification per app for a device it cannot reach, usually the latest. Google stores at most 100 pending data messages per device, and past that discards all of them. So trace a phone offline for two hours. An "out for delivery" update is sent, then "delivered", then a login code that expires 5 minutes later, then a digest of likes. Each replaces the last in Apple's store, and the code expires. When the phone reconnects, it shows the digest only. "Your order was delivered" never appears as a push.

The design absorbs that, because the planner wrote all four to the inbox, and the app syncs its inbox when it opens and takes its unread count from there. Two rules follow. Every push states its full meaning, "delivered", not "status changed", because it may be the only one that survives. And an Android data-message path must collapse by category or stay under 100 pending messages, because the 101st wipes the rest.

## Failure modes

When a provider degrades, back off with full jitter, bounded by the message's expiry, behind a circuit breaker, with SMS fallback for security codes only. When it recovers, retries go through the same token bucket, so they do not trip its limit again. A poison message that crashes a planner at one offset gets parked on a dead-letter topic, so that partition's users keep receiving everything else. Stale device tokens are invalidated on the provider's "unregistered" answer and never retried. Email reputation is protected with a suppression list and separate subdomains and IP pools for transactional and marketing mail, so a bad campaign cannot bury password resets in spam. And for the wrong audience, the human failure: two-person approval above a size, a 1 percent canary, and a kill switch that stops injection and purges queued jobs.

## In the interview

A follow-up the lesson expects. A login code must arrive within 10 seconds. How do you make that true?

[pause]

Its own lane, end to end: topic, planners, senders, and reserved provider quota. No digest, no quiet hours, no scheduler. At-least-once with a quick retry, and an SMS fallback if push is not accepted within a couple of seconds. And an SLO measured from request to provider acceptance, alerted separately from the bulk lanes. The wrong answer is "give it high priority in the queue", which does not jump a backlog.

## Recap

Four things. Design against the four real failures: duplicate, wrong audience, wrong time, silent loss. Derive the dedupe key from the domain event, scoped to the recipient, and know the three layers it takes, and what a dedupe-store failover lets through. Choose delivery semantics per category, because the provider hop can never be exactly-once. And partition by user so caps, digests and ordering have one owner, and isolate critical traffic with separate lanes and reserved provider quota, because a shared FIFO makes a login code wait 30 minutes.

At your desk: the API and diagrams, the three traces, the failure and trade-off tables, and the dedupe-and-cap exercise.
