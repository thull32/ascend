---
lesson: chat-system
source: fb1d279a91e3ed50
fit: great
desk:
  - "The estimates and tier-sizing tables"
  - "The send-to-double-tick, owner failover and sync traces"
  - "The membership-change sequence and the presence and typing arithmetic"
  - "The measured TLS handshake costs and the reconnect-storm scenarios"
  - "Exercise: render chat frames in order with dedupe and gap detection"
---
## Introduction

A chat system looks like a message queue with a user interface. Unlike almost every other system in this module, though, it keeps a long-lived, stateful connection open to every online device, about 100 million at peak. And it makes promises users notice the moment they break: the same order on every device, nothing lost once the single tick appears, and a phone that was off for a week catching up the moment it comes online.

The senior version is not about WebSockets, which every candidate mentions. It is about three harder questions. How does a message find the gateway holding the recipient's connection? What makes delivery correct when that path fails, as it will many times a second? And what do groups and presence do to the arithmetic? Those are the deep dives, plus a fourth: the reconnect storm.

## Requirements and the numbers

The requirements. One-to-one and group chats, groups up to a thousand members, with broadcast channels of 100 thousand or more handled separately. Delivery states: sent, meaning the server has it; delivered, meaning a recipient device has it; and read. Up to five devices per user, each with the full history in the same order. Push notifications for offline devices, presence, and typing indicators.

The non-functional side. Send to delivery under 100 milliseconds at the median and 500 at the 99th percentile, with both people online. Once the sender sees "sent", the message is never lost. Every device shows the same order within a conversation; no global order is needed. And exactly-once display on top of at-least-once delivery.

The scale. 500 million daily users sending 40 messages a day is about 600 thousand messages a second at peak. Each message averages about 10 deliveries, because a group message goes to 19 other members on one and a half devices each. Groups are 30 percent of messages and 85 percent of deliveries. That is 6 million deliveries a second, plus as many receipts. And 100 million connections sending a heartbeat a minute is 1.7 million heartbeats a second, more packets than messages.

Two sentences matter. First, store each message once per conversation. A mailbox copy per recipient would multiply 4 petabytes a year by ten. Second, the inbox log, a per-user list of small pointers saying "something happened in conversation X at position Y", is the biggest write load, more bytes than the messages themselves. That is why it holds 40-byte pointers and is trimmed after 30 days.

The tiers. 500 gateways, each holding 200 thousand connections. About 75 chat service instances. About 270 message store nodes for 90 days of hot history, and about 150 for the inbox. And a session registry in Redis, mapping each device to its gateway, sized not by its 75 gigabytes of memory but by 4.4 million lookups a second.

The architecture, in words. Each device holds one WebSocket to a gateway. Gateways are deliberately dumb: they terminate connections and forward frames. Conversations are consistent-hashed to owner instances in the chat service, and the owner does the work: it assigns the order, stores the message, appends inbox pointers, acknowledges the sender, looks up the recipients' gateways in the registry, and delivers. If a device has no live connection, a push notification wakes it.

## Deep dive one: send to double tick

Traced, with both users online and about 20 milliseconds of mobile latency each way. The sender's device sends with a client message ID. At 20 milliseconds the gateway forwards it to the conversation's owner. The owner has not seen that ID, so it assigns sequence number 1042. From 21 to 26 milliseconds, a quorum write stores the message and the inbox pointers for both members, in parallel. At 26, the owner acknowledges the sender and looks up the recipient's gateway. At 46, the sender sees the single tick. At 47, the recipient's device has it and renders it. At about 90, the sender sees the double tick.

Send to delivery is about 47 milliseconds, inside the 100 millisecond target. And here is the rule: the tick means durable. The acknowledgement waits for the quorum write, because acking from memory makes the tick a lie during a crash.

Now the senior point. Direct delivery fails many times a second: a stale registry entry, a gateway mid-crash, a phone entering a tunnel. None of these loses a message, because by 26 milliseconds the message is stored and the recipient's inbox points at it. The device fetches it on its next sync. A failed delivery falls through to a push notification, which only has to wake the app. The fast path is an optimisation; the slow path is the correctness path. Correctness never depends on the live connection.

Routing is the registry plus a direct call. Gateways write "this device is on me" with a TTL when a device connects, and the owner looks up all members' devices in one batched call. The alternatives, a pub-sub channel per user or a queue per gateway, each add a hard system for no correctness gain.

## Deep dive two: ordering, failover and sync

Client clocks are wrong and group members send concurrently, so the server picks the order: the conversation's owner assigns the next integer. One writer per conversation, conversations independent, no coordination on the hot path.

Failover is the subtle part. Owner X holds a lease at epoch 7. It assigns 1043, then hits a garbage collection pause. At 10 seconds its lease expires, and owner Y takes over at epoch 8, reads the highest sequence, 1043, and assigns 1044 to Bob's message. At 13 seconds, X wakes up, still believing it owns the conversation, and assigns 1044 to Ann's message. What stops two different messages from both being 1044?

[pause]

