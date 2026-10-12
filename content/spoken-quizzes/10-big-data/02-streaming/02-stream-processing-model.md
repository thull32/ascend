---
lesson: stream-processing-model
source: abc29dd77c4380b9
---
## 1

A consumer was down for 20 minutes, then caught up in 2. A processing-time one-minute count shows zero for 20 minutes and then two huge spikes. What does an event-time count show?

A, zero for every minute, because the events are all late. B, the same spikes, because the events were processed then. C, correct per-minute counts for the outage, emitted late. D, a gap and one spike, since windows close on the wall clock.

[think]

The answer is C: correct per-minute counts for the outage, emitted late.

Event-time windows place each event by when it happened, so the backlog fills the right minutes. The watermark was not advanced past those minutes while the consumer was down, because no events arrived, so the windows fire correctly during catch-up, just later in wall-clock time. Closing windows on the wall clock is exactly what event time does not do.

## 2

A partition that was marked idle for an hour wakes up and delivers an event stamped ten minutes ago. The operator's watermark is already past that time. What happens?

A, the window is reopened, and its result is silently corrected. B, the event is buffered until the partition's watermark catches up. C, the event is late for its window, and is dropped or sent to a side output. D, the operator's watermark moves back to include the event.

[think]

The answer is C: the event is late for its window, and is dropped or sent to a side output.

Watermarks are monotonic. The operator never emits a smaller watermark than before, and a resumed input only rejoins the minimum once its own watermark passes the current one. So the woken partition's older events arrive behind a watermark that has already fired their windows, and are treated as late. Nothing buffers them or reopens windows, unless allowed lateness is configured and still in force.

## 3

Your 99.9th percentile event delay is 45 seconds, and the dashboard must be within 2 minutes of real time. Which watermark bound is most defensible?

A, zero seconds, dropping every event that arrives out of order. B, about 60 seconds, and divert the roughly 0.1 percent that arrive later. C, about 15 minutes, so that almost no events are ever late. D, no watermark at all; window on processing time instead.

[think]

The answer is B: about 60 seconds, and divert the roughly 0.1 percent that arrive later.

A bound slightly above the measured tail meets the freshness requirement and loses about one event in a thousand, which you count and handle with a side output or a correction. Zero drops all out-of-order data, 15 minutes violates the freshness requirement, and processing time gives wrong windows.

## 4

A device with a clock one year in the future sends an event into a bounded out-of-orderness pipeline. What happens next?

A, only that device's own key and windows are affected. B, the watermark jumps a year, and real events become late. C, the event is dropped as late, and nothing else changes. D, nothing, because the watermark ignores outlier timestamps.

[think]

The answer is B: the watermark jumps a year, and real events become late.

The watermark is derived from the maximum event time seen, so a single future timestamp drags it forward. Every window up to that time fires, and almost all later legitimate events become late, for every key, not only that device's. Validate or clamp event times against ingestion time at the source.

## 5

Sliding windows of size 10 sliding by 5, with a 2-second bound. An event stamped 8 arrives when the watermark is 10. What happens to it?

A, it is counted only in the window from 0 to 10, because that window matches its timestamp first. B, it is late for the window from 0 to 10, but counted in the window from 5 to 15. C, it is counted in both of its windows, because neither has been cleaned up. D, it is dropped as late, because its timestamp is below the watermark.

[think]

The answer is B: late for the window from 0 to 10, but counted in the window from 5 to 15.

Lateness is decided per window, not per timestamp. The window from 0 to 10 fired when the watermark reached 10, so the event is late for it. The window from 5 to 15 stays open until the watermark reaches 15, so the event counts there. A timestamp below the watermark is not, by itself, a reason to drop an event.

## 6

The on-time result for a window was 3 for key a. A late event for the same key arrives within the allowed lateness. Under accumulating-and-retracting semantics, what is emitted?

A, a retraction of 3, followed by a new result of 4. B, a single result of 4, replacing the earlier value. C, a single result of 1, the count of the late pane alone. D, nothing, because retractions suppress late updates entirely.

[think]

The answer is A: a retraction of 3, followed by a new result of 4.

Accumulating and retracting emits the withdrawal of the previous pane's value, then the new accumulated value, so a downstream aggregation can subtract 3 and add 4. Emitting 1 alone is discarding mode. Emitting 4 alone is accumulating mode, which is only safe for a sink that upserts by key.
