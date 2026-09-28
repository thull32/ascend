---
slug: idempotency-and-retries
title: "Idempotency and retries: making the second attempt safe"
description: The double-charge race traced and reproduced on Postgres, an idempotency-key table and a three-phase handler that survives a crash between charging and recording, consumer deduplication, and retry storms simulated with and without backoff, jitter, retry budgets and deadline-aware servers, with how Stripe, AWS SDKs, gRPC, Envoy and Kafka implement each piece.
minutes: 25
difficulty: hard
tags: [system-design, idempotency, retries, deduplication, exactly-once, backoff]
---
Your payment service calls the card processor. After two seconds the call times out. Did the customer get charged? There are three possibilities and you cannot tell them apart from where you stand: the request never arrived; it arrived, the charge happened and the response was lost; or it is still running and will complete after you gave up. Retry blindly and you risk a double charge. Do not retry and you risk a customer who paid and got nothing.

Every network call has this ambiguity. Idempotency is the property that makes the retry safe: doing an operation twice has the same effect as doing it once. Most operations are not naturally idempotent, so you engineer it, and the details (the key table, its concurrency, the crash between side effect and record) decide whether it works. Retries then need their own discipline, because a retry is extra load on a system that just failed to answer.

## Which operations are already idempotent

| Operation | Idempotent? | Why |
|---|---|---|
| `SET balance = 100`, `PUT /users/42` with the full document | Yes | Absolute state; repeating it changes nothing |
| `DELETE /users/42` | In effect | The second call returns 404 but the state is the same; treat 404-after-delete as success |
| `balance = balance - 30`, `POST /payments` | No | Each execution subtracts or creates again |
| `INSERT` without a unique key | No | Each execution adds a row |
| Send an email | No | And it cannot be unsent |

Operations expressed as absolute state are idempotent; deltas and creations are not. Sometimes the second kind can be redesigned into the first: "set stock to 41 if it is 42" is idempotent and also detects a concurrent update. When it cannot, you add a key.

## The double charge, traced

A mobile client taps Pay; the service checks for an existing payment, then charges:

| t (ms) | Attempt 1 | Attempt 2 (client retry) | Payments rows | Charges |
|---|---|---|---|---|
| 0 | `SELECT` payments for order 7781: none | | 0 | 0 |
| 5 | Calls the processor | | 0 | 1 |
| 2,000 | | Client timed out and retries; `SELECT`: none (attempt 1 has not inserted) | 0 | 1 |
| 2,005 | | Calls the processor | 0 | **2** |
| 2,300 | Processor responds; `INSERT` payment | | 1 | 2 |
| 2,310 | | `INSERT` payment | 2 | 2 |

Check-then-act is a race whatever the timing. Reproduced on Postgres 17 at the default isolation level: two sessions each ran `SELECT count(*) ... WHERE idem_key = 'k3'` (both saw 0), waited 0.5 s, and inserted, leaving two rows, `ch_A` and `ch_B`. The fix is to make the claim itself atomic with a unique constraint, and the same experiment shows how Postgres enforces it:

| t (s) | Session A | Session B |
|---|---|---|
| 0 | `INSERT ... ON CONFLICT DO NOTHING RETURNING` inserts the key (transaction open) | |
| 0.50 | Holds the transaction for the "charge" | Same `INSERT` blocks on A's uncommitted index entry |
| 2.003 | `COMMIT` | |
| 2.006 | | Returns zero rows: the key exists, so B must not charge |

If A rolls back instead, B's insert succeeds the instant A's rollback lands (measured: 0.5 ms later), so a failed first attempt never blocks the retry forever. The unique index, not the `SELECT`, is the lock.

## An idempotency-key table

```sql
CREATE TABLE idempotency_keys (
  account_id    bigint      NOT NULL,
  idem_key      text        NOT NULL,             -- client-generated; scoped by account
  request_hash  bytea       NOT NULL,             -- SHA-256 of the canonical request body
  state         text        NOT NULL CHECK (state IN ('in_progress', 'done')),
  locked_until  timestamptz,                      -- lease on an in-progress key
  response_code int,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, idem_key)
);
CREATE INDEX ON idempotency_keys (created_at);    -- for the 24-hour expiry job
```

