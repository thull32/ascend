---
lesson: connection-management
source: 31e48b51218e1ffe
---
## 1

An API has 12 instances, each with a connection pool of at most 25, against a Postgres limit of 200 connections. Average pool usage is 3 per instance. Why might this still fail?

A, it cannot; average usage is 36 connections, far below the limit of 200. B, under load every pool can fill to 25, and 12 times 25 is 300, which exceeds 200. C, idle connections time out and reconnect so often that slots run out. D, Postgres refuses any client pool configured above 20 connections.

[think]

The answer is B: under load every pool can fill to 25, and 300 exceeds 200.

The budget must hold at the maximum, not the average. Load spikes and slow queries push every pool to its cap at the same moment, and a rolling deploy adds more pools on top, so at peak new connections are refused. The average of 36 says nothing about that moment. Shrink the pools to fit the budget, or put a server-side pooler in front.

## 2

A service handles 800 requests a second. Each request runs 3 queries, and each query holds a connection for 2 milliseconds. Roughly how many connections are in use on average?

A, about 1.6. B, about 48. C, about 800. D, about 4.8.

[think]

The answer is D: about 4.8.

Little's law: connections in use are acquisitions per second times hold time. That is 2,400 acquisitions a second, times 2 thousandths of a second, which is 4.8. With a burst factor of 2, you might provision around 10 across all instances. If the hold time grows to 200 milliseconds, the same load needs 480.

## 3

After moving behind PgBouncer in transaction mode, a Rust service using sqlx logs that its prepared statement, s 4, does not exist. What is happening?

A, the driver's statement cache is too small, and evicts statements early. B, a migration that creates the service's prepared statements did not run. C, PgBouncer rejects the extended query protocol, so every prepare fails. D, a statement prepared on one server connection runs on another.

[think]

The answer is D: a statement prepared on one server connection runs on another.

Named prepared statements are session state on a server connection. In transaction mode, consecutive transactions can land on different server connections, and the new one has never seen that statement. A small cache would only cause re-preparing on the same connection, not this error. Fix it with PgBouncer's maximum prepared statements setting, from version 1.21, which tracks and re-prepares protocol-level statements, or by disabling the driver's statement cache.

## 4

Why is raising the connection limit from 200 to 2,000 usually the wrong fix for too-many-clients errors?

A, extra backends use memory and add contention, not throughput, so the database gets slow. B, Postgres caps the limit at 1,000, so the new value is silently ignored. C, the superuser reservation grows with the limit, so few slots are gained. D, changing it needs a restart, which is never acceptable for a busy production database.

[think]

The answer is A: extra backends add memory and contention, not throughput.

Connections are not free capacity. Each is a process with its own memory, and active connections beyond a small multiple of the core count compete for the same CPUs and locks, so the failure turns from refused connections into a slow database. A restart is a real cost, but a schedulable one, not the reason. Queueing in a pool or PgBouncer, with timeouts, keeps the number of active queries near what the hardware can execute.

## 5

An HTTP handler has a 2-second deadline. The pool's acquire timeout is 10 seconds, and there is no statement timeout. What happens during a slow-query incident?

A, requests fail after 2 seconds, which frees their connections so the database recovers. B, the pool cancels any query that outlives its 10-second acquire timeout. C, nothing unusual; each timeout guards a different layer, so they never interact. D, waits and slow queries continue after callers give up, keeping the database loaded.

[think]

The answer is D: waits and slow queries continue after the callers give up.

Outer timeouts shorter than inner ones create work nobody wants. Requests keep waiting up to 10 seconds for a connection after their callers have gone, and slow queries run to completion with no one to read the results. The acquire timeout bounds waiting for a connection, not query runtime. It should sit well inside the request deadline, and a statement timeout should cancel queries whose callers cannot use the result.

## 6

A serverless function opens a new Postgres connection over TCP, with SCRAM authentication, for each request, and runs one query of 0.16 milliseconds. The measured connection setup is about 4.7 milliseconds. What is the most effective change?

A, switch from SCRAM to MD5 authentication, which removes the cost of connecting. B, cache query results in the function's memory, so that fewer queries are needed. C, raise the connection limit, so that each function instance can keep its own connection. D, put a pooler, such as PgBouncer or RDS Proxy, between the functions and Postgres.

[think]

The answer is D: put a pooler between the functions and Postgres.

Connection setup is about 30 times the query itself, so each request pays mostly for the process fork, the handshake and authentication. A pooler keeps server connections open and hands them out per transaction, so the per-request cost becomes a cheap client connection to the pooler. A higher limit makes the database slower under concurrency, MD5 is weaker and still pays for the fork and TCP setup, and a per-instance cache does not survive short-lived function instances.
