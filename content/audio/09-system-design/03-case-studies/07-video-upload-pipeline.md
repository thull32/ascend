---
lesson: video-upload-pipeline
source: dda9e4d4bbbc0913
fit: great
desk:
  - "The API calls, the data model and the video's state machine"
  - "The architecture and transcode DAG diagrams"
  - "The resumed-upload and first-playable traces, step by step"
  - "The per-rung cost table and the encode-cost code"
  - "The failure-mode, trade-off and evolution tables"
  - "Exercise: schedule a transcode DAG on N workers"
---
## Introduction

A creator on hotel Wi-Fi uploads a 4 gigabyte file. At 83 percent, the laptop goes to sleep. When it wakes, the only acceptable behaviour is that the upload carries on from 83 percent, and that within a minute or two of the last byte, viewers can press play at 360p while 1080p is still encoding. Meanwhile about three thousand other uploads arrive every minute: some corrupt, some crafted to crash a video decoder, some byte-for-byte copies of an earlier file.

This is two systems glued together at the object store. A network problem: moving huge files over unreliable links without routing them through your servers. Then a compute problem: a fan-out, fan-in graph of expensive jobs that fail. A weak answer is one HTTP POST and one call to ffmpeg. A strong one spends its time on resumability, idempotent tasks, the critical path to first playable, and where the money goes.

## Requirements and the numbers

Ask first: what is the largest file, does "fast" mean first playable or all qualities, and is re-encoding the catalogue in scope? Assume a user-generated platform. Files up to 50 gigabytes and 12 hours, resumable across disconnects and app restarts. Every video gets an H.264 ladder from 240p to 1080p, plus thumbnails, captions, and safety and copyright checks before it goes public. An upload acknowledged as complete is never lost, and every file is hostile input to a complex parser.

The most useful requirement is a split between two latencies. First playable: under 2 minutes after the last byte, at the 95th percentile, for a 10-minute 1080p video. Full ladder: under 15 minutes. That split is what licenses a priority system later.

Scale: assume 500 hours of video uploaded every minute, 10 minutes each at 10 megabits a second, with a three times daily peak. That is 4.3 million uploads a day, 50 a second, 150 at peak, and ingest of 300 gigabits a second, 900 at peak. An average file is 750 megabytes, about 400 seconds on a 15 megabit uplink, so 20 thousand uploads are in flight at any moment.

Now the numbers that change the design. Originals arrive at 3.2 petabytes a day, 1.2 exabytes a year: about 24 million dollars a month on a hot storage tier by year end. Encoding costs 7.2 CPU seconds per second of video, which keeps 216 thousand virtual CPUs busy, about 78 thousand dollars a day even on preemptible machines. So: originals move to an archive tier, about ten times cheaper, as soon as processing finishes. Every expensive codec must justify itself in views. And no byte of video ever passes through an application server.

## The architecture

The client creates an upload session, idempotently, so a double tap does not create two videos. It then asks for pre-signed URLs a few parts at a time. Each URL is scoped to one part of one upload and lives 15 minutes, so a leaked one cannot overwrite anyone else's file. Parts go straight to a nearby ingest edge and into the object store.

Then the client calls complete. The upload API commits the status change and a "start workflow" row into an outbox in the same transaction, so the workflow cannot be lost between the database and the orchestrator. Complete is idempotent on the upload ID: a retry returns the same video ID and starts no second workflow.

The orchestrator owns a graph of tasks per video. Probe the file, 3 seconds. Then in parallel: split it at keyframes, 10 seconds; thumbnails; a 20 second safety classifier; a 30 second copyright fingerprint. After the split, 240p and 360p become 40 high-priority tasks, and 480p to 1080p become 60 normal-priority ones. The low rungs are packaged, a gate waits for packaging and checks, and the video becomes playable.

## Deep dive one: getting the bytes in

Three options. A single PUT of the whole file: no resume, and a 4 gigabyte upload on a phone rarely survives in one piece. An offset protocol, where the client appends from the last committed byte: fine-grained resume, but now you operate a 900 gigabit fleet, and every deploy of it kills uploads. Or multipart upload with pre-signed part URLs: the object store runs the byte path, and you resume one part at a time. Choose multipart.

Then do the part-size arithmetic out loud. S3-style multipart allows at most 10 thousand parts of at least 5 mebibytes. At 5, a 50 gigabyte file needs about 10 thousand parts, right at the limit. At 16 it is about 3 thousand, and one part takes about 9 seconds on a 15 megabit uplink, so a dropped connection wastes seconds. Upload three or four parts in parallel, because one TCP connection over a long round trip is limited by its congestion window. And add a lifecycle rule that aborts incomplete uploads after seven days, because abandoned parts are invisible in listings but billed.

Now the hotel Wi-Fi. The file is 256 parts. At 1,900 seconds, parts 1 to 212 are acknowledged and three more are in flight. The laptop sleeps, then wakes. Before I tell you: what does the client ask, and whom does it trust?

[pause]

Not its own memory of an offset. It asks the API for the upload's status, and the API lists the received parts from the object store itself: 1 to 212. The client gets fresh URLs, since the old ones expired, sends the last 44 parts in about 394 seconds, and calls complete. The response is lost on the flaky Wi-Fi; the retry gets the same video ID and no second workflow. The sleep cost at most the three parts in flight, about 27 seconds of uplink.

Failed parts retry with jittered exponential backoff, so 20 thousand clients reconnecting after an edge outage do not return in lockstep. And a sweeper finds uploads with every part present but still marked uploading. Both it and complete go through a start that is idempotent on the video ID.

## Deep dive two: the transcode graph

