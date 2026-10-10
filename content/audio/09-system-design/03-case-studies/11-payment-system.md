---
lesson: payment-system
source: fd4420f68fa3aca4
fit: great
desk:
  - "The API, the data model and the architecture diagram"
  - "The checkout trace, from authorisation to bank payout"
  - "The ledger table and the runnable SQLite ledger code"
  - "The hot-account measurements and the out-of-order webhook table"
  - "The reconciliation query and the worked day of reconciliation"
  - "Exercise: check and apply journal entries"
---
## Introduction

A customer taps "Pay". Your service calls the payment provider, and ten seconds later the call times out. Did the card get charged? You do not know, and nothing you can do in the next millisecond will tell you. Report failure and the customer taps again: they may be charged twice, and they will see it on their statement. Report success when the charge failed, and you have given the product away. That moment, a call to a system you do not control with an outcome you cannot observe, is what payment design is about.

Payments are rarely a scale problem. Billing 250 million subscribers a month needs a few hundred charges a second. They are a correctness problem, in the presence of retries, timeouts, crashes, duplicate webhooks, and external systems that cannot join your transactions. The senior answer rests on four ideas. Idempotency keys at every boundary. Exactly-once as an effect, built from at-least-once delivery plus deduplication. A double-entry ledger that makes errors structurally visible. And reconciliation against the outside world, to catch whatever the first three miss.

## Requirements and the numbers

Charge stored payment methods for monthly renewals and at checkout, with refunds and disputes. Route across two or more payment service providers, PSPs, by region and cost, with failover. Post every movement of money to a double-entry ledger, and reconcile daily against the PSP's reports and the bank. Card numbers are out of scope: the PSP's vault tokenises them.

The targets: no double charges, no lost payments, every cent traceable from invoice to bank. Zero data loss. Checkout under 3 seconds at the 99th percentile, most of it the PSP. Renewals may wait hours but are never dropped. More than 99.9 percent of reconciliation lines matched automatically. For money, you choose correctness over availability. A renewal delayed by an hour is fine; one charged twice is an incident.

Now the numbers. 250 million renewals a month is 8.3 million a day, about 96 a second. Add checkouts, retries and refunds, assume 150 a second, with billing runs peaking at five times that: 750 a second. That fits one relational primary. Do not shard for throughput you do not have.

Here are the numbers that matter more. At 15 dollars a subscriber, that is 3.75 billion dollars a month, so an error rate of just one hundredth of a percent is 375 thousand dollars a month. That is why reconciliation is a product, not a spreadsheet. And the ledger takes 50 million postings a day, 18 billion a year, so balances cannot be computed by summing every row.

The machines are modest: a primary with a synchronous standby in another zone, a read replica for reconciliation, six stateless payment service instances and a small Kafka cluster.

## The architecture

Two API rules first. Amounts are integers in minor units, cents, with a currency code, never floats, because 0.1 plus 0.2 is not 0.3 in binary floating point. And the idempotency key is derived from the invoice, a natural identifier of the business intent that a buggy client cannot regenerate. A deliberate retry after a decline, days later, is a new intent with a new key; replaying the old key would just return the old decline. The API can also answer "processing", which is an honest answer.

Behind it, keys, payments, attempts, ledger and an outbox all live in one database, so one local transaction updates them together. And one constraint carries a lot of weight: a partial unique index allowing only one live payment per invoice. It refuses a second live payment however many keys, retries or bugs are involved, and it outlives the key's 24 hour window.

The flow: the payment service claims the key and records the attempt in one transaction, commits, and only then calls the PSP. No transaction is ever held open across that call. Results arrive synchronously or by webhook and feed one state machine. A resolver chases anything stuck in "processing". The outbox relay publishes events to entitlements, receipts and analytics. And reconciliation compares the database with the PSP's files and the bank.

## Deep dive one: one checkout, and the unknown outcome

At checkout, the service authorises first, which makes the issuer reserve the funds, and captures, which takes them, only once the product has been granted. So a failure in between voids the authorisation instead of refunding a charge.

Trace a 15.99 dollar checkout. At zero, transaction one claims the key, creates the payment as "processing", records an attempt as "sent", and commits. From here, a crash leaves evidence. The authorise call goes to the PSP with the attempt ID as the PSP's own idempotency key, and the issuer approves through the card network, somewhere between 400 and 1,500 milliseconds. Transaction two marks it authorised. Nothing goes in the ledger, because no money has moved. Entitlements grant the plan. The capture is recorded and sent, and at about 1.2 seconds, transaction three marks the payment succeeded, posts the ledger entry, writes the outbox event and saves the response under the key, all in one commit.

Then the slow world. The next day the PSP's settlement file lists the charge, with a 76 cent fee. The day after, the bank payout arrives: 15.23 dollars. That gap of days is why reconciliation must work in windows.

Now the moment from the opening. The capture times out after 10 seconds. There are exactly two wrong responses. Before I tell you the right one: what are they?

[pause]

Marking the payment failed, which invites the billing job to retry with a new key and can double-charge. And retrying with a new key at the PSP, which has the same effect. The right response has five parts. Leave the payment in "processing", and tell the customer "confirming your payment" while the page polls. Retry the capture with the same key, which the PSP deduplicates. Accept the webhook whenever it arrives; it feeds the same state machine. A resolver queries the PSP for anything processing longer than 5 minutes; the committed attempt row is the evidence that a call may have happened, which also covers a crash between the call and the final commit. And reconciliation is the backstop for whatever the resolver misses.

