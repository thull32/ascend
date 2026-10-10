---
lesson: io-and-syscalls
source: 9c38fde70b10abc5
fit: great
desk:
  - "The step-by-step trace of one blocking socket read through the kernel"
  - "The edge-triggered echo server and its strace, event by event"
  - "The io uring batch traced by ring index, and the runtime and I/O model comparison tables"
  - "Exercises: reassemble lines from partial reads, and edge-triggered versus level-triggered wake-ups"
---
## Introduction

Your notification gateway holds one WebSocket per logged-in user. It was written thread-per-connection: accept, spawn a thread, loop on a blocking read. At 2 thousand users it was fine. At 20 thousand it uses several gigabytes of memory, the machine does 150 thousand context switches a second, and a heartbeat that touches every connection takes 400 milliseconds. Almost every connection is idle. The machine is spending its effort on 20 thousand sleeping threads that each wake up to read 30 bytes.

Every high-connection server has converged on the same fix: stop dedicating a thread to waiting. One thread asks the kernel which of these 20 thousand sockets has data, handles the ready ones, and asks again.

To see why that works, where it stops working, and what replaced it, you need to look at the boundary your code crosses on every byte of I/O: the system call. Four stops: what a system call costs, how epoll reports readiness, why disk files break that model, and how io uring and sendfile remove calls and copies.

## What a system call costs

Your process cannot touch hardware. To read a socket it executes a special instruction that switches the CPU into kernel mode, runs the operation against kernel data structures, and returns. Measured on the lesson's machine, a call that does almost nothing costs about 130 nanoseconds. A function call costs about 1. So a system call is roughly a hundred function calls. A few cost nothing; a million cost a noticeable fraction of a second.

Some calls never enter the kernel at all. Reading the clock is served from a page of kernel code mapped into every process, the vDSO, in about 15 nanoseconds.

Here is the path of one blocking read on a socket, in words. The kernel looks up your descriptor to find the socket. The receive queue is empty, so your thread adds itself to the socket's wait queue, marks itself sleeping, and the scheduler runs someone else. A packet arrives; the network card writes it into memory and raises an interrupt; the kernel's TCP code appends the payload to the socket and wakes everyone on the wait queue. Your thread runs again, copies the bytes into your buffer, and returns. Hold on to that wait queue. It is the hook epoll uses.

The cheapest system call is the one you do not make. A Rust program wrote a million log lines to an unbuffered file: 1.85 seconds. Wrapped in a buffered writer: 24 milliseconds, 78 times faster. Tracing showed why the gap was so big: the unbuffered version made three write calls per line, one per formatting fragment. Rust's file type and Go's are unbuffered; Python's and C's buffer by default.

And a warning about the tool that showed it. Attaching strace slowed that loop 200 times, because it stops the process twice per system call. It is excellent for seeing what a process does, and dangerous to attach to a production process at peak. Use perf trace or an eBPF tool for counts.

## File descriptors

Every open file, socket, pipe and epoll instance your process holds is a file descriptor: a small integer indexing the process's descriptor table. Each entry points at an open file description, which holds the current offset and flags.

Three facts cause real incidents. Descriptors are limited, often to 1,024 per process by default, so a leak, like an HTTP response body never closed, ends in "too many open files" hours after a deploy. Duplicates share state: after fork, two descriptors share one offset. And descriptors leak into children unless marked close-on-exec, so a subprocess can keep your listening socket open after you restart.

## Readiness and epoll

Blocking I/O is simple and good. Code reads top to bottom, and a stack trace shows what a connection is doing. Up to a few thousand connections it is often the right choice. But the costs are per connection: a thread, its stacks, a wake-up and a switch per message. Dan Kegel named this the C10K problem in 1999. Ten thousand concurrent clients was hard not because of bandwidth but because of per-connection overhead.

Set a socket non-blocking and read never sleeps; with no data it fails immediately with "try again", spelled EAGAIN. Now one thread can juggle many sockets, but it needs to know which ones to try. The old interfaces, select and poll, pass the whole list of descriptors in on every call and the kernel scans all of them. Epoll registers each socket once, and the wait call returns only the ready ones.

The lesson measured each with exactly one readable socket among many idle ones. At 1,000 descriptors, poll took 45 microseconds per call. At 50 thousand, 8.6 milliseconds. Epoll's wait: 0.29 microseconds at every size. Flat.

Why flat? When you register a socket with epoll, it hooks a callback onto that same wait queue a blocking reader would sleep on. When data arrives and the kernel wakes the queue, the callback appends the socket to epoll's ready list. The wait call just copies the ready list out. Idle connections cost nothing per call.

Now the subtle part: level-triggered versus edge-triggered. In level-triggered mode, the default, a reported socket goes back on the ready list, so the next wait reports it again while unread data remains. In edge-triggered mode it does not; it comes back only when new data arrives.

