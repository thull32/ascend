---
slug: api-and-error-design
title: "API and error design: contracts, error taxonomies, pagination and versioning"
description: Design APIs whose errors tell callers what to do next, map domain errors to HTTP in exactly one place without leaking internals, and evolve contracts with idempotency, cursors and compatible changes.
minutes: 30
difficulty: medium
tags: [api-design, error-handling, http, idempotency, pagination, versioning, senior-craft]
---
A mobile team files a bug: "the app shows *Something went wrong* for everything." You look at the API. Validation failures return `500` with a stack trace. A missing record returns `200 {"error": "not found"}`. Rate limiting returns `503`, so the client's retry library hammers the server harder. And last month someone reworded an error message, which broke the client code that was string-matching on it. Every one of those decisions was local and reasonable. Together they make an API nobody can build on.

An API contract is not the happy-path JSON schema. It is everything a caller can observe: status codes, error codes, which operations are safe to retry, how pages are ordered, what happens under load, and which changes will never be made without warning. This lesson treats errors as the largest part of that contract and uses this repository's `AppError` as the worked example.

## Everything observable is the contract

Hyrum's law puts it bluntly: with enough users, every observable behaviour of your API will be depended on by somebody, whatever the documentation promises. Error message wording, field order, the exact status of a timeout, how long a request takes: someone's code relies on it.

You cannot stop that, but you can give callers something better to depend on. The senior move is to **separate what machines read from what humans read**:

- A **stable, machine-readable code** (`validation_error`, `rate_limited`) that you promise never to rename.
- A **human message** you are free to reword, translate or improve.
- A **status code** that tells generic infrastructure (retry libraries, proxies, monitoring) which broad class of outcome this is.

Once the code exists, reviewers can reject any client change that string-matches on a message.

## A taxonomy built on what the caller should do

Classify errors by the **caller's next action**, not by which library failed. A caller can do only a handful of things, so a handful of classes covers almost everything.

| Class | Typical status | Caller's next action | Safe to retry as-is? |
|---|---|---|---|
| Your request is malformed or invalid | 400 / 422 | Fix the input and resend | No |
| You are not authenticated | 401 | Log in, then resend | After re-authenticating |
| You may not do this | 403 | Give up or ask for access | No |
| It does not exist (or you may not know it exists) | 404 | Give up | No |
| It conflicts with current state | 409 | Re-read, reconcile, resend | After reconciling |
| Slow down | 429 + `Retry-After` | Wait, then resend | Yes, after the delay |
| A dependency failed | 502 / 504 | Retry with backoff | Usually, if idempotent |
| We are unavailable or the feature is off | 503 | Retry later or degrade | Yes, later |
| We have a bug | 500 | Report it | Maybe; it may fail again |

Three distinctions that interviewers probe:

- **401 vs 403.** 401 means "I do not know who you are"; the fix is to authenticate. 403 means "I know who you are and the answer is no"; re-authenticating will not help. A client that logs the user out on 403 is buggy.
- **403 vs 404.** Returning 403 for another user's private resource confirms that it exists. When existence itself is sensitive, return 404 for both "missing" and "not yours".
- **429 vs 503.** 429 says "you, specifically, are over a limit"; 503 says "everyone is affected". Retry libraries and load balancers treat them differently, so do not use one for the other.

## Ascend's error type, end to end

`crates/core/src/error.rs` defines one error type for the whole domain, and its doc comment states the rule: variants are *semantic* (what went wrong for the caller), not *mechanical* (which library failed).

```rust
pub enum AppError {
    Validation(String),
    Unauthorized,
    Forbidden,
    NotFound(&'static str),
    Conflict(String),
    RateLimited(String),
    AiDisabled,
    AiUpstream(String),
    Database(#[from] sea_orm::DbErr),
    Internal(String),
}
```

