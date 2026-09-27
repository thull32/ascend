---
slug: connection-management
title: "Connection management: pools, PgBouncer and the max_connections arithmetic"
description: What a Postgres connection costs, how an application pool queues work (with this app's SeaORM pool as the worked example), how to size pools with Little's law and the max_connections budget, what PgBouncer's pool modes break, and how to layer timeouts.
minutes: 31
difficulty: medium
tags: [connection-pooling, pgbouncer, postgres, timeouts, capacity-planning, sqlx, seaorm]
---
The week before a big launch, the team raises the API's autoscaling ceiling from 6 pods to 24. Each pod runs a connection pool with a maximum of 20. On launch morning traffic climbs, the autoscaler adds pods, and new pods start failing their readiness checks with:

```text
FATAL:  sorry, too many clients already
```

Postgres is configured for 200 connections, and 24 × 20 is 480. The autoscaler sees unhealthy pods and adds more. The database spends its CPU accepting and rejecting connections. Latency rises for every pod, including the healthy ones. Scaling out made the outage worse, because the resource that ran out was not CPU on the API tier. It was connections to the database, and nobody had written down how many there were.

Connections are usually the first database resource to run out, and the arithmetic for managing them is short enough to do on a whiteboard. This lesson walks through it with this app's own pool configuration as the example.

## What a Postgres connection costs

Postgres uses a process per connection. When a client connects, the postmaster forks a backend process that serves that one client for its whole session. That design is robust (a crash in one backend cannot corrupt another's memory) and expensive in three ways.

**Setting one up is slow relative to a query.** A new connection costs a TCP handshake, a TLS handshake, the startup message, a SCRAM authentication exchange of two more round trips, a `fork()`, and backend initialisation. In the same region that adds up to a few milliseconds, and across regions it is tens of milliseconds. A primary-key lookup takes a fraction of a millisecond. Opening a connection per request would make connection setup the dominant cost of most requests.

**Keeping one open costs memory.** Each backend has private memory: a few megabytes at rest, growing as it caches catalogue metadata, plus up to `work_mem` for *each* sort or hash node in whatever query it is running. Five hundred mostly idle connections can hold several gigabytes of RAM that would otherwise be page cache.

**Many active connections do not do more work.** A database with 16 cores can execute about 16 things at once. Past a small multiple of the core count, additional active connections add contention (for CPU, for locks, for buffer-pool latches) without adding throughput, so latency rises while throughput stays flat or falls. A widely quoted starting point, from the PostgreSQL wiki via the HikariCP documentation, is:

$$ \text{active connections} \approx 2 \times \text{cores} + \text{effective spindles} $$

For a 16-core server on SSDs, that suggests somewhere around 32–40 connections actively running queries. Treat it as a starting point for measurement, not a law. The practical conclusion holds either way: if 400 requests want the database at once, it is better for 360 of them to wait in a queue *you* control, with a timeout and a metric, than inside Postgres, where they all slow each other down.

That queue is the connection pool.

## How an application pool works

A pool keeps a set of open connections and lends them out. Code asks the pool for a connection (*acquire*), runs a query, and returns it (*release*). If none is free and the pool is below its maximum, it opens a new one; if it is at its maximum, the caller waits.

A pool is a counting semaphore guarding a set of connections:

```viz
{"type": "concurrency", "scenario": "semaphore", "threads": 6, "permits": 2,
 "title": "A connection pool is a counting semaphore",
 "caption": "Six request handlers compete for two connections. Acquire takes a permit or joins a FIFO wait queue; release hands the connection to the next waiter. The wait queue is where latency goes when the pool is too small or queries are too slow, and the acquire timeout bounds how long anyone waits in it."}
```

This app creates its pool once at startup in `crates/api/src/state.rs`:

```rust
pub async fn connect_db(config: &Config) -> anyhow::Result<DatabaseConnection> {
    let mut opts = ConnectOptions::new(config.database_url.expose_secret().to_string());
    opts.max_connections(20)
        .min_connections(2)
        .connect_timeout(Duration::from_secs(10))
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .sqlx_logging(false);
    let db = Database::connect(opts).await?;
    Ok(db)
}
```

SeaORM's `DatabaseConnection` wraps an sqlx `PgPool`, and `AppState` clones that handle into every service: comments, progress, auth, submissions, the AI budget tracker. So each API process has exactly one pool of at most 20 connections, shared by every request it serves. Here is what each setting does, including the ones the code does not set.

| Setting | Value here | Effect |
|---|---|---|
| `max_connections` | 20 | At most 20 open connections from this process. The 21st concurrent acquire waits. |
| `min_connections` | 2 | Keep two connections open while idle, so the first requests after a quiet period skip connection setup. |
| `connect_timeout` / `acquire_timeout` | 10 s / 10 s | How long an acquire may wait, including opening a new connection. In SeaORM 2 both map onto sqlx's single acquire timeout (the second call wins), so they are one knob set twice. |
| `idle_timeout` | 300 s | Close connections idle for five minutes, down to the minimum. |
| `max_lifetime` | not set (sqlx default: 30 min) | Retire every connection after 30 minutes. This bounds server-side memory growth and lets a pool drift back to a new primary's address after a DNS change. |
| `test_before_acquire` | not set (default: on) | Before handing out an idle connection, send a protocol-level ping and wait for the reply. That is one extra round trip on every acquire. SeaORM 2 also offers `test_before_acquire_if_idle_for`, which only pings connections that have been idle past a threshold. |

One detail about how SeaORM uses the pool matters for sizing. When a service method runs `Comments::find()...all(&self.db)`, the query acquires a connection, runs, and releases it. Four sequential queries in one request are four separate acquires, and between them the connection goes back into the pool. Only a transaction (`self.db.begin()`) holds one connection across several statements. So the unit of pool usage in this app is the *query*, not the request.

### A critique worth making

A 10-second acquire timeout is generous for an interactive API. When the pool is exhausted (say, because one slow query pattern is holding connections), every new request waits up to 10 seconds before failing, holding its Tokio task and its HTTP connection. Clients time out first and retry, adding more waiters. A shorter acquire timeout (a second or two, returning a 503) fails fast and sheds load while the cause is fixed, at the cost of spurious failures during very brief spikes. The rule is that the acquire timeout must be well inside the request's own deadline. Neither choice is wrong in general. Choosing without thinking is.

## Sizing a pool with Little's law

Little's law says that in a stable system, the average number of items inside it equals the arrival rate times the average time each item spends inside:

$$ L = \lambda \times W $$

For a pool, `L` is the average number of connections in use, `λ` is the rate of acquires, and `W` is how long each is held.

Work it for this app. Suppose one API instance serves 300 dashboard loads a second at peak, and each load calls `ProgressService::summary`, which runs four sequential queries (lesson progress, module preferences, solved problems, quiz attempts). Each query holds a connection for about 1.3 ms: a 0.3 ms ping from `test_before_acquire` plus roughly 1 ms to send the query, execute it and read the rows.

- Acquire rate: 300 × 4 = 1,200 per second.
- Hold time: 1.3 ms = 0.0013 s.
- Connections in use on average: 1,200 × 0.0013 ≈ 1.6.

A pool of 20 is enormous for that load. At 100% utilisation it could sustain 20 / 0.0013 ≈ 15,000 acquires per second; queueing theory says waits climb steeply above roughly 70–80% utilisation, so call it 10,000.

That calculation also shows what really empties pools. It is rarely a traffic spike. It is `W`. If a missing index makes one of the four queries take 400 ms instead of 1 ms, that query alone needs 300 × 0.4 = 120 connections. The pool of 20 is exhausted in milliseconds and every endpoint that touches the database starts queueing, including ones that have nothing to do with the slow query. A pool is a bulkhead that turns one slow query into a site-wide latency problem unless you protect it with `statement_timeout`.

The sizing procedure, then:

1. Measure hold time per acquire at p50 and p99, not just the average.
2. Compute `λ × W` at peak, and multiply by a burst factor (2× is common) for variance.
3. Divide across instances.
4. Check the result against the database's budget, which is the next section.

## The max_connections budget

Postgres has a hard limit, `max_connections` (100 by default), of which `superuser_reserved_connections` (3 by default) are kept for administrators. Every client of the database draws from what is left: every API instance's pool at its maximum, the worker fleet, cron jobs, the migration runner, dashboards, the `psql` session someone has open. Pools grow lazily, so this budget is not tested in normal operation. It is tested at peak load, which is precisely when the autoscaler is adding instances.

The constraint to write down is:

$$ \text{pool max per instance} \le \left\lfloor \frac{\text{max connections} - \text{reserved} - \text{other clients}}{\text{max instances} + \text{deploy surge}} \right\rfloor $$

The deploy surge matters because a rolling deploy runs old and new pods side by side. With this app's pool of 20 and a default Postgres (97 usable slots, nothing else connected):

| Instances | Surge | Worst-case connections | Fits in 97? |
|---|---|---|---|
| 2 | 1 | 3 × 20 = 60 | Yes |
| 4 | 0 | 80 | Yes |
| 4 | 1 | 5 × 20 = 100 | No: the deploy itself can exhaust the database |
| 8 | 2 | 200 | No |

This app runs a single instance today, so its pool sits comfortably inside the budget. The table shows where that stops being true: at four instances the pool of 20 is already too large for a default Postgres, even though average usage is two connections per instance. Two fixes are available: shrink the per-instance pool (from the Little's law numbers above, 8 would be plenty), or put a server-side pooler in front of Postgres so that the number of application connections stops mattering. Raising `max_connections` to 1,000 is the tempting third option, and it moves the failure from "cannot connect" to "connected and slow", because the extra connections compete for the same cores.

```exercise
id: pool-budget
title: Size a pool and check it against the database
prompt: |
  Implement `pool_plan(peak_rps, hold_ms, burst, instances, max_surge, db_slots)`.

  - `peak_rps`: acquires per second across the whole service at peak.
  - `hold_ms`: average time each acquire holds a connection, in milliseconds.
  - `burst`: integer safety multiplier for variance.
  - `instances`: number of application instances sharing the load.
  - `max_surge`: extra instances that exist during a rolling deploy.
  - `db_slots`: connections available to this service (`max_connections`
    minus reserved and other clients).

  Return `{"per_instance": p, "cap": c, "fits": f}` where
  - `p` is the pool size each instance needs: take
    `ceil(peak_rps * hold_ms * burst / 1000)` connections for the whole service,
    then divide across instances, rounding up;
  - `c` is the largest per-instance pool that cannot exceed `db_slots` when
    `instances + max_surge` instances all fill their pools (round down);
  - `f` is whether `p <= c`.

  All inputs are positive integers except `max_surge`, which may be 0. Use
  integer arithmetic to avoid floating-point surprises.
languages: [python, javascript]
entry: pool_plan
starter:
  python: |
    def pool_plan(peak_rps, hold_ms, burst, instances, max_surge, db_slots):
        return {"per_instance": 0, "cap": 0, "fits": False}
  javascript: |
    function pool_plan(peak_rps, hold_ms, burst, instances, max_surge, db_slots) {
      return { per_instance: 0, cap: 0, fits: false };
    }
tests:
  - args: [600, 8, 2, 2, 1, 97]
    expected: {"per_instance": 5, "cap": 32, "fits": true}
  - args: [2000, 25, 2, 4, 1, 97]
    expected: {"per_instance": 25, "cap": 19, "fits": false}
    label: slow queries blow the budget
  - args: [3000, 50, 1, 4, 1, 97]
    expected: {"per_instance": 38, "cap": 19, "fits": false}
  - args: [1, 1, 1, 1, 0, 97]
    expected: {"per_instance": 1, "cap": 97, "fits": true}
    label: tiny load still needs one connection
  - args: [5000, 40, 2, 10, 2, 390]
    expected: {"per_instance": 40, "cap": 32, "fits": false}
    hidden: true
  - args: [1200, 15, 2, 6, 2, 490]
    expected: {"per_instance": 6, "cap": 61, "fits": true}
    hidden: true
  - args: [350, 7, 3, 3, 0, 17]
    expected: {"per_instance": 3, "cap": 5, "fits": true}
    hidden: true
hints:
  - "Integer ceiling division: in Python `-(-a // b)`, in JavaScript `Math.floor((a + b - 1) / b)` for positive integers."
  - "The cap uses floor division of db_slots by (instances + max_surge)."
```

## PgBouncer: pooling on the server side

PgBouncer is a small proxy that speaks the Postgres wire protocol. Applications connect to it as if it were Postgres. It holds thousands of cheap client connections (it is a single-threaded event loop, not a process per connection) and a small pool of real server connections per database and user, and it assigns server connections to clients only while they need one.

*When* it assigns them is the pool mode, and it is the most important PgBouncer setting:

| Mode | Server connection held for | Multiplexing | What breaks |
|---|---|---|---|
| `session` | The client's whole session | None; only saves connection setup | Nothing |
| `transaction` | One transaction, then returned | High: 2,000 clients can share 40 server connections | Anything that relies on session state between transactions |
| `statement` | One statement | Highest | Multi-statement transactions are refused |

Transaction mode is the useful one and the one with sharp edges. Between your transactions, your next statement may run on a different server connection, so anything stored on the connection is gone or, worse, visible to another client:

- `SET search_path` or `SET statement_timeout` at session level (use `SET LOCAL` inside the transaction, or set it per role with `ALTER ROLE`);
- session-level advisory locks (use `pg_advisory_xact_lock`; see [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking));
- `LISTEN`/`NOTIFY`, temporary tables and `WITH HOLD` cursors that outlive a transaction;
- named prepared statements. sqlx prepares every query as a named statement (`sqlx_s_1`, `sqlx_s_2`, ...) and caches up to 100 per connection. Behind an older PgBouncer in transaction mode that produces `prepared statement "sqlx_s_3" does not exist` errors. PgBouncer 1.21 and later can track protocol-level prepared statements itself when `max_prepared_statements` is set; on older versions you must disable the driver's statement cache.

A typical configuration:

```text
; pgbouncer.ini
[databases]
app = host=10.0.0.5 port=5432 dbname=app

[pgbouncer]
listen_port = 6432
auth_type = scram-sha-256
pool_mode = transaction
; client connections are cheap: file descriptors, not processes
max_client_conn = 5000
; real Postgres connections per database/user pair
default_pool_size = 40
; up to 5 extra server connections once a client has waited 3 seconds
reserve_pool_size = 5
reserve_pool_timeout = 3
max_prepared_statements = 200
; fail clients that queue longer than this many seconds
query_wait_timeout = 30
server_idle_timeout = 600
```

With PgBouncer in place the application pool still exists (it saves a TCP connection to PgBouncer per query), but its maximum stops being constrained by `max_connections`: 24 pods × 20 = 480 client connections are fine, because only 40 of them hold a Postgres backend at any instant. Queueing moves to PgBouncer, and `SHOW POOLS;` on its admin console shows it: `cl_waiting` (clients queued) and `maxwait` (seconds the oldest has waited) are the numbers to alert on. Managed alternatives such as RDS Proxy, and newer poolers such as PgCat and Supavisor, make the same trade with different operational models.

Two costs to state in a design review: PgBouncer is one more hop (tens of microseconds on the same host, a network round trip otherwise) and one more thing that can fail, so it needs redundancy; and a single PgBouncer process is bounded by one CPU core, so very high transaction rates need several processes behind the same port.

## Timeouts, layered

Every layer between the user and the disk needs a timeout, and inner layers must give up before outer ones do. If the HTTP handler's deadline is 2 seconds but `statement_timeout` is unlimited, a slow query keeps running after its caller has given up, and during an incident the database fills with "zombie" queries whose results nobody will read.

| Timeout | Set where | Protects against | Starting point for an interactive API |
|---|---|---|---|
| Acquire timeout | Application pool | Unbounded queueing when the pool is exhausted | 0.5–2 s |
| Connect timeout | Driver | An unreachable database host | 2–5 s |
| `statement_timeout` | Postgres, per role or transaction | Runaway queries holding connections | 1–5 s for the API role; a separate role for batch work |
| `lock_timeout` | Postgres | Waiting behind locks, especially during DDL | 1–2 s; lower in migrations |
| `idle_in_transaction_session_timeout` | Postgres | Forgotten transactions pinning locks and vacuum | 10–60 s |
| `query_wait_timeout` | PgBouncer | Clients queued for a server connection | Just above the application's acquire timeout |
| TCP keepalives | Driver or OS | Half-open connections after a failover or network partition | Detect within a minute |

```sql
ALTER ROLE app_api SET statement_timeout = '3s';
ALTER ROLE app_api SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_batch SET statement_timeout = '15min';
```

Postgres only notices that a client has disconnected when it next tries to send it something, so an abandoned long query can run to completion. `client_connection_check_interval` (Postgres 14 and later) makes it check periodically during execution and cancel sooner.

## Seeing it

From the database side, group connections by state:

```sql
SELECT state, wait_event_type, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

```text
        state        | wait_event_type | count
---------------------+-----------------+-------
 idle                | Client          |    61
 active              |                 |     9
 idle in transaction | Client          |     4
 active              | Lock            |     3
```

Sixty-one idle connections are pool slack spread across instances: normal, but that is budget being held for nothing. Nine active with no wait event are doing work. Four `idle in transaction` are application bugs (a transaction held open across something slow). Three active and waiting on `Lock` are contention; find the blocker with `pg_blocking_pids`.

From the application side, export pool metrics: current size, idle count and, most importantly, a histogram of acquire wait time. In this app, `db.get_postgres_connection_pool()` returns the underlying sqlx `PgPool`, whose `size()` and `num_idle()` can be sampled into a gauge. Acquire latency climbing from microseconds to milliseconds is the earliest warning you will get that `W` has grown somewhere, usually minutes before anything times out. The [network track](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) covers the same ideas for HTTP connection pools.

## Senior signals

- You treat database connections as a budget with a written total, and you include rolling-deploy surge, workers, cron jobs and migrations in it.
- You size pools with Little's law from measured hold times, and you know pool exhaustion is usually caused by `W` rising (a slow query), not by `λ`.
- You prefer fewer active connections than you might expect (around a small multiple of database cores) and let the queue live in the pool where it can be timed out and measured.
- You know what transaction-mode PgBouncer breaks (session `SET`, session advisory locks, `LISTEN`, temp tables, and named prepared statements before 1.21) and how to work around each.
- You layer timeouts so inner ones fire first, and you set `statement_timeout` and `idle_in_transaction_session_timeout` per role.
- You can read this app's `connect_db` and say what each setting does, what the unset defaults are, and what you would change as traffic grows.

## Check yourself

```quiz
- q: >-
    An API has 12 instances, each with a pool of max 25, against Postgres with max_connections = 200. Average pool usage is 3 per instance. Why might this still fail?
  options: ["It cannot; average usage is only 36 connections", "Postgres rejects pools larger than 20", "Idle connections time out too quickly", "Pools grow to their maximum under load or slow queries, and 12 × 25 = 300 exceeds 200, so at peak (or during a deploy surge) new connections are refused"]
  answer: 3
  explanation: >-
    The budget must hold at the maximum, not the average. Load spikes and slow queries push every pool to its cap at the same moment. Shrink pools to fit the budget or put a server-side pooler in front.
- q: >-
    A service handles 800 requests per second, each running 3 queries that hold a connection for 2 ms each. Roughly how many connections are in use on average?
  options: ["About 1.6", "About 48", "About 4.8", "About 800"]
  answer: 2
  explanation: >-
    Little's law: acquires per second × hold time = 800 × 3 × 0.002 = 4.8. With a burst factor of 2 you might provision around 10 across all instances. If the hold time grows to 200 ms, the same load needs 480.
- q: >-
    After moving behind PgBouncer in transaction mode, a Rust service using sqlx logs prepared statement "sqlx_s_4" does not exist. What is happening?
  options: ["The migration did not run", "sqlx prepares named statements on one server connection and later executes them on another one that PgBouncer assigned; enable max_prepared_statements on PgBouncer 1.21+ or disable the driver's statement cache", "PgBouncer does not support the extended protocol at all", "The statement cache is too small"]
  answer: 1
  explanation: >-
    Named prepared statements are session state on a server connection. In transaction mode, consecutive transactions can land on different server connections. Newer PgBouncer versions track and re-prepare protocol-level statements when max_prepared_statements is set.
- q: >-
    Why is raising max_connections from 200 to 2,000 usually the wrong fix for too many clients errors?
  options: ["Each connection is a process with its own memory, and active connections beyond a small multiple of the core count add contention rather than throughput, so the failure turns into a slow database instead of refused connections", "Postgres caps max_connections at 1,000", "It requires a restart, which is never acceptable", "It disables autovacuum"]
  answer: 0
  explanation: >-
    Connections are not free capacity. More backends consume memory and compete for the same CPUs and locks. Queueing in a pool or PgBouncer, with timeouts, keeps the number of concurrently active queries near what the hardware can execute.
- q: >-
    An HTTP handler has a 2-second deadline. The pool's acquire timeout is 10 seconds and statement_timeout is unset. What happens during a slow-query incident?
  options: ["Requests fail after 2 seconds and the database recovers", "The pool automatically cancels slow queries", "Requests wait up to 10 seconds for a connection after their callers have given up, and slow queries keep running with no one waiting for the results, so load on the database stays high", "Nothing; the timeouts are independent"]
  answer: 2
  explanation: >-
    Outer timeouts shorter than inner ones create work nobody wants. The acquire timeout should be well inside the request deadline, and statement_timeout should cancel queries whose callers cannot use the result.
```