Every column answers a failure. **`account_id` in the key:** two tenants both send key `1`; without scoping one gets the other's response. **`request_hash`:** the same key with amount 30 and then 300 is a client bug, not a retry; reject it (422) rather than replay the wrong response. **`state` and `locked_until`:** distinguish a concurrent duplicate (409, retry later) from an attempt that died holding the key (the lease expired, so this attempt may take over). **`response_*`:** a retry after success gets the original response byte for byte.

**Size.** Measured on Postgres 17 with a 150-byte JSON response, a row costs 283 bytes of heap plus 88 bytes of primary-key index: about 370 bytes. At 2,000 payments a second kept 24 hours, $2{,}000 \times 86{,}400 \times 370\,B \approx 64$ GB of live keys, which is why the window is a day and not a month, and why keys are pruned by a job (or daily partitions dropped) rather than by `DELETE` storms.

## The handler: three phases and a crash

The external charge cannot sit inside the database transaction: holding a transaction and a connection open across a two-second network call starves the pool, and the processor would not roll back with it anyway. So the handler runs in phases, each atomic, and the processor gets the same key so it deduplicates too:

1. **Claim:** insert the key as `in_progress` with a lease, or find it: `done` means replay, a different hash means 422, a live lease means 409, an expired lease means take over.
2. **Side effect:** call the processor with the idempotency key passed through.
3. **Record:** insert the payment and mark the key `done` with the response, in one transaction.

A crash between phases 2 and 3 is the hard case. Runnable with the standard library, using SQLite in place of Postgres:

```python
import hashlib
import json
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)   # we issue BEGIN/COMMIT ourselves
db.executescript("""
CREATE TABLE idempotency_keys (
  account_id   INTEGER NOT NULL,
  idem_key     TEXT    NOT NULL,
  request_hash TEXT    NOT NULL,
  state        TEXT    NOT NULL,          -- 'in_progress' or 'done'
  locked_until REAL,                      -- lease: who may drive an in-progress key
  response     TEXT,
  PRIMARY KEY (account_id, idem_key)
);
CREATE TABLE payments (id TEXT PRIMARY KEY, account_id INTEGER, amount INTEGER, charge TEXT);
""")

class Processor:
    """Stands in for the card processor, which also dedupes on the key we pass it."""
    def __init__(self):
        self.charges = {}

    def charge(self, key, amount):
        if key not in self.charges:
            self.charges[key] = f"ch_{len(self.charges) + 1}"
        return self.charges[key]

processor = Processor()
LEASE_S = 30

def create_payment(account_id, idem_key, body, now, crash_after_charge=False):
    h = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    # Phase 1: claim the key atomically
    db.execute("BEGIN IMMEDIATE")
    row = db.execute("SELECT request_hash, state, locked_until, response FROM idempotency_keys "
                     "WHERE account_id = ? AND idem_key = ?", (account_id, idem_key)).fetchone()
    if row is None:
        db.execute("INSERT INTO idempotency_keys VALUES (?, ?, ?, 'in_progress', ?, NULL)",
                   (account_id, idem_key, h, now + LEASE_S))
    elif row[0] != h:
        db.execute("COMMIT")
        return 422, "key reused with a different request"
    elif row[1] == "done":
        db.execute("COMMIT")
        return 200, json.loads(row[3])                      # replay the stored response
    elif row[2] > now:
        db.execute("COMMIT")
        return 409, "a request with this key is in progress"
    else:                                                   # lease expired: the last attempt died
        db.execute("UPDATE idempotency_keys SET locked_until = ? WHERE account_id = ? AND idem_key = ?",
                   (now + LEASE_S, account_id, idem_key))
    db.execute("COMMIT")
    # Phase 2: the external side effect, outside any transaction, with the same key downstream
    charge = processor.charge(f"{account_id}:{idem_key}", body["amount"])
    if crash_after_charge:
        raise RuntimeError("process died after charging, before recording the result")
    # Phase 3: record the effect and the response together
    response = {"payment": f"pay_{idem_key}", "charge": charge}
    db.execute("BEGIN IMMEDIATE")
    db.execute("INSERT OR IGNORE INTO payments VALUES (?, ?, ?, ?)",
               (response["payment"], account_id, body["amount"], charge))
    db.execute("UPDATE idempotency_keys SET state = 'done', response = ? "
               "WHERE account_id = ? AND idem_key = ?", (json.dumps(response), account_id, idem_key))
    db.execute("COMMIT")
    return 201, response

body = {"amount": 3000, "currency": "usd"}
try:
    create_payment(7, "order-7781", body, now=0, crash_after_charge=True)
except RuntimeError as exc:
    print("t=0 ", exc)
print("t=5 ", create_payment(7, "order-7781", body, now=5))     # 409: lease still held
print("t=31", create_payment(7, "order-7781", body, now=31))    # re-drive: processor returns ch_1 again
print("t=40", create_payment(7, "order-7781", body, now=40))    # 200: replayed
print("t=41", create_payment(7, "order-7781", {"amount": 30000, "currency": "usd"}, now=41))  # 422
print("charges:", processor.charges)                               # exactly one
```

