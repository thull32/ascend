---
lesson: anatomy-of-a-request
source: 79ccb04b019c3327
fit: great
desk:
  - "The outer and API router code, and the table of why each layer sits where it does"
  - "The request-path flowchart and the round-trip sequence diagram"
  - "The AppError enum and the mapping function in error.rs"
  - "Exercise: trace a request through the middleware onion"
---
## Introduction

You tap "Mark complete" at the end of a lesson, and the button turns green about thirty milliseconds later. In between, the request crossed a TLS terminator, nine layers of middleware around the whole app, three more around the API, four extractors, one service, three database round trips, and a single function that turns domain errors into status codes. Then it went back out through most of those layers in reverse.

Every one of those steps is ordinary. The interesting part is the order. Move the request-ID layer inside the tracer and every log line says the request ID is a dash. Put the timeout outside the tracer and timed-out requests vanish from your logs. Check the body before the session and you parse JSON for strangers.

Four ideas, then. How to read a middleware chain, and what each position buys. Authentication as a lazy type rather than a middleware. Thin routes. And the one place where domain errors become HTTP, including the four places that contract leaked.

## The onion rule

The request is a PUT to the progress endpoint for one lesson, carrying the session cookie and a tiny JSON body that says "completed". Railway's edge terminates TLS, adds an X-Real-IP header with the address it saw, and forwards plain HTTP to the container. That is why the rate limiter believes X-Real-IP and nothing else: the proxy sets and overwrites it, while the first entry of X-Forwarded-For is whatever the client wrote. The front end also adds an X-Requested-With header, for the CSRF check you will meet shortly.

In Axum, here is the rule that makes the code readable. Each call to layer wraps everything built before it. So the last layer call in the source is the outermost layer. Read the chain bottom-up to get the order the request sees, and the response unwinds top-down.

Outermost of all is a sanitiser that throws away a client-supplied request ID unless it parses as a UUID, so nobody can pollute the logs with attacker-chosen values. Just inside it, a redirect sends old host names to the canonical one. Then the layer that sets a fresh request ID, then one that copies it onto the response, then the tracer, then metrics, then a 240-second timeout, then compression, then security headers. Inside that, for API routes only, come a body limit of 512 kibibytes, a general rate limit, and the CSRF check.

## Why each layer sits where it does

Take the positions that carry a story.

The request ID is set outside the tracer, because the tracer reads the header when it creates its span. Move the ID layer inside and every span logs a dash, and users quote request IDs that match nothing. The ID is copied onto the response outside the timeout, because a timed-out request is exactly the one a user will report.

Metrics sit outside the timeout, and that position was learned the hard way. Until a later fix, the metrics layer sat inside the timeout, so a request the 240-second timeout ended was never recorded, and a hung endpoint looked healthy on the dashboard. Now a cut-off request is counted as a 503 against the availability objective.

The general rate limit sits outside the CSRF check, so a rejected cross-site attempt still spends a token. Put it inside, and a flood of CSRF-rejected requests would be free, and the CSRF layer would do work for traffic the limiter was about to drop. The question to ask of any ordering is who pays for a rejection.

And a rejection short-circuits only what is inside it. When the rate limiter answers 429, the CSRF check and the handler never run. But everything outside still runs on the way out, so the 429 carries a request ID, security headers and a log line.

Two subtleties about the timeout. It bounds the response head, not the body. A streaming coach reply returns its headers at once and then streams for as long as the model talks, so 240 seconds never cuts an SSE stream. It exists for the slow non-streaming AI calls, such as quiz generation. An earlier version answered with the framework's default, 408 Request Timeout. HTTP lets a client repeat a request after a 408, which is the wrong signal for a server-side deadline on a POST, so a code review changed it to 503.

The second subtlety: the AI client's own timeout is 180 seconds, inside the 240. So the specific upstream error fires first, and the generic timeout is a backstop. Inner deadlines shorter than outer ones is the general rule.

## Authentication as a type

After routing, Axum runs the handler's arguments left to right, and only the last one may consume the body. For marking a lesson complete the order is the shared state, the current user, the path, and then the JSON body. That order is policy. An unauthenticated request with a malformed body gets 401, not a parse error, because the session is checked before a single byte of the body is read.

Here is the decision. The session is resolved by an extractor, a type a handler names in its signature, not by a middleware that runs for every API request. Why? Most of Ascend's traffic is public: the curriculum, lessons, problems, search. A middleware would add a database query to every one of them, putting Postgres on the hot read path that was designed to avoid it. The extractor is lazy. Only handlers that name a user pay for a lookup, and the result is cached for the request, so naming it twice still costs one query.

What it costs. Authentication is opt-in per handler, so a new mutating endpoint that forgets the current-user extractor is public, and only review and tests catch it. And because middleware runs before extractors, the rate limiter cannot ask who the user is. For a long time, that meant every limiter was keyed by IP.

