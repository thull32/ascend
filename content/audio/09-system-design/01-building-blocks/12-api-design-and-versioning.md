---
lesson: api-design-and-versioning
source: ab76c963272ccb25
fit: great
desk:
  - "The idempotency-key and If-Match traces, as tables"
  - "The keyset pagination query, its query plan, and the offset-versus-keyset measurements"
  - "The full breaking-change catalogue"
  - "The date-pinned version transform code and the retirement timeline"
  - "Exercise: return one keyset page with a tiebreaker"
---
## Introduction

Your public API has 3 thousand integrations. A field is misnamed. A list endpoint uses offset pagination that falls over past page 10 thousand. And errors are free-text strings that customers have started parsing with regular expressions. You cannot fix any of it, because every change breaks someone, and the someones do not upgrade.

That is what an API is: a contract whose other party you do not control and cannot schedule. So the design work is front-loaded. Get the resource model, the error shape, the pagination, the retry contract and the compatibility rules right before the first client ships, and evolution stays additive for years. Get them wrong, and every improvement is a migration.

This is the checklist a senior engineer runs on a new API. Four parts: what goes in the contract on day one, pagination with numbers, rate limits, and how changes break clients and how you retire a version.

## The contract on day one

Start with conventions, chosen once. Resources are plural nouns with a lifecycle. Timestamps in one standard format, in UTC. Money as an integer count of the smallest unit, cents, with a currency code. Identifiers as opaque prefixed strings. Each of those removes a whole category of client bugs. As for style, choose per audience: gRPC between your own services, REST at the public edge, GraphQL at the product edge if client teams want it.

Next, idempotency. GET, PUT and DELETE are idempotent by specification. POST is not. Any POST a client might retry needs a documented idempotency key header. The server stores the key, a hash of the request body, and the response. Follow one key. The first attempt creates an order, but the response is lost because the client's read timed out. A concurrent second attempt with the same key finds the first still in progress and gets a 409: retry shortly. The client's real retry finds it done and gets the original 201 replayed, byte for byte. And a buggy client reusing the key with a different cart gets a 422. Stripe says keys can be pruned once they are 24 hours old, and that window bounds how long a client may retry. Put it in the contract on day one. Adding it later leaves every existing client unsafe to retry.

Then errors. An error response is read by code more often than by people. The standard envelope, R F C 9457, has a type, a title, a status, a detail and an instance, and you add the fields clients need. The HTTP status carries the class of problem. A stable code, from a documented list, never changes meaning. The human-readable detail may change at any time, and the documentation says so. A retryable flag tells the client what to do without a lookup table, which prevents both the client that retries validation errors forever and the one that gives up on a transient 503. And a request ID joins the error to your logs and traces.

Last, lost updates. Two support agents open the same order and each changes something. Without a precondition, the second save silently overwrites the first. The fix is an E-tag, an opaque version of the resource, sent back in an If-Match header. Both agents read version 7. The first saves with If-Match version 7, succeeds, and the order becomes version 8. The second saves with If-Match version 7 and gets a 412, precondition failed, so it re-reads and re-applies its change. On the server that is one conditional update, where the stored version still equals the one the client sent, so the check and the write cannot race. Derive the E-tag from a row version, and where lost updates are unacceptable, reject writes that carry no precondition at all, with a 428.

## Pagination, measured

Every list endpoint paginates, with a documented maximum page size, 100 is common, and a default of around 20. The question is how.

Offset pagination says: skip a hundred thousand rows, give me the next hundred. Keyset, or cursor, pagination says: give me the next hundred rows after this position in the sort order, where the position is the last row's timestamp and ID. The lesson measured both on a million orders with an index on the sort order. Before I give you the numbers: what happens to the offset query as you go deeper?

[pause]

It grows in a straight line. At the first page, both took a few hundredths of a millisecond. Skipping 100 thousand rows, offset took just over a millisecond. Near the end, skipping 999 thousand rows, it took 11 and a half milliseconds. Keyset stayed flat at 0.026 milliseconds at every depth. The database really does walk and throw away every skipped row; Postgres's own manual says so. Walking the entire collection by keyset took under a third of a second. The full walk by offset adds up to about 5 billion row skips, roughly a minute.

Offset also lies when data changes. Say page one shows orders 2 and 1. A new order arrives at the top. Now page two, at offset 2, starts with order 1 again, so a client sees it twice, and a deletion would have made it skip one instead. A keyset cursor names a position in the sort order, not a count, so it returns the right next page regardless.

Two rules for keyset. The tiebreaker is mandatory: timestamps repeat, so the cursor must be the timestamp and the ID together, or rows that share a timestamp at a page boundary vanish, a bug that shows up only on busy days. And encode the cursor opaquely, so its contents can change later.

One more trap. Keyset is stable only if a row's sort key does not change while someone is paging. Sort tickets by last-updated, and if ticket C is edited while you page, it jumps from below your cursor to above it, and you never see it. For a list a human scrolls, document it. For a client syncing everything that changed, sort ascending by a change sequence assigned at commit, and treat the cursor as a high-water mark.