Each variant has a stable machine code via `AppError::code()` (`"validation_error"`, `"not_found"`, `"ai_upstream"`, ...), and the comment on that method says why: the code is "stable across wording changes". Conversions keep services terse: `From<validator::ValidationErrors>` flattens field errors into `"email must be a valid email address"` lines for a form, and `From<anyhow::Error>` turns anything unexpected into `Internal`.

The mapping to HTTP happens **once**, in `crates/api/src/error.rs`. Handlers return `ApiResult<T>` and never pick a status code:

```rust
let status = match &e {
    AppError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
    AppError::Unauthorized => StatusCode::UNAUTHORIZED,
    AppError::Forbidden => StatusCode::FORBIDDEN,
    AppError::NotFound(_) => StatusCode::NOT_FOUND,
    AppError::Conflict(_) => StatusCode::CONFLICT,
    AppError::RateLimited(_) => StatusCode::TOO_MANY_REQUESTS,
    AppError::AiDisabled => StatusCode::SERVICE_UNAVAILABLE,
    AppError::AiUpstream(_) => StatusCode::BAD_GATEWAY,
    AppError::Database(_) | AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
};
// Internal details are logged, never returned.
let message = match &e {
    AppError::Database(inner) => { tracing::error!(error = %inner, "database error"); "internal error".to_string() }
    AppError::Internal(inner) => { tracing::error!(error = %inner, "internal error"); "internal error".to_string() }
    other => other.to_string(),
};
```

The body is `{"code": "...", "message": "..."}`. The frontend's single fetch wrapper, `web/src/lib/api.ts`, turns every non-2xx response into an `ApiError(status, code, message)` so components branch on `e.code === "rate_limited"` rather than on text.

The most important line is the one that swallows detail. A `DbErr` can contain a hostname, a constraint name, or a fragment of SQL; an `Internal` string can contain a file path. Those go to the logs, where the request ID ties them to the user's report, and the client gets `"internal error"`. Leaking internals is not only an information-disclosure risk; it also creates contract you never meant to offer, because clients start matching on it.

### Translate upstream errors, never forward them

`crates/core/src/ai/anthropic.rs` shows the same discipline at the outbound edge. Its `map_status` function converts the AI provider's status into Ascend's semantics:

- Provider `429` becomes `AppError::RateLimited`, so the user sees "slow down".
- Provider `529`/`503` becomes `AiUpstream("the AI provider is overloaded; try again shortly")`, a 502 to the browser.
- Provider `401`/`403` becomes `AiUpstream("AI provider rejected our credentials")`, also a 502.

