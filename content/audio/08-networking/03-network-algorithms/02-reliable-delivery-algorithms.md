---
lesson: reliable-delivery-algorithms
source: f95199ae13807785
fit: partial
desk:
  - "The Go-Back-N and Selective Repeat traces under one loss, step by step"
  - "The proof of the window rule and its counterexamples with 3-bit sequence numbers"
  - "The SACK on and off measurement and the per-socket statistics output"
  - "The production failure-mode table and the protocol comparison table"
  - "Exercises: simulate a Go-Back-N sender and a Selective Repeat sender"
---
## Introduction

IP makes one promise: it will try. A packet can be dropped by a full router queue, corrupted and then discarded by a checksum, duplicated by a link-layer retry, or overtaken by a later packet that took another path. Yet a write on a TCP socket hands the other side exactly the bytes you wrote, once each, in order. Everything between those two facts is a small family of algorithms built from four parts: sequence numbers, acknowledgements, timers and retransmission.

Reliability on its own is easy: send it, wait for a thumbs-up, send it again if none arrives. The interesting part is reliability at speed, keeping a fast link with a long round trip full while still recovering every lost byte. That needs a sliding window. And what you do when one frame inside the window goes missing is the difference between Go-Back-N and Selective Repeat, and between a link that runs at 99 percent of capacity under loss and one that runs at 20.

Four things, in order. Why stop-and-wait is useless across an ocean. The two ways to recover inside a window. The rule that limits a window's size. And what TCP actually does, and what the same ideas look like in your message queue.

## Stop-and-wait

The simplest reliable protocol sends one frame, starts a timer, and waits. If the acknowledgement arrives, it sends the next. If the timer fires, it resends.

Two details make it correct. A retransmission can create a duplicate: the frame arrived, the acknowledgement was lost, and the sender resends. So frames carry a sequence number, and with one frame outstanding, a single alternating bit is enough. And the receiver acknowledges the duplicate again, because a retransmission is proof the sender never got the first acknowledgement.

Now the numbers. A link of 100 megabits a second, a 50-millisecond round trip, 1,500-byte frames. Sending one frame takes 0.12 milliseconds. Then you wait 50 milliseconds for the acknowledgement. The link is busy about a quarter of one percent of the time, carrying about 240 kilobits a second out of 100 megabits. On a LAN with a round trip of 0.2 milliseconds, the same protocol reaches 38 percent. That is why simple request-response protocols get away with it locally and fall apart across an ocean.

## The sliding window

The fix is to have many frames in flight. The sender keeps a window of frames sent but not yet acknowledged. When the oldest is acknowledged, the window slides forward and the next frame goes out.

How big? Big enough to cover the bandwidth-delay product: the link's speed times the round trip. For 100 megabits a second and 50 milliseconds, that is 625 thousand bytes, or about 418 frames. Here is the number that explains why window scaling exists. TCP's original 16-bit window field caps the window at 64 kilobytes, which on this link limits throughput to about 10.5 megabits a second, whatever the link speed.

The sender's window is a ring buffer: frames enter at the front, leave when they are acknowledged, and every frame in flight stays buffered because it might need resending. If you have built a circular queue, you have built the heart of every TCP send buffer.

## One loss, two strategies

Picture ten frames, a window of four, and the first transmission of frame 2 lost.

Go-Back-N keeps the receiver as simple as possible. It tracks one number, the frame it expects next. It delivers that frame only, throws away everything else, and keeps acknowledging the last in-order frame. So frames 3, 4 and 5 arrive perfectly well and are discarded. The sender runs one timer, for the oldest unacknowledged frame, and when it fires, the sender goes back and resends 2, 3, 4 and 5. Fourteen transmissions for ten frames. Three good frames crossed the link twice.

Selective Repeat moves the work to the receiver. The receiver buffers frames that arrive out of order inside its own window and acknowledges each one individually. The sender keeps a timer per frame and resends only frame 2. When 2 arrives, the receiver delivers 2, 3, 4 and 5 at once. Eleven transmissions, the minimum possible with one loss. The cost is the receiver's memory: it held three frames waiting for the gap.

There is one case where Go-Back-N comes off better. Suppose an acknowledgement is lost instead of a frame. In Go-Back-N nothing happens: the next acknowledgement is cumulative and covers it. In Selective Repeat, that frame's own timer fires and the sender resends a frame the receiver already delivered. The receiver must recognise it as old and acknowledge it again. If it stayed silent, the sender would retransmit it forever.

Now the number that decides between them. With the 418-frame window and 1 percent loss, how much useful throughput does Go-Back-N keep?

[pause]

About 19 percent. A loss happens about every 100 frames, and each one costs about a whole window of resends. The useful fraction is roughly one over one plus the loss rate times the window, and here that is one over about 5.2. A link that should carry 100 megabits a second delivers about 19 megabits of new data. Selective Repeat keeps about 99 percent, because each loss costs one extra frame.

## The window rule

Sequence numbers live in a fixed number of bits, and they wrap around. The receiver sees only the sequence number, so the protocol is correct only if every frame it could possibly be handed has a distinct one.