So here is a question. A server uses edge-triggered epoll and reads 4 kibibytes once per notification. A client sends 10 thousand bytes and waits for the reply. What happens?

[pause]

The 10 thousand bytes are one edge. The server reads 4,096, goes back to wait, and never hears about the remaining 5,904 bytes until the client sends more. And the client is waiting for a reply, so that may be never. Nothing is dropped; it is stranded. The rule: with edge-triggered epoll, read until "try again", every time. Level-triggered is the safer default.

This loop, wait for readiness then run the callbacks for whatever became ready, is the engine inside Node, nginx, Redis, Netty, Tokio and Python's asyncio. Which is also why one slow callback delays every connection on that loop.

## Partial reads and writes

TCP is a byte stream, not a message stream. One 10 thousand byte send arrived as three reads; two small sends can arrive as one. A read returns anything from one byte up to what you asked for. So every protocol needs framing, a delimiter or a length prefix, and every reader needs a per-connection buffer for the incomplete tail of the last read.

Writes are the mirror image. If a client reads slowly, its socket's send buffer fills and a send writes less than you gave it. The right response is to keep the unsent bytes and resume when the socket is writable. The two wrong responses: switch the socket to blocking, which stalls the whole loop behind one slow client, or append to an unbounded output buffer, which turns a slow client into a memory leak. Bounding the buffer and pausing the producer is backpressure.

## Disk files are always ready

Readiness works for sockets because they have a real "no data yet" state. A regular file does not: its data is always there, just possibly not in memory. Poll reports files as always readable, epoll refuses them outright, and a read that misses the page cache blocks the thread for the disk, whatever the non-blocking flag says.

So readiness-based runtimes handle disk with threads. Node sends file calls, and its blocking DNS lookup, to a pool of just 4 threads by default. Tokio uses a separate blocking pool. Go lets a goroutine block its OS thread and moves the others elsewhere. Python's asyncio has no async files at all; reading one in a coroutine blocks the loop.

The classic incident: a Node service at 20 percent CPU with rising latency on endpoints that read files and resolve hostnames. The four pool threads are busy, work queues behind them, and the event loop sits idle. Raise the pool size, or use the asynchronous resolver.

## io uring and zero copy

io uring changes the question from "tell me when I can read" to "do this read and tell me when it is done". It is two ring buffers shared between your process and the kernel. You write requests into the submission ring, each tagged with your own label. The kernel writes results into the completion ring, in whatever order they finish. One system call can submit a whole batch, and reaping results needs no call at all. With a polling mode, even the submit call disappears.

The measured win is queue depth. Random 4 kibibyte reads from disk, one thread. With plain one-at-a-time reads: about 4 thousand per second. With io uring, 64 reads per batch: about 100 thousand per second. A 24-fold gain, and almost none of it from saving system calls. It comes from keeping many requests in flight so the device can overlap them. For reads already in the page cache, io uring was no faster, because each read still does the same copy.

The costs. Your buffer must stay allocated and unmoved until its completion arrives, which is awkward in Rust's async model. And it has been a rich source of kernel vulnerabilities. Google reported in 2023 that 60 percent of submissions to its kernel exploit bounty over the previous year used io uring, and disabled it on its production servers. Docker's default security profile blocks it. Check it is available where you deploy.

Last, sendfile. Serving a file with read and write moves every byte through your process: two CPU copies, two system calls per chunk. Sendfile moves bytes from the page cache to the socket inside the kernel, one call for the whole file. Sending a cached 1 gibibyte file, the sender used 143 milliseconds of CPU with read and write, and 51 to 85 with sendfile. Nginx, Go's copy function and Kafka all use it. TLS breaks the trick because the CPU must encrypt every byte; kernel TLS moves the encryption into the kernel or the network card and gets it back.

## In the interview

A follow-up the lesson expects. How does io uring differ from epoll?

[pause]

Epoll tells you a descriptor is ready, and you still make the system call. io uring takes the operation itself through a shared submission ring and reports the result in a completion ring. So it batches system calls, works for regular files, and needs buffers that stay valid until completion. The wrong answer is "io uring is a faster epoll".

And: what does sendfile save? The two CPU copies through user space and most of the system calls. The data still comes from the page cache and still goes to the network card. The wrong answer is that it skips the disk read.

## Recap

Four things to remember. A system call costs about a hundred function calls, so buffer your writes, and never attach strace to a busy production process. Epoll is flat because a wait-queue callback fills a ready list; with edge-triggered mode, read until "try again". Disk files do not fit readiness, so runtimes push them to small thread pools that become hidden bottlenecks. And io uring's win is queue depth, while sendfile's win is skipping the copies through your process.

At your desk: the blocking read traced through the kernel, the epoll echo server and its trace, the io uring ring indexes, and the two exercises on partial reads and edge-triggered wake-ups.
