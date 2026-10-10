---
lesson: connection-management
source: 5cf85ff785f48b25
fit: great
desk:
  - "The connect-per-query and throughput-by-concurrency tables"
  - "This app's connect_db function and its settings table"
  - "The connection budget formula and the instances-and-surge table"
  - "The transaction pooling trace and the PgBouncer configuration"
  - "Exercise: size a pool and check it against the database"
---
## Introduction

The week before a big launch, the team raises the API's autoscaling ceiling from 6 pods to 24. Each pod runs a connection pool with a maximum of 20. On launch morning traffic climbs, the autoscaler adds pods, and the new pods fail their readiness checks with "sorry, too many clients already".

Postgres is configured for 200 connections, and 24 times 20 is 480. The autoscaler sees unhealthy pods and adds more. The database spends its CPU accepting and rejecting connections, and latency rises for every pod, including the healthy ones. Scaling out made the outage worse, because the resource that ran out was not CPU on the API tier. It was connections to the database, and nobody had written down how many there were.

Connections are usually the first database resource to run out, and the arithmetic is short enough for a whiteboard. Four ideas: what a connection costs, how a pool queues work, how to size it against the database's budget, and what a server-side pooler like PgBouncer breaks.

## What a connection costs

Postgres uses a process per connection. When a client connects, the server forks a backend that serves that one client for its whole session. It is robust, since a crash in one backend cannot corrupt another's memory, and it is expensive in three ways.

Setting one up is slow relative to a query. Over TCP with password authentication, a new connection took 4.7 milliseconds in the lab, against 0.16 milliseconds for a primary-key query on an open one. A pooled connection served about 7 thousand queries a second from one client. Connecting per query cut that to 180. That is 39 times fewer, before adding any network distance.

Keeping one open costs memory. A fresh backend held about 1.3 megabytes. After one query on a table with a thousand partitions it held 12, and it stays that way until the connection closes. Five hundred long-lived connections can hold several gigabytes that would otherwise be page cache.

And many active connections do not do more work. On a 32-core machine, single-row updates climbed with concurrency to a peak of about 130 thousand a second at 32 clients. Then, before you guess: what happens at 90 clients?

[pause]

Throughput falls. At 90 clients it was 37 percent below the peak, and each update took four and a half times longer. Past the core count, extra backends only add contention for CPU, locks and buffer-pool latches. A widely quoted starting point for actively running connections is about twice the core count plus the number of disks, but treat that as the first point on a curve you measure.

The conclusion holds either way. If 400 requests want the database at once, it is better for 360 of them to wait in a queue you control, with a timeout and a metric, than inside Postgres, where they slow each other down. That queue is the connection pool.

## How a pool works, and this app's pool

A pool keeps a set of open connections and lends them out. Code acquires one, runs a query, and releases it. If none is free and the pool is below its maximum, it opens a new one; at its maximum, the caller waits. A pool is a counting semaphore guarding a set of connections.

This app builds one pool per API process at startup and shares it with every service. Its maximum comes from configuration: 20 by default, 15 in production. It keeps two connections warm while idle. An acquire waits at most 5 seconds before failing. Idle connections close after 5 minutes, and every connection is retired after 30 minutes, which bounds server-side memory growth and lets the pool find a new primary after a failover. And it pings only connections idle for over a minute, instead of on every checkout.

That last setting matters because of how the app uses the pool. Each query acquires a connection, runs, and releases it. Four sequential queries in one request are four separate acquires. Only a transaction holds one connection across statements. So the unit of pool usage is the query, not the request, and a ping on every checkout would have cost four extra round trips for that request.

The first version of this code waited 10 seconds to acquire, set what looked like two timeouts that were really one knob set twice, and pinged on every checkout. Ten seconds is too long: when the pool is exhausted, clients time out first and retry, adding more waiters exactly when the database can least drain them. Five seconds fails sooner and sheds load. The general lesson: every pool setting is a timeout or a budget, so choose each against a number you can name, write it beside the setting, and keep the acquire timeout well inside the request's own deadline.

## Sizing with Little's law

Little's law says the average number of items in a stable system equals the arrival rate times the time each one spends inside. For a pool: connections in use equals the acquire rate times the hold time.

Work it for this app. One instance serves 300 dashboard loads a second at peak. Each load runs six sequential queries, and each query holds a connection for about 1.3 milliseconds. That is 1,800 acquires a second, times 1.3 milliseconds: about 2.3 connections in use on average. A pool of 20 is enormous for that load.

That arithmetic also shows what really empties pools. It is rarely a traffic spike. It is the hold time. If a missing index makes one of those six queries take 400 milliseconds instead of 1, that query alone needs 300 times 0.4: 120 connections. The pool of 20 is exhausted in milliseconds, and every endpoint that touches the database starts queueing, including the ones that have nothing to do with the slow query.

So the procedure: measure hold time per acquire, at the median and the 99th percentile. Multiply by the peak acquire rate. Add a burst factor, two times is common. Divide across instances. And then check the result against the database's budget.

## The connection budget

