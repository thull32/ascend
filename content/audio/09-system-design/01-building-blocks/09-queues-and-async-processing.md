---
lesson: queues-and-async-processing
source: d9a7503d8de2bab2
fit: great
desk:
  - "The utilisation table and the queue simulation code"
  - "The pooling table: one shared queue against partitions"
  - "The Kafka, RabbitMQ and SQS comparison table"
  - "The SQS crash trace and the poison-message trace"
  - "Exercise: simulate a visibility timeout, redelivery and a dead-letter queue"
---
## Introduction

A flash sale starts and orders arrive at 10 thousand a second. The fulfilment pipeline talks to a warehouse system built in 2009 and can process 2 thousand a second on a good day. If the order API calls fulfilment synchronously, the API's latency becomes the warehouse's latency, its threads fill with waiting requests, and within seconds it falls over. Every customer gets an error, even though the order database was fine.

Put a queue between them. The API writes the order and enqueues a message in about a millisecond. Consumers drain at 2 thousand a second. The backlog grows at 8 thousand a second for the ten minutes of the sale, peaks at 4.8 million messages, and drains in 40 minutes. Customers see instant confirmations and slightly delayed shipping emails.

That arithmetic, arrival rate minus service rate, times duration, divided by drain rate, is the first thing to write down whenever you propose a queue. The second is the curve that says how slow a queue is when it is not overloaded. The third is what happens to a message when the consumer holding it dies. Those are the three ideas.

## Why a queue, and what it costs

A queue buys four distinct things, and a design should say which. Buffering: absorbing bursts a downstream cannot handle, as long as the delay is acceptable to the product. Decoupling: the producer succeeds while the consumer is down, as long as the producer does not need the consumer's answer. Fan-out: one event, many independent consumers, fulfilment, fraud, analytics, each at its own pace. And retry isolation: failed work is retried by the consumer, without the original caller, with a dead-letter path for the poisonous ones.

The cost is the same every time. The work happens later, the caller cannot see its result, and you now operate a broker with its own failure modes.

## Utilisation decides latency

The flash-sale arithmetic treats the consumer as a pipe. Real arrivals are bursty and real processing times vary, and that variance makes a queue slow long before it is full. The standard model has random arrivals and one consumer, and here is the one formula: the average time in the system is the service time divided by one minus the utilisation. And the 99th percentile is about 4.6 times that average.

Take a consumer that needs 10 milliseconds per message. At 50 percent busy, a message spends 20 milliseconds on average. At 80 percent, 50. At 90 percent, 100 milliseconds, with a 99th percentile around 460. At 99 percent, the formula says a full second. Going from 50 to 90 percent busy buys 1.8 times the throughput and costs five times the latency. That is why consumers are provisioned for 60 to 70 percent at peak.

The second tool is Little's law, which holds for any stable system: the number of items inside equals the arrival rate times the time each spends inside. It turns a backlog into a delay: 4.8 million messages drained at 2 thousand a second means the last one waits 2,400 seconds. And it sizes concurrency. If each warehouse call takes 50 milliseconds, sustaining 2 thousand a second needs 100 messages in flight, for example 25 processes with 4 workers each. With only 40 in flight, the consumer tops out at 800 a second and the backlog never drains.

Now a question. Four consumers, each able to handle 100 messages a second, total load 320 a second. Same machines, same load, laid out two ways: one shared queue that any idle consumer can take from, or four Kafka partitions, one per consumer. Which has the better tail?

[pause]

The shared queue, by more than three times. Its 99th percentile was 68 milliseconds; the four partitions, 227. A partition is its own little queue, so a message can wait behind a busy consumer while another one sits idle. And the realistic case is worse: with keys split 30, 25, 25 and 20 percent, one partition ran at 96 percent busy, its mean went up fivefold, and the 99th percentile hit 809 milliseconds. Per-key ordering is what that loss buys. A workload that does not need ordering should not pay for it.

## Three models, not one

"Message queue" hides three architectures. A log, like Kafka, keeps messages after consumption, retained by time or size, for days. Any number of consumer groups read it independently, each tracking its own offset, and can rewind and replay. A broker-managed queue, like RabbitMQ, pushes messages to consumers and deletes them on acknowledgement, with rich routing and priorities. A managed queue, like SQS, is polled, deletes on acknowledgement, and needs nobody on call.

So the choice is mostly made for you. Fan-out and replay push you toward a log. Per-message routing, priorities and delayed delivery, toward a broker. No operations budget, toward SQS, whose standard queues have effectively unlimited throughput. "Kafka is faster" is not the deciding axis.

