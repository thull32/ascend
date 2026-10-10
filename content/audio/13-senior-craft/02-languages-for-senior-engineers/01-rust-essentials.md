---
lesson: rust-essentials
source: 8f3a72be76204899
fit: partial
desk:
  - "The pump signature from the opening, read as an ownership contract"
  - "The sizes table: what String, a fat pointer, an Option and the error enum cost"
  - "The E0502 borrow error and its line-by-line liveness trace"
  - "The MutexGuard across an await compile error, and the block-scope fix"
  - "The hand-built Countdown future and block on executor, with its printed trace"
  - "The password hash, coach route and pump code, and the sequence diagram"
  - "The reading-Rust and interview-idiom tables"
  - "Exercise: find the first borrow-checker error"
---
## Introduction

You are reviewing a pull request, and you meet a function called pump. It takes an upstream stream by value, it takes a channel sender by reference, and it asks for a stream that is Unpin. Three questions decide whether you can review it. Why does the stream arrive by value while the sender arrives by reference? What does Unpin buy? And what happens inside this function when the browser disconnects halfway through a reply?

An engineer who has never written Rust approves on vibes. A senior engineer reads the signature as a contract. Pump owns the stream and will consume it. It only borrows the sender, so it cannot close it. And it needs a stream that can be polled without first being pinned in place.

Rust earns that density by moving memory management and data-race prevention from run time to compile time. There is no garbage collector, and no reference counting unless you ask for it, yet use-after-free, double free and data races are compile errors. Everything follows from three rules about who owns a value and who may look at it.

The plan: ownership and borrowing, errors as values, what Send means across an await, how async actually runs, and why blocking work and cancellation shape real backend code.

## Ownership and borrowing

Three rules. Every value has exactly one owner. Assigning or passing by value moves ownership, and the source is dead afterwards. And when the owner goes out of scope, the value is dropped: its destructor runs and its memory is freed.

Picture a string holding "hello". Its 24-byte header lives on the stack: a pointer, a length and a capacity. The text lives on the heap. Say "let t equal s", and the 24 bytes are copied and s becomes unusable. The heap is untouched. Use s again and the compiler refuses. When t goes out of scope, the buffer is freed, exactly once.

Compare that with other languages. In Python, Java or Go, the same line makes two names for one object, and a collector decides when it dies. In C plus plus, it deep-copies. Rust makes the moved-from name unusable, so one owner frees the buffer: no double free, no forgotten free, no collector. A deep copy only happens when you write clone, so search a hot path for clone and you have found its allocations.

Most functions do not want ownership; they want to look. A shared borrow allows any number of readers, and none may mutate. An exclusive borrow, written ampersand mut, means that while it is live, no other borrow exists. Many readers or one writer.

Here is the error you will meet most. You get a reference to Ana's scores out of a map, then insert Bo into the map, then use Ana's reference. The compiler rejects the insert. Before I tell you why: the map had spare capacity, so the insert would not even have resized. Why reject it?

[pause]

Because the checker reasons from signatures, not from run-time state. Insert takes the map exclusively, so it may move anything inside, and the next insert that crosses a capacity boundary really does move the entries. In C plus plus, that is a dangling reference that passes your tests.

Since 2018, a borrow is live from its creation to its last use, not to the end of the block. So there are three fixes, in order of preference. Reorder, so the borrow's last use comes before the insert; free. Copy out what you need, like the length, instead of keeping a reference; also free. Or clone, which is correct and costs an allocation per call: fine at startup, suspicious in a hot loop.

Applied across threads, "many readers or one writer" rules out data races. Where the rule hurts is cyclic structures: doubly linked lists, graphs, trees with parent pointers. The idiomatic answer is nodes in a vector linked by index. In an interview, a graph is a vector of vectors of indices.

## Errors as values

A Rust enum is a tagged union, and the app's error vocabulary is one: validation, unauthorised, not found, rate limited, database, internal, and so on.

Match must be exhaustive, and the app uses that deliberately. The function that gives each error its machine code, and the mapping to an HTTP status, each list every variant with no wildcard arm. Add a payment-required variant and the build fails at both sites until someone decides its code and its status. A wildcard would silently map the new variant to whatever the default was.

The question mark operator is early return plus a conversion. Follow one failure end to end. Postgres drops a connection. SeaORM returns its error. A question mark in a service converts it to the app's database error. A question mark in the handler wraps that for the web layer, and the response becomes a 500 whose body says "internal error" while the cause goes to the log.

And unwrap and expect are assertions that panic. Right for "the hashing library itself is broken". Wrong for anything derived from request input, where one malformed input becomes a reset connection instead of a 400.

## Send and Sync across an await

Two marker traits govern threads, and the compiler derives them from a type's fields. Send: ownership may move to another thread. Sync: a shared reference may be used from several threads. Rc is neither, because its count is updated without atomics. Arc is both, when what it holds is.

Tokio's spawn requires a future that is Send, because a task may resume on a different worker after any await. And an async function compiles to a struct holding every local that is alive across an await. So one non-Send local held across an await makes the whole future non-Send.

The classic case: lock a standard mutex, bump a counter, then await a save while still holding the guard. The compiler says the future cannot be sent between threads safely. It is protecting you twice. The guard is not Send. And holding a blocking lock while suspended is a deadlock waiting to happen: another task on the same worker calls lock, blocks the thread, and the task holding the lock can never be polled to release it.