That is what exactly-once means here: at-least-once delivery plus idempotent processing gives an exactly-once effect, within the window keys are remembered. Stripe keeps keys for at least 24 hours, so a retry three days later is a new request, and the unique index blocks it.

Webhooks arrive at least once and in any order. So a payment's status only moves forward, and an event that does not fit triggers a fetch of the authoritative object from the PSP. A refund event before the success event? Fetch the charge, learn it was captured and then partly refunded, and record both. Then the late success event is a no-op.

So idempotency lives at four boundaries. Client to payment service: the key, with a request hash and saved response, plus the unique index. Payment service to PSP: the attempt ID as the PSP's key. PSP back to you: verify the webhook signature, dedupe on the event ID, forward-only transitions. And to downstream services: consumers dedupe on the outbox event ID.

## Deep dive two: the double-entry ledger

A payments table records what you asked for. A ledger records what money did. Every journal entry moves money between at least two accounts, as postings that sum to zero per currency: debits positive, credits negative.

Follow the checkout. The capture: the PSP receivable goes up 1,599 cents, and revenue is credited 1,599. The fee: fees expense up 76, receivable down 76. The settlement: cash at bank up 1,523, receivable down 1,523. Now the receivable is 1,599 minus 76 minus 1,523: zero. The PSP owes nothing for this charge, which is exactly what reconciliation verifies. The sum of all balances is zero at every point, so a bug that writes only one side of an entry cannot commit. In Postgres, enforce that with a deferred trigger that checks each entry's sum at commit, because application code is not the only thing that will ever write to the ledger.

Now a tempting mistake, and the lesson measured it. Keep a running balance row per account, updated in the same transaction as each posting. Every charge touches the PSP receivable, so that row sees every transaction. With durable commits on Postgres, appending postings alone ran 7,600 transactions a second from 32 connections. With the running balance row, how many?

[pause]

About 360 a second, at 8 connections or 32, with latency climbing to 88 milliseconds. Each transaction holds the row lock until its commit has flushed the WAL, roughly 2.8 milliseconds, so they run one at a time. At the 750 a second billing peak, that row is a queue. So balances are derived: a periodic snapshot per account plus the postings since. And hot system accounts are split into sub-accounts summed on read; with 16, throughput rose to about 3 thousand a second. A single customer's balance row is fine, because nothing else contends for it.

Three more rules keep a ledger honest. It is immutable: mistakes are corrected by a reversing entry, never an update. It balances per currency: a conversion is two legs through an exchange account at a recorded rate. And rounding is deterministic: 1,000 cents split three ways is 333, 333 and 334 by a fixed rule, so rounding never creates or destroys a cent.

## Deep dive three: a day of reconciliation

Everything above can still be wrong: a resolver bug, a webhook never sent, a fee you did not expect, a short payout. Reconciliation compares three independent records of the same money: your ledger, the PSP's settlement file and the bank statement. At its core it is a full outer join on the PSP's reference.

A small day, worked. Two charges match, and their fees and settlements get posted. One charge, captured two seconds before midnight, is missing from the file: the PSP dated it the next day. It stays pending, and becomes a break only if still unmatched after three days. One line in the PSP's file has no payment in your database, on an invoice already paid by another charge. That is a double charge from an unresolved timeout: refund it automatically, alert, and fix the resolver. And one charge shows a different amount at the PSP: a partial capture or a bug, so investigate. Then the bank payout is 300 cents short of the file's net, and that gap matches a chargeback line in the PSP's payout report, so it reconciles once that line is posted.

Timing causes most false breaks, which is why lines age through "pending" before becoming exceptions. The metrics that matter are the automatic match rate, the age of the oldest break, and the money in unresolved breaks. Run it daily from files, as an independent check that shares no code with the payment path.

## Failure modes

A PSP outage: route new payments to the second PSP. But a payment whose outcome is unknown on the first stays there until it is resolved or its authorisation is voided, because the second could charge it twice. Keys kept in an evicting cache produce duplicates clustered around evictions; keep them in the payments database, in the same transaction. A billing-day storm hits PSP rate limits at midnight on the first of the month; spread billing across anniversary dates, pace the jobs, and cap concurrency per PSP. And hard declines, a stolen card or a closed account, are never retried; soft declines are retried over days, each as a new intent with a new key.

## In the interview

A follow-up the lesson expects. How do you fail over between PSPs without double charging?

[pause]

Only payments with a known outcome move. New payments route to the healthy PSP. Payments unknown on the failing one stay until resolved or explicitly voided there. And the one-live-payment-per-invoice index refuses a second live payment even if routing gets it wrong. The wrong answer is "retry everything on the backup PSP".

And another: a client retries four days later with the same key. The key has expired, so the request looks new, but the invoice already has a live payment, so the unique index rejects it and you return the existing payment. Reconciliation catches anything that escapes both. Keeping keys forever trades a bounded table for an unbounded one, and still misses a client that mints a new key.

## Recap

Four things. Payments are a correctness problem at modest scale; do not shard 750 a second. Put idempotency at all four boundaries, derive the key from the business intent, and back it with a unique constraint that outlives the key. Treat "unknown" as a state, resolved by same-key retries, webhooks, a resolver and reconciliation, never converted into "failed". And post every movement in a double-entry ledger in integer cents, with derived balances, because one hot balance row serialises at the WAL flush rate, about 360 a second.

At your desk: the API, data model and diagram, the checkout trace, the ledger table and code, the hot-account measurements, the reconciliation query and worked day, and the ledger exercise.
