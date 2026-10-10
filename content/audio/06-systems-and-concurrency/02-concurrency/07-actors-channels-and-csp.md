---
lesson: actors-channels-and-csp
source: e17307918f4ccd09
fit: great
desk:
  - "The Go channel internals and the capacity-two channel trace, step by step"
  - "The channel cost table against a mutex-protected slice"
  - "The pipeline code with cancellation, and the leaking fetch-with-timeout"
  - "The Rust bounded channel, the Python sentinel shutdown, and the Elixir counter"
  - "The bounded versus unbounded queue table, and the mutex, channel and actor comparison"
  - "Exercises: replay a Go channel's internals, and send completion times on a bounded channel"
---
## Introduction

A team rewrites a lock-heavy Go service in the spirit of "share memory by communicating". The mutexes disappear and the code reads beautifully. Three weeks later, the service's memory grows by a couple of hundred megabytes a day, and a goroutine dump shows over a million goroutines, all parked on the same line: a send on an unbuffered channel whose receiver had already returned because of a timeout.

Message passing is a genuinely better model for a lot of concurrent code. It gives each piece of state one owner, so invariants are protected by construction rather than by discipline. But it does not remove concurrency bugs. It changes their shape. Deadlocks become cycles of blocked sends. Races become leaked goroutines. Unbounded buffers become unbounded mailboxes.

Four ideas: the two families of message passing, what a Go channel actually is, the goroutine leak from that opening story, and why every queue, whatever it is called, needs a bound.

## Two families

With shared memory, threads touch the same data, and locks keep them from seeing each other's half-finished work. With message passing, each piece of state has exactly one owner, and everyone else sends the owner a message. Nobody can see the state half-updated, because nobody else can see it at all.

The first family is CSP, Communicating Sequential Processes, from Tony Hoare in 1978. Anonymous processes talk over named channels, and in the original model a send and a receive happen together, as a rendezvous. Go's goroutines and channels and Rust's channels are CSP. A full channel blocks the sender, so backpressure is built in.

The second family is actors, from Carl Hewitt in 1973, made practical by Erlang in the late 1980s. Named actors each have private state and a mailbox. Sending is asynchronous: you drop a message in an actor's mailbox by its address and carry on, and the actor processes messages one at a time. Actors crash independently and supervisors restart them, and they are designed to span machines. But mailboxes grow by default: no backpressure unless you add it.

## What a Go channel is

First, the rules that matter. An unbuffered channel is a rendezvous: a send blocks until a receiver takes the value. A buffered channel of capacity n lets sends complete while fewer than n values wait. Only the sender closes: receiving from a closed channel returns the zero value immediately, but sending on a closed channel, or closing it twice, panics. And a select picks at random among ready cases, so no case can starve the others.

Under the hood, a channel is a mutex, a small ring buffer, a closed flag, and two queues of parked goroutines: senders waiting and receivers waiting. Every operation takes the mutex and follows one of three paths. For a send: if a receiver is parked, copy the value straight onto that goroutine's stack and wake it, skipping the buffer. Otherwise, if the buffer has room, put it there. Otherwise, park the sender.

Receive mirrors it, with one twist worth remembering. Picture a channel of capacity two that holds 2 and 3, and a sender parked trying to send 4. A receiver arrives. It cannot simply take 4 from the parked sender, because that would jump the queue. So it takes 2 from the buffer, and moves the parked sender's 4 into the slot it just freed, completing the sender in the same step. The order stays first in, first out.

That mutex also explains the costs. The lesson moved 2 million integers between two goroutines. An unbuffered channel cost about 90 to 98 nanoseconds per item, because it forces a goroutine switch per item. A buffer of 128 cost about 25, because each side runs a batch before switching. A mutex-protected slice: 22.

So channels are the right tool for transferring ownership, distributing work and signalling. A mutex is the right tool for protecting a small piece of shared state, and the Go project's own guidance is to use whichever is simpler. And channels do not stop data races: send a pointer, and you have transferred the pointer, not exclusive access to what it points at.

## The goroutine leak

Back to the opening story. A function starts a goroutine to fetch something, and that goroutine sends its result on an unbuffered channel. The function then waits on either that channel or a one-second timer. Under load, memory grows steadily. Why?

[pause]

When the timer wins, the function returns, and nobody will ever receive from that channel again. The inner goroutine finishes its fetch, tries to send, and parks forever, pinning everything it references. The lesson measured 2 thousand calls whose 20-millisecond fetch outlived a 5-millisecond timeout. The unbuffered version left 2 thousand goroutines behind and 128 mebibytes of heap. Give the channel a buffer of one, so the send can always complete and the goroutine exits, and the heap was 3 mebibytes. Better still, pass a context into the fetch so abandoned work stops early.

