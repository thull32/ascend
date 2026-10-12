---
lesson: queues-and-async-processing
source: 45e7b5b2f39010ec
---
## 1

Orders arrive at 10,000 a second for 10 minutes, and consumers drain 2,000 a second. What is the peak backlog, and how long after the burst ends does it clear?

A, 6 million messages, and 30 minutes. B, 8 million messages, and 40 minutes. C, 4.8 million messages, and 40 minutes. D, 4.8 million messages, and 24 minutes.

[think]

The answer is C: 4.8 million messages, and 40 minutes.

The backlog grows at 10,000 minus 2,000, which is 8,000 a second, for 600 seconds: 4.8 million. After arrivals stop, it drains at 2,000 a second, so 4.8 million takes 2,400 seconds, which is 40 minutes.

## 2

A consumer takes 10 milliseconds per message on average. Traffic grows from 50 to 90 messages per second. Under the single-server queueing model, what happens to the mean time a message spends in the system?

A, it rises from 20 milliseconds to 100, five times. B, it rises from 20 milliseconds to 36, in line with load. C, it doubles from 20 milliseconds to 40, as the load nearly doubles. D, it stays near 10 milliseconds until the consumer is full.

[think]

The answer is A: it rises from 20 milliseconds to 100, five times.

The time in the system is one over the spare capacity: the consumer can do 100 a second, so at 50 a second it is one fiftieth of a second, 20 milliseconds, and at 90 a second it is one tenth, 100 milliseconds. Latency grows with one over one minus the utilisation, not with load, which is why consumers are provisioned for 60 to 70 percent at peak. The lesson's simulation measured 19.9 milliseconds and 95.

## 3

An SQS consumer takes 45 seconds to process a message with the default 30-second visibility timeout, then deletes the message. What happens?

A, the first consumer gets an error at 30 seconds, and has to restart its work. B, SQS deletes the message at 30 seconds, because the lease has expired. C, SQS extends the lease automatically while the first consumer is still working. D, it is redelivered at 30 seconds, and the late delete may not remove it.

[think]

The answer is D: it is redelivered at 30 seconds, and the late delete may not remove it.

The visibility timeout is a lease. When it expires, the message is delivered again with a new receipt handle, so two consumers process it, and the first consumer's delete uses a stale handle, which the documentation warns may not delete it. Extend visibility explicitly, and make processing idempotent.

## 4

A Kafka consumer uses auto-commit, hands each polled batch to a thread pool, and returns to polling immediately. What delivery guarantee does it have?

A, at-most-once, because a crash can lose handed-off records. B, at-least-once, because the thread pool retries on failure. C, at-least-once, because offsets are committed after processing. D, exactly-once, because Kafka commits and processes atomically.

[think]

The answer is A: at-most-once, because a crash can lose handed-off records.

Auto-commit commits the offsets returned by the previous poll during the next poll. With processing on another thread, the next poll arrives before processing finishes, so offsets run ahead of the work, and a crash loses those records. Synchronous processing in the poll loop would give at-least-once.

## 5

Four consumers each handle 100 messages a second, and total load is 320 a second. Why did four Kafka partitions measure a 99th percentile of 227 milliseconds, while one shared queue, in the style of SQS, measured 68?

A, Kafka adds broker latency on every fetch that SQS avoids. B, the shared queue drops slow messages to protect its 99th percentile. C, each partition queues alone while other consumers sit idle. D, partitions process messages in order, which doubles service time.

[think]

The answer is C: each partition queues alone while other consumers sit idle.

A consumer group gives each partition to one consumer, making four separate single-server queues, while a shared queue lets any idle consumer take the next message, one queue with four servers. Pooling removes waiting behind a busy consumer while another is idle. Service time is the same in both: ordering costs you the pooling, not per-message work.

## 6

A standard SQS queue retains messages for 4 days, and its dead-letter queue also retains them for 4 days. A message fails for 3 days before moving to the dead-letter queue. When is it deleted?

A, about 7 days after it was first sent. B, about 1 day after it reaches the dead-letter queue. C, about 4 days after it reaches the dead-letter queue. D, never, since dead-letter messages do not expire.

[think]

The answer is B: about 1 day after it reaches the dead-letter queue.

For standard queues, the enqueue timestamp is unchanged when a message moves to the dead-letter queue, so its expiry is still 4 days after it was first sent: about 1 day after it arrives there. Set the dead-letter queue's retention longer than the source's, up to the 14-day maximum.
