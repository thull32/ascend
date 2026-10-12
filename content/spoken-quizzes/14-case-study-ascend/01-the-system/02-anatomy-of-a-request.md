---
lesson: anatomy-of-a-request
source: 5a8950af517c1660
---
## 1

An Axum router adds its routes, then calls layer with A, then layer with B. Which layer does an incoming request reach first, and which layer does the response leave last?

A, B first, and the response leaves A last. B, B first, and the response leaves B last. C, A first, and the response leaves A last. D, A first, and the response leaves B last.

[think]

The answer is B: B first, and the response leaves B last.

Each call to layer wraps everything built before it, so B wraps A. The request enters B, then A, then the route; the response leaves A, then B. Reading the chain from the bottom up gives the request order, and the response unwinds in reverse.

## 2

The general rate limiter rejects a request with a 429. Which statement about that response is true in Ascend's stack?

A, it carries a request ID and the security headers, and is logged, because those layers are outside the limiter. B, it skips compression and the security headers, because a rejection bypasses the router. C, it is not logged, because the trace layer only records responses that succeeded. D, it has no request ID, because the handler that would have set one never ran.

[think]

The answer is A: it carries a request ID and the security headers, and is logged.

A rejection short-circuits only the layers inside the limiter: the CSRF check, the extractors and the handler. Everything outside it, including the layers that set and propagate the request ID, the trace layer, compression and the security headers, still processes the response on the way out. The request ID is set by middleware, not by handlers.

## 3

Why does Ascend's Anthropic client use a 180 second timeout, when the global timeout layer is 240 seconds?

A, it is an accident, and the two numbers should be made to match. B, Railway requires every request to finish in under 200 seconds. C, the client timeout only applies to streaming responses anyway. D, the inner deadline fires first, so the specific AI error wins out.

[think]

The answer is D: the inner deadline fires first, so the specific AI error wins out.

When the inner deadline fires first, the domain can classify the failure and return its AI upstream error, a 502 with a clear code, instead of a generic 503 with an empty body. If the outer one fired first, the domain would never know. The global layer is a backstop, and the general rule is that inner deadlines are shorter than outer ones.

## 4

Ascend resolves sessions in an extractor, rather than in a middleware that runs for every API request. What is the main benefit, and what is the main cost?

A, benefit: public reads skip the session query. Cost: each handler must opt in to auth. B, benefit: CSRF checks are no longer needed. Cost: logins become slower. C, benefit: sessions are cached across requests. Cost: a revoked session may go stale. D, benefit: fewer lines of code. Cost: none worth naming in review.

[think]

The answer is A: public reads skip the session query, and the cost is that each handler must opt in to auth.

The extractor is lazy, so only handlers that ask for the current user, or the optional user, pay for a lookup, which keeps public hot paths off Postgres. The flip side is that a handler that forgets to ask for the current user is public, and middleware such as the rate limiter cannot ask who the user is. Sessions are resolved per request, never cached across requests.

## 5

Two registrations for the same new email arrive at the same moment. What does the losing client receive today, and why is the password hashed before the insert?

A, 422, because the second request fails validation once the email is already claimed. B, 409: the unique violation maps to conflict, and hashing first equalises the timing. C, it waits, because the insert blocks on the first transaction until the timeout. D, 500, because a unique violation is a database error, and all of those map to 500.

[think]

The answer is B: 409, because the unique violation maps to conflict, and hashing first equalises the timing.

The service lets the unique index decide, and maps a unique constraint violation to the conflict error, so the race ends in a 409. Before the fix, a check then an insert let both requests pass the check, and the loser's database error surfaced as a 500. Hashing first also removes the fast path that made already-registered emails answer about 100 milliseconds sooner.

## 6

An unauthenticated client sends a PUT to the lesson progress endpoint, with a malformed JSON body and a valid X-Requested-With header. Which status does it get, and why?

A, 401, because the current user is extracted before the body is read. B, 400, because the body is parsed first, and it is not valid JSON. C, 403, because the CSRF check rejects bodies that fail to parse. D, 422, because validation of the body runs before authentication.

[think]

The answer is A: 401, because the current user is extracted before the body is read.

Extractors run left to right, and the current user comes before the JSON body in the handler's signature, so the session is checked before a byte of the body is read. An authenticated client with the same body would get a 400 bad request. Rejecting strangers first is cheaper, and reveals nothing about the expected payload.
