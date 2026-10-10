---
lesson: api-and-error-design
source: a631ad47d81b3a39
fit: great
desk:
  - "The table of every error a client can see, with codes and Retry-After"
  - "The AppError enum and its single mapping to HTTP"
  - "How a JSON body becomes 400, 413, 415 or 422, traced on four bodies"
  - "The idempotency-key trace and the keyset pagination trace"
  - "Exercise: map domain errors to HTTP responses"
---
## Introduction

A mobile team files a bug: the app shows "Something went wrong" for everything. You look at the API. Validation failures return a 500 with a stack trace. A missing record returns a 200 with an error field. Rate limiting returns 503, so the client's retry library hammers the server harder. And last month someone reworded an error message, which broke client code that was matching on the text.

Every one of those decisions was local and reasonable. Together they make an API nobody can build on.

An API contract is not the happy-path JSON schema. It is everything a caller can observe: status codes, error codes, which operations are safe to retry, how pages are ordered, and which changes will never be made without warning. Four ideas: an error taxonomy built on what the caller should do next, mapping errors in exactly one place, idempotency, and evolving a contract without breaking anyone.

## Everything observable is the contract

Hyrum's law puts it bluntly. With enough users, every observable behaviour of your API will be depended on by somebody, whatever the documentation promises. Message wording, field order, a timeout's status, latency: someone relies on each.

You cannot stop that, but you can give callers something better to depend on. Separate what machines read from what humans read. A stable, machine-readable code, like validation error or rate limited, that you promise never to rename. A human message you are free to reword or translate. And a status code that tells generic infrastructure, retry libraries, proxies and monitoring, which broad class of outcome this is.

## A taxonomy built on the caller's next action

Classify errors by what the caller should do next, not by which library failed. A caller can only do a handful of things. Fix the input and resend: 400 or 422. Log in, then resend: 401. Give up: 403 or 404. Re-read, reconcile and resend: 409, a conflict. Wait, then resend: 429, with a Retry-After header. Retry with backoff: 502 or 504, a dependency failed. Retry later or degrade: 503. And report it: 500, a bug.

Three distinctions interviewers probe. First, 401 versus 403. 401 means "I do not know who you are", and the fix is to authenticate. 403 means "I know who you are, and the answer is no". Logging in again as the same user will not help. A client that logs the user out on a 403 is buggy.

Second, 403 versus 404. Returning 403 for another user's private resource confirms that it exists. When existence itself is sensitive, return 404 for both "missing" and "not yours". The HTTP standard explicitly allows that.

Third, 429 versus 503. 429 says you, specifically, are over a limit. 503 says everyone is affected. Retry libraries and load balancers treat them differently, so never use one for the other.

## One error type, mapped once

Ascend defines one error type for the whole domain, and its rule is that variants are semantic, what went wrong for the caller, not mechanical, which library failed. Validation, unauthorized, forbidden, not found, conflict, rate limited, unavailable, AI upstream, database and internal. Each has a stable machine code that, in the code's own words, is stable across wording changes.

The mapping to HTTP happens once, in a single file in the api crate. Handlers never pick a status code. The body is always a code and a message, and the frontend's single fetch wrapper turns every failure into an error with a status, a code and a message, so components branch on the code, never on text.

The key line in that mapping swallows detail. A database error can contain a hostname, a constraint name, or a fragment of SQL. An internal error can contain a file path. Those go to the logs, where the request ID ties them to the user's report, and the client gets two words: "internal error". Leaking internals is not only an information-disclosure risk. It creates contract you never meant to offer, because clients start matching on it.

And the error type is not the whole contract. The framework's extractors, the middleware and the timeout layer all produce errors before any handler runs. A body that is not valid JSON is a 400. A body over 512 kibibytes is a 413. The wrong content type is a 415. Well-formed JSON with the wrong fields is a 422. The CSRF check returns 403 with its own code, and the rate limiter returns 429. Several statuses carry more than one code, which is exactly why the code exists: the status tells infrastructure the class, and the code tells the client the case.

A review caught this the hard way. Originally the framework answered unparseable bodies with plain text, so the client got no code at all. The first fix wrapped every rejection as a 422 validation error, which restored the shape but flattened the taxonomy: a broken serialiser and a wrong field looked identical. Now each keeps its own status. Your error contract covers the failures your framework produces, not only your own.

## Translate upstream errors, never forward them

The same discipline applies at the outbound edge. When the AI provider returns 429, Ascend turns it into its own rate-limited error with a 30-second Retry-After. When the provider is overloaded, the browser gets a 502 with a fixed message. When the provider rejects Ascend's credentials, the browser also gets a 502, saying the AI coach is temporarily unavailable. An earlier wording told every user about the server's configuration. The learner only needs to know the feature is down; the operator reads the details in the logs.

