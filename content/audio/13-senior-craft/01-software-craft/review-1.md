---
review: software-craft
source: 1c751ba6363b3963
---
## Introduction

Twelve questions from the software-craft module. Answer out loud before the answer comes.

They run in the order of the lessons: architecture, API and error design, testing, security, deployment, containers, observability, documentation, and authentication. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A handler inserts an order row and then publishes an "order placed" message to a broker. Occasionally the publish fails after the database commit. Which change makes the two effects consistent?

A, publish the message first and insert the order row after. B, insert an outbox row in the same transaction, and have a relay deliver it. C, wrap both calls in a try and catch that logs any failure. D, retry the failed publish three times with exponential backoff.

[think]

The answer is B: an outbox row in the same transaction, delivered by a relay.

Reordering or retrying only moves the window where one effect happened without the other; a crash between the two steps still loses one of them. The outbox puts both writes inside one database transaction, and the relay delivers the message afterwards at least once, so consumers must deduplicate. Logging the failure is an explicit decision to accept the loss, which is fine for a chat transcript but not for an order.

## Question 2

Your API calls a payment provider, which returns 401 because your server's own API key was rotated. What should your API return to its client?

A, 403, since the provider denied access to the resource. B, 200 with an error field, so the client's retry logic stays out of it. C, 502 or 503 with a generic message, and alert the operators. D, 401, forwarding the provider's status so the client re-authenticates.

[think]

The answer is C: 502 or 503 with a generic message, and alert the operators.

The provider's 401 describes your server's credentials, not the user's. Forwarding it tells the client its own session is invalid, which can log the user out for a server-side problem; Ascend's web app treats any 401 as signed out. A 403 tells the user they lack a permission they cannot get. And a 200 hides the failure from every retry library and dashboard.

## Question 3

A client retries a payment request with the same idempotency key, but a different amount. What should the server do?

A, reject it with a client error, since the key now names a different request. B, process it as a new payment, since the body differs. C, update the first payment to the new amount and return the result. D, return the stored response of the first request without running anything.

[think]

The answer is A: reject it with a client error.

The key identifies one logical operation. The server stores a hash of the original request, and a mismatch means the client has a bug. Silently replaying the old response, or running it again, would hide that bug. Replaying the stored response is right only when the request matches.

## Question 4

Your team's CI retries failing tests up to twice, and reports green if any attempt passes. What is the main risk?

A, test order becomes fixed, so order-dependent bugs can no longer appear. B, flaky tests start failing more often, because they run more times. C, every run gets slower, because each test now runs three times. D, real intermittent bugs, such as races in the product, look like noise.

[think]

The answer is D: real intermittent bugs look like noise.

Some flakes are genuine product bugs, races or timeouts, that users will hit, and automatic retries turn them into green builds with no signal. Only failing tests are retried, so passing runs are not slower, and retrying changes neither test order nor how often the bug fires. If you retry at all, record a pass on retry as a flake event and track it.

## Question 5

Ascend stores session tokens as plain SHA-256 hashes, but passwords as Argon2id hashes. Why is a fast hash acceptable for the tokens?

A, tokens expire within 30 days, so a stolen hash is soon useless. B, tokens are 256 random bits, so no guessing rate could ever find one. C, SHA-256 is a stronger algorithm than Argon2id for short inputs. D, tokens are also encrypted at rest, so the hash is a second layer.

[think]

The answer is B: 256 random bits cannot be guessed at any rate.

Slow hashing makes up for inputs with little entropy, which attackers can guess, like passwords. A 256-bit random token has no guessable structure: at a trillion guesses a second, searching half the space takes around 10 to the 57th years. Expiry limits the window but does not replace hashing, SHA-256 is faster than Argon2id rather than stronger, and the tokens are not encrypted; the hash is the only protection, and it is enough.

## Question 6

A rate limiter keys login attempts on the first IP address in the X-Forwarded-For header. What can an attacker do?

A, skip the CSRF check, since the limiter runs before the CSRF layer. B, spoof only IPv6 addresses, because IPv4 entries are checked against the connection. C, send a new fake IP on each request, and get a fresh bucket every time. D, nothing, because proxies replace the header with the real client address.

[think]

The answer is C: a new fake IP on each request gets a fresh bucket every time.

Proxies append to that header; they do not remove what the client sent, so the first entry is attacker-controlled, whatever its address family. Each fake address gets its own bucket, and the per-IP limit disappears. Key on a header your trusted edge overwrites, or on the socket address, and limit per account as well.

## Question 7

