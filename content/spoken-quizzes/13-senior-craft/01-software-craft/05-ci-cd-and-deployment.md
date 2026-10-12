---
lesson: ci-cd-and-deployment
source: b64c8d963854191b
---
## 1

A team rebuilds the Docker image from the same Git commit when promoting it from staging to production. What is the risk?

A, production images must have debug symbols stripped, so a rebuild is needed anyway. B, none, because one commit always builds a byte-identical image on any machine. C, only speed: rebuilding repeats work, but yields the same tested artifact. D, the rebuilt image can differ from the tested one, through a moved base tag or a dependency.

[think]

The answer is D: the rebuilt image can differ from the tested one.

Builds are not reliably reproducible. Base image tags move to new digests, and dependency resolution and caches change. Promoting the exact digest that passed the tests is the only way to know production runs what you tested; frozen lockfiles narrow the gap, but do not pin the base image.

## 2

This app runs its migrations before binding the port, and Railway only sends traffic once the readiness endpoint answers. A new release contains a migration that fails. What happens?

A, the process exits with an error, never turns ready, and the old deployment keeps serving. B, the platform rolls the database back to its previous state and retries the deploy. C, the new version starts anyway, and serves traffic against the old, unmigrated schema. D, both versions share traffic until someone intervenes and picks which one to keep.

[think]

The answer is A: the process exits with an error, never turns ready, and the old deployment keeps serving.

Because migrations run before the listener binds, a failed migration means the process never becomes ready, so traffic never moves. Nothing rolls the database back for you. The SeaORM migration tool runs each Postgres migration in a transaction by default, which is why a failed one leaves no partial schema or record here.

## 3

A service handles 1,000 requests a second with a 0.1 percent error rate. A release raises errors to 0.5 percent. You run a 1 percent canary, with a gate at the expected errors plus three standard deviations, evaluated after one minute. How often is the regression caught?

A, about half the time, because the gate compares against a coin flip. B, almost always, because a fivefold increase is far outside the noise. C, about a third of the time, because 600 requests expect only 0.6 errors. D, never, because a 1 percent canary cannot detect any error regression at all.

[think]

The answer is C: about a third of the time.

The canary sees 600 requests. A healthy one expects 0.6 errors, and the gate trips at 4. The broken release produces 3 on average, so it trips only about 35 percent of the time. A fivefold ratio sounds decisive, but with counts this small it is not. The same stage needs about four and a half minutes to catch it 95 percent of the time, and a 10 percent stage about 30 seconds.

## 4

You roll this app back to the previous image after a release whose only schema change was adding a nullable column. Boot migrations are planned by Ascend's own migration planner. What happens?

A, the old binary refuses to boot, because the database has a migration it lacks. B, the old binary runs the new migration's down step, then serves traffic. C, the old binary finds the schema ahead of it, skips migrating, and serves. D, Railway reverts the migration before it starts the old image.

[think]

The answer is C: the old binary finds the schema ahead of it, skips migrating, and serves.

The planner sees a migration it does not know and none of its own pending, so it plans "schema ahead", logs a warning and starts. The nullable column is invisible to the old code, which is exactly what expand-only migrations guarantee. Refusing to boot is what the migration library's own check did before Ascend replaced it, and that made this rollback impossible. Nothing runs down steps or reverts migrations automatically.

## 5

You need to rename a column that the current release reads and writes. Which plan keeps every deploy reversible?

A, rename the column during a maintenance window, when no traffic reaches the database. B, add the new column, write to both, backfill, switch reads, then drop the old one later. C, create a view with the new name over the table, then rename the table beneath it. D, ship a single migration that renames the column, together with the matching code change.

[think]

The answer is B: add the new column, write to both, backfill, switch reads, then drop the old one later.

Expand and contract keeps the schema compatible with both releases that can be live at every step, so overlap and a one-release rollback are safe. A one-step rename, with or without a maintenance window, breaks whichever version expects the other name the moment it runs.

## 6

Ascend sets Railway's deployment draining window to 60 seconds, and bounds its own shutdown at 25 seconds for connections, then 30 for background tasks. Why keep the server's total under the platform's window?

A, so the kill signal never lands mid-shutdown and cuts the task wait short. B, so the new deployment's health check can begin as soon as possible. C, because Railway rejects any drain longer than the health check window. D, because the timers start before the terminate signal, and need slack to catch up.

[think]

The answer is A: so the kill signal never lands mid-shutdown and cuts the task wait short.

The window is the time between SIGTERM and SIGKILL. At Railway's default of zero, which applied until Ascend changed it, the kill arrived at once and neither the drain nor the task wait ran. A server budget longer than the window fails the same way at its end. 55 seconds fits inside 60, so the process finishes its own shutdown. The timers start at SIGTERM, and draining the old deployment is separate from the new one's health check.
