---
lesson: building-the-ai-coach
source: 2dda44b42665173f
---
## 1

A learner closes the tab two seconds into a 30 second coach reply. What happens on the server?

A, the partial reply is discarded, but its tokens are still recorded from the message start event. B, the request is queued, and replayed automatically when the learner opens the page again. C, Axum drops the response body, which cancels the upstream call, so nothing is stored or billed. D, the background task keeps reading, ignores the failed sends, and stores and bills the reply.

[think]

The answer is D: the background task keeps reading, ignores the failed sends, and stores and bills the reply.

The upstream stream is owned by a tracked background task, not by the response. When the receiver is dropped, sends fail and pump ignores the error, so the task drains the stream and finishes the turn, which settles the budget hold with the real usage and stores the reply. Cancellation on drop is what happens when a handler returns the upstream stream directly, the naive design this code avoids.

## 2

Before the AI hardening commit, two requests from one user arrived together when the usage table showed 149 of 150 requests. What happened, and what prevents it now?

A, exactly one succeeded, because the increment was already atomic; nothing had to change. B, the second waited for the first model call to end; a per-user mutex now serialises them. C, both failed with a serialisation error; a retry loop around the check now handles it. D, both succeeded and the count reached 151; a check under the row lock now decides.

[think]

The answer is D: both succeeded and the count reached 151, and a check under the row lock now decides.

Each request read 149, passed the comparison, then ran its own atomic increment. Atomic increments do not make a check-then-act sequence atomic. The fix moved the check under the day row's lock: first as one conditional upsert, and now as a select for update inside the reservation's transaction, so reservations queue, and an over-budget request changes nothing. A mutex around the model call would serialise minutes of work, not one short check.

## 3

A learner asks the coach a question in the dock, completes the lesson, so the progress line in the context changes, and asks again 30 seconds later. What does the prompt cache do on the second request?

A, reads the whole prompt from cache, because the five-minute lifetime has not expired. B, reads the context and the history, and re-writes only the stable persona block. C, misses everything, because any change anywhere in a request invalidates the entire cache. D, reads the stable block, then re-writes the context block and the history after it.

[think]

The answer is D: it reads the stable block, then re-writes the context block and the history after it.

Caching is a prefix match in render order: the system blocks, then the messages. The stable block is unchanged, so it is read. The context block changed, and everything after it, including the conversation history, must be written again at the write premium. A change invalidates only what follows it, not what precedes it.

## 4

Why does Ascend's frontend parse server-sent events by hand with fetch, instead of using the browser's EventSource?

A, EventSource does not decode UTF-8, so multi-byte characters arrive split. B, EventSource cannot POST a body or set custom headers, and the coach needs both. C, fetch streams deliver tokens faster, because they skip the event parser. D, EventSource cannot reconnect after a network drop, which phones need.

[think]

The answer is B: EventSource cannot POST a body or set custom headers, and the coach needs both.

The message and the editor contents travel in a POST body, and every mutating request must carry the X-Requested-With header for the CSRF middleware. EventSource can do neither. It does reconnect automatically, a feature this app gives up, but reconnecting would make no sense for a POST that creates a message anyway.

## 5

The coach page used separate routes for the coach and for a coach conversation by ID. Why did replacing them with one route, with an optional ID, fix the dropped reply?

A, optional segments match faster, so the navigation finishes before the stream begins. B, it stops React Router from refetching the conversation while a stream is running. C, it makes navigation synchronous, so the new page mounts before the first delta arrives. D, the element keeps its tree position, so React re-renders instead of remounting the page.

[think]

The answer is D: the element keeps its tree position, so React re-renders instead of remounting the page.

React preserves component state when the element type and position are unchanged. Two sibling routes are two positions, so navigating between them unmounted the page whose closure held the live stream. A guard on the local conversation handles the second half of the bug: loading the saved conversation overwriting a stream in progress.

## 6

A learner presses Stop 5 seconds into a reply that would have used 3,000 output tokens. Roughly what is billed and stored?

A, nothing at all, because the provider does not bill aborted requests. B, the full reply is generated, billed, stored, and counted in the usage table. C, about five seconds of tokens, because Stop cancels the upstream call. D, the partial text is stored, and the daily budget refunds the difference.

[think]

The answer is B: the full reply is generated, billed, stored, and counted.

Aborting the fetch closes the connection, which the server cannot tell apart from a closed tab, and the background task finishes the stream by design. Saving tokens on Stop needs an explicit cancel signal that the task checks, which trades against the guarantee that disconnects never lose replies.
