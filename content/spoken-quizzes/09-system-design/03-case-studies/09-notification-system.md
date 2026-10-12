---
lesson: notification-system
source: bac91aabc90a5fb0
---
## 1

An order service's consumer crashes after the notification API accepted its request, but before committing its Kafka offset. On restart, it sends the same request. What stops a second notification?

A, the provider, which refuses a second push with the same payload. B, Kafka's idempotent producer, which removes the duplicate request. C, the planner, which drops a request it has seen within the last hour. D, the recipient-scoped dedupe key, claimed with an atomic set-if-not-exists.

[think]

The answer is D: the recipient-scoped dedupe key, claimed with an atomic set-if-not-exists.

The replay is a new HTTP request, so broker-level idempotence does not apply. The dedupe key is derived from the domain event and claimed atomically, so the second request finds it, and gets the original notification ID back without enqueuing anything. Providers do not compare payloads.

## 2

A sender calls the push provider, the provider accepts, and the sender crashes before recording success. What is the right behaviour on redelivery, for a marketing message?

A, ask the provider whether the push was displayed, then decide. B, fail over to SMS, because the push outcome cannot be known. C, do not retry, since a duplicate promotion is worse than none. D, retry, since at-least-once delivery is always the safe default.

[think]

The answer is C: do not retry, since a duplicate promotion is worse than none.

The provider hop cannot be exactly-once, so you choose the failure you prefer for each category. For marketing, a duplicate is worse than a miss, so record the ambiguous send as sent. Providers cannot say whether a message was displayed, and SMS fallback for marketing costs real money.

## 3

Security codes and a campaign to 50 million recipients share one queue, and codes take 30 minutes to arrive. What fixes this?

A, add a priority field, so codes are picked ahead of campaign messages. B, give critical messages their own topic, senders, and provider quota. C, add partitions to the shared topic, so that the backlog drains faster. D, send codes synchronously from the producer, bypassing the platform.

[think]

The answer is B: give critical messages their own topic, senders, and provider quota.

Isolation needs separate lanes, and a guaranteed share of the provider's rate limit. A priority field does not let a message jump a backlog already ahead of it in a log, and more partitions spread the same backlog. Bypassing the platform loses preferences, auditing and fallback.

## 4

Thirty planners share user traffic without keying, and a marketing cap of 3 a day is sometimes exceeded. What is the most direct structural fix?

A, check the cap again in the sender, right before calling the provider. B, partition requests by user ID, so one planner owns each user's count. C, cache each user's count in the planner for a minute, to cut reads. D, lower the cap to 2, so overshoots still stay within the product limit.

[think]

The answer is B: partition requests by user ID, so one planner owns each user's count.

Two planners can both read 2 sent, both send, and make it 4: a read-modify-write race. Keying by user makes one planner the single owner of that state, so the check and the increment happen in one thread. A cache widens the race, and a second check in the sender has the same race.

## 5

A campaign message arrives at 10:30 at night in the user's time zone, inside quiet hours that end at 8 in the morning, and it expires at 6 in the evening, local time, the next day. What should happen?

A, schedule it for 8 in the morning, local time, and re-check preferences then. B, send it at 8 in the morning UTC, since the scheduler works in UTC. C, drop it, since it arrived inside the user's quiet hours. D, send it now, since campaigns are paced and already approved.

[think]

The answer is A: schedule it for 8 in the morning, local time, and re-check preferences then.

Quiet hours are a delay, not a drop, as long as the expiry is later than the next allowed time. The planner hands the message to the scheduler for 8 in the morning in the device's time zone, and re-reads preferences when it comes due, so an unsubscribe overnight still wins. UTC is the wrong clock for a local rule.

## 6

A marketing campaign draws many bounces and spam complaints, and password-reset emails start landing in spam. What design choice would have prevented this?

A, rate-limiting the campaign, so bounces arrive more slowly across the day. B, retrying bounced emails with backoff, so they are eventually delivered. C, separate subdomains and IP pools for marketing and transactional mail. D, using a larger email provider, whose IP reputation absorbs the damage.

[think]

The answer is C: separate subdomains and IP pools for marketing and transactional mail.

Mailbox providers judge reputation per sending domain and IP address, so sharing them lets a bad campaign bury critical mail, and bounces and complaints should also feed the suppression list. Retrying bounces worsens reputation, pacing does not change the bounce rate, and a different provider does not change how mailboxes judge your domain.
