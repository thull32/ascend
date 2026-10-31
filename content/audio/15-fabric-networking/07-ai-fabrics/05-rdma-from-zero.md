---
lesson: rdma-from-zero
source: ea868a1b8a6343bb
fit: partial
desk:
  - "The rdma-write visualisation: 1 mebibyte from srv001 to srv002 over a TCP socket, then as one RDMA WRITE"
  - "The kernel path cost table, the verbs table and the QP state machine diagram with its attributes"
  - "The RC, UC and UD comparison table and the memory region table"
  - "The RDMA READ sequence diagram and the SEND, WRITE and READ comparison table"
  - "The completion status table and the RoCEv2 first packet, field by field"
  - "The RC queue pair model in Python, with its five cases and output"
  - "The trade-offs table: kernel TCP, zero-copy TCP, DPDK, RDMA RC and RDMA UD"
---
## Introduction

Every training step on Meridian's San Jose cluster ends with each of its 1,024 GPUs exchanging gradients with the others, and the step waits for the last byte. Each GPU has its own 400 gigabit network card, which can move 50 gigabytes per second each way. Push that through the kernel's TCP stack and you pay many CPU cores per card, a copy of every byte through host memory, and microseconds of software per message, while the GPUs wait.

RDMA, remote direct memory access, is the way out. DMA is a device, such as a network card, reading and writing host memory itself. RDMA takes that across the network: the application tells its card "these bytes of mine, into that address on that server", and the two cards move the data, run the transport, check permissions and report completion, with no system call, copy or interrupt on either side. Here it runs on RoCE version 2, RDMA packets inside ordinary UDP and IP.

Coming up: the kernel's cost, the way around it, queue pairs, memory keys, the ways to move data, and one write traced, with a lost packet.

## The kernel path, and the way around it

A TCP socket costs three things on each side: a system call, up to a microsecond each; a copy into or out of the kernel's socket buffers; and interrupts plus IP and TCP processing in software.

At 400 gigabits with 1,500-byte packets, a card receives about 32.5 million packets a second. That is about 31 nanoseconds per packet, roughly 92 cycles at 3 gigahertz, less than one trip to main memory. Even with offloads, one tuned core moves a few tens of gigabits of TCP, so eight cards would need on the order of a hundred cores. Memory hurts as much. Receiving at line rate with one copy is about 150 gigabytes per second of memory traffic: the card writes 50, the copy reads 50 and writes 50. Zero copy is 50. A CPU socket has about 300 in theory, so copying for two cards eats all of it. Latency too: a small round trip through two kernel stacks is 10 to 30 microseconds, against about 2 with RDMA. A one-mebibyte message takes about 21 microseconds on the wire, so 10 microseconds of software wastes a third of the link.

Kernel bypass means the application talks to the card directly on the data path. Zero copy means the card reads and writes the application's own buffers. RDMA does both by splitting every operation in two. The control path goes through the kernel once: opening the device, registering memory and creating queues are system calls that check permissions, pin memory and program the card. The data path stays in user space. At setup the driver maps the queues, plus a page of the card's registers called the doorbell, into the application's memory. Posting work is writing a descriptor into a queue and one doorbell write; finishing is reading the next completion entry from memory. Neither is a system call.

The kernel loses visibility: no socket, so ordinary tcpdump sees nothing. And the transport moves into the card, which is why the receiving CPU does nothing, and why RDMA wants a network that rarely drops. GPUDirect RDMA extends this to GPU memory, so gradients never touch host memory.

## Verbs and queue pairs

Verbs are the RDMA programming interface, actions like "post send" and "poll completion queue", implemented on Linux by libibverbs, with NCCL, MPI and NVMe over Fabrics on top. Every RDMA error and counter is named after their objects. A work request describes one operation: an opcode, an ID, the local buffers and keys, and for one-sided operations the remote address and key. Tiny payloads can be copied into the descriptor itself, the one place RDMA copies on purpose, because a CPU copy of 64 bytes is cheaper than a PCIe round trip.

