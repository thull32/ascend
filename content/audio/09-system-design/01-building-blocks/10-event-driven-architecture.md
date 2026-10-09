---
lesson: event-driven-architecture
source: f52949d2706cefe7
fit: great
desk:
  - "The event-sourcing fold, the projection rebuild and the optimistic-concurrency traces"
  - "The Postgres event store and the bigserial commit-order trace"
  - "The saga crash trace and the outbox relay-crash trace, with the outbox code"
  - "The compatibility-mode table and the three-consumer schema change trace"
  - "Exercise: rebuild account balances from an at-least-once event log"
---
## Introduction

The order service saves an order and then publishes "order placed" to Kafka. One afternoon the broker is slow, and the publish times out after the database commit has already succeeded. The order exists, fulfilment never hears about it, and the customer gets a receipt for something that will not ship. Reverse the two steps and you get the opposite bug: an event announcing an order whose insert was then rolled back.

This is the dual-write problem, and any architecture that says "write to the database and publish an event" has it until it is designed away. Event-driven architecture is worth its complexity because a new consumer can subscribe without the producer knowing, so teams evolve independently. That independence is only real if events are reliably produced, arrive in an order consumers can rely on, and can change shape without breaking everyone downstream.

So: what an event should carry, event sourcing and its costs, sagas, the outbox that fixes the dual write, and schemas that survive change.

## Events, commands, and what they carry

An event is a fact about the past, like "payment captured". Its producer does not know who consumes it, and nobody can reject it; it already happened. A command is a request, like "reserve inventory". It has one intended handler, which may refuse it. A producer that emits "events" which are really instructions to one service couples them as tightly as a remote call, while hiding the coupling. "Send welcome email" is a command in disguise.

Events come in three styles. A notification carries just an ID, and the consumer calls back for details, so a burst of events becomes a burst of API calls, and the consumer depends on the producer being up. Event-carried state transfer sends the full snapshot: a 1 kilobyte order at 500 orders a second is 500 kilobytes a second, and it removes the callback entirely. That is the usual choice between services. And event sourcing, where the log of every change is the store itself, is a storage decision inside one service.

## Event sourcing, and what it costs

An event-sourced account stores no balance. It stores facts: opened with 100, deposited 50, withdrew 30, deposited 10. The balance is computed by replaying them, 130. A command to withdraw 200 is rejected, and no event is written. To keep loading cheap, a snapshot every few hundred events records the balance and version, so a load reads the snapshot and only the events after it.

The numbers. A fold over in-memory events measured 100 nanoseconds an event, and 830 once each event was decoded from JSON, so decoding, not applying, dominates. A 5-million-event stream costs seconds of CPU per load, which is what snapshots prevent. And storage: a thousand 300-byte events a second is 26 gigabytes a day, 9.5 terabytes a year, append-only.

Concurrency is handled at append. The store has a unique constraint on stream and version. Two handlers both load the account at balance 115, version 6. One withdraws 100 and appends at version 7. The other tries to withdraw 50, and also appends at version 7. What happens?

[pause]

The second append hits the unique constraint. It reloads, sees a balance of 15 at version 7, and rejects the withdrawal. Without the version check, both appends succeed and the balance becomes minus 35. The conflict is the invariant being enforced.

Read models come from projectors, which read the event log in order and record a checkpoint. A projector is at-least-once, like any consumer, so it stores the stream version on each row and skips an event it has already applied. And there is a trap if the log is a Postgres table with an auto-incrementing position: positions are assigned at insert, not at commit. If position 101 commits before 100, the projector reads 101, moves its checkpoint past 100, and never sees it. A few balances are then permanently wrong. Read only below the oldest in-progress transaction, or tail the write-ahead log, which is in commit order.

Splitting the write model from the read models is called CQRS, command query responsibility segregation, and it does not require event sourcing. Most teams that need it want an ordinary write side with change data capture feeding the read models. Event sourcing without a real need for history is the most expensive way to build CRUD. Use it where the history is the product: ledgers, licences, workflows.

## Choreography, orchestration and the saga

Take order fulfilment: reserve inventory, capture payment, create shipment, send confirmation. In choreography, each service reacts to events and emits its own, and the flow emerges from the subscriptions. In orchestration, a coordinator, the order saga, issues commands and records each outcome in its own table.

Choreography suits fan-out to independent consumers: analytics, search, notifications. But ask "where is order 7781?" and you trace it across five services, and compensation means every service listening for every later failure. A multi-step flow that must be undone on failure is a saga, and it wants an owner.