So how is the AI limiter per user? Before I tell you, think about it: the limiter runs before anyone is authenticated.

[pause]

It keys on a 16-byte SHA-256 digest of the session cookie, falling back to the IP when there is no cookie. The grading limiter uses the same key. That is safe precisely because of the order. A forged cookie earns a fresh bucket, but only for a request the extractor then rejects with 401 before any model or sandbox runs, and that request has already spent a token from the per-IP general bucket on the way in.

The option to move to as the surface grows is a route layer that requires a session for a whole group of private routes. Public paths stay free, and the private default becomes safe.

## Thin routes and the round trip

Each handler behind the progress router parses input, calls one service method and maps the result. None touches the database. That is what lets the core crate be tested and reused without HTTP, and what would let you move a service into a worker at 100x without rewriting endpoints. A useful review heuristic: when a handler calls two services, ask whether a service method is missing.

Our request makes three database round trips. One looks up the session joined to the user. One is the progress upsert, which returns the row. One inserts today into the activity log. Each costs roughly a millisecond in the same region; most of the thirty milliseconds goes on the network between the browser and the edge, and the twelve layers of middleware cost microseconds.

That count has moved twice, both times on purpose. An earlier version ran the upsert and then re-read the row with a separate select. Returning the row from the upsert removed a round trip from the most frequent write in the product. Then the streak fix added one back: the activity-log insert that makes streaks correct. One millisecond for correct streaks is a good trade.

## From AppError to HTTP

The domain speaks in semantic errors: validation, unauthorised, forbidden, not found, conflict, rate limited, unavailable, upstream AI failure, database, internal. Each has a stable machine code. The API maps them to statuses in exactly one function. Validation becomes 422, conflict 409, rate limited 429, unavailable 503, an upstream AI failure 502, and database and internal errors become 500 with the message "internal error". The detail goes to the log, inside the request's span, so the log line carries the request ID a user can quote. The front end branches on the code, never on English text.

The rejected alternatives. Using a catch-all error type all the way up makes every failure a 500 and loses the difference between "no such lesson" and "Postgres is down". Choosing status codes inside each handler produces thirty slightly different conventions. Passing database errors through leaks constraint names and SQL fragments. A unit test builds an internal error containing a connection string and asserts the response body does not contain it.

When this module was first drafted, reading rather than testing found four gaps between the contract as designed and as enforced. Three are closed.

The first was misclassification. Registration checked for an existing email and then inserted. Two simultaneous registrations for one address both passed the check, the second insert hit the unique index, and that was a database error, so the loser saw a 500 instead of a 409. The one-place mapping is only as good as the classification feeding it. The fix classifies at the source: hash the password, insert, and turn a unique violation into a conflict. The test fires four registrations at once and expects one success and three 409s.

The second was framework rejections. Axum's own body rejections answered in plain text, not the API's shape. The first fix wrapped them as validation errors, which fixed the shape and broke the status: a syntax error, an oversized body and a wrong content type all answered 422. Now each keeps its own status. Malformed JSON is 400, too large is 413, wrong media type is 415, and 422 is only for well-formed JSON with the wrong fields. A 400 says your bytes are broken; a 422 says your fields are wrong.

The third was retry hints. Every 429 said retry after 60 seconds, though the general bucket refilled far faster. The algorithm behind every bucket knows exactly when the next request would be allowed, and the response now says so. Domain errors could not carry a hint at all, until the variant gained a retry-after field. The fix was a type change, not a header tweak: once the error could express when, every producer could say it, and one place could send it.

The fourth is still open. The timeout's 503 has an empty body and, because it is produced outside the security-headers layer, no security headers.

## In the interview

Here is one the lesson expects. A learner reports a 503 after exactly four minutes on quiz generation. Walk me through it.

[pause]

240 seconds is the outer timeout. The AI client's own timeout is 180 seconds and would have produced a 502 first, so the model call was not the slow part. Find the request ID's log line, then look at what else the handler awaited. A pool acquire is bounded at 5 seconds; a database statement is not. The wrong answer is "raise the timeout", which hides the unbounded wait and holds a pooled connection longer. At 100x, give ordinary routes deadlines of a few seconds, set a statement timeout in Postgres, and keep long deadlines for the AI routes only.

## Recap

Four things to remember. The last layer call is the outermost layer: request IDs go outermost, logging and metrics outside the timeout, and the cheap rate limit before the CSRF check so every rejection costs a token. Inner deadlines must be shorter than outer ones, and a server deadline is a 503, not a 408. Lazy authentication keeps public reads off the database, at the price of opt-in auth per handler, and a cookie digest lets the limiter key by session safely. And map domain errors to HTTP in one place, then go looking for the leaks: misclassified database errors, framework rejections, and errors with nowhere to say when to retry.

At your desk: the two router definitions and the layer table, the round-trip diagram, the error mapping, and the onion exercise.