The rule: every goroutine you start needs a known way to finish. In a pipeline, that means every blocking send sits in a select alongside the context's done channel, so that if downstream gives up, the stage stops instead of blocking forever. Export the goroutine count as a metric, and run a leak checker in tests. Go's runtime only reports a deadlock when every goroutine is blocked, so a leak in a server is never reported for you.

## Rust and Python

In Rust, sending a value through a channel moves it, and the compiler rejects any later use of it by the sender. "Share memory by communicating" is a convention in Go; in Rust it is a type-checked fact. Closing is structural: a channel closes when every sender is dropped, so there is no double close and no send-on-closed panic.

Tokio makes bounded versus unbounded explicit in the API. A bounded channel of n is a semaphore of n permits: sending first acquires a permit, suspending the task when none are free, which is backpressure without blocking a thread. The unbounded channel has no semaphore. Send always succeeds, so a slow receiver means unbounded memory.

Python's message-passing tools are queues: between threads, between asyncio tasks, and between processes, where every object is pickled and sent through a pipe. Between processes that cost about 5 to 10 microseconds per item, so small tasks drown in it. With no select over several queues, shutdown traditionally uses a sentinel, one stop marker per worker; Python 3.13 added a shutdown method to the queues.

## Actors and how they fail

An actor is private state, plus a mailbox, plus a function that handles one message at a time. Because it handles messages one at a time, its state needs no lock; the actor is the serialisation point.

Erlang's runtime, the BEAM, is the reference. Processes are tiny, a few hundred words at spawn, so one node runs hundreds of thousands to millions of them, one per connection or session. Each has its own heap and garbage collector, so there is no global stop-the-world pause. A send copies the message into the receiver's heap, which is what isolates processes, and what makes big messages expensive. Scheduling is preemptive, so one busy process cannot starve the others. And failure is local and supervised: a supervisor restarts crashed children. The philosophy is "let it crash", and restart from a known-good state.

Actor systems fail in their own ways. Mailbox growth: sends are asynchronous and mailboxes unbounded, so a slow actor silently accumulates messages until the node runs out of memory. Hot actors: one actor per entity is elegant until one entity is hot, a celebrity's timeline or a popular chat room, and every message to it is serialised through one process on one core. Shard it. Call cycles: if A makes a synchronous call to B while B calls A, both wait forever; Erlang's default 5-second call timeout turns that into a crash supervision can recover from, but the real fix is no synchronous calls in cycles. And ordering: messages from one sender to one receiver arrive in order, but nothing orders messages from different senders.

## Every queue needs a bound

Every one of these systems is a set of queues, and the most important property of a queue is whether it has a bound.

A buffer absorbs bursts. It cannot absorb a consumer that is slower on average. Suppose a producer emits 150 items a second, and a consumer handles 100. A teammate proposes raising the buffer from 100 to 100 thousand. What does that buy?

[pause]

Nothing lasting. The buffer fills at 50 items a second, and then the producer is throttled exactly as before, except that each item now waits behind up to 100 thousand others. More memory, more latency, same throughput. Only more consumers, a slower producer, or shedding load fixes a consumer that is slower on average.

With a bounded queue, overload shows up at the sender: it blocks, or the send is rejected, and memory stays flat. With an unbounded one, a Tokio unbounded channel, an Erlang mailbox, Akka's default mailbox, overload is visible nowhere until the crash.

So how do you choose? Ask one question first: who owns this data? Everyone, briefly, like a cache or a counter: a mutex, the cheapest and simplest, as long as critical sections are short. One stage at a time, handed along a pipeline: channels, where ownership transfer is the point and bounded channels give you backpressure for free. One long-lived entity with an identity and its own lifecycle, like a session or a game room, especially across machines or with independent failure: actors. Most real systems mix them.

## In the interview

A follow-up the lesson expects. How do actors provide backpressure?

[pause]

By default, they do not. Sends are asynchronous and mailboxes are unbounded. You add demand signalling, like Elixir's GenStage or Reactive Streams, or bounded mailboxes with a drop policy. The wrong answer is "the mailbox blocks the sender when full".

And: when would you use a mutex rather than a channel in Go? To protect a small piece of shared state accessed briefly by many goroutines, a cache or a counter, where a mutex is cheaper and clearer. Channels are for transferring ownership, pipelines and signalling. "Never, because Go says share memory by communicating" is the wrong answer.

## Recap

Four things to remember. Message passing gives each piece of state one owner, but it changes the shape of bugs rather than removing them: blocked-send cycles, leaked goroutines, growing mailboxes. A Go channel is a mutex, a ring buffer and two queues of parked goroutines, and an unbuffered send costs a goroutine switch. Every goroutine needs a known way to finish: put blocking sends in a select with cancellation, and give abandonable results a buffer of one. And every queue needs a bound, because a buffer absorbs bursts, never a consumer that is slower on average.

At your desk: the channel trace and costs, the pipeline and leak code, the Rust, Python and Elixir examples, the comparison tables, and the two channel exercises.