Here is why the persisted state matters. The saga reserves inventory, then sends capture payment with a key derived from the saga and the step, and crashes before recording the reply. On restart it reads its own state, inventory reserved, and sends capture payment again with the same key. The payment service returns its stored result, declined, instead of charging again. The saga releases the inventory and marks the order failed. That works only because the key was derived, not generated per attempt.

## The dual write and the outbox

Back to the opening. The database and the broker are two systems with no transaction spanning both. The transactional outbox takes the broker out of the transaction: the service writes the order and an outbox row in one local transaction, and a separate relay publishes the outbox.

Trace a relay crash. The order and outbox row commit together. The relay publishes the event, the broker acknowledges, and then the relay crashes before marking the row published. A new relay finds the row still unpublished and publishes it again. Now the topic holds the event twice. The consumer reads the first copy, applies it and records its ID in one transaction, and skips the second. So delivery is at least once, and the outbox row's ID is the event ID consumers dedupe on. Kafka's idempotent producer does not save you here, because the restarted relay is a new producer with a new producer ID.

Two ways to run the relay. A polling relay selects unpublished rows every 100 milliseconds, adding up to 100 milliseconds of latency, and inherits the same commit-order trap as the projector. A change-data-capture relay, Debezium for example, tails the write-ahead log, in commit order, with tens of milliseconds of latency.

Ordering is per key: partition by the aggregate ID, so events for one order arrive in order. Across aggregates nothing is ordered, so a payment can arrive before its order. Treat that as a temporary state, and buffer it, not as an error.

## Schemas that survive change

An event's schema is a public API with consumers you cannot deploy in lockstep. Registries name the compatibility modes by which side may upgrade first. Backward means readers on the new schema can read old data, so consumers deploy first. Forward means readers on the old schema can read new data, so producers deploy first. Full means both. A topic with many consumer teams cannot choose a deploy order, so it runs full, and full transitive if anyone replays from the beginning. An event-sourced store cannot migrate at all: its events are immutable and replayed forever, so an old version is upcast to the new shape at read time, and every upcaster ever written stays in the codebase.

The lesson traces one change through three consumers. The total field has always meant US dollars, and the business adds other currencies. Version two adds an amount in minor units, defaulting to null, and a currency, defaulting to "USD". Old records read with the new schema get USD, which is true of every one of them. That is the first lesson: a default is a claim about old data. A default of zero would have turned years of history into free orders on the next replay.

Later, total gets a default of zero, and then it is deleted, and the registry accepts both. A consumer built against the schema with the default, that still reads total, now scores every order at zero dollars. No decode error, anywhere. Full compatibility guarantees decoding, not meaning. So gate a delete on evidence that no consumer still reads the field, such as each consumer group reporting its schema version, not on the registry's green light. And the only consumer that needed nothing at any step was the tolerant reader, which reads the fields it needs and ignores the rest.

Every event also carries an envelope: an event ID to dedupe on, a correlation ID shared by every event in a flow, and a causation ID naming the event that caused this one. When two services copy each other's customer data and loop, the shared correlation ID and a climbing causation depth make the loop visible. Two guards stop it: never emit an event for an update that changed nothing, and cap the depth at around ten, parking anything past it with an alert.

## In the interview

The opening story is the opening question. The order service commits and then publishes to Kafka. What is wrong?

[pause]

Two systems, no shared transaction. A failed publish after the commit loses the event, and publishing first announces orders that may roll back. Write the event to an outbox in the same transaction, relay it, ideally through change data capture, and dedupe consumers on the outbox ID. The wrong answer is "retry the publish until it succeeds", which still loses the event when the process dies between the commit and the retry.

And the follow-up that catches people: the registry accepted the change, so it is safe to deploy, right? No. The registry checks that bytes decode, not that they mean what readers assume. Deleting a field that gained a default passes full compatibility, and a consumer still using it silently reads the default. Before a delete, you want each consumer group's reader schema version, and defaults that are true of every old record, or that explicitly mean absent.

## Recap

Five things to remember. Name the dual-write problem and fix it with an outbox or change data capture, knowing a relay crash produces a duplicate the consumer must absorb by event ID. Send event-carried state between services, and keep commands out of events. Event sourcing is a storage decision with a lasting cost, snapshots, upcasters and projections, and most teams want CQRS fed by change data capture instead. Orchestrate sagas, with step keys derived from the saga, and use choreography for independent side consumers. And treat a schema change as a migration across named consumers: full compatibility, defaults that are true of old data, deletes gated on reader telemetry, and tolerant readers.

At your desk: the event-sourcing and projection traces, the commit-order trap, the saga and outbox traces with the code, the schema change across three consumers, and the projection-rebuild exercise.