First, cost. Model encode cost as pixels times frames, divided by encoder speed. Assume x264's medium preset encodes 1080p at twice real time on an 8 CPU worker, and measure it, because preset, content and hardware move it several-fold.

For a 10-minute video, the 1080p rung costs 2,400 CPU seconds: 55.5 percent of the ladder, because 1080p has more pixels per frame than the four lower rungs combined. The whole ladder is about 1.2 CPU hours, roughly 2 cents per upload. And the two rungs you need for first playable, 240p and 360p, are under 9 percent of the compute. That is why a reserved lane for them is cheap: 7,200 workers that are never preempted.

Why chunk? The 1080p rung alone takes 300 seconds on one worker. Split at keyframes into 20 chunks of 30 seconds, and each chunk-rung task is 15 seconds of encoding plus about 4 of overhead. Not shorter: 2 to 4 second chunks would spend more time on overhead than on encoding the low rungs.

Now the trace. Complete returns at zero. The workflow starts at 1 second, probe ends at 4, the split ends at 14, and the copyright scan, started at 4, runs in parallel. The low-rung tasks wait 10 seconds for reserved workers, encode from 24 to 30, and are packaged by 34. Copyright passes at 34. Playable at 35 seconds.

A team proposes GPU encoders that halve encode time. What happens to first playable?

[pause]

Nothing. The critical path is probe, copyright scan, gate: 1 plus 3 plus 30 plus 1, 35 seconds. With no queue wait at all, the low rungs are packaged at 24 and the video still becomes playable at 35. The encode path has 10 seconds of slack. It cuts the other way too: give the video only 4 workers, the encode path becomes critical, and first playable moves to 84 seconds. Find the critical path before you optimise; it is often a check, not the encode.

Next, surviving the machines. Workers are preemptible, so tasks will be killed. Each task is a pure function of the source hash, the chunk, the rendition and the encoder version, and its output key is derived from exactly those values, so a retry overwrites the same object with the same bytes. Workers hold tasks under a lease they extend every 10 seconds; if one dies, the lease expires and the task is redelivered. A file that crashes the decoder every time goes to a dead-letter queue after three attempts, and the video is marked failed with a reason the creator can act on, like "unsupported codec". A workflow engine, such as Temporal or Step Functions, holds this per-video state and answers "where is this video stuck?".

And priority is separate queues, not a field. Low rungs go to a high-priority queue served by the reserved workers, the rest to a normal queue, and catalogue re-encodes to a low queue on spare capacity. A priority field inside one FIFO queue does not help when 500 thousand backfill tasks are already ahead. Autoscale each queue on the age of its oldest message, not on CPU, which is always near 100 percent on an encoding fleet.

## Deep dive three: before the last byte, and where the views are

The creator's clock started 400 seconds before the last byte. If the client cuts the video into keyframe-aligned 30 second segments and uploads them in order, one arrives every 20 seconds. Its low rungs take about 6 seconds and its 1080p about 19, both under 20, so the encoders keep pace with the upload. First playable falls from 35 seconds after the last byte to 11. The cost: the checks must work per segment, a segment that fails to decode is found mid-upload, and browsers uploading in parallel deliver parts out of order.

Then money. View counts on user video are extremely skewed. Assume AV1 saves 35 percent of the bits at ten times the H.264 compute. One full view at 1080p is 375 megabytes, so AV1 saves about a fifth of a cent of CDN egress per view. An AV1 ladder costs about 12 CPU hours, around 18 cents. Break-even is on the order of 100 full views. So every video gets H.264 immediately, and a view-count trigger, say a thousand views in a day, queues AV1 on the low-priority lane.

## Failure modes

A preempted worker shows up as latency, not errors: redeliver, and chunking caps the lost work at one 19 second task. A malicious file is worse. Media parsers are large, old and memory-unsafe, and a crafted file that gets code execution on a worker holding cloud credentials is a company-ending incident. So decoders run sandboxed, with no network, no credentials, memory and time limits, on disposable hosts. A worker needs read access to one input key and write access to one output prefix, nothing more.

A duplicate workflow start encodes a video twice; fix it with a conditional insert keyed on the video ID that both complete and the sweeper go through. A post-outage herd of 120 thousand videos landing at once is absorbed by separate lanes, shedding re-encodes first. And a broken encoder release is caught on a canary; because the version is in the output keys, rollback is pointing manifests at the previous version.

## In the interview

A follow-up the lesson expects. The same file is uploaded 10 thousand times. Do you process it 10 thousand times?

[pause]

No. At complete, look up the source's SHA-256 together with the encoder version, and if renditions exist, the new video points at them. Ownership and takedowns stay per video, so shared renditions need reference counting. And copyright matching uses perceptual fingerprints, because a re-encode changes every byte. The wrong answers: deduplicate by filename, or use the exact hash for copyright.

Another: you shipped a better encoder; how do you re-encode a billion videos? As a low-priority backfill, ordered by watch time times bitrate saved, so the head goes first and the tail maybe never, with a manifest flip per video and the reverse flip as rollback.

## Recap

Four things. Separate the network problem from the compute problem: direct-to-storage multipart, a part size derived from the 10 thousand part limit, and resume from the store's part list, never the client's memory. Cost the ladder from pixels times frames: 1080p is over half, the first-playable rungs under 9 percent. Find the critical path before you optimise; here it is the copyright scan. And make every task a pure function with a deterministic output key, with priority as separate queues scaled on queue age, and expensive codecs only where views repay them.

At your desk: the API, data model and diagrams, the two traces, the cost table and code, the failure tables, and the scheduling exercise.