That last one is the lesson. If the API forwarded the provider's 401, a client would reasonably conclude that the *user's* session had expired (this SPA's auth context in `web/src/lib/auth.tsx` treats a 401 as signed out) and send them to log in again, for a problem that is entirely the server's API key. An upstream status describes the relationship between you and your vendor; your caller needs a status that describes the relationship between them and you.

### What a reviewer would still flag

The design is sound; a careful review still finds edges worth knowing about.

1. **Framework rejections bypass the shape.** When a body is not valid JSON, Axum's `Json` extractor rejects the request with its own plain-text response before the handler runs, so the client gets no `code`. `web/src/lib/api.ts` copes by falling back to `"http_error"`. A stricter API wraps the extractor so that every failure, including malformed input, uses the same body.
2. **Middleware speaks the same dialect.** The CSRF middleware returns 403 with `code: "csrf"` and the rate limiter returns 429 with `code: "rate_limited"` and `retry-after: 60`, both using `ErrorBody` even though neither is an `AppError`. That consistency is deliberate and worth copying.
3. **Vendor text crossing the boundary.** The 400 branch of `map_status` includes up to 200 characters of the provider's response body in the message the browser sees. The provider's text is probably harmless, but the rule "only strings we wrote reach the client" is easier to audit than "vendor strings reach the client when we think they are safe".
4. **Timeout semantics.** The router's `TimeoutLayer` answers a slow handler with `408 Request Timeout`. RFC 9110 defines 408 as the *client* failing to send a complete request in time, and some HTTP clients treat 408 as automatically retryable. A handler that ran out of time is more accurately a 503 or 504.
5. **Login failures are 422.** `AuthService::login` returns `Validation("invalid email or password")` for both an unknown email and a wrong password. The single message is correct (it avoids account enumeration), and `crates/api/tests/api.rs` pins it: a test asserts that the wrong-password and unknown-email responses have identical bodies. Whether the status should be 401 instead is a judgement call. What matters is that it is consistent, documented and tested.

Now implement the mapping yourself, including the part that matters most: internal detail must never reach the response.

```exercise
id: map-app-error
title: Map domain errors to HTTP responses
prompt: |
  Implement the single place where domain errors become HTTP responses.

  The input is an error object `{"kind": ..., "detail": ...}`. Return
  `{"status": <int>, "code": <string>, "message": <string>}` using these
  rules (kind: status, code, message):

  `validation`: 422, `validation_error`, the detail
  `unauthorized`: 401, `unauthorized`, "authentication required"
  `forbidden`: 403, `forbidden`, "forbidden"
  `not_found`: 404, `not_found`, the detail followed by " not found"
  `conflict`: 409, `conflict`, the detail
  `rate_limited`: 429, `rate_limited`, "rate limit exceeded: " then the detail
  `ai_upstream`: 502, `ai_upstream`, "upstream AI provider error: " then the detail
  `database`: 500, `database_error`, "internal error"
  `internal`: 500, `internal_error`, "internal error"

  Any other kind is a programming error: fail closed with status 500, code
  `internal_error` and message `internal error`. Never copy the detail of a
  500 into the response.
languages: [python, javascript]
entry: to_http
starter:
  python: |
    def to_http(error):
        kind, detail = error["kind"], error["detail"]
        # your code here
        return {"status": 500, "code": "internal_error", "message": detail}
  javascript: |
    function to_http(error) {
      const { kind, detail } = error;
      // your code here
      return { status: 500, code: "internal_error", message: detail };
    }
tests:
  - args: [{"kind": "validation", "detail": "email must be a valid email address"}]
    expected: {"status": 422, "code": "validation_error", "message": "email must be a valid email address"}
  - args: [{"kind": "not_found", "detail": "interview"}]
    expected: {"status": 404, "code": "not_found", "message": "interview not found"}
  - args: [{"kind": "database", "detail": "connection refused: 10.0.4.7:5432"}]
    expected: {"status": 500, "code": "database_error", "message": "internal error"}
    label: database details never leak
  - args: [{"kind": "rate_limited", "detail": "daily AI budget"}]
    expected: {"status": 429, "code": "rate_limited", "message": "rate limit exceeded: daily AI budget"}
  - args: [{"kind": "conflict", "detail": "an account with that email already exists"}]
    expected: {"status": 409, "code": "conflict", "message": "an account with that email already exists"}
  - args: [{"kind": "unauthorized", "detail": "token expired at 12:00"}]
    expected: {"status": 401, "code": "unauthorized", "message": "authentication required"}
    hidden: true
    label: fixed messages ignore the detail
  - args: [{"kind": "teapot", "detail": "Traceback: /srv/app/handlers.py line 88"}]
    expected: {"status": 500, "code": "internal_error", "message": "internal error"}
    hidden: true
    label: unknown kinds fail closed
hints:
  - "A dictionary from kind to (status, code) handles most rows; only the message needs per-kind logic."
  - "Start from the fail-closed default and overwrite it only for kinds you recognise."
```

## Idempotency is part of the contract

Networks fail after the server has done the work but before the client hears about it. The client cannot tell "never arrived" from "succeeded, reply lost", so it retries. Whether that retry is safe is a property of the API, and callers need to know it.

The cheapest way to make retries safe is to **design operations to be idempotent by construction**. Ascend's `PUT /api/progress/lessons/{track}/{module}/{lesson}` sends the desired state (`{"status": "completed"}`), and the service writes it with an upsert keyed on `(user_id, lesson_slug)` (`crates/core/src/services/progress.rs`). Sending it once or five times leaves the same row.

`POST /api/comments` is different: two identical posts create two comments. When an operation is inherently "create a new thing" or "move money", the client supplies an **idempotency key**: a unique ID per logical operation, sent as a header. The server records the key with a hash of the request and the response. A retry with the same key gets the stored response without re-executing; the same key with a *different* body is a client bug and gets a client error (422 is a common choice); a retry that arrives while the first attempt is still running gets a 409 or waits.

```viz
{"type": "system", "algorithm": "idempotency-key", "title": "Idempotency keys turn retries into replays", "caption": "The second request carries the same key, so the server returns the stored result instead of charging twice. Keys need a TTL and must be scoped per caller."}
```

The details that separate a senior design: scope keys per authenticated caller (so one user cannot replay another's response), store the key in the same transaction as the side effect, and expire keys after a window your clients' retry policies fit inside. The full pattern, including exactly-once illusions, is in [idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries).

The error taxonomy also decides what **callers' resilience machinery** does. A circuit breaker should count timeouts and 5xx responses as failures, and must not count 4xx: a buggy client sending invalid requests should not open the breaker for every other caller.

```viz
{"type": "system", "algorithm": "circuit-breaker", "title": "The caller's side of your error contract", "caption": "After repeated failures the breaker opens and fails fast, then lets a probe through. Which statuses count as failures is decided by the error taxonomy."}
```

## Pagination: offsets lie, cursors scale

An offset page (`?offset=100000&limit=20`) looks simple and has two flaws. The database must walk and discard 100,000 rows to return 20, so page 5,000 is thousands of times slower than page 1. And if a row is inserted at the head while a client pages, every later page shifts by one: the client sees a duplicate or silently misses a row.

A **cursor** (keyset) page asks for rows *after* the last one seen, using an index to seek directly there:

```sql
-- First page
SELECT id, body, created_at FROM comments
WHERE target_kind = 'lesson' AND target_slug = $1
ORDER BY created_at, id
LIMIT 50;

-- Next page: the cursor encodes the last row's (created_at, id)
SELECT id, body, created_at FROM comments
WHERE target_kind = 'lesson' AND target_slug = $1
  AND (created_at, id) > ($2, $3)
ORDER BY created_at, id
LIMIT 50;
```

With an index on `(target_kind, target_slug, created_at)` the second query costs the same on page 1 and page 5,000. The `id` tiebreaker makes the order total, so two rows with the same timestamp are never skipped. Encode the cursor as an opaque string (base64 of the tuple) so clients cannot construct or depend on its internals, and so you can change it later.

Ascend today does not paginate comments: `CommentService::list` returns at most 500 rows per target, oldest first, and builds threads in memory. That is a reasonable contract for a lesson's discussion, and the index in `migration/src/m0004_community.rs`, on `(target_kind, target_slug, created_at)`, is already most of what a cursor needs; appending `id` as a final column would resolve the tiebreaker inside the index too. The senior point is that the cap is part of the contract: the client should know that a 500-comment lesson returns a truncated list, or the API should say so in the response.

## Evolving a contract without breaking callers

Some changes are safe for any reasonable client; some break someone.

| Usually safe (additive) | Breaking |
|---|---|
| Adding an optional request field | Making an optional field required |
| Adding a response field | Removing or renaming a field |
| Adding an endpoint | Changing a field's type or units |
| Adding an enum value *if* clients were told to tolerate unknowns | Changing the meaning of an existing value |
| Relaxing a validation rule | Tightening a validation rule |

"Adding an enum value" is the trap: a client with an exhaustive `switch` on `code` will crash on a new error code. Tell clients up front that unknown codes must fall back to generic handling (the tolerant reader principle), and make your own clients do it: `web/src/lib/api.ts` defaults a missing code to `"http_error"`.

When you must break, you choose a versioning strategy: a path prefix (`/v2/...`), a header, or per-client pinned versions where the server keeps translating old shapes (the approach popularised by date-versioned public APIs). All of them cost a period where you run two contracts, so the real skill is needing it rarely.

Ascend has an unusual advantage: the SPA and the API ship in the same binary, so there is only one client version per deploy. Almost. A browser tab opened before a deploy keeps running the old JavaScript against the new API until it reloads. `crates/api/src/app.rs` serves `index.html` with `no-cache` and hashed assets as `immutable`, so a reload always picks up the new bundle, but between deploy and reload the API must still accept the previous client's requests. "Backward compatible for one release" is the practical rule even for a monolith. The broader treatment is in [API design and versioning](/learn/system-design/building-blocks/api-design-and-versioning).

## Senior signals

- You classify errors by **the caller's next action** and can defend 401 vs 403, 403 vs 404 and 429 vs 503 in one sentence each.
- You insist on **stable machine codes** separate from human messages, and you reject client code that parses messages.
- You map errors to transport **in exactly one place**, and that place logs internal detail with a request ID and returns a generic message.
- You **translate upstream errors** into your own semantics instead of forwarding a vendor's status to your users.
- You make operations **idempotent by construction** where possible, and specify idempotency keys (scope, storage, TTL, conflicting reuse) where not.
- You choose **cursor pagination** for anything that grows, and you document caps and tolerant-reader rules as part of the contract.

## Check yourself

```quiz
- q: >-
    Your API calls a payment provider, which returns 401 because your server's API key was rotated. What should your API return to its own client?
  options: ["401, forwarding the provider's status", "403, because access was denied", "502 or 503 with a generic message, and an alert for the operators", "200 with an error field"]
  answer: 2
  explanation: >-
    The provider's 401 describes your server's credentials, not the end user's. Forwarding 401 tells the client its own session is invalid, which may log the user out for a server-side problem. Translate it to a gateway/unavailable status and page someone.
- q: >-
    A user requests /api/interviews/{id} for an interview that belongs to someone else. Ascend's InterviewService::get returns NotFound rather than Forbidden. Why?
  options: ["404 responses are cached, so it is faster", "Returning 403 would confirm that an interview with that ID exists", "Forbidden is not a valid AppError variant", "Browsers retry 403 automatically"]
  answer: 1
  explanation: >-
    For private resources, 403 leaks existence. Returning 404 for both "missing" and "not yours" gives an attacker enumerating IDs no signal. Forbidden is a real variant; the comment-deletion path uses it because the comment's existence is already public.
- q: >-
    Which change to a public JSON API is most likely to break existing clients even though it only adds something?
  options: ["Adding a new value to an error code enum that clients switch on exhaustively", "Adding a new optional response field", "Adding a new endpoint", "Adding an optional query parameter"]
  answer: 0
  explanation: >-
    Clients that treat the set of codes as closed will crash or mis-handle the new value. That is why the contract should tell clients to fall back to generic handling for unknown codes. New optional fields and endpoints are ignored by tolerant clients.
- q: >-
    A feed endpoint uses ?offset=N&limit=20. Users on page 300 report slow responses and occasional duplicates. What fixes both?
  options: ["Add a cache in front of the endpoint", "Switch to a keyset cursor on (created_at, id) with a matching index", "Increase limit to 100 so there are fewer pages", "Sort by id descending instead"]
  answer: 1
  explanation: >-
    Offsets make the database scan and discard every earlier row, and inserts shift page boundaries. A cursor seeks directly via the index and pages relative to the last row seen, so cost is constant and rows are neither skipped nor repeated. Caching hides the cost without fixing correctness.
- q: >-
    A client retries POST /payments with the same Idempotency-Key but a different amount. What should the server do?
  options: ["Process it as a new payment", "Return the stored response of the first request", "Overwrite the first payment with the new amount", "Reject it with a client error, because the key was reused for a different request"]
  answer: 3
  explanation: >-
    The key identifies one logical operation. The server stores a hash of the original request; a mismatch means the client has a bug, and silently replaying or re-executing would hide it. Replaying the stored response is right only when the request matches.
```