A queue pair is RDMA's socket: a send queue of work and a receive queue of buffers for incoming sends, each tied to a completion queue. Every packet carries its 24-bit QP number, the way a TCP segment carries a port, and its state, sequence numbers, peer and timers, lives in the card.

A new queue pair does nothing until software walks it through states. Reset. Init, bound to a port. Ready to receive, which needs the peer's QP number, the peer's address, called a GID, the sequence number to expect, and the path MTU. Ready to send, with its own starting sequence number, the ack timeout and retry counts. And error, after a fatal fault. RDMA has no handshake, so applications swap these details out of band, usually over a TCP connection, as NCCL's bootstrap does. A queue pair that never works usually got one wrong: the wrong GID index, a path MTU bigger than the network carries, or mismatched sequence numbers.

There are three transport types. RC, reliable connected: one queue pair to exactly one remote queue pair, acknowledged, retransmitted and in order, every operation allowed, messages up to 2 gibibytes. NCCL and nearly all AI traffic use it. UC, unreliable connected: no acknowledgements, so a lost packet silently discards its whole message; rarely used. UD, unreliable datagram: one queue pair reaches any number of peers, but only with sends of one packet each, and no reliability.

RC's catch is one queue pair per peer per channel. In a 1,024-GPU all-to-all each card holds thousands. A packet is processed only once its queue pair's context is in the card's on-chip cache, and past that working set every miss is a fetch over PCIe and throughput falls. The signal: throughput dropping as peers rise, with message size held constant. The answers share connections: NVIDIA's dynamically connected transport, AWS's SRD, and the Ultra Ethernet transport.

## Memory registration and keys

The card moves data using physical addresses, while the application knows virtual ones that the kernel may move at any moment. Registration fixes that. It pins the pages. It builds a translation table in the card, one entry per page: a gibibyte in 4-kilobyte pages is 262,144 entries, in 2-megabyte huge pages 512. It records the access rights. And it returns two 32-bit keys.

The local key names the region in your own work requests. The remote key is a capability for other cards. srv002 sends srv001 its buffer's address, length and remote key, and from then on srv001's card can write there with no action by srv002's CPU. On every one-sided request the responding card checks that the key exists, is in the queue pair's protection domain, allows the operation and covers the range.

Registration is slow, tens to hundreds of milliseconds for gigabytes of small pages, so libraries like NCCL register once and reuse. Pinned memory counts against the locked-memory limit. A region registered without remote write fails every write into it with a remote access error on the sender, breaking its queue pair. And the remote key is a bearer token: anyone who reaches the queue pair with the right numbers and key can write that memory. So RDMA networks are isolated, and applications that must revoke access use memory windows.

## One-sided, two-sided, and completions

An RDMA write is a one-sided push: the responding card places the data and acknowledges, and the remote application is not told. Its CPU never runs. So how does the receiver learn the data arrived?

[pause]

Three ways. A write with immediate data, whose last packet consumes a posted receive and creates a completion on the far side; NCCL moves bulk data with writes and signals with exactly that. A write followed by a send on the same queue pair, since RC delivers in order. Or polling a flag the sender writes after the data, never the payload's last byte, because bytes within one write are not ordered.

An RDMA read is a one-sided pull: the request carries address, key and length, and the responses double as acknowledgements. It costs a round trip before the first byte, and both sides cap reads in flight, typically at 16. Because the reader decides when data arrives, reads help against incast; storage targets pull a host's write data that way.

Send and receive are two-sided. A send carries no address; it lands in the oldest buffer the receiver posted, so every buffer must fit the largest message. A send that finds no buffer gets a receiver-not-ready NAK, waits a timer and retries: RDMA's full receive window.

