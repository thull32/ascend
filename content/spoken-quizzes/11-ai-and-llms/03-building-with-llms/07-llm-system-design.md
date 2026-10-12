---
lesson: llm-system-design
source: 1bf34c49f1527b45
---
## 1

The coach sends a cached, stable system block with the persona and curriculum map, then an uncached context block that includes the editor contents, then the history, with automatic caching on the last message. A learner edits their code before every question. What does each turn read from cache?

A, only the stable block, because the edit changes the prefix under the history breakpoint. B, nothing, because a change anywhere in the system prompt invalidates all of its breakpoints. C, everything, because the context block has no cache marker of its own. D, only the history, because automatic caching skips the system prompt entirely.

[think]

The answer is A: only the stable block, because the edit changes the prefix under the history breakpoint.

Caching is an exact prefix match in render order, system then messages. The explicit breakpoint after the stable block still matches, so that part is read. The automatic breakpoint on the last message covers the context block too, so a code edit changes that prefix, and everything after the stable block is written again at the write premium. Moving the editor snapshot into the latest user turn would keep the history prefix stable.

## 2

The coach keeps at most 30 past messages, and moves the window's start in steps of 10, instead of dropping one exchange per turn. Why?

A, so the database query can use an index on message number instead of timestamps. B, so old messages are summarised in batches of 10, which saves output tokens. C, so the model always sees exactly 30 messages, which keeps its answers consistent. D, so the history's first message changes rarely, and most turns reuse the cached prefix.

[think]

The answer is D: the history's first message changes rarely, and most turns reuse the cached prefix.

A sliding window changes the first message of the history every turn, so everything after the context block misses the cache every time. Stepping keeps the start fixed for five turns, so four in five read the prefix and write only the newest exchange; in the lesson's simulation, that cut billed input per turn about four-fold. The window holds between 21 and 30 messages, not always 30, and nothing is summarised.

## 3

Why does the coach run the model stream in a spawned task that writes to a channel, instead of streaming directly from the request handler?

A, server-sent event responses must be written from a separate operating system thread. B, spawned tasks run on a faster executor, so tokens reach the browser sooner. C, so the reply is still consumed and saved if the browser disconnects midway. D, to avoid holding a database connection open for the length of the stream.

[think]

The answer is C: so the reply is still consumed and saved if the browser disconnects midway.

If the handler owned the stream, a disconnect would drop it and lose the reply. The task, not the HTTP response, owns persistence: it keeps reading after the receiver is gone and finishes the turn, and a task tracker lets shutdown wait for it. Speed has nothing to do with it; the tokens arrive no faster. The cost is paying for generations nobody is watching.

## 4

The first version of the daily budget read today's usage, checked it against the limit, then incremented the request counter with an atomic upsert. What could still happen?

A, the counter could go negative when a refund raced with a new reservation. B, nothing, because the atomic upsert made the check and the increment atomic. C, lost updates: two concurrent increments could overwrite each other's counts. D, concurrent requests could all pass the check before any increment landed.

[think]

The answer is D: concurrent requests could all pass the check before any increment landed.

The upsert made each increment atomic, so no update was lost, but the check was a separate read, so requests in flight together could all pass it and overshoot the limit by their number. The fix checks under the row lock, first in one conditional upsert, and now in a select for update with a budget hold. A test of 30 concurrent requests against a limit of 10 proves it.

## 5

The daily input limit first compared against the API's input tokens count, and conversation caching was switched on in the same change. Which cost did that leave without a direct cap?

A, uncached input, because the input tokens count includes only prompt tokens read from cache. B, prompt cache writes, which that count leaves out, and which bill at 1.25 times input. C, output spend, because output tokens were recorded but never compared with a limit. D, thinking tokens, because they bill as input and are reported in no counter at all.

[think]

The answer is B: prompt cache writes, which that count leaves out, and which bill at 1.25 times input.

The input tokens count includes only uncached input. The API reports cache writes and reads separately, and with caching on, nearly all of a chat's input moves into those two counters. The fix counts billed input in the reservation, with cache writes weighted at 1.25 and reads at the model's price. Output was always checked, and thinking tokens bill as output, not input.

## 6

The provider is overloaded, and you add a fallback to a second model for coach turns. What cost should you expect on the first fallback turn of a long conversation?

A, nothing extra, because failed turns on the primary model already paid for the prefix. B, the same as a warm turn, because the prompt cache is shared across a provider's models. C, lower than a warm turn, because the fallback model is smaller, and so reads cache faster. D, a full cache write of the whole prompt, because caches are per model and start cold.

[think]

The answer is D: a full cache write of the whole prompt, because caches are per model and start cold.

Cached prefixes belong to one model, so the fallback reads nothing and writes the entire prompt at the write premium: about 6.9 cents of input for an 11,000-token turn, against about 1 cent for a warm follow-up on the primary. Keep a conversation on the fallback once it moves, rather than alternating, or every switch pays the write again.
