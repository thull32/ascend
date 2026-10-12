---
lesson: rust-essentials
source: f452f2a7562a22e9
---
## 1

In Rust, you take a reference to Ana's entry in a hash map of scores, then insert another entry into the map, then read the length of Ana's entry. The compiler rejects it with a borrow error, although the map has spare capacity and the insert would not resize. Why?

A, it rejects any two method calls on one map within the same block. B, it checks signatures: insert takes the map by mutable reference, which may move entries. C, hash map values are always boxed, so any insert invalidates every reference. D, it tracks capacity, and assumes the next insert will always resize the map.

[think]

The answer is B: it checks signatures, and insert takes the map by mutable reference, which may move entries.

The borrow checker never looks at run-time state such as capacity. Insert takes an exclusive borrow, and an exclusive borrow may do anything to the map, including the resize that really does move entries on a later insert. The error vanishes if the last use of Ana's reference comes before the insert, because non-lexical lifetimes end the borrow there. And values are stored inline in the table, not boxed.

## 2

On Rust 1.98, an async function locks a standard library mutex, reads the value, explicitly drops the guard, then awaits. Passing it to tokio spawn still fails, because the future is not Send. What compiles?

A, wrap the guard in an Arc, so that it can be shared between threads. B, add an explicit Send bound to the async function's return type. C, read the value inside a block that ends the guard's scope, then await. D, take the lock inside a closure passed to spawn blocking instead.

[think]

The answer is C: read the value inside a block that ends the guard's scope, then await.

The analysis of what a future holds across an await is based on the variable's scope, so an explicit drop is not enough on this compiler, while a block that ends before the await is. An Arc does not make a mutex guard Send, and asserting Send in a signature does not change the type. Spawn blocking is for long CPU work, not for a critical section that lasts nanoseconds.

## 3

An async function keeps a 1,024 byte array alive across one await. A second version ends the array's scope before the await. Measured, the two futures are 1,026 bytes and 16 bytes. What explains the difference?

A, the compiler boxes every array larger than one kilobyte. B, awaiting copies the whole stack frame into the future, whatever is live. C, the first future is compiled in debug mode, and the second is optimised. D, locals alive across an await are stored as fields of the state machine.

[think]

The answer is D: locals alive across an await are stored as fields of the state machine.

An async function compiles to a state machine whose fields are the locals that must survive a suspension. A buffer that is dead before the await need not be saved, so the future stays small. Nothing is boxed implicitly and the frame is not copied wholesale, which is why scoping large temporaries before an await shrinks every spawned task.

## 4

A teammate adds a payment-required variant to Ascend's app error enum, with its error message attribute and nothing else. What happens?

A, the build fails at the error code function and at the status match, until each one handles it. B, it compiles, because thiserror derives an HTTP status from the message. C, it compiles, and the new variant falls into a default 500 arm at run time. D, it compiles, then panics the first time a handler returns the variant.

[think]

The answer is A: the build fails at the error code function and at the status match, until each one handles it.

Both matches are exhaustive with no wildcard, so the compiler lists every place that must decide a machine-readable code and a status. A wildcard would have silently produced a default. thiserror only generates the display text, and conversions for wrapped errors; it knows nothing about HTTP.

## 5

During a coach reply, a spawned task called pump reads the model's stream and sends each delta on a channel to the browser's response. The browser disconnects after ten deltas. What does pump do next?

A, the upstream model stream is cancelled automatically once the receiver is dropped. B, the send waits forever, because nobody reads from the channel any more. C, the send returns an error at once; pump ignores it and keeps draining the upstream. D, the send panics on the closed channel, and the spawned task aborts early.

[think]

The answer is C: the send returns an error at once; pump ignores it and keeps draining the upstream.

Dropping the receiver closes the channel, and sends then fail fast instead of waiting or panicking. Pump discards the error, and the task goes on to finish the turn, so the full reply is saved. Nothing links the receiver to the upstream stream, and that is the design: the work outlives the request.

## 6

You call the Argon2 password hash, which takes tens of milliseconds, directly inside an async handler, on a Tokio runtime with 8 workers. What happens under 8 simultaneous logins?

A, it fails to compile, because async code cannot call synchronous functions. B, all 8 workers are stuck hashing, so every other request waits. C, Tokio's budget of 128 operations preempts the hashing and yields. D, Tokio detects the blocking call and moves it to the blocking pool.

[think]

The answer is B: all 8 workers are stuck hashing, so every other request waits.

Scheduling is cooperative: a task yields only by returning pending. The cooperative budget counts operations on Tokio's own resources, so a pure computation never touches it, and holds its worker the whole time. Calling a synchronous function from async code compiles fine, which is why this bug reaches production. Spawn blocking, plus a bound on concurrency, is the fix.