The rule: the sender's window plus the receiver's window can be no larger than the number of sequence values. Go-Back-N's receiver window is one, so with 3-bit numbers, eight values, its window can be 7. Selective Repeat's receiver window equals the sender's, so its window can be at most half the space: 4.

The intuition: the receiver's window can be a full window ahead of the sender's, when every frame arrived but every acknowledgement was lost. So the frames it might see span two windows of consecutive numbers, and all of them must be distinguishable. Take Selective Repeat with a window of 5 and eight sequence numbers. After frames 0 to 4 arrive, the receiver accepts 5, 6, 7, 0 and 1, and a retransmitted old frame 0 is buffered as if it were frame 8. At a window of 4, the old 0 falls outside, is recognised as a duplicate, and is acknowledged again.

TCP numbers bytes with 32 bits and caps its window near 2 to the 30th, a quarter of the space, safely under the bound. But at 10 gigabits a second the 32-bit space wraps in about 3.4 seconds, far less than the two minutes a stray segment may survive in the network. So TCP adds PAWS, protection against wrapped sequences, which uses the timestamp option as extra sequence bits and drops segments whose timestamp is older than the last one seen.

## What TCP actually does

TCP is neither pure Go-Back-N nor pure Selective Repeat. It took the cheap parts of each. Its acknowledgements are cumulative, "the next byte I expect", so a lost acknowledgement is repaired by the next one. Its receivers buffer segments that arrive after a hole, like Selective Repeat. The SACK option lists the byte ranges held beyond the hole, which makes the acknowledgements selective. It runs one retransmission timer, like Go-Back-N. And it has fast retransmit: three duplicate acknowledgements mean later data is arriving and one segment is missing, so resend it without waiting for the timer.

The lesson measured what SACK is worth: 20-megabyte transfers over a 50-millisecond round trip, with 1 percent loss each way. The variance was large, so read the direction, not the precision. Without SACK, the sender learns about one hole per round trip, several losses in one window push it into retransmission timeouts, and the median transfer took about one and a half times as long.

Linux has gone further. RACK declares a segment lost when one sent after it has been delivered and a reordering window has passed, which tolerates reordering that a duplicate count would mistake for loss. And tail loss probes cover the case where the last segments of a burst are lost, so no later data exists to produce duplicate acknowledgements. After about two round trips, the sender resends the last segment to provoke a SACK, instead of waiting out a timer whose floor on Linux is 200 milliseconds.

One more ambiguity. When an acknowledgement arrives for a segment sent twice, which transmission does it acknowledge? Karn's algorithm simply never takes a round-trip sample from a retransmitted segment. QUIC fixed it at the root: packet numbers are never reused, so a retransmission carries the lost data in a new packet with a higher number, and every acknowledgement names exactly one transmission.

## The same algorithms, one layer up

A TCP acknowledgement means the peer's kernel has the bytes in its receive buffer. It does not mean the application read them, let alone acted on them. If the process crashes after the acknowledgement, the data is gone and the sender never knows. That is the end-to-end argument: reliability that matters to the application has to be built again by the application, and when you do that, you rebuild this lesson.

Kafka consumer offsets are cumulative acknowledgements. Committing an offset says everything before it is processed, so one slow or poisoned message blocks the commit for everything after it: Go-Back-N's head-of-line problem. SQS acknowledgements are Selective Repeat: each message is deleted individually, and the visibility timeout, 30 seconds by default, is a per-message retransmission timer. And idempotency keys are sequence numbers. Retransmission guarantees duplicates, so the receiver must deduplicate, just as the alternating bit did.

## In the interview

Here is one the lesson expects. Your Kafka consumer processes a batch in parallel. How do you commit?

[pause]

Track completion per offset, and commit the lowest offset below which everything is done. That is a Selective Repeat receiver emitting a cumulative acknowledgement. Send poison records to a dead-letter topic so the commit point can advance. The wrong answer is "commit the highest completed offset", which silently skips unfinished messages after a crash.

And another. A 1-gigabyte copy between regions with an 80-millisecond round trip runs at 50 megabits a second with no loss. What do you check? The window against the bandwidth-delay product. 50 megabits a second times 80 milliseconds is 500 kilobytes, so something caps the window near 500 kilobytes: an explicitly set receive buffer, which turns off Linux's autotuning, a low maximum in the kernel's buffer settings, or an application reading slowly. The wrong answer is "the link is congested, buy bandwidth", when there is no loss.

## Recap

Four things to remember. A window must cover the bandwidth-delay product, or the protocol spends its time waiting. Go-Back-N buys a one-number receiver with up to a window of resends per loss, about 19 percent useful throughput in the lesson's example, while Selective Repeat pays in receiver memory and per-frame timers and keeps about 99. Selective Repeat's window is at most half the sequence space, or an old frame looks new. And a transport acknowledgement is not an application acknowledgement: Kafka offsets are cumulative, queue acknowledgements are selective, and retransmission guarantees duplicates.

At your desk: the two traces under one loss, the proof of the window rule, the SACK measurement and the socket statistics, and the two simulation exercises.