It prints the crash, then 409 while the dead attempt's lease runs, then 201 with `ch_1` when the retry re-drives the charge (the processor recognises the key and returns the original charge), a 200 replay, a 422 for the changed amount, and one charge in total. The pieces that make it work: the claim is atomic, the key reaches the processor, and phase 3 records the payment and the response in one transaction. A sweeper that re-drives keys stuck `in_progress` past their lease closes the case where the client never retries.

```viz
{"type": "system", "scenario": "idempotency-key", "requests": 3,
 "title": "Three deliveries of one payment request", "caption": "The first request records the key and executes. The retries find the key, skip execution and return the stored response. The charge happens once regardless of how many times the request arrives."}
```

```exercise
id: idempotency-handler
title: Implement an idempotency-key handler
prompt: |
  Implement `handle_requests(events)`, processing events in order and returning
  one string per `"request"` event:

  - `["request", account, key, body_hash, now]`: keys are scoped by `account`.
    A key older than 86400 seconds (`now - created >= 86400`) is treated as absent.
    - Absent: record it as in progress with this `body_hash` and `created = now`; return `"execute"`.
    - Present with a different `body_hash`: return `"mismatch"`.
    - Present and in progress: return `"conflict"`.
    - Present and done: return `"replay:" + response`.
  - `["complete", account, key, response]`: mark the key done with `response`.
  - `["abort", account, key]`: the attempt failed before any side effect; forget the key.
languages: [python, javascript]
entry: handle_requests
starter:
  python: |
    def handle_requests(events):
        out = []
        # your code here
        return out
  javascript: |
    function handle_requests(events) {
      const out = [];
      // your code here
      return out;
    }
tests:
  - args: [[["request", 7, "k1", "h1", 0], ["complete", 7, "k1", "ch_1"], ["request", 7, "k1", "h1", 5]]]
    expected: ["execute", "replay:ch_1"]
    label: a retry after success replays
  - args: [[["request", 7, "k1", "h1", 0], ["request", 7, "k1", "h1", 1], ["complete", 7, "k1", "ch_1"], ["request", 7, "k1", "h1", 2]]]
    expected: ["execute", "conflict", "replay:ch_1"]
    label: concurrent duplicate
  - args: [[["request", 7, "k1", "h1", 0], ["complete", 7, "k1", "ch_1"], ["request", 7, "k1", "h2", 3]]]
    expected: ["execute", "mismatch"]
    label: same key, different body
  - args: [[["request", 1, "k", "h1", 0], ["request", 2, "k", "h1", 0], ["complete", 2, "k", "ch_2"], ["request", 1, "k", "h1", 1], ["request", 2, "k", "h1", 1]]]
    expected: ["execute", "execute", "conflict", "replay:ch_2"]
    label: keys are scoped by account
  - args: [[["request", 7, "k1", "h1", 0], ["abort", 7, "k1"], ["request", 7, "k1", "h1", 10]]]
    expected: ["execute", "execute"]
    label: an aborted attempt frees the key
  - args: [[]]
    expected: []
    label: no events
  - args: [[["request", 7, "k1", "h1", 0], ["complete", 7, "k1", "ch_1"], ["request", 7, "k1", "h1", 86399], ["request", 7, "k1", "h1", 86400]]]
    expected: ["execute", "replay:ch_1", "execute"]
    label: expiry at exactly 24 hours
    hidden: true
  - args: [[["request", 7, "a", "h1", 0], ["request", 7, "b", "h2", 0], ["request", 7, "a", "h9", 1], ["complete", 7, "b", "ch_b"], ["abort", 7, "a"], ["request", 7, "a", "h9", 2], ["request", 7, "b", "h2", 3], ["request", 7, "a", "h9", 4]]]
    expected: ["execute", "execute", "mismatch", "execute", "replay:ch_b", "conflict"]
    hidden: true
hints:
  - "Store per (account, key): the body hash, the state, the response and the creation time."
  - "Check expiry first, then the body hash, then the state; a mismatch is reported even while the original is still in progress."
```