One Kafka number to carry. A consumer that handles 500 messages a second and a target of 20 thousand a second needs at least 40 partitions. Over-provision modestly, say 60, because the count is hard to change later: adding partitions changes which partition each key hashes to.

## A message, and the consumer that dies

The delivery guarantee is decided by when the consumer acknowledges, not by the broker. Acknowledge before processing, and a crash loses the message: at most once. Acknowledge after, and a crash after the side effect redelivers it: at least once. At least once is the default you want, and it means every consumer must be idempotent.

Trace it on SQS. The visibility timeout is 30 seconds; the message says "ship order 7781". Consumer A receives it, calls the warehouse API, and a shipment is created. Then A is killed before it deletes the message. At 30 seconds the lease expires, the message becomes visible, and consumer B receives it and calls the warehouse API. Nothing was lost, and the customer gets two parcels.

B cannot tell that A did the work, because A's only record of it is on the warehouse's side. So the fix lives there: B sends the same idempotency key A sent, derived from the order, not generated per attempt, and the warehouse returns the existing shipment.

Kafka redelivers by position instead of by lease. A polls offsets 1,000 to 1,499, writes the first 300 to the database, and is killed. After the session timeout, 45 seconds by default, the partition moves to B, which starts again from offset 1,000. 300 duplicate writes and a 45-second stall. A graceful shutdown commits and leaves the group at once, which is why deploys should stop consumers with a SIGTERM and a grace period, not a SIGKILL.

And the trap in Kafka's default. With auto-commit on, each poll commits the offsets returned by the previous poll. That is at least once if you finish processing before polling again, and silently at most once the moment you hand records to a thread pool, because the next poll commits offsets whose work has not happened.

## Ordering, poison and the dead-letter queue

Global ordering does not exist at scale; you get ordering per key. Everything for one order goes to one partition, and the consumer processes it sequentially. The cost is head-of-line blocking: if one message for order 7781 is retried for a minute, every other order that hashed to that partition waits behind it.

A poison message, one that fails every time, shows the difference. On SQS, with a 30-second visibility timeout and a maximum of three receives, it is tried three times over 90 seconds and then moved to the dead-letter queue, blocking nothing. On a Kafka partition the same retries stall everything behind it, and Kafka has no broker-side dead-letter queue, so you build one: publish the failure to a retry topic, commit, and move on, and send a repeatedly failing message to the dead-letter path after three attempts, not thirty. When per-key order matters, park the key, so its later events follow it down the retry path instead of overtaking it.

Four rules make a dead-letter queue useful rather than a graveyard. Alert on its depth and age. Keep the reason: the exception, the attempt count, the consumer version. Give it longer retention than the source. On SQS a message keeps its original enqueue time, so with the default 4 days on both, a message that spent 3 days failing is deleted one day after it lands. Set the dead-letter queue to the 14-day maximum. And build the replay tool before the incident.

Finally, the health metric. The health of an async system is consumer lag, and lag in time is what to alert on. A shipping-email pipeline that tolerates 5 minutes pages at 3 minutes of age. Lag also sizes the fleet: if it grows at 8 thousand a second and each consumer drains 500, 16 more consumers stop the growth.

## In the interview

A question the lesson expects. Four consumers are 80 percent busy and the 99th percentile is 230 milliseconds. The team wants to add partitions. What else?

[pause]

Each partition is its own single-consumer queue. The same four consumers on a shared queue measured 68 milliseconds at the same load. If ordering is not needed, a competing-consumer queue buys pooling. If it is, add consumers to bring utilisation down to 60 or 70 percent, and fix the key skew first. The wrong answer is "they are only 80 percent busy, so the latency must be downstream", which ignores queueing delay.

And: why Kafka and not SQS here? Because three consumers need the same order events and you want replay: when the fraud model changes, you re-score the last 7 days from the log. SQS would need a fan-out to three queues and cannot replay after delete. With one consumer and no replay, pick SQS and spend the operational budget elsewhere.

## Recap

Four things to remember. Justify a queue with arithmetic: arrival minus service rate, peak backlog, drain time. Latency grows with one over one minus utilisation, so 90 percent busy is five times slower than 50, and Little's law turns lag into seconds and sizes in-flight work. Choose a log or a queue on fan-out, replay and operations, knowing partitions trade pooling for per-key order. And the guarantee is set by when the consumer acknowledges, so consumers are idempotent with keys derived from the business entity, retries are bounded, and dead-letter queues get alerts, long retention and a replay tool.

At your desk: the utilisation and pooling tables, the three-system comparison, the crash and poison traces, and the visibility-timeout exercise.