The verdict: public APIs use cursors. An admin screen that needs "page 7 of 43" can use offset with a hard cap, which is what Elasticsearch does, rejecting anything past 10 thousand results by default.

## Rate limits

A limit clients discover through errors is a support ticket. A limit in the contract is a feature. Document it per API key, return a 429 with a Retry-After header, and send the remaining quota on every response so good clients pace themselves and never see a 429 at all.

The usual mechanism is a token bucket. Picture a bucket that holds 2 tokens and refills at 1 a second. Two requests arrive at once and both succeed, leaving it empty. A third, at the same moment, gets a 429 with Retry-After of one second. Capacity is the burst you permit; refill is the sustained rate. Limit by API key, not by IP address: many customers share one address behind a NAT, and one customer uses many.

The header that breaks clients is the reset header. Some APIs send it as a timestamp in epoch seconds, others as seconds remaining. A client that reads a timestamp as a delay waits for decades. One that reads a delay as a timestamp retries at once. Retry-After is unambiguous, so prefer it, and document which one your reset header is.

And keep two things apart. A rate limit is fairness per client: a 429, the client did something wrong, and it waits exactly Retry-After. Load shedding protects the server: a 503, the client did nothing wrong, and it backs off with jitter.

## How changes break clients

A change is breaking if any correct client written against the old contract behaves differently. The obvious ones are easy: removing or renaming a field, since a rename is a remove; changing a type, say a string to a number or seconds to milliseconds; making an optional parameter required. Adding optional fields, parameters and endpoints is safe, as long as clients are required to ignore what they do not know.

The subtle ones pass a schema diff and still break people. Adding an enum value, because exhaustive switch statements fall into their default or throw. Tightening validation, say a maximum length from 255 to 100. Changing the default sort order or page size. Making a field nullable, or omitting it instead of sending null. Changing a status code, a 404 that becomes a 403. Changing rounding, so reconciliation jobs stop matching. Lowering a rate limit or shortening the idempotency window. Making a synchronous operation asynchronous, so the resource is not there when the client reads it back. Schema diff tools catch the obvious list and almost none of the subtle one, which is why contract tests exist.

## Versioning and retiring a version

Versioning is for the breaking change you cannot avoid. First preference: no version at all, just additive evolution and deprecations, which covers most changes if you respect that catalogue.

Second: date-pinned versions, as Stripe described in 2017. An account is pinned to the newest version the first time it calls. The code only knows the current shape. Each breaking change ships with a small transform that turns a response back into the previous shape, and on the way out, the edge walks back through time applying each transform until it reaches the client's date. The cost is a transform per change, forever. The benefit is that no client is ever forced to migrate, and the core never branches on version.

Third: a version in the URL, slash v2. Explicit and easy to route, but it means maintaining two surfaces, and it tempts teams to bundle unrelated changes into the bump, which turns migration into a project nobody schedules.

Every version needs a retirement plan from the day it is created, and the plan runs on telemetry, not the calendar. Old-version responses carry standard deprecation and sunset headers. Every request is logged with its API key and resolved version. Around week 8, contact every key still on the old version, largest first. Then brown-outs: the old version returns errors for 10 minutes one weekday, then an hour, then a day.

Brown-outs work because of their arithmetic. Say 45 keys are still on version one, sending 0.8 percent of all requests. A 10-minute brown-out fails about six thousandths of a percent of the day's traffic, invisible in your error rate. But it fails every request those 45 integrations make for 10 minutes, which is exactly what fires their alerts and gets the migration scheduled.

And one thing telemetry cannot see. You observe what clients send: endpoints, parameters, the version they pin. You never observe which response fields they read. So removing a parameter can be measured down to zero, but removing a response field can only be measured through a proxy, like a version pin. That asymmetry is the practical argument for versions or pins, even in an API that otherwise evolves additively.

## In the interview

A partner needs a field renamed. What do you ship?

[pause]

Nothing that removes the old name. Add the new field, populate both, mark the old one deprecated with a sunset date, measure readers by API key, and remove it, or add a date-pinned transform, when usage reaches zero. The wrong answer is "a version two with the rename", which forces 3 thousand integrations to migrate for one field.

And: is adding an enum value a breaking change? For clients that switch exhaustively, yes, and no schema diff catches it. The contract must say unknown values can appear and must be handled, generated SDKs map them to an unknown case, and the new value ships to clients' test environments first. The wrong answer is "no, it is additive", which is true of the schema and false of the code that consumes it.

## Recap

Four things to remember. Idempotency keys, cursor pagination, an error envelope with stable codes and a retryable flag, and rate-limit headers go in the contract before the first client, because none can be added safely later. Offset pagination is linear in depth, 11 and a half milliseconds near a million rows against a flat 0.026 for keyset, and it shifts under writes; keyset needs a tiebreaker. A 429 means wait exactly Retry-After; a 503 means back off with jitter. And many breaking changes pass a schema diff, so prefer additive evolution, and retire versions with per-key telemetry and escalating brown-outs, not a date on a calendar.

At your desk: the idempotency and E-tag traces, the keyset query and its measurements, the full breaking-change catalogue, the version transform code and retirement timeline, and the keyset exercise.