A fencing token. Every write is conditional: "1044 is absent, and the epoch is at least 8." X's write carries epoch 7, so the store rejects it. Ann's device times out and retries with the same client message ID through Y, which assigns 1045. Without the conditional write and the fencing token, 1044 would exist twice with different bodies on different devices.

Exactly-once display is three things together: at-least-once delivery, idempotent storage where a retried client ID gets its original sequence back, and dedupe on the device by conversation and sequence. The device also fills gaps. Holding 1042 and receiving 1045, it fetches 1043 and 1044 before rendering: a brief loading state, never a reorder.

Sync. A naive sync sends a cursor per conversation: 300 cursors and 300 partition reads per reconnect. Instead, every event concerning a user goes into their inbox log with the next inbox sequence number, and each device remembers one number. A phone off for two days reconnects with 800 events waiting. Handshakes take about 150 milliseconds, reading the inbox range takes 5, fetching the messages 10, and streaming the first 500 events about 200. Under a second, whatever the number of conversations. Beyond 10 thousand waiting events, or past the 30-day trim, the server switches to a summary resync: the latest few messages and unread counts, with full history fetched on open.

Membership changes go through the same sequence. Removing a member takes the next sequence number like a message, so if C sends at the moment A removes D, the order decides cleanly whether D received it. Every device shows the removal at the same point.

## Deep dive three: groups and presence

Small groups, up to a thousand members: store once, append a pointer per member, one batched registry lookup, deliver. When such a group is busy, its fan-out moves onto Kafka-fed workers so one hot group cannot stall the owner's other conversations.

Broadcast channels of 100 thousand or more switch to fan-out on read. A hundred thousand pointer writes per message is the news feed's celebrity problem again. Store once, signal only members with the channel open, and let everyone else read on open.

Presence is a fan-out bomb. 100 million online users with 200 contacts each, changing state about every 10 minutes, is about 170 thousand changes a second, times 200: 33 million notifications a second, almost all to people not looking. The fix is subscribe on view. A client subscribes only to the 20 or so users on its screen, and unsubscribes when they scroll away. That cuts notifications to about 3.3 million a second, a tenth. Debounce "offline" for about 30 seconds, so a switch from Wi-Fi to cellular does not flash offline to 200 people. And write "last seen" only on offline transitions, not every heartbeat: about 83 thousand writes a second instead of 1.7 million.

Typing indicators are never stored or retried, are rate-limited to about one every three seconds, and are the first thing dropped under load. In a thousand-member group with 20 people typing, aggregating them into one "Ann and 19 others are typing" frame per viewer every three seconds turns 10 thousand frames a second into 25.

## Deep dive four: the reconnect storm

A gateway process crashes. Its kernel closes 200 thousand sockets at once, so every client learns within one round trip, and they all reconnect. Each reconnect is a TCP and TLS handshake, an authenticated upgrade, a registry write, and a sync.

The lesson measured the crypto. A full TLS handshake with an elliptic-curve certificate costs the server about 47 microseconds of public-key work; with an RSA certificate, about 200. Spread across the 499 surviving gateways, the crashed node's 200 thousand clients cost each survivor 5 milliseconds. Crypto is not the constraint.

Concentration and synchronisation are. Behind a least-connections balancer, all 200 thousand land on the empty replacement, which needs 2.3 seconds of full capacity with elliptic-curve certificates and nearly 10 with RSA. Its accept queue overflows, clients resend in synchronised waves, and with RSA only about half finish inside a 5 second client timeout. The fixes: slow start on the balancer, so a new node is not flooded. Full jitter on clients over 30 seconds. And admission control, answering any excess at once with a retry-after.

At region scale, 30 million connections, the limit moves downstream. 30 million registry writes are 6.8 seconds of the registry's entire capacity, while it is also serving deliveries. Jitter over 60 seconds gives each gateway 2 percent of its handshake capacity and the registry 11 percent. Size the window from the slowest downstream tier, not from TLS.

## In the interview

A follow-up the lesson expects. Deploy a new gateway version without dropping 100 million connections.

[pause]

Roll a few percent at a time. Drain each gateway by refusing new connections and asking clients to reconnect elsewhere over about 10 minutes, about 330 reconnects a second per gateway. Keep the frame protocol backward compatible, and gate each step on connection success, delivery latency and reconnect rate. At 500 gateways, 5 percent at a time, it takes a few hours. The wrong answer is a rolling restart, which is 200 thousand simultaneous reconnects per node.

And another: why not use Kafka as the message store, a topic per conversation? A cluster handles hundreds of thousands of partitions, millions at most, not billions of conversations. And Kafka cannot answer "messages 900 to 950 of this conversation" without scanning, while scrollback is core. Kafka is right for large-group fan-out work, not storage.

## Recap

Five things to remember. Store each message once per conversation, with a pointer inbox per user, and know the inbox is the biggest write load. The tick means durable, and correctness lives in the store, the inbox log and sync, never in the live socket. One sequencer per conversation, fenced on failover, never device clocks. Presence is subscribe on view, a tenth of the notifications. And the reconnect storm is about concentration, synchronisation and the registry, not TLS: slow start, jitter and admission control.

At your desk: the sizing tables, the three traces, the membership and presence arithmetic, the handshake measurements, and the in-order rendering exercise.