## The "exactly once" illusion

No protocol delivers a message exactly once: any acknowledgement can itself be lost, and the sender must then choose between resending (a possible duplicate) and not (a possible loss). Systems offer **at-least-once delivery plus idempotent processing**, whose observable effect is exactly once. Kafka's exactly-once semantics are this: the idempotent producer (on by default since Kafka 3.0) tags batches with a producer ID and a per-partition sequence number so the broker drops resent duplicates, and transactions commit consumer offsets together with the output, which holds only while the sink is Kafka ([Exactly-once semantics](/learn/system-design/distributed-systems/exactly-once-semantics)).

## Deduplication in consumers

A queue consumer sees duplicates after a crash mid-batch, a visibility timeout that expired before the ack, or a rebalance. It needs the same discipline, keyed on an ID the producer assigned (event ID, or order ID plus event type):

| Approach | Survives failover | Window | Cost per message | Use when |
|---|---|---|---|---|
| Upsert on event ID in the sink (`INSERT ... ON CONFLICT (event_id) DO NOTHING`) | As the data | None needed | One index probe inside the write | The sink is a database you control; prefer it |
| Key table in the same database as the effect | As the effect | Chosen, e.g. 24 hours | One insert in the effect's transaction | Side effects in your own database |
| Redis `SET id 1 NX EX 86400` | No: asynchronous replicas can miss the last keys | Chosen by TTL | One ~0.5 ms round trip | Cheap, re-doable work |
| Bloom filter in front of an exact store | As the store | As the store | ~10 bits of memory per ID for 1% false positives | Millions of messages a second |
| Broker-side (SQS FIFO deduplication ID, Kafka idempotent producer) | As the broker | 5 minutes for SQS FIFO | None to you | Producer resends only, not consumer redelivery |

Whatever holds the IDs, the window must exceed the longest possible redelivery: a dead-letter queue replayed three days later sails past a one-day window. Size a store as rate × window × bytes per ID.

```viz
{"type": "system", "scenario": "bloom-filter", "keys": ["evt-1","evt-2","evt-3","evt-9"],
 "title": "Bloom filter as a dedupe pre-check", "caption": "A miss in the filter means the ID was never seen, so the consumer skips the exact lookup. A hit might be a false positive, so it is confirmed against the dedupe store before the message is dropped."}
```

## Retry storms, simulated

**Scenario A, a stall.** A dependency serves 1,000 requests a second (FIFO, 1 ms each) and stalls for 10 s at t = 10 s. Clients send 800 new requests a second, give up on an attempt after 1 s, and retry up to 3 times. Unless it is deadline-aware, the server keeps working on requests whose client has already left. Two minutes simulated:

| Policy | Peak offered load | Attempts, t = 10–60 s | Useful responses, t = 10–60 s | Goodput back to 95% |
|---|---|---|---|---|
| No retries | 850/s | 39,700 | 5,000 | t = 55 s |
| 3 retries, immediate | 3,287/s | 154,000 | 0 | Never, within 120 s |
| 3 retries, exponential backoff | 3,291/s | 153,000 | 0 | Never |
| 3 retries, backoff with full jitter | 3,290/s | 154,000 | 0 | Never |
| Jitter plus a 10% retry budget | 935/s | 43,700 | 0 | t = 86 s |
| No retries, server skips requests past their deadline | 850/s | 39,700 | 32,500 | t = 20 s |
| Jitter, budget and a deadline-aware server | 935/s | 40,500 | 32,600 | t = 20 s |

Read it row by row. Retries turned a 10-second stall into a permanent outage: offered load quadrupled, the backlog never drained, and every response arrived after its client had given up, so each "success" was wasted work that triggered another retry. That is a **metastable failure**: the trigger ended at t = 20 s and the overload sustained itself. Backoff and jitter did nothing here, because failures were already spread over time. The retry budget capped the amplification at 1.17× but the backlog of abandoned work still took a minute to clear. What restored service at t = 20 s was the server dropping requests whose deadline had passed, which is why deadlines must travel with requests (gRPC propagates them natively).

**Scenario B, a synchronised failure.** A server restart resets 2,000 clients at the same instant; the server accepts 1,000 requests a second (10 per 10 ms) and rejects the excess immediately; clients retry until they succeed, with backoff starting at 100 ms and capped at 5 s:

| Backoff | Attempts per client | Time until every client is served |
|---|---|---|
| Exponential, no jitter | 100.5 | 971 s |
| Equal jitter (half fixed, half random) | 5.1 | 5.6 s |
| Full jitter (uniform from 0 to the cap) | 5.2 | 5.7 s |
| Decorrelated jitter (random up to 3× the previous delay) | 4.1 | 4.3 s |

Without jitter the 2,000 clients stay in lockstep forever: every retry wave arrives in the same 10 ms, 10 succeed and 1,990 back off together. Any jitter breaks the lockstep; the floor is 2 s (2,000 clients at 1,000 a second). Jitter matters when failures are synchronised; budgets and deadlines matter when they are not.

```viz
{"type": "system", "scenario": "retry-backoff", "requests": 6,
 "title": "Backoff with and without jitter", "caption": "Synchronised retries arrive as a second spike on a dependency that has just failed. Jitter spreads them out so the dependency sees a smooth ramp rather than a wave."}
```

## Retry design

- **Retry in one layer per hop.** Client, gateway and service each retrying 3 times is $4^3 = 64$ attempts per user action on a dead dependency (27 if each layer makes three attempts in total). The service retries its own dependencies; the gateway passes failures through.
- **Retry only what can succeed.** Timeouts, 503, 429 with `Retry-After`, connection resets: yes. 400, 401, 404, 422: never. A 500 once, if the operation is idempotent.
- **Back off exponentially with jitter:** delay = random(0, min(cap, base × 2^attempt)).
- **Budget retries** at about 10% of requests, so a dead dependency sees 1.1× load, not 4×.
- **Propagate deadlines**, and never start an attempt that cannot finish before the caller gives up. [Timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff) covers timeout budgets.

## Under the hood: how real systems do it