A team rebuilds the Docker image from the same Git commit when promoting it from staging to production. What is the risk?

A, production images must have debug symbols stripped, so a rebuild is needed anyway. B, none, because one commit always builds a byte-identical image on any machine. C, only speed; rebuilding repeats work but yields the same tested artifact. D, the rebuilt image can differ from the tested one, through a moved base tag or a dependency.

[think]

The answer is D: the rebuilt image can differ from the one you tested.

Builds are not reliably reproducible. Base image tags move to new digests, and dependency resolution and caches change. Promoting the exact digest that passed the tests is the only way to know production runs what you tested; frozen lockfiles narrow the gap, but do not pin the base image.

## Question 8

A Kubernetes Deployment has 3 replicas, a max surge of 1 and max unavailable of 0. The new version's readiness probe never passes. What is the state 15 minutes later?

A, two old pods and one unready new pod remain, with a third of capacity missing. B, three old pods serve, one new pod is unready, and progress is reported as exceeded. C, all pods have been replaced, because readiness only delays traffic, not the rollout. D, Kubernetes has rolled back to the previous version and deleted the new pod.

[think]

The answer is B: three old pods serve, one new pod is unready, and progress is reported as exceeded.

With max unavailable at zero, no old pod may go until a new one is available, so the rollout stops after the first extra pod. After the progress deadline, 600 seconds by default, the Deployment reports progress deadline exceeded, but nothing rolls back automatically. Losing a third of capacity is what a max surge of zero with max unavailable of one would do.

## Question 9

To cut log volume, production's log level is changed to warn. Warning and error events still appear. What else changes on those lines?

A, nothing; spans are not affected by the level filter at all. B, they gain a list of spans, because that list is only hidden at info. C, their level field becomes lower case. D, they lose the span object, so the request ID disappears from them.

[think]

The answer is D: they lose the span object, and with it the request ID.

The filter applies to spans as well as events. Ascend's request span is created at info level, so at warn it is never created, and there is no span to print. Every remaining warning and error line loses its request ID, with no error anywhere. Keep the span's module at info, and quieten the noisy events instead.

## Question 10

A service head-samples 1 percent of traces. An incident fails 5 requests. How likely is it that at least one of them was traced?

A, certain, since head sampling always keeps traces with errors. B, about 5 percent, since each request is kept independently at 1 percent. C, exactly 1 percent, since the rate applies to the incident as a whole. D, about 50 percent, since five requests give five separate chances.

[think]

The answer is B: about 5 percent.

Head sampling decides before the outcome is known, independently for each trace, so the chance is one minus 0.99 to the fifth power, about 4.9 percent. It cannot know which traces will fail. Tail sampling decides after the trace completes and keeps every error, at the cost of buffering spans in a collector while it waits to decide.

## Question 11

An accepted architecture decision record turns out to be wrong six months later. What should the team do?

A, write a new ADR that supersedes it, and mark the old one as superseded. B, edit the ADR in place so it describes the decision the team made instead. C, leave the ADR alone, and explain the change in a comment next to the code. D, delete the ADR so nobody is misled by an outdated decision.

[think]

The answer is A: write a superseding ADR and mark the old one superseded.

ADRs are a history. Superseding keeps why the first decision was made and why it changed, which is exactly what the next person needs. Editing or deleting erases that history, and a code comment leaves the ADR log asserting something false.

## Question 12

An identity provider starts signing tokens with a new key the moment it is generated, and publishes the key in its key set at the same time. APIs cache the key set for one hour. What do users see?

A, only tokens signed with the old key fail, until they expire. B, every token fails until the APIs are restarted and reload their configuration. C, new tokens fail at APIs whose cache predates the key, for up to an hour. D, nothing, since the old key stays in the key set for the tokens it signed.

[think]

The answer is C: new tokens fail at APIs with an older cache, for up to an hour.

New tokens carry the new key's ID, and an API whose cached key set predates it cannot find the key, so it rejects them until its cache expires, unless it refetches on an unknown key ID. Old-key tokens still verify, because the old key is still cached. The safe order is publish, wait one cache lifetime, then sign with the new key.

## Recap

Three ideas kept coming back. First, put a failure where it cannot hide: an outbox instead of a hopeful retry, a flaky test tracked instead of retried into green, a request ID that survives the log filter. Second, ship and trust exactly what you checked: the image digest that passed the tests, the client's original request behind an idempotency key, and the keys a verifier has actually fetched. And third, history and overlap beat replacement: supersede a decision record rather than edit it, roll pods over without dropping capacity, and publish a new key before you sign with it.
