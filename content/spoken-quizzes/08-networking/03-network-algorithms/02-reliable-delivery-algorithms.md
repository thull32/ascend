---
lesson: reliable-delivery-algorithms
source: fbfd117d768d2e55
---
## 1

A stop-and-wait protocol runs over a 1 gigabit link with a 100 millisecond round trip and 1,500-byte frames. Roughly what throughput does it achieve, and what is the fix?

A, about 120 kilobits per second, so keep a bandwidth-delay product of frames in flight. B, about 1 gigabit per second, since the link is never the limit. C, about 12 megabits per second, so upgrade to a 10 gigabit link. D, about 500 megabits per second, so send jumbo frames to halve the waits.

[think]

The answer is A: about 120 kilobits per second, so keep a bandwidth-delay product of frames in flight.

One 12,000-bit frame per 100 millisecond round trip is 120 kilobits per second. Only a window covering the bandwidth-delay product, 12.5 megabytes or about 8,300 frames, keeps the pipe full. Larger frames or a faster link do almost nothing, because the protocol is waiting, not transmitting.

## 2

A protocol uses 4-bit sequence numbers, so sixteen values. What are the largest safe windows for Go-Back-N and for Selective Repeat?

A, 16 and 16. B, 15 and 15. C, 8 and 15. D, 15 and 8.

[think]

The answer is D: 15 and 8.

The condition is that the sender's window plus the receiver's window is at most 16. Go-Back-N's receiver window is 1, so the sender's can be 15. Selective Repeat's receiver window equals the sender's, so twice the window is at most 16, and the window is 8. With a window of 9, the receiver's advanced window could contain the sequence number of a retransmitted old frame, and accept it as new.

## 3

A Selective Repeat receiver uses 3-bit sequence numbers and a window of 4, and has slid forward so its window starts at sequence 6. A late retransmission carrying sequence 2 arrives. What must the receiver do?

A, deliver it at once, since it fills an old gap. B, discard it silently, since it is outside the window. C, treat it as a duplicate, and acknowledge it again. D, buffer it as frame 10, since 2 follows 1.

[think]

The answer is C: treat it as a duplicate, and acknowledge it again.

The window accepts sequence numbers 6, 7, 0 and 1, so 2 is outside it: an old frame the receiver already delivered. It must acknowledge it again, because the sender is retransmitting only because it never saw the first acknowledgement, and staying silent makes the sender retry forever. The window rule is what guarantees an old frame can never look new.

## 4

A satellite link has a large window and a 2 percent loss rate. Moving from Go-Back-N to Selective Repeat mainly improves throughput because of what?

A, individual acknowledgements are smaller than cumulative ones. B, each loss costs one resend, instead of up to a window. C, Selective Repeat needs fewer sequence-number bits. D, Selective Repeat never needs retransmission timers.

[think]

The answer is B: each loss costs one resend, instead of up to a window.

With a window of frames in flight, Go-Back-N resends up to the whole window for every loss, while Selective Repeat resends only the missing frame. The price is the opposite of the other claims: it needs more sequence space, a receiver buffer the size of the window, and a timer per frame.

## 5

Your service writes an order to a TCP socket, the write returns, and the peer's TCP stack acknowledges every byte. Then the peer process crashes. What do you know?

A, the acknowledgement proves the process read the bytes before crashing. B, only that the bytes reached the peer's kernel buffer. C, TCP will redeliver the order once the peer restarts. D, the order was processed, because TCP is reliable.

[think]

The answer is B: only that the bytes reached the peer's kernel buffer.

TCP's reliability ends at the receiving kernel: the acknowledgement says the bytes are in the receive buffer, not that the application read them. Delivery to the application needs its own acknowledgement, such as a response, a committed offset or a queue acknowledgement, and its own deduplication. That is the end-to-end argument, and it is why message queues rebuild acknowledgements and timers above TCP.

## 6

Small API responses show a 99th percentile about 220 milliseconds above the median. The handler is fast, and a capture shows the final segment of those responses being retransmitted. Why does fast retransmit not help, and what does?

A, the window is below the bandwidth-delay product, so a larger receive buffer on the client. B, no later segment exists to cause duplicate acknowledgements, so a tail loss probe. C, the receiver disabled selective acknowledgements, so turning them back on at the server. D, Nagle delayed the segment, so setting the no-delay option on the socket.

[think]

The answer is B: no later segment exists to cause duplicate acknowledgements, so a tail loss probe.

Fast retransmit and RACK need evidence that later data was delivered. When the last segment of a response is lost, there is no later data, so recovery waits for the retransmission timeout, whose floor on Linux is 200 milliseconds. A tail loss probe retransmits the last segment after about two round trips, to provoke a selective acknowledgement instead. The other causes produce different signatures.