| System | Mechanism |
|---|---|
| Stripe API | `Idempotency-Key` header up to 255 characters; saves the status code and body of the first request that started executing, including 500s, and returns them on retries; compares the parameters of retries and errors on a mismatch; keys may be pruned after 24 hours; a request that fails validation or collides with a concurrent one saves nothing |
| IETF `Idempotency-Key` draft | Standardises the header: 400 when a required key is missing, 422 when a key is reused with a different payload, 409 while the original is still processing |
| Postgres | A unique-index insert waits on a concurrent uncommitted insert of the same key, then fails or proceeds depending on that transaction's outcome (measured above) |
| AWS SDKs, standard retry mode | 3 attempts, exponential backoff with jitter, and a client-side retry quota (a 500-token bucket; each retry costs 5, a timeout retry 10), so a failing service drains the bucket and retries stop |
| gRPC | Retry policy per method in the service config, plus retry throttling: a token count that failures decrement and successes refill by `tokenRatio`; retries are allowed only while it is above half of `maxTokens` |
| Envoy | Retry budgets: retries limited to `budget_percent` of active requests (20% by default) with a floor of 3 concurrent retries |
| Kafka | Idempotent producer with per-partition sequence numbers, up to 5 in-flight batches per connection while keeping order |
| SQS FIFO | Deduplication on `MessageDeduplicationId` within a 5-minute interval |

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Double charge from layered retries | Two identical payments seconds apart | No key, or a new key minted per retry; reconcile against the processor | Client generates the key when the user taps Pay and reuses it on every retry; pass it to the processor |
| Key store lost on failover | Duplicates clustered around a Redis failover | Keys in an asynchronously replicated cache | Keys for money in the same database and transaction as the effect |
| Key reuse across tenants or payloads | A customer receives another customer's response | Keys from a per-process counter; no scoping or hash check | UUIDs or intent-derived keys, scoped by account, with request fingerprints |
| Stuck `in_progress` keys | Retries get 409 forever after a crash | The process died between the side effect and the record | Leases plus a sweeper that re-drives or reconciles with the provider |
| Metastable retry storm | Load stays at 3–4× after the trigger ends | Offered load far above user activity; server busy with requests whose clients left | Retry budgets, deadline propagation, load shedding |
| Idempotent in name only | Three confirmation emails for one order | A side effect outside the idempotent boundary | Key every side effect; the mail service dedupes on the same key |

## Interviewer follow-ups

**"The payment call timed out. What does your service do?"** Model answer: it does not guess. The key was generated when the user confirmed, claimed atomically, and passed to the processor. The retry replays with the same key: our table returns the stored response if we finished, the processor returns the original charge if it finished and we lost the response, and if neither finished it runs once. Keys stuck `in_progress` past their lease are re-driven or reconciled against the processor. Common wrong answer: "check whether a payment exists, then retry", which is the check-then-act race.

**"Why not have the queue deliver exactly once?"** Model answer: it cannot; a lost acknowledgement forces a choice between duplicate and loss. Kafka's version is producer deduplication plus transactional offsets and holds only into Kafka; for any other sink the consumer dedupes by producer-assigned ID or upserts. Common wrong answer: "turn on exactly-once in the client library".

**"Where do retries live in this architecture, and how many?"** Model answer: one layer per hop, with budgets. The service retries its database and cache calls; the gateway does not retry; the client retries the whole request up to three times with jitter, reusing the key. Deadlines propagate so a server can drop work nobody is waiting for; in the simulation that, not backoff, ended the storm. Common wrong answer: "every layer retries three times for resilience", which is 27 to 64 attempts.

**"How big is the key store, and what if it is unavailable?"** Model answer: about 370 bytes a key measured on Postgres, so 2,000 payments a second for 24 hours is ~64 GB live. If it is down, fail closed for payments (a retryable 503), because a duplicate charge is worse than a delayed one; fail open and log for cheap, re-doable work. Common wrong answer: "fall back to executing without the check".

## What mid-level engineers get wrong

- Deduplicating with a `SELECT` before the `INSERT`.
- Generating a fresh key per retry attempt, which dedupes nothing.
- Holding a database transaction open across the external call.
- Not passing the key to the downstream provider, so a crash after the charge double-charges on re-drive.
- Retrying 400s, or retrying at every layer.
- Believing jitter fixes every retry storm; without budgets and deadlines a stall can become permanent.
- A dedupe window shorter than the dead-letter queue's replay delay.

## Senior signals

