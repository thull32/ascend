---
lesson: idempotency-and-retries
source: 8faf84eef2f51e2b
fit: great
desk:
  - "The double-charge trace and the Postgres unique-index experiment"
  - "The idempotency-key table schema and the three-phase handler code"
  - "The lease-expiry trace with fencing tokens"
  - "The queue-and-database crash table, and the dedupe approaches table"
  - "The two retry-storm simulation tables"
  - "Exercise: implement an idempotency-key handler"
---
## Introduction

Your payment service calls the card processor. After two seconds the call times out. Did the customer get charged? There are three possibilities, and from where you stand you cannot tell them apart. The request never arrived. Or it arrived, the charge happened, and the response was lost. Or it is still running, and will complete after you gave up. Retry blindly and you risk a double charge. Do not retry and you risk a customer who paid and got nothing.

Every network call has this ambiguity. Idempotency is the property that makes the retry safe: doing an operation twice has the same effect as doing it once. Most operations are not naturally idempotent, so you engineer it, and the details decide whether it works. Then retries need their own discipline, because a retry is extra load on a system that just failed to answer.

Three ideas: the race that a naive duplicate check always loses, the handler that survives a crash between charging and recording, and the retry storm that turns a ten-second stall into a permanent outage.

## The double charge

Some operations are already safe. Setting a balance to 100, or putting a full document, is absolute state; repeating it changes nothing. Subtracting 30, or posting a payment, is not; each execution subtracts or creates again. And sending an email cannot be unsent. Sometimes you can redesign the second kind into the first: "set stock to 41 if it is 42" is idempotent, and it also detects a concurrent update. When you cannot, you add a key.

Here is the naive version. The service checks whether a payment exists for the order, finds none, and calls the processor. Two seconds later the client times out and retries. The retry checks too, and also finds none, because the first attempt has not inserted its row yet. It calls the processor. Two charges.

Check-then-act is a race whatever the timing. The lesson reproduced it on Postgres 17 at the default isolation level: two sessions each counted rows with the key, both saw zero, waited half a second, and both inserted.

The fix is to make the claim itself atomic with a unique constraint. Session A inserts the key and holds its transaction open. Session B runs the same insert and blocks on A's uncommitted index entry. When A commits, two seconds later, B returns zero rows: the key exists, so B must not charge. And if A rolls back instead, B's insert succeeds the instant the rollback lands, measured at half a millisecond later, so a failed first attempt never blocks the retry forever. The unique index, not the select, is the lock.

## The key table, and where the key comes from

The key table has a column for every failure. The key is scoped by account, because two tenants will both send key "1", and without scoping one gets the other's response. It stores a hash of the request, because the same key with an amount of 30 and then 300 is a client bug, not a retry, and gets rejected with a 422 rather than replaying the wrong response. It stores a state and a lease, to tell a concurrent duplicate, which gets a 409, from an attempt that died holding the key. And it stores the response, so a retry after success gets the original byte for byte.

Size it. Measured on Postgres, a key costs about 370 bytes. At 2,000 payments a second kept for 24 hours, that is about 64 gigabytes of live keys, which is why the window is a day and not a month.

Where the key is minted decides which duplicates it catches. Minted per HTTP attempt by the client library, it catches nothing; it is a key in name only. Minted when the checkout page loads, it catches double taps but not a reload, which renders a new key. Minted when the user taps Pay and kept until the outcome is known, it catches network retries, but not a second tab submitting the same cart. The strongest is derived from the intent: a hash of the user, the cart and the cart's version. Two submissions of the same intent collide wherever they come from. Its risk is the opposite error, treating two genuine purchases as one, which is why the version must change whenever the user edits what they are buying.

## Three phases and a crash

The charge cannot sit inside a database transaction. Holding a transaction and a connection open across a two-second network call starves the pool, and the processor would not roll back with it anyway. So the handler runs in three phases, each atomic.

Claim: insert the key as in progress with a lease, or find it. Done means replay. A different hash means 422. A live lease means 409. An expired lease means the last attempt died, so take over. Side effect: call the processor, passing the same idempotency key through. Record: insert the payment and mark the key done with its response, in one transaction.

Now crash the process between phases two and three. The customer has been charged, and your table still says in progress. What stops the retry from charging again?

[pause]

The processor. Because the key was passed downstream, when the retry takes over after the lease expires and calls the processor again, the processor recognises the key and returns the original charge. In the lesson's run: the crash, then a 409 while the dead attempt's lease runs, then a 201 with the original charge, then a plain replay, then a 422 for a changed amount. One charge in total. A sweeper that re-drives keys stuck in progress past their lease covers the client that never retries.

One more edge. A lease is a promise about time, and a slow attempt can outlive it. The processor call hangs for 35 seconds under a 30-second lease; a retry takes over at 31 seconds and finishes first. Here both saw the same charge, so it was harmless. It would not be if they saw different outcomes. Two rules close it. Phase three updates the key only while holding its own lease token, a fencing check. And the lease is longer than the side effect's own timeout, say a 25-second client timeout under a 30-second lease.

