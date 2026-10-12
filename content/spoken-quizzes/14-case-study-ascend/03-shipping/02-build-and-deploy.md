---
lesson: build-and-deploy
source: 699b23e74dfc9143
---
## 1

Which change causes the cargo chef cook layer to rebuild all of Ascend's dependencies?

A, adding a crate to a Cargo manifest, which changes the dependency recipe. B, changing a React component, which changes the app embedded in the binary. C, editing a lesson in the content folder, which the binary embeds when it compiles. D, editing a Rust source file in the API crate, such as a route handler.

[think]

The answer is A: adding a crate to a Cargo manifest, which changes the dependency recipe.

The cook layer's only input is the recipe, derived from the manifests and the lockfile. Source, content and front-end changes invalidate only the later layers that compile the workspace crates, which is why a deploy that changes only content takes about a minute.

## 2

Railway now waits for CI, and CI validates content strictly. Why does the Dockerfile still run the binary's content check?

A, the Docker step also executes every problem's reference solution. B, CI validates content in lenient mode, so only the Docker check is strict. C, it checks the exact content embedded in this binary, on the path that builds it. D, it is redundant now, and stays only because nobody has got round to removing it.

[think]

The answer is C: it checks the exact content embedded in this binary, on the path that builds it.

Validation belongs on the path that produces the artifact. The Docker check runs the freshly built binary against the curriculum compiled into it, not a checkout that might differ, and it holds even if a deploy ever bypasses CI. CI's content validation is strict too, and the reference solutions are executed by a separate CI job.

## 3

A release renames a column in its migration. The new version passes readiness, then starts returning errors, and you roll back to the previous deployment. What happens?

A, nothing, because SeaORM maps the old and new column names to each other. B, Railway refuses to roll back any deployment whose migration succeeded. C, the old binary boots, skips migrating, then fails every query that names the old column. D, the rollback restores the old schema automatically before starting.

[think]

The answer is C: the old binary boots, skips migrating, then fails every query that names the old column.

Migrations ran forward on boot, and nothing runs them backward, so a rollback redeploys code, not schema. The migration planner sees a schema ahead of the build and starts without migrating, and the old queries then name a column that no longer exists. Rollback safety requires expand and contract: add the new column in one release, move reads and writes, and remove the old one in a later release.

## 4

Ascend's rate limiter originally used the first X-Forwarded-For entry as the client's IP address. What could an attacker do?

A, send a new fake address each time, and get a fresh bucket every time. B, only slow down their own requests, since the limiter keys on them. C, nothing, because Railway strips the header before the app sees it. D, bypass the CSRF check by claiming the site's own origin in that same header.

[think]

The answer is A: send a new fake address each time, and get a fresh bucket every time.

Proxies append to that header, so its first entry is supplied by the client. Keying a limiter on it lets the client choose its own key, which made every limit keyed by IP address, login included, meaningless. Trusting only a header the edge overwrites, configured explicitly, fixes it.

## 5

Ascend's readiness check returns 200 when "select 1" succeeds against the database. Which bad deploy does it let through?

A, a migration that fails part-way through and exits the process. B, a deploy whose Anthropic API key has been revoked. C, a container that cannot reach Postgres over the network. D, a binary that panics during boot, before it binds its port.

[think]

The answer is B: a deploy whose Anthropic API key has been revoked.

A failing migration or a boot panic never binds the port, and an unreachable database makes readiness return 503. The AI field only says a key is configured, not that it works, so a revoked key goes live. A probe at boot would catch it, without calling a paid API on every health poll.

## 6

A commit changes only one route handler in the API crate. Which Docker layers rebuild?

A, only the web stage, because the app is embedded into the API binary. B, every Rust layer, because the planner copies the crates folder, so its cache is invalid. C, the planner and the final workspace build, while the dependency cook stays cached. D, nothing but the content check, because the source is only embedded, not compiled.

[think]

The answer is C: the planner and the final workspace build, while the dependency cook stays cached.

The planner copies the crates folder, so it runs again, but it writes the same recipe, and the cook layer is keyed on that file's contents, so every dependency stays cached. Only the workspace crates compile again. The web stage never sees Rust sources, and source is compiled, not embedded.