Postgres has a hard limit of 100 connections by default, with 3 reserved for administrators. Every client draws from the rest: every API instance's pool at its maximum, workers, cron jobs, the migration runner, dashboards, the session someone left open. Pools grow lazily, so this budget is never tested in normal operation. It is tested at peak, which is exactly when the autoscaler is adding instances.

The constraint to write down: the per-instance pool maximum, times the maximum number of instances plus the deploy surge, must fit in what is left. The surge matters because a rolling deploy runs old and new pods side by side.

With a pool of 20 and 97 usable slots: two instances plus one during a deploy is 60, fine. Four instances with no surge is 80, fine. Four plus one during a deploy is 100, and the deploy itself can exhaust the database, even though average usage is about two connections per instance.

This app met that question when it planned a second replica. The pool size became configuration, set to 15 in production, so two replicas plus two more during a deploy hold at most 60. At boot the app reads the server's limit and current connections, and warns if its pool would leave less than 10 of headroom. Past about four replicas, the plan is to add a pooler.

There are two real fixes: shrink the per-instance pool, since the arithmetic says 8 would be plenty, or put a server-side pooler in front. Raising the database's limit to a thousand is the tempting third option. It moves the failure from "cannot connect" to "connected and slow", because the extra connections compete for the same cores.

## PgBouncer and transaction pooling

PgBouncer is a small proxy that speaks the Postgres protocol. It holds thousands of cheap client connections, because it is a single-threaded event loop rather than a process per connection, and a small pool of real server connections. It assigns server connections only while clients need them, and when it does that is the pool mode.

Session mode holds a server connection for the client's whole session: it only saves setup. Statement mode releases after every statement and refuses multi-statement transactions. Transaction mode is the useful one: a server connection is held for one transaction, then returned, so 2,000 clients can share 40 server connections.

Why 40 is enough is Little's law again. Two thousand clients, each running 5 transactions a second that spend 2 milliseconds inside the database, need 20 busy server connections on average.

The sharp edge: between your transactions, your next statement may run on a different server connection. Anything stored on the connection is gone, or worse, visible to another client. Picture client A setting a session variable on server connection one, then committing. Client C picks up connection one and inherits A's setting, while A's next statement runs on connection two, where the setting does not exist.

So transaction mode breaks session-level settings, session advisory locks, listen and notify, temporary tables, and named prepared statements. That last one bites Rust services: sqlx prepares every query as a named statement, and behind an older PgBouncer you get "prepared statement does not exist" errors. PgBouncer 1.21 and later can track prepared statements itself; on older versions, disable the driver's statement cache. The fixes for the others: set local inside the transaction, or set it per role, and use transaction-scoped advisory locks.

With PgBouncer in front, 24 pods times 20 is 480 client connections, which is fine, because only 40 hold a real backend at any moment. The queue moves to PgBouncer, and the numbers to alert on are clients waiting and how long the oldest has waited. It does add a hop, and one more thing that can fail, so it needs redundancy.

## Timeouts, layered

Every layer between the user and the disk needs a timeout, and inner layers must give up before outer ones. If the handler's deadline is 2 seconds but the statement timeout is unlimited, a slow query keeps running after its caller has gone, and during an incident the database fills with zombie queries whose results nobody will read.

Starting points for an interactive API: an acquire timeout of half a second to 2 seconds. A statement timeout of 1 to 5 seconds for the API's role, with a separate role for batch work. A lock timeout of 1 to 2 seconds, lower in migrations. And an idle-in-transaction timeout of 10 to 60 seconds, for forgotten transactions that pin locks and vacuum.

When you look at the database's live connections grouped by state, idle ones are pool slack, active ones are working, and "idle in transaction" ones are application bugs, usually a transaction held open across something slow, like an HTTP call to another service. On the application side, the earliest warning you get is acquire wait time climbing from microseconds to milliseconds, usually minutes before anything times out.

## In the interview

A follow-up the lesson expects. The pool is exhausted. Is it too small?

[pause]

Usually not. Check whether the hold time rose first: a slow query, or a transaction held across a network call. Arrival rate times hold time grew through the hold time. The wrong answer is "double the pool", which spreads the same slow query over more connections and more contention.

And: how big should the pool be? Measure hold time and peak acquire rate, apply Little's law with a burst factor, divide by instances, then check the total against the database's limit including deploy surge, keeping active connections near a small multiple of the database's cores. Do not say "as large as possible so requests never wait". That moves the queue into Postgres, where it costs throughput.

## Recap

Five things to remember. A Postgres connection is a process: milliseconds to open, megabytes to hold, and throughput falls once active connections pass the core count. Connections in use equal acquire rate times hold time, and pools are emptied by hold time growing, not by traffic. Write the connection budget down, at maximum pool size, with deploy surge, and never fix it first by raising the limit. Transaction-mode PgBouncer multiplexes thousands of clients onto a few backends, and breaks anything that lives on the session. And layer timeouts so the inner ones fire first.

At your desk: the cost and concurrency tables, this app's pool code, the budget formula and its table, the transaction pooling trace with the PgBouncer configuration, and the pool sizing exercise.
