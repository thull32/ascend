---
slug: io-and-syscalls
title: "I/O and system calls: from blocking read to epoll and io_uring"
description: What a system call costs and what the kernel does inside one, how file descriptors work, why thread-per-connection stops scaling, how epoll reports readiness (traced event by event), why disk files break that model, and how io_uring's rings and sendfile remove syscalls and copies, with measured numbers.
minutes: 35
difficulty: medium
tags: [operating-systems, syscalls, epoll, io-uring, non-blocking-io, file-descriptors, zero-copy]
problems: [design-circular-queue]
---
Your notification gateway holds one WebSocket per logged-in user. It was written thread-per-connection: accept, spawn a thread, loop on a blocking `read`. At 2,000 users it was fine. At 20,000 it uses several gigabytes of memory, `vmstat` shows 150,000 context switches a second, and a heartbeat that touches every connection takes 400 ms. Almost every connection is idle. The machine is spending its effort on 20,000 sleeping threads that each wake up to read 30 bytes.

Every high-connection server has converged on the same fix: stop dedicating a thread to *waiting*. One thread asks the kernel "which of these 20,000 sockets has data?", handles the ready ones and asks again. To see why that works, where it stops working (disk files, CPU-heavy callbacks) and what replaced it, you need to look at the boundary your code crosses on every byte of I/O: the system call. Numbers below were measured on a Ryzen 9 9950X3D running Linux 6.18 under WSL2.

## What a system call costs

Your process cannot touch hardware. To read a socket it executes the `syscall` instruction, which switches the CPU to kernel mode, runs the requested operation against kernel data structures and returns. Measured here with a C loop: `getppid()`, which does almost nothing, costs 128 ns; a one-byte `write` to `/dev/null` costs 173 ns. A function call costs about 1 ns, so a syscall is roughly a hundred function calls. A few cost nothing; a million cost a noticeable fraction of a second.

Some calls never enter the kernel. `clock_gettime` is served from the **vDSO**, a page of kernel-provided code mapped into every process that reads a clock the kernel keeps updated in shared memory: 15 ns here. If `clock_gettime` shows up as a real system call in a profile, the VM's clock source does not support that fast path.

### Under the hood: one blocking `read` on a socket

1. The libc wrapper puts the syscall number (0 for `read`) in `rax` and the arguments in `rdi`, `rsi`, `rdx`, then executes `syscall`.
2. The CPU switches to ring 0 and jumps to the entry point stored in a model-specific register; the kernel switches to the thread's kernel stack and saves the user registers. On CPUs vulnerable to Meltdown the entry also switches page tables, which is part of why syscall cost varies between machines.
3. The dispatcher indexes the syscall table and calls `ksys_read`, which looks up descriptor 5 in the process's descriptor table to find a `struct file`, then calls that file's `read_iter` operation: for a TCP socket, `tcp_recvmsg`.
4. The socket's receive queue is empty, so the thread adds itself to the socket's **wait queue**, marks itself sleeping and calls `schedule()`. Another thread runs.
5. A packet arrives. The network card writes it into memory by DMA and raises an interrupt; the kernel's receive path (in a softirq) runs IP and TCP processing and appends the payload to the socket's receive queue, then walks the wait queue waking every waiter.
6. The thread becomes runnable, eventually runs, and `tcp_recvmsg` copies the bytes from kernel buffers into your buffer (`copy_to_user`).
7. The kernel restores the registers and returns to user mode with the byte count in `rax`.

Hold on to step 5: the wait queue is the hook that `epoll` uses below.

### The cheapest syscall is the one you do not make

Buffering exists to batch syscalls, and languages disagree about whether you get it by default:

```rust
use std::fs::File;
use std::io::{BufWriter, Write};

fn main() -> std::io::Result<()> {
    let mut f = File::create("out.log")?;
    for i in 0..1_000_000 {
        writeln!(f, "event {i}")?;          // File is unbuffered
    }
    let mut w = BufWriter::new(File::create("out.log")?);
    for i in 0..1_000_000 {
        writeln!(w, "event {i}")?;          // fills an 8 KiB buffer first
    }
    w.flush()?;
    Ok(())
}
```

Measured: the unbuffered loop took 1.85 s, the buffered one 23.8 ms, 78 times faster. `strace -c` on a 100,000-line version explained the size of the gap: 300,148 `write` calls, not 100,000, because `writeln!` on an unbuffered `File` issues one `write` per formatting fragment (`"event "`, the number, `"\n"`). Rust's `File` and Go's `os.File` are unbuffered; Python's `open()` and C's `stdio` buffer by default. Standard output is line-buffered on a terminal and block-buffered in a pipe, which is why output order can change when you pipe a program.

