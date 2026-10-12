---
lesson: io-and-syscalls
source: 79d58dc830ccd6ad
---
## 1

A Rust service writes 2 million small log lines per minute with the writeln macro, straight to a File, and a profile shows most of the CPU time in the kernel. What is the cheapest fix?

A, open the file with direct input-output, so writes skip the page cache. B, call fsync less often, so the kernel can batch disk flushes. C, wrap the File in a BufWriter, so many lines share one write. D, move the writes to io uring, so they bypass the system call path.

[think]

The answer is C: wrap the File in a BufWriter, so many lines share one write.

Rust's File is unbuffered, so the macro issues a write system call per formatting fragment. A BufWriter batches them into 8 kibibyte writes; measured, the loop went from 1.85 seconds to 24 milliseconds. Io uring would still submit one operation per fragment unless you batch, and fsync and direct input-output do not change the number of system calls.

## 2

Why does epoll wait cost about the same with 50 thousand idle descriptors as with 10, when poll grows to milliseconds?

A, epoll keeps descriptors in a hash table with constant-time lookups. B, a wait-queue callback fills a ready list that epoll wait drains. C, epoll runs a kernel thread that polls every socket continuously. D, poll is capped at a fixed set size, so it rescans in blocks.

[think]

The answer is B: a wait-queue callback fills a ready list that epoll wait drains.

Poll copies in and scans the whole array on every call, about 45 nanoseconds per descriptor. Epoll registers each socket once, hooking a callback onto its wait queue. When data arrives, the callback appends that socket to the ready list, and epoll wait only copies the list out. The fixed set size limit belongs to select, and epoll's interest set is a red-black tree, not a hash table.

## 3

A server uses edge-triggered epoll and makes one 4 kibibyte read per notification. A client sends a 10 thousand byte request and waits for the reply. What happens?

A, the receive buffer truncates the request to 4 kibibytes. B, the kernel drops the bytes that do not fit in one read. C, epoll reports the socket again until it is fully drained. D, 5,904 bytes stay unread until the client sends more.

[think]

The answer is D: 5,904 bytes stay unread until the client sends more.

The whole arrival is one edge. After one read, edge-triggered mode does not re-queue the socket, so no notification comes until new data arrives, and the client is waiting for a reply. Nothing is dropped or truncated, and level-triggered mode would have reported the socket again. The fix is to keep reading until the call returns EAGAIN.

## 4

A Node service with low CPU usage shows rising latency on endpoints that read small files and resolve hostnames with dns lookup. What is the likely bottleneck?

A, libuv's 4-thread pool, shared by file calls and getaddrinfo. B, TCP congestion control throttling the DNS replies. C, the epoll ready list growing faster than it drains. D, garbage collection pausing the event-loop thread.

[think]

The answer is A: libuv's 4-thread pool, shared by file calls and getaddrinfo.

Regular files and getaddrinfo cannot use readiness-based input-output, so libuv runs them on a pool of 4 threads by default. When those are busy, new file and DNS work queues behind them while the main thread idles. Garbage collection pauses would show up as CPU time. Raising the thread pool size, or using dns resolve instead, helps.

## 5

A single thread issues random 4 kibibyte direct input-output reads. With pread it gets about 4,000 IOPS; submitting 64 reads per io uring enter call gets about 100 thousand. What mostly explains the gain?

A, many requests in flight, so device latency overlaps. B, the page cache serving most of the io uring reads. C, registered buffers removing the copy to user space. D, fewer system calls, since one enter replaces 64 pread calls.

[think]

The answer is A: many requests in flight, so device latency overlaps.

Throughput equals requests in flight divided by latency. One outstanding read at about 240 microseconds caps a thread near 4,000 IOPS, while 64 in flight let the storage stack overlap them. System call savings are tiny next to 240 microseconds, and for cached reads io uring was no faster. Direct input-output bypasses the page cache, and no registered buffers were used.

## 6

What does sendfile save, compared with a read and write loop, when serving a static file over plain TCP?

A, TCP checksum work, since stored checksums are reused. B, two CPU copies through a user buffer, and most of the system calls. C, the disk read, since the file streams from the NIC's cache. D, the page-cache lookup, since bytes go straight from disk to the NIC.

[think]

The answer is B: two CPU copies through a user buffer, and most system calls.

The data still comes from the page cache, read from disk if needed, and still goes to the NIC. Sendfile skips copying it into and back out of user space, and moves the whole file in one call; measured, the sender's CPU per gibibyte fell from 143 milliseconds to between 51 and 85. With TLS the CPU must encrypt the bytes, which is why kernel TLS is needed to keep the benefit.