## Exactly once is at least once, made idempotent

No protocol delivers a message exactly once. Any acknowledgement can itself be lost, and the sender must then choose between resending, a possible duplicate, and not, a possible loss. Systems offer at-least-once delivery plus idempotent processing, whose observable effect is exactly once. Kafka's exactly-once semantics are this: the producer tags batches so the broker drops resent duplicates, and transactions commit consumer offsets together with the output, which holds only while the output is Kafka.

So a queue consumer needs the same discipline. The pattern that holds: one local transaction per message that inserts the event ID into a processed-events table, applies the effect, and writes any outgoing event to an outbox, and only after the commit does the consumer acknowledge. Walk the crash points. Crash before or during the transaction, it rolled back, and redelivery processes normally. Crash after the commit but before the acknowledgement: the message comes back, the insert finds the event ID, the consumer skips and acknowledges. Once, every time, because the only step outside the transaction is the acknowledgement. It breaks the moment the effect lives elsewhere, an email or a card charge, and then the event ID travels as that call's idempotency key.

Whatever holds the IDs, the window must outlast the longest redelivery. A dead-letter queue replayed three days later sails straight past a one-day window. And a Redis set-if-absent is cheap but does not survive a failover, because asynchronous replicas can miss the last keys.

Sometimes you need no table at all. A Kafka consumer can store its partition offsets in the same transaction as its effects and seek to them on every reassignment. Or, when events carry a version per entity and full state, apply an event only if its version is newer. Delivered as 1, 2, 2, 4, 3, 5, the consumer applies 1, 2 and 4, skips the second 2 and the late 3, and applies 5. One integer per entity, and a replay from last week is recognised as old.

## Retry storms, simulated

Scenario one. A dependency serves 1,000 requests a second and stalls for 10 seconds. Clients send 800 new requests a second, give up after one second, and retry up to three times. With no retries, it recovered at about 55 seconds. With three retries, immediate, exponential, or with full jitter, it made no difference: offered load quadrupled to about 3,300 a second, and the system never recovered within the two minutes simulated. Zero useful responses. Every answer arrived after its client had given up, so each "success" was wasted work that triggered another retry.

That is a metastable failure: the trigger ended at 20 seconds, and the overload sustained itself. Before I tell you, what ended it?

[pause]

Not backoff, and not jitter; failures were already spread over time. A 10 percent retry budget capped the load at 1.17 times and recovered by 86 seconds. What restored service the moment the stall ended was the server dropping requests whose deadline had already passed. That is why deadlines must travel with requests.

Scenario two is where jitter matters. A restart resets 2,000 clients at the same instant, against a server that accepts 1,000 a second. With exponential backoff and no jitter, the clients stay in lockstep: every retry wave lands in the same 10 milliseconds, 10 succeed and 1,990 back off together. It took 971 seconds and about 100 attempts per client. With any jitter, 4 to 6 seconds. Jitter matters when failures are synchronised; budgets and deadlines matter when they are not.

And the arithmetic of what a retry buys. At a 1 percent failure rate, three retries cost 1.01 attempts per request. At 10 percent, 1.11. At 90 percent, 3.44 attempts, for 34 percent success, and even that is optimistic, because the retries are what keep the dependency overloaded. Retries are nearly free exactly when they help, and approach four times the load exactly when they cannot.

So: retry in one layer per hop, because a client, a gateway and a service each retrying three times is 64 attempts per user action. Retry only what can succeed: timeouts, 503s, 429s, never a 400 or a 404. Back off with jitter. Budget retries at about 10 percent. And propagate deadlines.

## In the interview

The classic: the payment call timed out. What does your service do?

[pause]

It does not guess. The key was generated when the user confirmed, claimed atomically, and passed to the processor. The retry reuses it. If we finished, our table returns the stored response. If the processor finished and we lost the response, it returns the original charge. If neither finished, it runs once. Keys stuck in progress past their lease are re-driven or reconciled against the processor. The wrong answer is "check whether a payment exists, then retry", which is the check-then-act race.

And: where do retries live, and how many? One layer per hop, with budgets. The service retries its own database and cache calls, the gateway passes failures through, and the client retries the whole request up to three times with jitter, reusing the key. Deadlines propagate so a server can drop work nobody is waiting for; in the simulation, that, not backoff, ended the storm. The wrong answer is every layer retrying three times, which is 27 to 64 attempts.

## Recap

Four things to remember. A timeout has three possible outcomes, and you design for not knowing which. Claim keys with a unique constraint, never a select, scoped by account, fingerprinted, leased, and derived from the user's intent rather than the attempt. Split the handler into atomic phases around the external call, and pass the key downstream so a crash between charge and record cannot charge twice. And exactly once means at least once plus idempotent processing, while retries need one layer, jitter, a budget and propagated deadlines, or a ten-second stall becomes permanent.

At your desk: the double-charge and lease traces, the handler code, the crash table, the two storm simulations, and the key-handler exercise.
