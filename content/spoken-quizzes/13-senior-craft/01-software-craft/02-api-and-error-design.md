---
lesson: api-and-error-design
source: 242a6f8f6912b029
---
## 1

Your API calls a payment provider, which returns 401 because your server's own API key was rotated. What should your API return to its client?

A, 403, since the provider denied access to the resource. B, 200 with an error field, so the client's retry logic stays out of it. C, 502 or 503 with a generic message, and alert the operators. D, 401, forwarding the provider's status so the client re-authenticates.

[think]

The answer is C: 502 or 503 with a generic message, and alert the operators.

The provider's 401 describes your server's credentials, not the user's. Forwarding it tells the client its own session is invalid, which can log the user out for a server-side problem; Ascend's web app treats any 401 as signed out. A 403 tells the user they lack a permission they cannot get. Translate it to a gateway or unavailable status, keep the vendor's detail in the logs, and page someone. A 200 hides the failure from every retry library and dashboard.

## 2

A user requests an interview by its ID, but the interview belongs to someone else. Ascend's interview service returns not found rather than forbidden. Why?

A, browsers retry a 403 automatically, doubling the load. B, a 403 would confirm that an interview with that ID exists. C, forbidden is reserved for admins, and interviews have no admin role. D, a 404 can be cached by the browser, so repeat probes are cheaper.

[think]

The answer is B: a 403 would confirm that an interview with that ID exists.

For private resources, a 403 leaks existence. Returning 404 for both missing and not yours gives an attacker who is enumerating IDs no signal. Forbidden has no special admin meaning: deleting a comment returns it to anyone who is neither the author nor an admin, because a comment's existence is already public. Caching and automatic retries play no part in the choice.

## 3

Which change to a public JSON API is most likely to break existing clients, even though it only adds something?

A, a new optional query parameter that defaults to the old behaviour. B, a new endpoint next to the existing ones in this version. C, a new optional field in a response that clients already parse. D, a new value in the error code enum that clients switch on.

[think]

The answer is D: a new value in the error code enum that clients switch on.

Clients that treat the set of codes as closed, with an exhaustive switch, will crash or mishandle the new value. That is why the contract should tell clients to fall back to generic handling for unknown codes. New optional fields, new endpoints and defaulted parameters are simply ignored by tolerant clients.

## 4

A feed endpoint pages with an offset and a limit of 20. Users on page 300 report slow responses and occasional duplicates. What fixes both?

A, sort by ID ascending, so new rows append at the end, not the front. B, put a cache in front of the endpoint, keyed on offset and limit. C, raise the limit to 100, so users need far fewer pages. D, use a keyset cursor on created at and ID, backed by an index.

[think]

The answer is D: a keyset cursor on created at and ID, backed by an index.

An offset makes the database scan and discard every earlier row, and inserts shift the page boundaries. A cursor seeks directly through the index and pages relative to the last row seen, so the cost is constant and rows are neither skipped nor repeated. Sorting ascending stops new rows shifting earlier pages, but keeps the scan cost, and deletes still shift pages. A cache or bigger pages hide the cost without fixing correctness.

## 5

A client retries a payment request with the same idempotency key, but a different amount. What should the server do?

A, reject it with a client error, since the key now names a different request. B, process it as a new payment, since the body differs from the first. C, update the first payment to the new amount and return the result. D, return the stored response of the first request without running anything again.

[think]

The answer is A: reject it with a client error, since the key now names a different request.

The key identifies one logical operation. The server stores a hash of the original request, and a mismatch means the client has a bug. Silently replaying the old response, or running it again, would hide that bug. Replaying the stored response is right only when the request matches.

## 6

A newest-first feed pages with a cursor on the created at timestamp alone. Page 1 ends at a row stamped 10:00:12, and another row has exactly that timestamp. What happens on page 2?

A, the row sharing the timestamp is shown twice, once on each page. B, nothing, since two rows can never share an identical timestamp. C, the row sharing the timestamp is skipped, because page 2 asks for timestamps strictly before 10:00:12. D, the database adds the primary key to the comparison implicitly.

[think]

The answer is C: the row sharing the timestamp is skipped.

The next page asks for timestamps strictly below the last value seen, so any unseen row with the same timestamp is excluded forever. Duplicates are the offset failure, not this one. Adding the ID as a tiebreaker, in both the sort order and the cursor, makes the order total. Databases never add it for you, and equal timestamps are common at any real write rate.