- You start from the three outcomes of a timeout and design for not knowing which happened.
- You claim keys with a unique constraint, scope them by caller, fingerprint the body, and lease in-progress keys.
- You split the handler into atomic phases around the external call and pass the key downstream.
- You say "exactly once" only as at-least-once plus idempotent processing.
- You retry in one layer with jitter, a budget and propagated deadlines, and can explain a metastable retry storm with numbers.
- You size key stores and dedupe windows from rate × window × bytes, with the window longer than any redelivery. The [payment system case study](/learn/system-design/case-studies/payment-system) puts these together.

## Check yourself

```quiz
- q: >-
    A client sends POST /orders with idempotency key K, times out after 2 s, and retries at 2.1 s while the first attempt is still executing. The server should:
  options: ["Return the stored response for K from the first attempt", "See K marked in progress; return 409 or wait for the first", "Reject the retry with 400, because a key may be used only once", "Execute the second request too, since the first has not completed"]
  answer: 1
  explanation: >-
    The atomic claim makes the second attempt find an in-progress record, so it returns 409 (with Retry-After) or waits. Executing it would create two orders; there is no stored response yet; and reusing a key on retry is exactly what keys are for.
- q: >-
    Two sessions each run SELECT to check for an existing payment with key K, find none, and then insert and charge. What prevents the double charge?
  options: ["Running both sessions at the default read-committed isolation level", "Adding a short sleep between the SELECT and the INSERT", "A unique index on the key, claimed by the INSERT itself", "Retrying the SELECT until it returns the same count twice"]
  answer: 2
  explanation: >-
    Check-then-act is a race: both SELECTs can run before either INSERT, which the Postgres experiment reproduced. A unique index makes the claim atomic; the second INSERT waits for the first transaction and then fails or returns no row. Sleeps and repeated SELECTs only move the window.
- q: >-
    A payment handler charges the processor, then crashes before recording the result. The client retries with the same key after the lease expires. What prevents a second charge?
  options: ["The processor dedupes on the same key and returns the original charge", "The database transaction around the charge is rolled back on the crash", "The lease blocks the retry permanently until someone intervenes", "The retry sees state done and replays the stored response"]
  answer: 0
  explanation: >-
    The side effect happened outside any transaction, so nothing rolled it back and our table still says in progress. Passing the idempotency key to the processor makes the re-driven charge return the original charge. The lease only delays the retry; the state is not yet done.
- q: >-
    In the simulated 10-second stall, three retries with exponential backoff and full jitter never recovered, while a deadline-aware server with no retries recovered as soon as the stall ended. What was sustaining the outage?
  options: ["Jitter spreading the retries too thinly across time", "Too few retries per request to get through the backlog", "The server's backlog of requests whose clients had left", "The retry budget throttling legitimate first attempts"]
  answer: 2
  explanation: >-
    The server kept processing requests whose 1 s deadline had passed, so every response was late, every attempt timed out and was retried, and offered load stayed near four times capacity: a metastable failure. Dropping expired requests at the server let fresh requests through immediately. Jitter made no difference because the failures were not synchronised.
- q: >-
    2,000 clients are disconnected at the same instant and retry with exponential backoff but no jitter against a server that admits 1,000 requests a second. What happens?
  options: ["They stay in lockstep, so each wave mostly fails again", "They finish in about 2 s, the capacity limit", "They finish faster than with jitter, since delays are shorter", "They spread out naturally after the first retry"]
  answer: 0
  explanation: >-
    Identical deterministic delays keep every client synchronised, so each retry wave lands in the same instant and only the capacity of that instant succeeds; in the simulation it took 971 s and about 100 attempts per client. Any jitter broke the lockstep and finished in 4–6 s.
- q: >-
    A consumer's dedupe store keeps event IDs for 24 hours. The dead-letter queue can replay a message after 3 days. What is the risk?
  options: ["None; the dead-letter queue deduplicates replays on its own", "The dedupe store fills up because replays extend the window", "The consumer rejects the replay as expired and drops it", "The replay looks new and its effect is applied twice"]
  answer: 3
  explanation: >-
    Once the ID has expired, the consumer has no memory of it and treats the replay as new. The window must exceed the longest possible redelivery delay, or the effect must be idempotent by construction (an upsert on event ID), which needs no window.
```
