---
lesson: video-upload-pipeline
source: 723cc61799420aac
---
## 1

An object store allows at most 10,000 parts per multipart upload, each at least 5 mebibytes. Files can be up to 50 gigabytes. Which part size is the best default?

A, 16 mebibytes: about 3,000 parts at 50 gigabytes, and seconds of rework per failure. B, 5 mebibytes, the minimum, so each failure wastes the least transfer. C, 1 gibibyte, because the fewest parts means the fewest signed requests. D, 256 mebibytes: about 200 parts at 50 gigabytes, and far fewer signed part requests.

[think]

The answer is A: 16 mebibytes: about 3,000 parts at 50 gigabytes, and seconds of rework per failure.

At 5 mebibytes, a 50 gigabyte file needs about 10,000 parts, right at the limit. At 256 mebibytes or 1 gibibyte, a dropped connection on a phone wastes minutes of transfer. 16 mebibytes leaves ample headroom under the limit, and loses about 9 seconds of a 15 megabit uplink per failed part.

## 2

A transcode worker is preempted after uploading its output, but before reporting success, and the task is redelivered. What makes this safe?

A, the queue deduplicates the redelivery, so the task runs only once. B, the worker holds a distributed lock on the video until it reports back. C, the orchestrator deletes the partial output before it retries. D, a deterministic output key makes the retry rewrite identical bytes.

[think]

The answer is D: a deterministic output key makes the retry rewrite identical bytes.

Queues deliver at least once, so safety comes from idempotent tasks. The output key is derived from the input hash, the chunk, the rendition and the encoder version, so the retry overwrites the same object with the same content. A lock does not help when the lock holder is the process that died.

## 3

After an outage, 500,000 catalogue re-encode tasks are queued, and new uploads wait 40 minutes to become playable. What is the structural fix?

A, add a priority field to each message in the shared first-in, first-out queue. B, reject new uploads with 503 until the re-encode backlog drains. C, autoscale the worker fleet on CPU utilisation until it drains. D, split the queues by priority, scaling each on the age of its oldest message.

[think]

The answer is D: split the queues by priority, scaling each on the age of its oldest message.

Separate queues, with reserved capacity for first-playable work, isolate the classes, and queue age maps onto the latency target. A priority field does not let new work jump a backlog that is already ahead of it, and CPU is always saturated on an encoding fleet.

## 4

Time to first playable is 35 seconds. The low rungs are packaged at 24 seconds, and the copyright scan finishes at 34. A team proposes GPU encoders that halve encode time. What happens to first playable?

A, it stays at 35 seconds, since the scan is the critical path. B, it falls to about 29 seconds, since encoding is half the path. C, it rises, since GPU queues are shared with other teams' jobs. D, it falls to about 12 seconds, since the GPUs parallelise chunks.

[think]

The answer is A: it stays at 35 seconds, since the scan is the critical path.

The video becomes playable when both the encode path and the checks finish, so it waits for the longer one: probe, copyright scan, gate. The encode path already has 10 seconds of slack, and shortening it changes nothing. Running the fingerprint per chunk, or during upload, is what moves the number.

## 5

Encode cost is modelled as pixels times frames. Roughly what share of a 240p to 1080p H.264 ladder's compute goes to the 1080p rung?

A, about 90 percent, since lower rungs are nearly free to encode. B, about 20 percent, since the ladder's five rungs share the work equally. C, about 55 percent, since it has more pixels than the rest combined. D, about 35 percent, since 720p and 1080p split the high end between them.

[think]

The answer is C: about 55 percent, since it has more pixels than the rest combined.

1080p has 2.07 million pixels per frame, against 1.66 million for 240p, 360p, 480p and 720p together, so it takes 55.5 percent of the ladder, and the ladder costs 1.8 times the 1080p rung alone. The low rungs needed for first playable are under 9 percent, which is why reserving capacity for them is cheap.

## 6

A new codec saves 35 percent of bits, but costs 10 times the encode compute. Which policy follows from the economics of a user-generated platform?

A, never use it, because compute is the dominant elastic cost. B, encode every upload in the new codec, because egress dominates. C, use it for every upload's 1080p rung only, where the bits are largest. D, add the new codec once a video's views pass the break-even point.

[think]

The answer is D: add the new codec once a video's views pass the break-even point.

Savings scale with views, and costs are paid once per video. Break-even is on the order of 100 full views, and views are heavily skewed, so most videos never repay the extra encode, even on one rung, while popular ones repay it many times over. A view-count trigger captures most of the savings.