Here is the version-specific trap. On rustc 1.98, calling drop on the guard before the await still fails with the same error, because the compiler decides what a future holds from the variable's scope, not from the move. What compiles is a block that reads the value and ends, so the guard's scope closes before the await. When the lock genuinely must span an await, use Tokio's mutex, whose lock yields instead of blocking. It is slower, which is why Tokio itself recommends the standard mutex for short critical sections.

The cost of sharing, measured. Cloning and dropping an Rc took half a nanosecond. An Arc took about 7 nanoseconds on one thread. With eight threads cloning the same Arc, each clone took 88 nanoseconds, because the count's cache line bounces between cores.

## How async actually runs

An async function returns a future: a state machine that does nothing until an executor calls poll. Poll returns ready with a value, or pending. A future that returns pending must first hand its waker to whatever will complete it, a socket, a timer or a channel, which calls wake to ask the executor to poll again. That is the whole protocol.

The lesson builds one by hand: a countdown future that says pending twice and then ready, and an executor that polls and sleeps until woken. The handler's "start" line prints once. Polls two and three do not rerun the handler from the top; they resume the state machine at its await.

And those saved locals are real memory. An async function that keeps a 1,024-byte buffer alive across an await produced a 1,026-byte future. The same function with the buffer scoped to end before the await produced a 16-byte one. Spawning moves the whole future into one heap allocation, so large locals held across awaits are memory per concurrent task.

Now Pin. That state machine may hold a reference to one of its own fields. Moving the future to another address would leave that reference pointing at the old one. So poll takes a pinned reference: a promise that the value will not move again until it is dropped. Types with no self-references are Unpin, and pinning them is a no-op. Futures from async blocks are not. You pin on the heap with Box pin, or on the stack with the pin macro.

What Tokio adds is the industrial executor: one worker thread per core by default, work stealing, and an I/O driver built on epoll holding the wakers of every parked socket. The key word is cooperative. A task gives the thread back only when it returns pending. Tokio adds a budget of 128 operations per poll on its own resources, but nothing interrupts a task that computes for 40 milliseconds without touching a Tokio resource.

## Blocking work and cancellation

That is why password hashing looks the way it does. Argon2 costs tens of milliseconds of CPU with no await points. With 8 workers, 8 concurrent logins occupy all of them, and every other request waits, health checks included. A rule of thumb from Tokio's maintainers is no more than 10 to 100 microseconds of work between awaits.

The fix is spawn blocking, which moves the work to a separate pool of up to 512 threads. Read the rest as a contract. The password arrives as an owned string, because the blocking task can outlive the caller: if the browser disconnects, the handler is dropped, but a thread already hashing cannot be interrupted.

The second failure is subtler. After moving hashing to spawn blocking, a credential-stuffing burst kills the pod for running out of memory. The pool bounds threads, not memory, and each Argon2 call holds 19 mebibytes: 200 concurrent attempts is about 3.7 gibibytes. The fix is a semaphore sized to the CPU count in front of the work. And a trap hides here: the permit is bound to a variable named underscore permit. Write "let underscore equals" instead, and the permit drops on the spot, because a bare underscore is not a variable and nothing owns the value. The limit then bounds nothing.

Now the opening question. Cancellation in async Rust is dropping. Dropping a future stops it at whatever await it was parked on; the code after that point never runs, and there is no finally, only destructors. So the coach route, which must save the full model reply even if the tab closes, puts that work in a spawned task that owns the upstream stream and the sender. The HTTP response owns only the receiving end, and a disconnect drops only that.

When the browser goes, the channel closes, sends fail at once, pump ignores the error and keeps draining the upstream, and then the reply is persisted. The channel holds 64 events, which is backpressure: a slow reader fills it, sending waits, and pump stops pulling from the model instead of growing memory.

## In the interview

Here is a follow-up the lesson expects. Why can't you hold a standard mutex guard across an await?

[pause]

The guard is not Send, so the future cannot be spawned on a multi-threaded runtime. And even where it compiles, a task suspended while holding a blocking lock can deadlock a worker whose next task calls lock. Scope the guard in a block that ends before the await, because on rustc 1.98 an explicit drop is not enough, or use Tokio's mutex when the lock must span it. The common wrong answer is "always use Tokio's mutex in async code", which pays an async lock's overhead for critical sections that never await.

Another: can safe Rust leak memory? Yes: through Rc cycles, through forget, through Box leak. Leaking is memory-safe; Rust prevents dangling pointers and double frees, not waste. A slowly growing graph of Rc nodes is a cycle; make the back-pointers weak, or store the graph as indices.

And in a design review, choose Rust for a measured reason: latency-sensitive services where garbage collection pauses show in the 99th percentile, memory-constrained deployments, parsing untrusted input. Name its costs: slower compiles, a steeper learning curve, a smaller hiring pool, and an async model that asks you to understand Pin, Send and cancellation. For a coding round, only if you are already fluent.

## Recap

Five things to remember. A Rust signature is an ownership contract: by value means consumed, a shared borrow means inspected, an exclusive borrow means modified, Pin means will not move. A borrow-checker error is a liveness trace, and the cheapest fixes come first: reorder, copy out, then clone. Locals alive across an await live inside the future, which is why a guard there breaks Send and a buffer there costs memory per task. Scheduling is cooperative, so CPU work goes to spawn blocking with a semaphore bounding its memory. And cancellation is dropping, so must-complete work belongs in a tracked task.

At your desk: the sizes table, the borrow error and its trace, the mutex compile error, the hand-built executor, the coach route code, the idiom tables, and the borrow-checker exercise.
