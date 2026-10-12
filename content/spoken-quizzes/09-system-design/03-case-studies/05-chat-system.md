---
lesson: chat-system
source: 5574fcae4572c89f
---
## 1

A chat message is acknowledged to the sender and stored, but direct delivery fails, because the registry points at a gateway that crashed a moment ago. What guarantees the recipient still gets it?

A, the sender's device resends it after it sees no delivery receipt. B, the push notification carries the message, so the device can display it. C, the gateway replays its in-memory queue for that device when it restarts. D, the inbox log points to the stored copy, so the device's next sync gets it.

[think]

The answer is D: the inbox log points to the stored copy, so the device's next sync gets it.

Durable storage plus the per-user inbox log is the correctness path, and live delivery is only an optimisation. The push notification only has to wake the app so it syncs, and Apple's and Google's push services are best-effort. Gateways hold no durable state, and relying on the sender to resend would break exactly-once display.

## 2

Two members of a group send messages at nearly the same time, from phones with different clock offsets. How does every device end up showing the same order?

A, every device sorts by the time each message arrived at that device. B, every device sorts by the sender's device timestamp in each message. C, each gateway assigns sequence numbers to the messages its own devices send. D, the conversation's owner assigns sequence numbers, and devices render by them.

[think]

The answer is D: the conversation's owner assigns sequence numbers, and devices render by them.

One sequencer per conversation gives a total order within the conversation, with no coordination across conversations. Device clocks disagree, and arrival order differs per device. Numbering per gateway fails, because two senders in one group are usually on different gateways, so their numbers conflict.

## 3

A conversation's owner pauses for 12 seconds, its lease expires, and a new owner assigns sequence number 1044. The old owner wakes, and assigns 1044 to a different message. What stops two different messages numbered 1044?

A, devices keep whichever 1044 arrives first, and drop the other one. B, the store rejects the write, because 1044 exists and the epoch is stale. C, the old owner rereads the lease before each write, so it never sends one. D, gossip tells the old owner about the takeover before its pause ends.

[think]

The answer is B: the store rejects the write, because 1044 exists and the epoch is stale.

A paused process cannot be trusted to check its lease in time, because the pause can fall between the check and the write. The store is the referee: a write conditional on the number being absent, carrying the new fencing epoch, rejects the deposed owner, whose client then retries with the same client message ID through the new owner. Devices keeping the first arrival would show different messages on different devices.

## 4

The sender's app times out and retries a send. Which mechanism prevents the recipient from seeing the message twice?

A, the gateway drops any message whose text matches the sender's last one. B, read receipts tell the sender's app that the first copy already arrived. C, TCP retransmission guarantees each frame reaches the gateway only once. D, the retry reuses the client message ID, so the owner returns the original sequence number.

[think]

The answer is D: the retry reuses the client message ID, so the owner returns the original sequence number.

Keys for idempotency turn at-least-once sends into one stored message: a duplicate client message ID gets the original acknowledgement back, and devices deduplicate redelivery by conversation and sequence number. TCP cannot help, because the retry is a new application-level send. Deduplicating on text would wrongly drop a user who really did send "ok" twice.

## 5

Presence moves from pushing to all contacts to subscribing on view: 100 million online users, 20 users on each screen, and screens changing about once a minute. Which cost is now the largest by operation count?

A, notifications, still about 33 million deliveries a second to all contacts. B, heartbeats, which double because every subscriber must ping them. C, memory, since two billion subscriptions cannot be held in RAM. D, subscription churn, about 33 million subscribes a second before batching.

[think]

The answer is D: subscription churn, about 33 million subscribes a second before batching.

Notifications fall to about 3.3 million a second, a tenth of pushing to all. But 100 million users times 20 new subscriptions a minute is about 33 million a second, affordable only because it is batched per screen, limited to apps in the foreground, and smoothed by hysteresis. Heartbeats do not depend on subscriptions, and two billion entries at 10 to 50 bytes is 20 to 100 gigabytes, spread across shards.

## 6

Messages are 200 bytes, and inbox pointers 40 bytes. Why does the inbox log still write more bytes a day than the message store?

A, receipts are stored as full messages, so they double the inbox traffic. B, pointers are never compacted, while messages are compressed on write. C, pointers are replicated five times, once per device, and messages three times. D, each message creates about 7.4 pointers, one per member, on average.

[think]

The answer is D: each message creates about 7.4 pointers, one per member, on average.

A message is stored once per conversation, but a pointer is appended for every member: with the lesson's mix of one-to-one chats and groups of 20, that averages 7.4 pointers per message, and 7.4 times 40 bytes beats 200. That is why the inbox is the biggest write load, and why it is trimmed after 30 days, with a summary resync behind it. Pointers are per user, not per device.
