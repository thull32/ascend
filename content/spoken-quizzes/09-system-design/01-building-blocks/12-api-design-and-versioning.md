---
lesson: api-design-and-versioning
source: 9fb0e5cd4d08bcfd
---
## 1

A client walks an entire collection of 1 million rows, using offset pagination with pages of 100. Roughly how many rows does the database scan in total?

A, 10 million. B, 10 billion. C, 5 billion. D, 1 million.

[think]

The answer is C: 5 billion.

Page k scans about k times 100 rows, and summing over 10,000 pages gives roughly 100 times 10,000 squared, divided by 2: 5 billion rows. Forgetting the division by 2 gives the 10 billion option. Keyset pagination scans about 1 million, plus index lookups.

## 2

Why must a keyset cursor include a unique tiebreaker, such as the ID, alongside the created-at timestamp?

A, because an index on a timestamp alone cannot be range-scanned. B, so that clients can jump straight to an arbitrary page number. C, so rows sharing a timestamp are not skipped or repeated. D, to keep the encoded cursor short and opaque to clients.

[think]

The answer is C: so rows sharing a timestamp are not skipped or repeated.

The cursor is a position in a total order. Timestamps are not unique, so rows with an equal timestamp at a page boundary would otherwise be skipped or repeated, and the order must be made total with a unique column. Keyset pagination still cannot jump to page N.

## 3

Two clients read the same order at version 7, and each sends a PATCH with an if-match header set to that version's ETag. What happens?

A, both fail with 409, since the two edits conflict with each other. B, both succeed, and the later PATCH overwrites the earlier one. C, the first succeeds, and the second gets 412 and must re-read. D, the second waits on a lock until the first commits, then succeeds.

[think]

The answer is C: the first succeeds, and the second gets 412 and must re-read.

The server applies each PATCH as a conditional update on the stored version. The first moves it to 8, so the second's precondition no longer holds; it gets 412, Precondition Failed, and re-reads, re-applies, and retries with the new ETag. Without the if-match header, both would succeed and one edit would be lost, and nothing holds a lock across two HTTP requests.

## 4

Which change passes an OpenAPI or protobuf schema diff, but can still break correct clients?

A, changing a field from a string to an integer. B, removing a field from the response. C, adding a new value to an existing enum. D, making an optional parameter required.

[think]

The answer is C: adding a new value to an existing enum.

A new enum value is additive to the schema, so diff tools accept it, but clients that switch exhaustively hit a default branch, or throw. The other changes are exactly what diff tools reject. The contract must say that unknown values can appear.

## 5

A client receives a 429 with a retry-after header of 30. What is the correct client behaviour?

A, wait at least 30 seconds, then retry. B, treat it as a permanent failure, and stop. C, retry immediately with exponential backoff. D, switch to a different API key, and retry.

[think]

The answer is A: wait at least 30 seconds, then retry.

A 429 with retry-after is the server telling the client exactly when its quota refills, and honouring it avoids further rejections. Backoff with jitter is for 503 load shedding, where no exact time is known. Rotating keys to evade limits is abuse.

## 6

An API pins each account to a dated version, and serves one canonical response shape internally. How are older clients served?

A, clients are forced onto the newest version when they next deploy. B, the database keeps one copy of each record for every version. C, transforms undo newer changes, newest first, down to the pinned date. D, each dated version runs as a separate deployment of all the service code.

[think]

The answer is C: transforms undo newer changes, newest first, down to the pinned date.

Each breaking change ships with a small transform that converts a response back to the previous version, and the edge applies them newest first until it reaches the client's date. The core never branches on version, and the cost is keeping every transform. Separate deployments or copies per version are what this design avoids.