Here is why it matters. Before I say it: what goes wrong if you simply forward the provider's 401 to the browser?

[pause]

The client reasonably concludes that the user's own session has expired. Ascend's single-page app treats any 401 as signed out, so it would send the user to log in again, for a problem on the server. An upstream status describes the relationship between you and your vendor. Your caller needs a status that describes the relationship between them and you.

One more review finding: the provider's error body used to reach the browser, up to 200 characters, and a provider's validation error can quote the prompt. Now every such site logs the detail and returns only a public string, and a test replays an error saying "secret" and asserts the learner never sees it. "Only strings we wrote reach the client" is a rule you can audit.

## Idempotency is part of the contract

Networks fail after the server has done the work but before the client hears about it. The client cannot tell "never arrived" from "succeeded, reply lost", so it retries. Whether that is safe is a property of your API.

The cheapest way is to be idempotent by construction. Ascend's progress endpoint is a PUT that sends the desired state, "completed", and the service writes it with an upsert keyed on the user and the lesson. Once or five times, the same row.

Creating a comment is different: two identical posts create two comments. When an operation is inherently "create a new thing" or "move money", the client sends an idempotency key, a unique ID per logical operation. The server stores the key with a hash of the request and the response, in the same transaction as the side effect. A retry with the same key gets the stored response, with no second charge. The same key with a different body is a client bug, and gets a client error. A retry that arrives while the first is still running gets a 409, or waits.

Two details separate a senior design. Scope keys per authenticated caller, so one user cannot replay another's response. And make the key's TTL outlast every client's retry window. With a 24-hour TTL, a retry 25 hours later is treated as new, and charges twice.

The taxonomy also shapes your callers' resilience machinery. A circuit breaker should count timeouts and responses in the 500s as failures, and must not count the 400s. A buggy client sending invalid requests should not open the breaker for everyone else.

## Pagination and evolving the contract

An offset page looks simple and has two flaws. The database walks and discards every skipped row, so deep pages are slow. Measured on a million rows, an offset near the end took 19 milliseconds, against 5 thousandths of a millisecond for a cursor at any depth. And if a row is inserted at the head while a client pages, every later page shifts: the client sees a duplicate or silently misses a row.

A keyset cursor asks for rows after the last one seen, using an index to seek straight there, so its cost is constant. The one trap: you need a unique tiebreaker. Picture a newest-first feed paging on timestamp alone. Page one ends at a row stamped 10:00:12, and another row shares that timestamp. Page two asks for everything strictly before 10:00:12, and that row is never shown. Page on the timestamp and the ID together, and the order is total. Encode the cursor as an opaque string so clients cannot construct it.

Now evolution. Adding an optional field, a response field or an endpoint is usually safe. Removing, renaming, changing a type or tightening validation is breaking. The trap is adding an enum value. A client with an exhaustive switch on the error code crashes on a new one. So tell clients up front that unknown codes fall back to generic handling, the tolerant reader principle, and make your own clients do it.

For a real break, say replacing a boolean "onboarded" with an "onboarded at" timestamp, run expand and contract on the contract itself. Send both fields. Move clients to the new one, falling back to the old. Remove the old field only after logs show no client version has read it for a full window, which for mobile apps means months.

Even Ascend, which ships its single-page app and API in one binary, is not exempt. A browser tab opened before a deploy keeps running the old JavaScript until it reloads. So "backward compatible for one release" is the practical rule, even for a monolith.

## In the interview

A follow-up the lesson expects: what should a client do on a 429, a 503 and a 500?

[pause]

On a 429, wait for the Retry-After and resend. On a 503, retry with exponential backoff and jitter, and degrade if it persists. On a 500, retry only idempotent requests, once or twice. The wrong answer is "retry everything three times immediately", which turns an overload into an outage.

And: wrong password, 401 or 422? Either is defensible, if it is consistent and the body is identical for an unknown email and a wrong password, so login does not enumerate accounts. 422 has a practical edge in a single-page app whose global handler treats every 401 as an expired session. The wrong answer is 404 for an unknown email, which turns login into an account-enumeration oracle.

## Recap

Five things to remember. Classify errors by the caller's next action, and defend 401 versus 403, 403 versus 404, and 429 versus 503 in one sentence each. Stable machine codes, separate from human messages. Map errors to HTTP in exactly one place, which logs the detail and returns a generic message, and translate a vendor's errors instead of forwarding them. Make operations idempotent by construction, or specify keys with a scope and a TTL. And page with cursors that have a unique tiebreaker, and evolve contracts additively, with tolerant readers.

At your desk: the full table of client-visible errors, the error type and its mapping, the JSON rejection trace, the idempotency and pagination traces, and the error-mapping exercise.
