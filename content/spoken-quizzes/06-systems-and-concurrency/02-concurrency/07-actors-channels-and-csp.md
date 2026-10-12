---
lesson: actors-channels-and-csp
source: ab959d6e26eb974b
---
## 1

A Go function starts a goroutine that sends its result on an unbuffered channel, then selects on that channel and a one-second timer. Under load, memory grows steadily. Why?

A, late goroutines park forever on a send that nobody will receive. B, the select statement starves its channel case under load. C, unbuffered channels allocate a fresh buffer on every send. D, the timer leaks once per call, and is never collected.

[think]

The answer is A: late goroutines park forever on a send nobody will receive.

An unbuffered send needs a receiver. Once the caller returns on the timeout, the goroutine parks in the channel's send queue forever, and pins everything it references; the lesson's measurement left 2,000 goroutines and 128 mebibytes behind. A buffer of 1 lets the send complete and the goroutine exit, and a context lets the work stop early. The growth tracks timeouts, not calls.

## 2

A goroutine receives from a channel of capacity 2 whose buffer is full, while another goroutine is parked trying to send. What does the runtime do?

A, it returns the oldest buffered value, and moves the parked sender's value into the freed slot. B, it returns the parked sender's value directly, and leaves the buffer untouched. C, it grows the buffer by one slot, so both the sender and the receiver can proceed. D, it wakes the sender first, and makes the receiver wait for its send to finish.

[think]

The answer is A: it returns the oldest buffered value, and moves the sender's value into the freed slot.

Taking the parked sender's value directly would break first-in first-out order, since two older values are buffered. The receiver takes the value at the head of the buffer, and copies the sender's value into the slot it just freed, completing the sender in the same operation. Channel buffers never grow.

## 3

Which statement about Go channels is true?

A, receiving from a closed channel panics, so receivers must check. B, sending on a closed channel panics, so only the sender closes. C, a nil channel returns the zero value immediately on receive. D, select always picks the first ready case in source order.

[think]

The answer is B: sending on a closed channel panics, so only the sender closes.

That panic is why closing is the sender's job. Receiving on a closed channel returns the zero value, with the ok flag false. A nil channel blocks forever, which is useful for disabling a select case. And select chooses pseudo-randomly among the ready cases.

## 4

A Tokio service switches from a bounded channel of 1,000 to an unbounded channel, because senders were occasionally waiting. What changes under a sustained overload?

A, throughput rises, because the receiver can batch its reads. B, nothing, because Tokio caps unbounded channels at 1,000 items. C, senders never wait, and the queue grows until memory runs out. D, senders block their operating system thread instead of suspending the task.

[think]

The answer is C: senders never wait, and the queue grows until memory runs out.

The bounded channel's capacity is a semaphore, and waiting for a permit was the backpressure. The unbounded channel has no semaphore, so a send always succeeds, and a slower receiver means unbounded growth in memory and latency. There is no hidden cap, and neither variant blocks an operating system thread on send.

## 5

An Erlang system gives every chat room its own process. One room with a celebrity guest becomes slow, and its node's memory climbs. What is happening?

A, the supervisor keeps restarting the crashed room process. B, messages from different senders arrive out of order. C, stop-the-world garbage collection is pausing the node. D, one process serialises the room, and its mailbox grows.

[think]

The answer is D: one process serialises the room, and its mailbox grows.

An actor is a serialisation point by design: the room's process handles messages one at a time. A hot entity receives more messages than one process can handle, and because sends go asynchronously into unbounded mailboxes, the backlog piles up in memory. Shard the hot entity, or add flow control. Garbage collection on the BEAM is per process, not stop-the-world.

## 6

A consumer processes 100 items a second on average, and a producer emits 150. A teammate proposes raising the channel buffer from 100 to 100 thousand. What will that do?

A, it speeds up the consumer by letting it batch its reads. B, it fixes it, because the producer no longer needs to block. C, it only delays blocking, adding memory and latency. D, nothing, because Go caps channel buffers at a small size.

[think]

The answer is C: it only delays blocking, adding memory and latency.

A buffer absorbs bursts, not a sustained difference in rate. It fills at 50 items a second, and then the producer is throttled exactly as before, except that each item now waits behind up to 100 thousand others. Add consumers, slow or shed the producer, or accept the backpressure.