A completion queue is a ring in application memory that the card writes. Polling it is fast but spins a core; NCCL polls. A sender that never asks for completions never frees its queue slots, and stalls. A completion queue that overflows moves every queue pair on it to error. And after any fatal error, every outstanding request completes with a flush error, so the first error that is not a flush is the one that matters.

## One write, traced

The visualisation tells this story. An application on srv001 moves one mebibyte into a buffer on srv002, both on rail 1's leaf. Setup is done: buffers registered, RC queue pairs created, details and the remote key swapped over TCP, both queue pairs at ready to send with a 4,096-byte path MTU.

The application writes one work request, an RDMA write with ID 7, and rings the doorbell: well under a microsecond of CPU. The card reads the mebibyte by DMA and cuts it into 256 packets, each with the next sequence number. The first is a 4,174-byte frame, so the back end runs jumbo frames. Outside it is plain Ethernet, IP marked with DSCP 26 for the lossless class, and UDP to port 4791, RoCE version 2. Inside is InfiniBand's transport, unchanged: an opcode saying "write first", the destination QP number, the sequence number, then the remote address, key and length, the 4,096 bytes, and a checksum over everything no router changes.

Before I go on: what does the leaf read in that packet?

[pause]

Only the IP header. rail1-leaf1 decrements the time to live, rewrites the MACs, and queues the packet in the lossless class. srv002's card finds the queue pair, checks the sequence number, validates the key for remote write over the whole mebibyte, and writes the bytes into memory. Packet 256, "write last", asks for an acknowledgement. srv002's card sends one, and srv001's card writes a success completion with ID 7. About 21 microseconds on the wire, and srv002's CPU ran nothing.

Now lose packet 10. The responder accepts only the expected sequence number, so when 11 arrives it sends one NAK naming 10 and discards everything until 10 shows up. The requester resends everything from 10: go-back-N, 247 packets for one loss. At 0.1 percent loss, a 256-packet message loses a packet 23 percent of the time, each loss resending half the message on average. That arithmetic is why RoCE fabrics avoid drops.

Losing the last packet is worse. Nothing reveals the gap, so the requester waits out the ack timeout: about 4 microseconds times 2 to the power of the setting. 14 gives 67 milliseconds per attempt. NCCL's default of about 20 gives 4.3 seconds, so with 7 retries a dead peer fails a job only after about half a minute, with a retry exceeded error, while every GPU waits.

## In the interview

Production failures follow. A job dies with "transport retry counter exceeded": subtract the retry budget from its timestamp and you land on a leaf port flap. Bandwidth is low with no errors: the card's out-of-sequence counters show go-back-N, and a switch drops on the lossless queue. Queue pairs connect but carry nothing while ping works: the wrong GID index or path MTU. A new Kubernetes node pool fails to register memory: the pod's locked-memory limit. So the platform scrapes card counters, counts error completions first error first, puts host and fabric on one timeline, and checks every server's settings for drift.

The classic question: why can't we use TCP for GPU-to-GPU traffic?

[pause]

At small scale we can. At 400 gigabits per card, the kernel path costs about 150 gigabytes per second of memory traffic per receiving card, several cores, and 10 microseconds or more per message; RDMA runs the transport in the card, copies nothing, and with GPUDirect never touches host memory. The wrong answer is "the three-way handshake is too slow", which happens once per connection.

## Recap

Five things to remember. At 400 gigabits the kernel path has 31 nanoseconds per packet and 150 gigabytes per second of memory traffic, so RDMA splits a control path through the kernel from a user-space data path: descriptor, doorbell, poll. A queue pair is walked to ready to send with details swapped out of band, and RC's one per peer runs out the card's cache at scale. Registration pins memory and returns a local and a remote key, and the remote key is a bearer token. A write tells the receiver nothing unless it carries immediate data or a send follows. And go-back-N plus a timeout is why RoCE wants a lossless fabric, and why the first non-flush error is the one to read.

At your desk: the RDMA write visualisation, the tables and diagrams, the first packet field by field, and the queue pair model with its five cases.
