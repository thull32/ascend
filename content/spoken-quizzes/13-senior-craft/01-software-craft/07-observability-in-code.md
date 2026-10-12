---
lesson: observability-in-code
source: 77bf87758c4fd1fc
---
## 1

Which of these log statements is the most useful in production?

A, an info event with the constant message "lesson completed", and typed fields for the user, the lesson and the seconds taken. B, a debug event with the same message and fields, plus the whole request. C, an info event whose message text has the user, the lesson and the seconds interpolated into it. D, a plain print line that imitates an info log with key equals value text.

[think]

The answer is A: an info event with a constant message and typed fields.

A constant message with typed fields at info level can be counted, grouped and filtered by user or lesson. The interpolated version makes every line unique text. A plain print bypasses levels, the subscriber and its JSON output, even when it imitates key equals value text. And the debug line is off in production, and when it is on, it dumps the whole request, which is noisy and a data leak risk.

## 2

Over five minutes, a latency histogram saw 1,000 requests. 960 finished within a quarter of a second, 985 within half a second, 994 within 1 second, 998 within two and a half seconds, and all 1,000 eventually. What does the 99th percentile query return?

A, about 0.78 seconds, interpolated inside the half second to 1 second bucket. B, exactly half a second, the lower bound of the bucket that holds request number 990. C, exactly 1 second, the upper bound of the bucket that holds request number 990. D, nothing useful without the raw latencies of the requests.

[think]

The answer is A: about 0.78 seconds, interpolated inside the half second to 1 second bucket.

Request number 990 falls in the bucket from half a second to 1 second, which holds 9 requests, and 5 of them are needed to reach 990. Five ninths of the way through a half-second bucket gives about 0.78 seconds. The function assumes requests are spread evenly inside the bucket, so the true 99th percentile is only known to lie between half a second and a second. A rank in the unbounded top bucket would return two and a half seconds, the largest finite bound.

## 3

A teammate adds the request span's URI value as a label on Ascend's latency histogram. What is the concern?

A, the span records the method as well, which duplicates a label. B, every lesson and every conversation ID adds a new set of series. C, histograms cannot carry labels that are longer than their name. D, paths contain slashes, which are not allowed in label values.

[think]

The answer is B: every lesson and every conversation ID adds a new set of series.

The URI is the raw path, so each of hundreds of lesson paths, and every coach conversation's UUID, mints its own label set. A histogram with 14 bucket boundaries stores 17 series per set, so the count grows without bound. Label by the matched route template, and keep IDs in logs and traces. Slashes are legal in label values.

## 4

To cut log volume, production's Rust log level is changed to warn. Warning and error events still appear. What else changes on those lines?

A, nothing: spans are not affected by the level filter at all. B, they gain a list of spans, because that list is only hidden at info. C, their level field becomes lower case. D, they lose the span object, so the request ID disappears from them.

[think]

The answer is D: they lose the span object, so the request ID disappears from them.

The filter applies to spans as well as events. Ascend's request span is created at info level, so at warn it is never created, and the formatter has no current span to print. Every remaining warning and error line loses its request ID, with no error anywhere. Keep the span's target at info, and quieten the noisy events instead.

## 5

A service receives a traceparent header whose trace ID is all zeros, while its parent ID and its sampled flag are well formed. What should the service do?

A, reply 400, since the caller sent a malformed trace header. B, continue the trace, since the parent ID and flags are valid. C, forward the header unchanged, so the next service can decide. D, start a new trace, and ignore any trace state that came with it.

[think]

The answer is D: start a new trace, and ignore any trace state that came with it.

An all-zero trace ID is invalid, so the header is ignored and the service starts a new trace. It must not parse the trace state header that came with an invalid traceparent. Tracing is best-effort context, so it never fails the request. And forwarding the header unchanged would be wrong even for a valid one, because the parent ID on the wire must be the span that makes the next call.

## 6

A service head-samples 1 percent of traces. An incident fails 5 requests. How likely is it that at least one of them was traced?

A, certain, since head sampling always keeps traces with errors. B, about 5 percent, since each request is kept independently at 1 percent. C, exactly 1 percent, since the rate applies to the incident as a whole. D, about 50 percent, since five requests give five separate chances.

[think]

The answer is B: about 5 percent.

Head sampling decides before the outcome is known, independently for each trace, so the chance is one minus 0.99 to the fifth power, about 4.9 percent. It cannot know which traces will fail. Tail sampling decides after the trace completes and keeps every error, at the cost of buffering spans in a collector while it waits to decide.