That same `strace` run also measured `strace`: the 100,000-line unbuffered loop went from 167 ms to 33.5 s, 200 times slower, because `ptrace` stops the process twice per syscall (and on this VM each stop is a cross-CPU wake-up). `strace` is excellent for *what* a process is doing and dangerous to attach to a production process at peak; `perf trace -s` or an eBPF tool such as `syscount` gives counts at a fraction of the overhead.

## File descriptors

Every open file, socket, pipe, `epoll` instance, timer and event counter your process holds is a **file descriptor**: a small integer indexing the process's descriptor table (`files_struct`). Entry 5 points at a `struct file`, the *open file description*, which holds the current offset, the flags and a pointer to the operations for that kind of object (file, socket, pipe). Descriptors 0, 1 and 2 are stdin, stdout and stderr by convention.

Three facts about that structure cause real incidents:

- **Descriptors are limited.** The per-process soft limit (`ulimit -n`) defaults to 1,024 on many distributions (this machine's session is raised to 1,048,576). Every connection and open file uses one. A leak, such as an HTTP response body never closed (`resp.Body.Close()` in Go), ends in `EMFILE: Too many open files` hours after deploy.
- **Duplicates share state.** After `fork` or `dup`, two descriptors point at the same open file description and share one offset. Two processes writing to one inherited log descriptor do not overwrite each other; two that each `open` the file separately can, unless they use `O_APPEND`.
- **Descriptors leak into children.** A descriptor without `O_CLOEXEC` survives `exec`, so a subprocess can keep your listening socket open after you restart. Modern runtimes set close-on-exec by default (the `accept4(..., SOCK_CLOEXEC)` in the trace below); C code has to ask.

## Blocking I/O and thread-per-connection

The blocking `read` traced above is simple and good. Code reads top to bottom, errors come back where they happened, and a stack trace shows what a connection is doing. Up to a few thousand connections it is often the right choice: classic Java servlet containers, Apache's worker model and PostgreSQL's process-per-connection all use it.

The costs are per connection, not per request. Each thread holds a 16 KiB kernel stack plus the pages of its user stack it has touched. Each message costs a wake-up and a switch (about 2 µs on one core, 25 µs across vCPUs on this VM, per the [processes and threads lesson](/learn/systems/operating-systems/processes-and-threads)) and a cold cache. Dan Kegel named this the **C10K problem** in 1999: serving ten thousand concurrent clients was hard not because of bandwidth but because of per-connection overhead.

## Non-blocking I/O and readiness

Set `O_NONBLOCK` on a socket and `read` never sleeps: with no data it fails immediately with `EAGAIN`. One thread can now juggle many sockets, but it needs to know *which* ones to try, so the kernel offers **readiness notification**:

| API | How you ask | Cost per call | Limits |
|---|---|---|---|
| `select` | Pass bitmaps of fds; kernel scans all; bitmaps copied in and out every call | O(watched) | `FD_SETSIZE`, usually 1,024 |
| `poll` | Pass an array of `pollfd` structs | O(watched) | None, but the same scan |
| `epoll` (Linux) | Register once with `epoll_ctl`; `epoll_wait` returns ready fds | O(ready) | None practical |
| `kqueue` (BSD, macOS) | Register filters once; `kevent` returns events | O(ready) | Also covers timers, signals, process exit |

Measured with N idle socket pairs plus exactly one readable socket, each call non-blocking:

| Watched descriptors | `poll` per call | `epoll_wait` per call |
|---|---|---|
| 10 | 0.5 µs | 0.29 µs |
| 1,000 | 44.8 µs | 0.29 µs |
| 10,000 | 588 µs | 0.29 µs |
| 50,000 | 8,639 µs | 0.29 µs |

`poll` costs about 45 ns per watched descriptor, worse at 50,000 when the array falls out of cache. `epoll_wait` is flat. Registration costs 0.6–0.8 µs per `epoll_ctl(ADD)`, paid once per connection.

### Under the hood: the interest tree and the ready list

An `epoll` instance holds a red-black tree of registered items (keyed by descriptor and file) and a linked **ready list**. `epoll_ctl(ADD)` inserts an item and calls the socket's `poll` operation with a hook that adds an entry to the socket's wait queue, the same queue a blocking reader sleeps on. When step 5 of the `read` trace wakes the wait queue, that entry's callback appends the item to the ready list and wakes whoever sleeps in `epoll_wait`. `epoll_wait` copies out the ready list. That is why idle connections cost nothing per call.

Level- versus edge-triggering is one line in that copy-out loop. In **level-triggered** mode (the default) each reported item is put back on the ready list, so the next `epoll_wait` re-checks it and reports it again while unread data remains. In **edge-triggered** mode (`EPOLLET`) it is not put back; it returns only when the callback fires again, which happens when *new* data arrives. If you read 4 KiB of a 10 KB arrival and go back to `epoll_wait`, you will not hear about the remaining 5,904 bytes until the peer sends more, which for a request-response protocol may be never. With edge-triggered `epoll`, you read until `EAGAIN`, every time.

## epoll, traced event by event

A 20-line edge-triggered echo server using Python's `select.epoll`:

```python
import select, socket

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", 9077)); srv.listen(128); srv.setblocking(False)
ep = select.epoll()
ep.register(srv.fileno(), select.EPOLLIN)
conns = {}
while True:
    for fd, ev in ep.poll():                     # epoll_wait
        if fd == srv.fileno():
            c, _ = srv.accept(); c.setblocking(False)
            conns[c.fileno()] = c
            ep.register(c.fileno(), select.EPOLLIN | select.EPOLLET)
            continue
        c = conns[fd]
        while True:                              # edge-triggered: drain until EAGAIN
            try:
                data = c.recv(4096)
            except BlockingIOError:
                break
            if not data:                         # peer closed
                ep.unregister(fd); c.close(); del conns[fd]
                break
            c.send(data[:5])                     # reply with a 5-byte acknowledgement
```

A client connected, sent `hello\n`, waited, sent 10,000 bytes in one `sendall`, then closed. `strace` on the server recorded exactly this:

```text
epoll_create1(EPOLL_CLOEXEC)            = 4
epoll_ctl(4, EPOLL_CTL_ADD, 3, {events=EPOLLIN, data={u32=3, u64=3}}) = 0
epoll_wait(4, [{events=EPOLLIN, data={u32=3, u64=3}}], 1023, -1) = 1
accept4(3, {sa_family=AF_INET, sin_port=htons(42366), sin_addr=inet_addr("127.0.0.1")}, [16], SOCK_CLOEXEC) = 5
epoll_ctl(4, EPOLL_CTL_ADD, 5, {events=EPOLLIN|EPOLLET, data={u32=5, u64=5}}) = 0
epoll_wait(4, [{events=EPOLLIN, data={u32=5, u64=5}}], 1023, -1) = 1
recvfrom(5, "hello\n", 4096, 0, NULL, NULL) = 6
sendto(5, "hello", 5, 0, NULL, 0)       = 5
recvfrom(5, 0x2c0ac870, 4096, 0, NULL, NULL) = -1 EAGAIN (Resource temporarily unavailable)
epoll_wait(4, [{events=EPOLLIN, data={u32=5, u64=5}}], 1023, -1) = 1
recvfrom(5, "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"..., 4096, 0, NULL, NULL) = 4096
sendto(5, "xxxxx", 5, 0, NULL, 0)       = 5
recvfrom(5, "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"..., 4096, 0, NULL, NULL) = 4096
sendto(5, "xxxxx", 5, 0, NULL, 0)       = 5
recvfrom(5, "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"..., 4096, 0, NULL, NULL) = 1808
sendto(5, "xxxxx", 5, 0, NULL, 0)       = 5
recvfrom(5, 0x2c0acfb0, 4096, 0, NULL, NULL) = -1 EAGAIN (Resource temporarily unavailable)
epoll_wait(4, [{events=EPOLLIN, data={u32=5, u64=5}}], 1023, -1) = 1
recvfrom(5, "", 4096, 0, NULL, NULL)    = 0
epoll_ctl(4, EPOLL_CTL_DEL, 5, 0x7ffc4df4c1b4) = 0
```

Event by event: the listening socket (fd 3) is registered level-triggered; the first `epoll_wait` sleeps until a connection is queued, and `accept4` returns fd 5 with close-on-exec set. Fd 5 is registered edge-triggered. The second `epoll_wait` reports the 6-byte `hello\n`; the server reads it, replies, and reads again to get `EAGAIN`, which proves the socket is drained. The 10,000 bytes produce **one** edge, and the loop takes them in three reads (4,096 + 4,096 + 1,808) until `EAGAIN`. Without the inner loop, the server would have read 4,096 bytes and slept on 5,904 forever. The last edge is the peer's close, seen as a zero-byte read. Every call in the trace is non-blocking except `epoll_wait`, which is the one place the thread sleeps.

This loop is the engine inside Node, nginx, Redis, Netty, Tokio and `asyncio`. A runtime adds timers, a task queue and a nicer programming model on top, but the thread still alternates between "wait for readiness" and "run the callbacks for whatever became ready", which is why one slow callback delays every connection:

```viz
{"type": "concurrency", "algorithm": "event-loop",
 "title": "One thread, many callbacks",
 "caption": "The host (kernel via epoll, plus timers) decides what is ready; the loop runs each callback to completion on one thread. A 200 ms callback delays every socket by 200 ms."}
```

## A read returns what is there, not what you asked for

TCP is a byte stream, not a message stream. One 10 KB `send` arrived above as three reads; two small sends can arrive as one. `recv(fd, buf, 4096)` returns anything from 1 to 4,096 bytes, 0 at end of stream, or `EAGAIN`. Every protocol therefore needs **framing** (a delimiter, a length prefix, or HTTP's `Content-Length` and chunked encoding) and every reader needs a per-connection buffer for the incomplete tail of the last read.

Writes are the mirror image. A non-blocking `send` copies as much as fits in the socket's send buffer and returns the count. If a client reads slowly, the buffer fills and `send` returns less than you gave it. The correct response is to keep the unsent bytes, register interest in `EPOLLOUT` and resume when the socket is writable. The two common incorrect responses are switching the socket to blocking (which stalls the loop behind one slow client) and appending to an unbounded per-connection output buffer (which turns a slow client into a memory leak). Bounding that buffer and pausing the producer is **backpressure**, covered in [I/O-bound versus CPU-bound](/learn/systems/performance-engineering/io-bound-vs-cpu-bound).

## Disk files are always "ready"

Readiness works for sockets and pipes because they have a meaningful "no data yet" state. A regular file does not: its data is always there, possibly not in memory. `select` and `poll` report regular files as always readable, `epoll_ctl` refuses them with `EPERM`, and a `read` that misses the page cache blocks the thread for the disk read whatever `O_NONBLOCK` says. So readiness-based runtimes handle disk I/O with threads:

- **Node** (libuv) runs file system calls, `dns.lookup` (the blocking `getaddrinfo`) and some crypto and compression on a thread pool of 4 threads by default (`UV_THREADPOOL_SIZE`). Heavy file I/O plus many DNS lookups saturates those four threads while the CPU idles.
- **Tokio**'s `tokio::fs` wraps blocking calls in `spawn_blocking`, a separate pool.
- **Go** lets a goroutine block its OS thread in the syscall and moves the other goroutines to another thread.
- **Python** `asyncio` has no async files; `open().read()` in a coroutine blocks the loop unless sent to `run_in_executor`.

## io_uring: completion instead of readiness

`io_uring` (Linux 5.1, 2019) changes the question from "tell me when I *can* read" to "do this read and tell me when it is *done*". It is two ring buffers in memory shared between your process and the kernel, each with one producer and one consumer, coordinated only by head and tail indices and memory barriers ([Design Circular Queue](/practice/design-circular-queue) is the core data structure):

- The **submission queue** (SQ): you produce 64-byte entries (opcode, fd, offset, buffer address, length, a `user_data` tag) at the tail; the kernel consumes from the head.
- The **completion queue** (CQ): the kernel produces 16-byte entries (`user_data`, result, flags) at the tail; you consume from the head.

### One batch, traced by ring index

Trace one batch of three reads on a ring of 8 entries (index mask 7), starting with SQ head = tail = 5 and CQ head = tail = 12:

1. Write SQEs into slots 5, 6 and 7 (`5 & 7`, `6 & 7`, `7 & 7`): read fd 7 at offset 0 tagged `A`, fd 9 tagged `B`, fd 12 tagged `C`. Advance the local tail to 8.
2. Publish with a store-release: SQ tail = 8. Nothing has happened yet from the kernel's view.
3. One `io_uring_enter(ring, to_submit=3, min_complete=3)` syscall. The kernel consumes slots 5–7, SQ head becomes 8, and it starts each operation: it tries a non-blocking attempt inline, arms an internal poll for sockets that are not ready, and hands blocking file work to the block layer or its worker threads.
4. As operations finish, the kernel writes CQEs at CQ tail 12, 13, 14 (slots 4, 5, 6 with mask 7), in *completion* order, say `B` (4,096 bytes), `A` (512), `C` (300), and advances CQ tail to 15.
5. You read CQ tail (load-acquire), process slots 12–14 matching on `user_data`, and store CQ head = 15. No syscall was needed to reap.

With `SQPOLL` a kernel thread watches the SQ tail and even step 3 disappears.

### Measured: queue depth is the win

A raw C program (no liburing) measured the effect of queue depth on random 4 KiB `O_DIRECT` reads from this VM's virtual disk:

| Method | Time | Random-read IOPS |
|---|---|---|
| `pread`, one at a time | 236 µs per read | 4,234 |
| `io_uring`, batches of 4 | 145 µs per batch | 27,621 |
| `io_uring`, batches of 16 | 223 µs per batch | 71,829 |
| `io_uring`, batches of 64 | 625 µs per batch | 102,781 |

A 24-fold gain from one thread, entirely from keeping many requests in flight: Little's law, covered in the [filesystems lesson](/learn/systems/operating-systems/filesystems-and-storage). For reads already in the page cache the picture is honest in the other direction: `pread` cost 0.57 µs and `io_uring` with 64 reads per `io_uring_enter` 0.66 µs per read, because each operation still does the same copy and the saved syscall is a small part of it.

### The costs

Completion-based I/O means the kernel writes into your buffer *later*, so the buffer must stay allocated and unmoved until its CQE arrives; that is natural in C and awkward in Rust's async model, where dropping a future cancels the operation from Rust's point of view while the kernel may still write, so Rust io_uring runtimes take ownership of buffers per operation. It has also been a rich source of kernel vulnerabilities: Google reported in 2023 that 60% of the kernel exploits submitted to its bug bounty in 2022 used io_uring, and disabled it on ChromeOS, Android apps and its production servers, and default container seccomp profiles, Docker's among them, now block its system calls. Check that it is available where you deploy.

## Zero-copy: sendfile and friends

Serving a file with `read` and `write` moves every byte four times: disk to page cache (DMA), page cache to your buffer (CPU copy), your buffer to the socket buffer (CPU copy), socket buffer to the network card (DMA), with two syscalls per chunk. `sendfile(socket, file, offset, count)` sends file bytes from the page cache to the socket inside the kernel: no user-space copy, one call for the whole file, and with a scatter-gather network card the page-cache pages are DMAed straight to the wire.

Measured sending a cached 1 GiB file over loopback TCP to a process that read and discarded it: both methods took about 0.6 s, because the receiver's copy out of the socket was the bottleneck, but the *sender* used 143 ms of CPU with `pread` + `write` in 64 KiB chunks and 51–85 ms with `sendfile`. On a real network the sender's CPU per gigabyte is what decides how many gigabits one box can serve.

```python
with open("video.mp4", "rb") as f:
    conn.sendfile(f)              # os.sendfile under the hood: no copy through Python
```

nginx has `sendfile on;`. Go's `io.Copy` from an `*os.File` to a `*net.TCPConn` uses `sendfile` automatically on Linux. Kafka serves consumers with `FileChannel.transferTo`, which is `sendfile`, so recent messages go from page cache to socket without entering the JVM heap. TLS breaks the trick because the CPU must encrypt every byte; **kernel TLS** (kTLS) moves the symmetric encryption into the kernel or the network card after the handshake, so `sendfile` works for encrypted traffic again. Netflix's Open Connect appliances, which serve video from FreeBSD, rely on in-kernel TLS for exactly this reason. `splice` moves data between a pipe and another descriptor without a user copy, and `MSG_ZEROCOPY` lets `send` transmit from user memory, which only pays off for large sends (roughly 10 KB and up) because page pinning and the completion notification replace the copy.

## What your runtime is doing

| Runtime | Network I/O | Disk I/O | What blocks everything |
|---|---|---|---|
| Node | libuv event loop over epoll/kqueue | libuv thread pool (4 threads default) | Synchronous CPU work or `*Sync` calls on the main thread |
| Python asyncio | Event loop over `selectors` | Blocks the loop unless sent to an executor | Any non-async library call (`requests`, most DB drivers) |
| Go | Netpoller (epoll) under goroutines; code looks blocking | Blocks an OS thread; runtime compensates | Rarely the whole process; heavy cgo or syscalls can exhaust threads |
| Rust Tokio | mio over epoll/kqueue | `spawn_blocking` pool | CPU-heavy or blocking code inside `async fn` on a worker |
| Java Netty | epoll per event-loop thread | Separate executor | Blocking in a channel handler |
| nginx | One epoll loop per worker process | Optional thread pools | Slow modules or blocking upstream calls |

## Choosing an I/O model

| | Blocking, thread per connection | Readiness (`epoll`/`kqueue`) | Completion (`io_uring`) |
|---|---|---|---|
| Cost per idle connection | A thread: kernel stack, user stack, scheduler entry | A few hundred bytes of kernel state | Same as readiness, plus buffers owned while in flight |
| Syscalls per operation | One, blocking | Wait plus the operation (often more) | Batched; zero with `SQPOLL` |
| Disk files | Work natively | Need a thread pool | Work natively, asynchronously |
| Programming model | Straight-line code, real stack traces | Callbacks or async/await over a loop | Buffer ownership and completion order to manage |
| Portability and safety | Everywhere | Linux (`epoll`), BSD/macOS (`kqueue`) | Linux 5.1+, often disabled by seccomp |
| Breaks down at | Thousands of connections | CPU-heavy callbacks on the loop thread | Environments that block it |

## Failure modes in production

**Symptom: `accept` fails with `EMFILE: Too many open files` hours after deploy, and the process cannot recover.** Diagnosis: `ls /proc/<pid>/fd | wc -l` climbs steadily; `lsof -p <pid>` shows thousands of sockets in `CLOSE_WAIT`, the signature of responses whose bodies were never closed. Fix: close in `finally`/`defer`, then raise `LimitNOFILE=` for servers that legitimately hold many connections.

**Symptom: some clients hang waiting for a response to a large request; small requests are fine.** Diagnosis: the server uses edge-triggered `epoll` (or a library configured for it) and reads a fixed chunk per notification, as the exercise below reproduces; `ss -tn` shows a non-zero `Recv-Q` on the hung connections. Fix: read until `EAGAIN`, or use level-triggered mode.

**Symptom: a Node service at 20% CPU shows rising latency on endpoints that read files and resolve hostnames.** Diagnosis: libuv's 4 pool threads are busy with `fs` and `dns.lookup`; the event loop is idle while work queues behind them. Fix: raise `UV_THREADPOOL_SIZE`, use `dns.resolve` (asynchronous, bypasses the pool) or cache lookups.

**Symptom: memory grows without bound during a traffic spike, dominated by per-connection output buffers.** Diagnosis: a few slow consumers cannot drain their sockets, and the server keeps appending to user-space write buffers. Fix: cap the buffer, stop reading from the producer (or drop the client) when it is full, and resume on `EPOLLOUT`.

**Symptom: a production process slows down 100-fold while someone investigates it.** Diagnosis: `strace` is attached; each syscall now costs two `ptrace` stops (200 times slower measured above). Fix: use `perf trace`, eBPF tools or sampling instead, and detach.

## Interviewer follow-ups

**"Why does `epoll` scale better than `poll`?"** Model answer: `poll` passes and scans the whole array per call (45 ns per descriptor measured, 8.6 ms at 50,000), while `epoll` registers once and a wait-queue callback appends ready sockets to a ready list, so `epoll_wait` costs the same at 10 or 50,000 descriptors. Common wrong answer: "`epoll` uses a hash table so lookups are O(1)".

**"What is the difference between level- and edge-triggered, and which would you use?"** Model answer: level-triggered re-reports a descriptor while it stays ready because the kernel re-queues it after each report; edge-triggered reports only new arrivals, so you must drain until `EAGAIN`; level-triggered is the safer default, edge-triggered reduces wake-ups when many threads share an instance. Common wrong answer: "edge-triggered drops data".

**"How does io_uring differ from epoll?"** Model answer: epoll tells you a descriptor is ready and you still make the syscall; io_uring takes the operation itself through a shared submission ring and reports the result in a completion ring, so it batches syscalls, works for regular files, and needs buffers that stay valid until completion. Common wrong answer: "io_uring is a faster epoll".

**"What does `sendfile` save?"** Model answer: the two CPU copies through user space and most syscalls; the data still comes from the page cache and still goes to the NIC; with TLS it needs kTLS to keep the benefit. Common wrong answer: "it skips the disk read".

## What mid-level engineers get wrong

- **Writing to an unbuffered Rust `File` or Go `os.File` in a loop.** Consequence: one syscall per fragment, 78 times slower in the measurement above.
- **Assuming one `recv` returns one message.** Consequence: corrupted parsing when a message spans reads or two arrive together.
- **Reading once per edge-triggered notification.** Consequence: connections that hang with data in their receive queue.
- **Calling blocking libraries inside an event loop.** Consequence: every connection on that loop stalls for the call's duration.
- **Treating `O_NONBLOCK` as making disk reads asynchronous.** Consequence: an event loop that stalls on every page-cache miss.
- **Attaching `strace` to a busy production process.** Consequence: an outage caused by the investigation.

## Exercises

```exercise
id: frame-lines
title: Reassemble lines from partial reads
prompt: |
  A non-blocking socket delivers a newline-delimited protocol. `chunks` is the
  sequence of results from successive `recv` calls: each element is a string
  (the bytes that call returned, in any split) or `null`/`None` (the call
  failed with EAGAIN: no data yet).

  Return an object `{"lines": [...], "rest": "..."}` where `lines` holds every
  complete line in order, without its trailing "\n", and `rest` is the
  incomplete data after the last newline, which a real server would keep in
  the connection's buffer until more arrives. Empty lines count as lines.

  Production note: scan only newly appended data for "\n", or a client that
  trickles one byte at a time makes your parser quadratic.
languages: [python, javascript]
entry: frame_lines
starter:
  python: |
    def frame_lines(chunks):
        lines = []
        rest = ""
        # your code here
        return {"lines": lines, "rest": rest}
  javascript: |
    function frame_lines(chunks) {
      const lines = [];
      let rest = "";
      // your code here
      return { lines, rest };
    }
tests:
  - args: [["PING\n"]]
    expected: {"lines": ["PING"], "rest": ""}
  - args: [["GET /a", " HTTP/1.1\nHost: x\n"]]
    expected: {"lines": ["GET /a HTTP/1.1", "Host: x"], "rest": ""}
    label: a line split across two reads
  - args: [["a\nb\nc"]]
    expected: {"lines": ["a", "b"], "rest": "c"}
    label: incomplete tail is kept
  - args: [["he", null, "llo\nwor", null, "ld\n"]]
    expected: {"lines": ["hello", "world"], "rest": ""}
    label: EAGAIN between reads
  - args: [[]]
    expected: {"lines": [], "rest": ""}
    label: no reads
  - args: [["\n\n"]]
    expected: {"lines": ["", ""], "rest": ""}
    label: empty lines
  - args: [["x", "y", "z"]]
    expected: {"lines": [], "rest": "xyz"}
    hidden: true
  - args: [["one\ntwo\nthr", "ee\nfo"]]
    expected: {"lines": ["one", "two", "three"], "rest": "fo"}
    hidden: true
hints:
  - "Keep a buffer. Skip null chunks, append the others to the buffer."
  - "After each append, repeatedly split off everything before the first newline as a complete line."
  - "Whatever is left in the buffer at the end is `rest`."
```

```exercise
id: edge-vs-level
title: Edge-triggered versus level-triggered wake-ups
prompt: |
  Simulate one socket watched by epoll. `arrivals[t]` is the number of bytes
  that arrive in the receive buffer just before the loop calls `epoll_wait`
  at step `t` (0 means nothing new arrives). The (buggy) server makes exactly
  one `recv` of up to `chunk` bytes each time the socket is reported.

  In `"level"` mode the socket is reported at every step where the buffer is
  non-empty. In `"edge"` mode it is reported only at steps where new bytes
  arrived (`arrivals[t] > 0`).

  Return `{"reads": [...], "unread": n}`: `reads` lists the bytes returned
  by each `recv` in order (only steps where the socket was reported), and
  `unread` is what is left in the buffer after the last step.
languages: [python, javascript]
entry: epoll_reads
starter:
  python: |
    def epoll_reads(arrivals, chunk, mode):
        reads = []
        buffered = 0
        # your code here
        return {"reads": reads, "unread": buffered}
  javascript: |
    function epoll_reads(arrivals, chunk, mode) {
      const reads = [];
      let buffered = 0;
      // your code here
      return { reads, unread: buffered };
    }
tests:
  - args: [[10000, 0, 0], 4096, "edge"]
    expected: {"reads": [4096], "unread": 5904}
    label: the stranded 5,904 bytes from the lesson
  - args: [[10000, 0, 0], 4096, "level"]
    expected: {"reads": [4096, 4096, 1808], "unread": 0}
    label: level-triggered keeps reporting
  - args: [[], 4096, "edge"]
    expected: {"reads": [], "unread": 0}
    label: no steps
  - args: [[100, 0, 50], 4096, "edge"]
    expected: {"reads": [100, 50], "unread": 0}
    label: small messages fit in one read
  - args: [[5000, 5000, 0], 4096, "edge"]
    expected: {"reads": [4096, 4096], "unread": 1808}
    hidden: true
  - args: [[0, 3000, 0, 0], 1000, "level"]
    expected: {"reads": [1000, 1000, 1000], "unread": 0}
    hidden: true
hints:
  - "At each step, add the arrival to the buffer first, then decide whether the socket is reported."
  - "A report means one read of min(chunk, buffered) bytes; subtract it from the buffer."
```

## Senior signals

- You quote a syscall at about 100 ns and the vDSO clock at tens of nanoseconds, count syscalls with `perf trace` or eBPF, and know `strace` can slow a target by two orders of magnitude.
- You can narrate the path of a blocking `read` from the `syscall` instruction through the wait queue to `copy_to_user`, and explain `epoll` as a callback on that same wait queue feeding a ready list.
- You know which languages buffer file writes by default, and you treat every `recv` and `send` as partial, with explicit framing and bounded output buffers.
- You state the edge-triggered rule (read until `EAGAIN`) and why the kernel's re-queueing makes level-triggered the safer default.
- You know regular files do not fit readiness, so Node, Tokio and asyncio use thread pools for disk and DNS, and you can describe how that pool becomes a hidden bottleneck.
- You can trace an io_uring submission and completion by ring index, explain why queue depth multiplies IOPS, and name its buffer-ownership and security costs; you know where `sendfile` and kTLS remove copies.

## Check yourself

```quiz
- q: >-
    A Rust service writes 2 million small log lines per minute with writeln! to a File, and a profile shows most CPU time in the kernel. What is the cheapest fix?
  options: ["Open the file with O_DIRECT so writes skip the page cache", "Call fsync less often so the kernel can batch disk flushes", "Wrap the File in a BufWriter so many lines share one write", "Move the writes to io_uring so they bypass the syscall path"]
  answer: 2
  explanation: >-
    Rust's File is unbuffered, so writeln! issues a write syscall per formatting fragment. BufWriter batches them into 8 KiB writes; measured here the loop went from 1.85 s to 24 ms. io_uring would still submit one operation per fragment unless you batch, and fsync and O_DIRECT do not change the syscall count.
- q: >-
    Why does epoll_wait cost about the same with 50,000 idle descriptors as with 10, when poll grows to milliseconds?
  options: ["epoll keeps descriptors in a hash table with O(1) lookups", "A wait-queue callback fills a ready list that epoll_wait drains", "epoll runs a kernel thread that polls every socket continuously", "poll is capped by FD_SETSIZE, so it rescans in blocks"]
  answer: 1
  explanation: >-
    poll copies in and scans the whole array on every call, about 45 ns per descriptor measured here. epoll registers each socket once, hooking a callback onto its wait queue; when data arrives the callback appends the item to the ready list, and epoll_wait only copies that list out. The FD_SETSIZE limit belongs to select, and the interest set is a red-black tree, not a hash table.
- q: >-
    A server uses edge-triggered epoll and makes one 4 KiB recv per notification. A client sends a 10,000-byte request and waits for the reply. What happens?
  options: ["The receive buffer truncates the request to 4 KiB", "The kernel drops the bytes that do not fit in one read", "epoll reports the socket again until it is fully drained", "5,904 bytes stay unread until the client sends more"]
  answer: 3
  explanation: >-
    The whole arrival is one edge. After one read the item is not re-queued in edge-triggered mode, so no further notification comes until new data arrives, and the client is waiting for a reply. Nothing is dropped or truncated; level-triggered mode would have reported the socket again. The fix is to read until EAGAIN.
- q: >-
    A Node service with low CPU usage shows rising latency on endpoints that read small files and resolve hostnames with dns.lookup. What is the likely bottleneck?
  options: ["libuv's 4-thread pool, shared by fs and getaddrinfo", "TCP congestion control throttling the DNS replies", "The epoll ready list growing faster than it drains", "Garbage collection pausing the event-loop thread"]
  answer: 0
  explanation: >-
    Regular files and getaddrinfo cannot use readiness-based I/O, so libuv runs them on a pool of 4 threads by default. When those are busy, new fs and DNS work queues behind them while the main thread idles; GC pauses would show up as CPU time. Raising UV_THREADPOOL_SIZE or using dns.resolve helps.
- q: >-
    A single thread issues random 4 KiB O_DIRECT reads. With pread it gets about 4,000 IOPS; submitting 64 reads per io_uring_enter gets about 100,000. What mostly explains the gain?
  options: ["Many requests in flight, so device latency overlaps", "The page cache serving most of the io_uring reads", "Registered buffers removing the copy to user space", "Fewer syscalls, since one enter replaces 64 pread calls"]
  answer: 0
  explanation: >-
    Throughput equals requests in flight divided by latency. One outstanding read at about 240 µs caps a thread near 4,000 IOPS; 64 in flight let the storage stack overlap them. Syscall savings are tiny next to 240 µs (and for cached reads io_uring was no faster here). O_DIRECT bypasses the page cache, and no registered buffers were used.
- q: >-
    What does sendfile save compared with a read and write loop when serving a static file over plain TCP?
  options: ["TCP checksum work, since stored checksums are reused", "Two CPU copies through a user buffer and most syscalls", "The disk read, since the file streams from the NIC cache", "The page-cache lookup, since bytes go from disk to NIC"]
  answer: 1
  explanation: >-
    The data still comes from the page cache (read from disk if needed) and still goes to the NIC. sendfile skips copying it into and back out of user space and moves the whole file in one call; measured here the sender's CPU per GiB fell from 143 ms to 51–85 ms. With TLS the CPU must encrypt the bytes, which is why kernel TLS is needed to keep the benefit.
```
