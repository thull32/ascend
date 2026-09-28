---
slug: api-and-error-design
title: "API and error design: contracts, error taxonomies, pagination and versioning"
description: Design APIs whose errors tell callers what to do next, map domain errors to HTTP in exactly one place without leaking internals, and evolve contracts with idempotency, cursors and compatible changes.
minutes: 40
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
    RateLimited { message: String, retry_after_secs: Option<u64> },
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
    AppError::RateLimited { .. } => StatusCode::TOO_MANY_REQUESTS,
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
// ... build the response, then, if the domain knows when to retry, say so:
if let AppError::RateLimited { retry_after_secs: Some(secs), .. } = e {
    res.headers_mut().insert(axum::http::header::RETRY_AFTER, secs.max(1).into());
}
```

The body is `{"code": "...", "message": "..."}`. The frontend's single fetch wrapper, `web/src/lib/api.ts`, turns every non-2xx response into an `ApiError(status, code, message)` so components branch on `e.code === "rate_limited"` rather than on text.

The most important line is the one that swallows detail. A `DbErr` can contain a hostname, a constraint name, or a fragment of SQL; an `Internal` string can contain a file path. Those go to the logs, where the request ID ties them to the user's report, and the client gets `"internal error"`. Leaking internals is not only an information-disclosure risk; it also creates contract you never meant to offer, because clients start matching on it.

## Every error a client can see

`AppError` is not the whole contract. Axum's extractors, the middleware and the timeout layer produce errors before any handler runs, and a client sees all of them. The complete list for Ascend's API:

| Produced by | Example trigger | Status | `code` | `Retry-After` | Client's next move |
|---|---|---|---|---|---|
| `AppJson`, unparseable body | `{"email": ` cut off, or not JSON at all | 400 | `bad_request` | | Fix the client's serialiser |
| `AppJson`, body over 512 KiB | a huge editor buffer | 413 | `payload_too_large` | | Send less |
| `AppJson`, wrong content type | no `Content-Type: application/json` | 415 | `unsupported_media_type` | | Fix the client |
| `AppJson`, well-formed but wrong shape | `{"email": 5}`, a missing field | 422 | `validation_error` | | Fix the input |
| `AppError::Validation` | an invalid email; a wrong password | 422 | `validation_error` | | Fix the input |
| `AppError::Unauthorized` | no session, or an expired one | 401 | `unauthorized` | | Sign in, then resend |
| CSRF middleware | a mutating request without the custom header, or from a foreign origin | 403 | `csrf` | | Give up: the request is forged or misbuilt |
| `AppError::Forbidden` | deleting someone else's comment | 403 | `forbidden` | | Give up |
| `AppError::NotFound`, `api_not_found` | a missing or not-yours interview; an unknown `/api` path | 404 | `not_found` | | Give up |
| `AppError::Conflict` | an email already registered; an interview already ended | 409 | `conflict` | | Re-read, reconcile, resend |
| Rate-limit middleware | the per-IP, per-account or per-session bucket is empty | 429 | `rate_limited` | GCRA's wait, rounded up, at least 1 s | Wait, then resend |
| `AppError::RateLimited` | the daily AI budget; the provider throttling Ascend | 429 | `rate_limited` | seconds to the next UTC midnight; 30 | Wait, then resend |
| `AppError::AiUpstream` | the provider is overloaded or rejected the request | 502 | `ai_upstream` | | Retry with backoff |
| `AppError::AiDisabled` | no API key configured | 503 | `ai_disabled` | | Degrade: hide AI features |
| `TimeoutLayer` | a handler still running after 240 s | 503 | none: empty body | | Retry with backoff if idempotent |
| `AppError::Database`, `Internal` | a failed query, a bug | 500 | `database_error`, `internal_error` | | Report it; retry sparingly |

Two rows share a status with different codes (403 `csrf` and 403 `forbidden`; 429 from the middleware and from the domain), which is exactly why the code exists: the status tells generic infrastructure the class, and the code tells the client which case it is.

## Under the hood: how a JSON body becomes 400, 413, 415 or 422

`AppJson<T>` in `crates/api/src/extractors.rs` delegates to Axum's `Json` and converts its rejection. In Axum 0.8.9 the rejection is chosen in three steps, and each maps to a row above:

1. **Content type.** If the `Content-Type` header does not parse as a JSON media type, the extractor rejects with `MissingJsonContentType`: 415.
2. **Buffering.** The body is read into memory through the `DefaultBodyLimit::max(512 * 1024)` set on the `/api` router in `app.rs`; passing it raises `LengthLimitError`: 413.
3. **Deserialising.** `serde_json` classifies its error. `Category::Syntax` and `Category::Eof` (the bytes are not JSON, or stop early) become `JsonSyntaxError`: 400. `Category::Data` (valid JSON that does not fit `T`: a number where a string belongs, a missing field) becomes `JsonDataError`: 422.

`JsonError::into_response` then picks the code from the status, so the mapping lives in one `match` and a new rejection kind falls through to `validation_error` rather than to plain text. Traced on four bodies for `LoginInput { email, password }`:

| Body | serde_json category | Rejection | Response |
|---|---|---|---|
| `{"email": "a@b.co", "password": "x"}` | none | none: the handler runs | `422` from `LoginInput::validate` if the email or password is invalid, otherwise the login |
| `{"email": "a@b.co"` | `Eof` | `JsonSyntaxError` | `400 bad_request` |
| `{"email": 5, "password": "x"}` | `Data` | `JsonDataError` | `422 validation_error` |
| 600 KiB of JSON | not reached | `LengthLimitError` | `413 payload_too_large` |

## Translate upstream errors, never forward them

`crates/core/src/ai/anthropic.rs` shows the same discipline at the outbound edge. Its `map_status` function converts the AI provider's status into Ascend's semantics:

- Provider `429` becomes `AppError::RateLimited` with `retry_after_secs: Some(30)`, so the user sees "slow down" and the browser gets a `Retry-After`.
- Provider `529`/`503` becomes `AiUpstream("the AI provider is overloaded; try again shortly")`, a 502 to the browser.
- Provider `401`/`403` becomes `AiUpstream("the AI coach is temporarily unavailable")`, also a 502. An earlier wording, "AI provider rejected our credentials", told every user about the server's configuration; the learner only needs to know the feature is down, and the operator reads the status in the logs.
- Provider `400` becomes `AiUpstream("the AI provider rejected the request")`: a fixed string, with the provider's body sent to the logs, never to the browser.

That last one is the lesson. If the API forwarded the provider's 401, a client would reasonably conclude that the *user's* session had expired (this SPA's auth context in `web/src/lib/auth.tsx` treats a 401 as signed out) and send them to log in again, for a problem that is entirely the server's API key. An upstream status describes the relationship between you and your vendor; your caller needs a status that describes the relationship between them and you.

## What a review flagged, and what changed

The design was sound; careful reviews still found edges, and the before and after are worth more than either alone.

1. **Framework rejections bypassed the shape (fixed twice).** Axum's `Json` extractor answered unparseable bodies with plain text, so the client got no `code` and `web/src/lib/api.ts` fell back to `"http_error"`. The first fix wrapped it in `AppJson` and turned every rejection into `422 validation_error`, which restored the shape but flattened the taxonomy: a broken serialiser and a wrong field looked identical. `AppJson` now keeps Axum's status, as traced above, and the integration test `malformed_json_uses_the_api_error_shape` pins the 400. Your error contract covers the failures your framework produces, not only your own.
2. **Middleware speaks the same dialect, and now tells the truth about waiting.** The CSRF middleware and the rate limiter use `ErrorBody` although neither is an `AppError`. The limiter used to send a fixed `retry-after: 60` whatever the real wait; it now asks the GCRA limiter when the next request will be allowed (`throttled_responses_say_when_to_retry`), and the SPA's query client in `web/src/main.tsx` retries reads at most twice, waiting as long as the server asked, capped at 10 seconds. Domain 429s had no header at all until `RateLimited` gained `retry_after_secs`, which the daily AI budget fills with the seconds to the next UTC midnight (`rate_limited_errors_carry_retry_after_when_known`). When a fact must reach the wire, give it a field in the error type, not a special case in one handler.
3. **Vendor text crossed the boundary (fixed).** The 400 branch of `map_status` used to put up to 200 characters of the provider's body into the browser's message, and a provider's validation error can quote the prompt. Every such site now calls `AppError::ai_upstream(public, detail)`, which logs `detail` and returns only `public`, and a unit test replays a stream whose error event says SECRET and asserts the learner never sees it. "Only strings we wrote reach the client" is a rule you can audit.
4. **Timeout semantics (fixed).** `TimeoutLayer` used to answer `408 Request Timeout`, which RFC 9110 defines as the *client* failing to send its request in time, and some clients retry automatically. It now answers `503`. One edge remains: the timeout's body is empty, so for this status the SPA still falls back to `"http_error"`.
5. **Login failures are 422.** Unknown email and wrong password both return `Validation("invalid email or password")`, and `crates/api/tests/api.rs` asserts that the two bodies are identical, so the endpoint does not enumerate accounts. Whether the status should be 401 is a judgement call, taken up in the follow-ups below; consistency and a test are what matter.

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

The cheapest way to make retries safe is to **design operations to be idempotent by construction**. Ascend's `PUT /api/progress/lessons/{track}/{module}/{lesson}` sends the desired state (`{"status": "completed"}`), and the service writes it with an upsert keyed on `(user_id, lesson_slug)` (`crates/core/src/services/progress.rs`). Sending it once or five times leaves the same row. The streak log it also writes is idempotent the same way: `activity_days` has one row per user per UTC day, inserted with `ON CONFLICT DO NOTHING`, and the integration test `activity_counts_toward_the_streak_and_is_recorded_once_per_day` sends the same PUT twice and asserts a single row.

`POST /api/comments` is different: two identical posts create two comments. When an operation is inherently "create a new thing" or "move money", the client supplies an **idempotency key**: a unique ID per logical operation, sent as a header. The server records the key with a hash of the request and the response. A retry with the same key gets the stored response without re-executing; the same key with a *different* body is a client bug and gets a client error (422 is a common choice); a retry that arrives while the first attempt is still running gets a 409 or waits.

```viz
{"type": "system", "algorithm": "idempotency-key", "title": "Idempotency keys turn retries into replays", "caption": "The second request carries the same key, so the server returns the stored result instead of charging twice. Keys need a TTL and must be scoped per caller."}
```

Traced for `POST /payments` with `Idempotency-Key: k1`, where the server stores the key, a hash of the body and the response:

| # | Request | Stored before | Server does | Response |
|---|---|---|---|---|
| 1 | key `k1`, body hash `h1` | nothing | inserts `(caller, k1, h1, in progress)` in the transaction that charges the card, then stores the response | `201` |
| 2 | the same, after the first reply was lost | `(k1, h1, done, 201 …)` | returns the stored response; no second charge | `201`, replayed |
| 3 | key `k1`, a different body `h2` | `(k1, h1, done)` | refuses: the key names another request | `422` |
| 4 | the same as 1, while 1 is still running | `(k1, h1, in progress)` | refuses, or waits for 1 to finish | `409` |
| 5 | key `k1`, 25 hours later, with a 24-hour TTL | expired | treats it as new: a second charge | `201` |

Row 5 is why the TTL must outlast every client's retry window. The details that separate a senior design: scope keys per authenticated caller (so one user cannot replay another's response), store the key in the same transaction as the side effect, and expire keys after a window your clients' retry policies fit inside. The full pattern, including exactly-once illusions, is in [idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries).

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

### A page boundary, traced

Traced on one lesson's comments, newest first, two per page. Rows 5 and 6 share a timestamp, and between the two page requests a new comment, 8, arrives:

| Row id | 7 | 6 | 5 | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|---|---|
| `created_at` | 10:00:20 | 10:00:12 | 10:00:12 | 10:00:09 | 10:00:05 | 10:00:05 | 10:00:00 |

| Pagination | Page 1 | Cursor after page 1 | Page 2, after comment 8 arrives | Result |
|---|---|---|---|---|
| `OFFSET` | 7, 6 | `offset=2` | 6, 5 | Row 6 shown twice |
| Timestamp only | 7, 6 | `created_at < 10:00:12` | 4, 3 | Row 5 never shown |
| Keyset on `(created_at, id)` | 7, 6 | `(created_at, id) < (10:00:12, 6)` | 5, 4 | Correct |

The cursor the client receives is opaque: `WyIyMDI2LTA5LTI4VDEwOjAwOjEyWiIsNl0`, the base64url of the JSON `["2026-09-28T10:00:12Z",6]`, which you can later change to include a version or a sort key without breaking anyone who treats it as a string.

The cost difference is measured on SQLite 3.53.1 in memory, one million comments on one target, an index on `(target, created_at, id)` and 20 rows per page: `OFFSET 10000` took 0.18 ms, `OFFSET 500000` 9.0 ms and `OFFSET 999980` 19.0 ms, because the database walks every skipped index entry, while the keyset query took 0.005 ms at every depth, a seek plus 20 rows. On Postgres the [schema migrations lesson](/learn/databases/data-modeling-and-evolution/schema-migrations-at-scale) measured the same shape: 67 ms at offset 1,990,000 against 0.77 ms for the keyset query.

Ascend today does not paginate comments: `CommentService::list` returns the newest 500 rows per target, reverses them into oldest-first order, and builds threads in memory. (The first version kept the *oldest* 500, so on a busy lesson new comments silently never appeared; which end of the list a cap discards is a contract decision too.) That is a reasonable contract for a lesson's discussion, and the index in `migration/src/m0004_community.rs`, on `(target_kind, target_slug, created_at)`, is already most of what a cursor needs; appending `id` as a final column would resolve the tiebreaker inside the index too. The senior point is that the cap is part of the contract: the client should know that a lesson with more than 500 comments returns only the newest 500, or the API should say so in the response.

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

A breaking change, worked. Suppose `GET /api/auth/me` must replace the boolean `onboarded` with `onboarded_at`, a timestamp. Rather than one release that renames the field, run expand and contract on the contract itself:

| Release | Server sends | Clients read | Why it is safe |
|---|---|---|---|
| N | `onboarded` | `onboarded` | |
| N+1, expand | `onboarded` and `onboarded_at` | `onboarded` | Additive; tolerant readers ignore the new field |
| N+2, migrate | both | `onboarded_at`, falling back to `onboarded` | Old tabs and old app versions still get `onboarded` |
| N+3, contract | `onboarded_at` only | `onboarded_at` | Only after logs show no client version reading the old field for a full window |

For clients you do not ship yourself, announce the removal with a `Sunset` header (RFC 8594) carrying the date, log the client version on each request so "nobody reads it" is a query rather than a hope, and keep the old field for the window your slowest client needs (months for mobile apps, which users do not update on your schedule).

When you must break, you choose a versioning strategy: a path prefix (`/v2/...`), a header, or per-client pinned versions where the server keeps translating old shapes (the approach popularised by date-versioned public APIs). All of them cost a period where you run two contracts, so the real skill is needing it rarely.

Ascend has an unusual advantage: the SPA and the API ship in the same binary, so there is only one client version per deploy. Almost. A browser tab opened before a deploy keeps running the old JavaScript against the new API until it reloads. `crates/api/src/app.rs` serves `index.html` with `no-cache` and hashed assets as `immutable`, so a reload always picks up the new bundle, but between deploy and reload the API must still accept the previous client's requests. Since commit `8f82820` the server answers a code chunk from the previous build with a `404` instead of `index.html`, and the SPA reloads once when a chunk fails to load, which shortens that window without closing it: an old tab that needs no new chunk keeps sending old requests until the user reloads. "Backward compatible for one release" is the practical rule even for a monolith.

## Validators are part of the contract

Caching is part of the contract too. Content responses carry an `ETag`, and a browser that sends it back in `If-None-Match` gets a `304 Not Modified` and keeps its cached body. The ETag used to be the content fingerprint alone, so a deploy that changed only the code shaping a response (for example which quiz fields are stripped) left the validator unchanged, and browsers kept serving themselves the old shape. `crates/api/src/build_info.rs` now hashes the content version, the build id (the commit, passed in by the Docker build) and the SPA's `index.html` together, so any deploy that could change the bytes changes the validator. The rule: a validator must cover everything that determines the response, not only the data. The broader treatment is in [API design and versioning](/learn/system-design/building-blocks/api-design-and-versioning).

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Clients hammer the server harder during rate limiting | Throttling answered with `503`, or `429` without a truthful `Retry-After` | `429` with the limiter's own wait time; clients honour it |
| Users are logged out when a vendor key is rotated | The vendor's `401` forwarded to the browser | Translate to `502`/`503` with a fixed message; alert the operator |
| A client crashes right after a deploy that only added an error code | An exhaustive `switch` on `code` | Tolerant readers: unknown codes take the generic path |
| Deep pages are slow and occasionally show duplicates | `OFFSET` pagination over a table with inserts at the head | Keyset cursor on `(created_at, id)` with a matching index |
| A retried checkout charges twice | A non-idempotent `POST` with no key, or a key TTL shorter than the retry window | Idempotency keys stored with the side effect, TTL above every retry policy |
| Browsers keep an old response shape after a deploy | The `ETag` covered the data but not the code that shapes it | Include the build id, as `build_info.rs` does |
| Some errors show "Something went wrong" with no code | A framework path outside the error shape: a plain-text rejection, an empty-bodied timeout | Wrap framework rejections; give every status a body |

## Trade-offs

| Pagination | Cost at depth | Stable under inserts | Jump to page N | Sorting |
|---|---|---|---|---|
| `OFFSET` | Grows with the offset (19 ms at one million rows) | No: duplicates and gaps | Yes | Any order |
| Keyset cursor | Constant (0.005 ms) | Yes | No, only next and previous | Only orders an index serves, with a unique tiebreaker |
| Snapshot token (a stored result set) | Constant after the first page | Yes, frozen in time | Yes | Any, at the cost of storage per query |

| Versioning | Visible in logs and caches | Server cost | Client effort | Fits |
|---|---|---|---|---|
| Additive changes only | Yes | Lowest | Tolerate unknown fields | Most internal and first-party APIs, Ascend included |
| Path prefix (`/v2/…`) | Yes, in every URL | Two code paths for the overlap | Change base URLs | Public APIs with rare, large breaks |
| Header or media-type version | Only if logged | Routing on a header | Send the header | APIs that version resources independently |
| Date-pinned per client | Yes, per account | A translation layer per old version | None until they choose to move | Large public platforms with slow-moving integrators |

## Interviewer follow-ups

**"Wrong password: 401 or 422?"** Model answer: either is defensible if it is consistent and the body is identical for unknown email and wrong password. 422 has a practical edge in an SPA whose global handler treats every 401 as "session expired, go to login", as Ascend's `web/src/lib/auth.tsx` does. Common wrong answer: "404 for an unknown email", which turns login into an account-enumeration oracle.

**"Design pagination for a feed where new items arrive at the top."** Model answer: keyset on `(created_at DESC, id DESC)` with a composite index, an opaque versioned cursor, no exact total count (or an estimate), and no "jump to page 500"; search and filters replace deep paging. Common wrong answer: "offset with a cache", which is still slow on a miss and still shows duplicates.

**"How do you remove a field from a public API?"** Model answer: expand and contract on the contract: add the replacement, move clients, announce a sunset date, measure reads of the old field per client version, and remove it only when the logs show nobody has read it for a full release window. Common wrong answer: "bump to `/v2`" for every change, or "remove it and see who complains."

**"What should a client do on 429, 503 and 500?"** Model answer: on 429, wait for `Retry-After` and resend; on 503, retry with exponential backoff and jitter, and degrade if it persists; on 500, retry only idempotent requests, once or twice. A circuit breaker counts timeouts and 5xx, never 4xx. Common wrong answer: "retry everything three times immediately", which turns an overload into an outage.

## What mid-level engineers get wrong

- **Choosing status codes per handler**, so the same failure comes back as 400 in one route and 500 in another.
- **Returning internal detail** (SQL, hostnames, vendor bodies) in error messages, which leaks and becomes contract.
- **Forwarding a dependency's status** to your own callers.
- **Clients that parse messages** instead of codes, or that treat the set of codes as closed.
- **Offset pagination on growing tables**, and cursors without a unique tiebreaker.
- **Retry-safe by assumption.** A `POST` retried by a proxy or a mobile client charges twice without a key.
- **Validators that cover data but not code**, so caches serve an old shape after a deploy.

## Senior signals

- You classify errors by **the caller's next action** and can defend 401 vs 403, 403 vs 404 and 429 vs 503 in one sentence each.
- You insist on **stable machine codes** separate from human messages, and you reject client code that parses messages.
- You map errors to transport **in exactly one place**, and that place logs internal detail with a request ID and returns a generic message.
- You **translate upstream errors** into your own semantics instead of forwarding a vendor's status to your users.
- You make operations **idempotent by construction** where possible, and specify idempotency keys (scope, storage, TTL, conflicting reuse) where not.
- You choose **cursor pagination** for anything that grows, with a unique tiebreaker, and you document caps and tolerant-reader rules as part of the contract.
- You can list **every error a client can see**, including the ones your framework and middleware produce, and you remove fields by expand and contract with measured usage.

## Check yourself

```quiz
- q: >-
    Your API calls a payment provider, which returns 401 because your server's API key was rotated. What should your API return to its own client?
  options: ["403, since the provider denied access to the resource", "200 with an error field, so the client's retry logic stays out of it", "502 or 503 with a generic message, and alert the operators", "401, forwarding the provider's status so the client re-authenticates"]
  answer: 2
  explanation: >-
    The provider's 401 describes your server's credentials, not the end user's. Forwarding 401 tells the client its own session is invalid, which may log the user out for a server-side problem (Ascend's SPA treats any 401 as signed out), and a 403 tells the user they lack a permission they cannot obtain. Translate it to a gateway or unavailable status, keep the vendor's detail in the logs and page someone. A 200 hides the failure from every retry library and dashboard.
- q: >-
    A user requests /api/interviews/{id} for an interview that belongs to someone else. Ascend's InterviewService::get returns NotFound rather than Forbidden. Why?
  options: ["Browsers retry a 403 automatically, doubling the load", "A 403 would confirm that an interview with that ID exists", "Forbidden is reserved for admins, and interviews have no admin role", "A 404 can be cached by the browser, so repeat probes are cheaper"]
  answer: 1
  explanation: >-
    For private resources, 403 leaks existence. Returning 404 for both "missing" and "not yours" gives an attacker enumerating IDs no signal. Forbidden is an ordinary variant with no admin meaning: the comment-deletion path returns it to anyone who is neither the author nor an admin, because a comment's existence is already public. Caching and automatic retries play no part in the choice.
- q: >-
    Which change to a public JSON API is most likely to break existing clients even though it only adds something?
  options: ["A new optional query parameter that defaults to the old behaviour", "A new endpoint next to the existing ones in this version", "A new optional field in a response that clients already parse", "A new value in the error-code enum that clients switch on"]
  answer: 3
  explanation: >-
    Clients that treat the set of codes as closed (an exhaustive switch) will crash or mishandle the new value. That is why the contract should tell clients to fall back to generic handling for unknown codes. New optional fields, new endpoints and defaulted parameters are ignored by tolerant clients.
- q: >-
    A feed endpoint uses ?offset=N&limit=20. Users on page 300 report slow responses and occasional duplicates. What fixes both?
  options: ["Sort by id ascending so new rows append at the end, not the front", "Put a cache in front of the endpoint keyed on offset and limit", "Raise the limit to 100 so that users need far fewer pages", "Use a keyset cursor on (created_at, id) backed by an index"]
  answer: 3
  explanation: >-
    Offsets make the database scan and discard every earlier row, and inserts shift page boundaries. A cursor seeks directly via the index and pages relative to the last row seen, so the cost is constant and rows are neither skipped nor repeated. Sorting ascending stops new rows shifting earlier pages but keeps the scan cost (and deletes still shift pages); a cache or bigger pages hide the cost without fixing correctness.
- q: >-
    A client retries POST /payments with the same Idempotency-Key but a different amount. What should the server do?
  options: ["Reject it with a client error, since the key now names another request", "Process it as a new payment, since the body differs from the first", "Update the first payment to the new amount and return the result", "Return the stored response of the first request without re-running"]
  answer: 0
  explanation: >-
    The key identifies one logical operation. The server stores a hash of the original request; a mismatch means the client has a bug, and silently replaying the old response or re-executing would hide it. Replaying the stored response is right only when the request matches.
- q: >-
    A newest-first feed pages with a cursor on created_at alone. Page 1 ends at a row stamped 10:00:12, and another row has that same timestamp. What happens on page 2?
  options: ["The row sharing the timestamp is shown twice, once on each page", "Nothing, since two rows can never share an identical timestamp", "The row sharing the timestamp is skipped by created_at < 10:00:12", "The database adds the primary key to the comparison implicitly"]
  answer: 2
  explanation: >-
    The next page asks for created_at strictly below the last value seen, so any unseen row with the same timestamp is excluded forever. Duplicates are the offset failure, not this one. Adding id as a tiebreaker in both the ORDER BY and the cursor, (created_at, id) < (10:00:12, 6), makes the order total; databases never add it for you, and equal timestamps are common at any real write rate.
```
