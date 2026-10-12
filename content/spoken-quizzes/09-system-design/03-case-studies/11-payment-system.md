---
lesson: payment-system
source: f62369c1a6389f9b
---
## 1

A call to the payment service provider times out during a charge. Which response is correct?

A, mark the payment succeeded, since most charges succeed. B, mark the payment failed, so the customer can retry. C, retry immediately on a second provider, to get a definite answer. D, keep it processing, retry with the same key, and reconcile.

[think]

The answer is D: keep it processing, retry with the same key, and reconcile.

The outcome is unknown, so the payment stays in processing, and is retried with the same idempotency key at the provider, then resolved by webhook or status query. Marking it failed invites a retry with a new intent, and trying a second provider can charge twice if the first succeeded. Guessing success gives away the product when the charge actually failed.

## 2

Keys for idempotency are kept for 24 hours. What protects against a duplicate charge from a retry four days later?

A, a longer idempotency key, so collisions cannot occur. B, the provider's fraud checks flagging the repeated charge. C, a unique constraint: one live payment per invoice. D, nothing, since beyond 24 hours a duplicate is an accepted risk.

[think]

The answer is C: a unique constraint: one live payment per invoice.

A natural business key, enforced by the database, outlives any key's time to live. The idempotency key gives replayable responses for recent retries, and the constraint gives a permanent guarantee for the business intent. Fraud checks are not designed to catch duplicates, and key length is irrelevant.

## 3

A charge of 15 dollars 99 incurs a 76-cent provider fee, and settles 15 dollars 23 to the bank. What is the provider receivable's balance after the capture, fee and settlement entries?

A, minus 76 cents. B, plus 1,599 cents. C, plus 1,523 cents. D, zero.

[think]

The answer is D: zero.

The capture debits the receivable 1,599 cents, the fee credits it 76, and the settlement credits it 1,523, which leaves zero. A zero receivable after settlement is exactly the fact reconciliation checks for each charge, and a nonzero one points at a missing or wrong entry.

## 4

A running balance row for the provider receivable is updated in every payment transaction. Measured, throughput stayed near 360 a second at both 8 and 32 connections. Why?

A, the postings index is rebuilt on every committed insert. B, Postgres limits each table to one writer at a time. C, 32 connections exceed the database's connection limit. D, each transaction holds the row lock until its WAL flush.

[think]

The answer is D: each transaction holds the row lock until its WAL flush.

Every transaction updates the same row and keeps its lock until commit, and commit waits for the WAL flush, about 2.8 milliseconds here, so transactions on that row run one at a time, whatever the connection count. Append-only postings do not contend, and reached 7,600 a second; splitting the account into 16 sub-accounts reached 3,030.

## 5

Checkout authorises the card, then grants the plan, then captures. Provisioning fails after the authorisation succeeded. What should happen?

A, void the authorisation, so no money is taken. B, capture anyway, and refund the customer later. C, let reconciliation capture the authorisation later. D, retry the authorisation with a new idempotency key.

[think]

The answer is A: void the authorisation, so no money is taken.

An authorisation reserves funds without moving them, so voiding it means the customer is never charged, which is cleaner than a refund that shows on the statement for days. A new authorisation key would reserve the funds twice, and reconciliation reports breaks; it does not capture payments.

## 6

Reconciliation finds a charge at the provider with no successful payment in your database, on an invoice already paid by another charge. What is it, and what should happen?

A, card fraud, so block the customer's account and card. B, a timing difference, so it will match in tomorrow's file. C, a double charge, so refund it automatically, and alert. D, a fee mismatch, so raise a claim against the provider's fee.

[think]

The answer is C: a double charge, so refund it automatically, and alert.

A charge the provider holds that you never recorded, on an invoice already paid, means the customer paid twice, probably from an unresolved unknown outcome. The playbook refunds it and alerts, so the resolver bug can be fixed. Timing windows explain a charge that appears a day late, not a second charge on a paid invoice.
