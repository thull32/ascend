---
lesson: rdma-from-zero
source: 85a2eecdb444baef
---
## 1

srv001 completes an RDMA write of one mebibyte into a buffer on srv002, and its completion entry says success. What does srv002's application know at that moment?

A, nothing: no completion appears on its side. B, it got a completion entry saying one mebibyte arrived. C, it was interrupted when the first packet arrived. D, its receive call returned with the mebibyte.

[think]

The answer is A: nothing, because no completion appears on its side.

A plain RDMA write is one-sided: the responding card checks the remote key and places the data in memory, and no completion, interrupt or system call happens on srv002. To notify the receiver, the sender uses a write with immediate data, which consumes a posted receive and creates a completion there, or follows the write with a send on the same queue pair. There is no receive call for a write.

## 2

A reliable connected queue pair sends a 256-packet RDMA write, and the packet with the 10th sequence number is dropped. What does classic RC recovery do?

A, the leaf retransmits the packet from its lossless queue buffer. B, the responder discards the message and the application reposts the work request. C, the responder sends a NAK and the requester resends the 247 packets from the 10th. D, the responder sends a NAK and the requester resends only the 10th packet.

[think]

The answer is C: the responder sends a NAK and the requester resends the 247 packets from the 10th.

The responder accepts only the expected sequence number, so on seeing the 11th it sends one sequence-error NAK naming the 10th and discards everything after it until the 10th arrives. The requester goes back and resends packets 10 through 256, 247 of them. That go-back-N cost is why RoCE fabrics avoid drops. Selective resend exists on some newer cards but is not the classic behaviour, and switches never retransmit.

## 3

Every training job on a new Kubernetes node pool fails at start-up with a memory registration error, while the same image works elsewhere. What is the most likely cause?

A, the queue pairs use RoCE version 1 GIDs, which the leaves cannot route. B, the remote key was sent to the peer over the wrong network. C, the pod's locked-memory limit is too small to pin buffers. D, the card's queue pair context cache is too small for the job.

[think]

The answer is C: the pod's locked-memory limit is too small to pin buffers.

Registration pins pages, which counts against the locked-memory limit, so a container with the small default fails registration as soon as it registers a real buffer. A wrong GID index fails later, when queue pairs try to become ready to receive or exchange traffic, and a context cache problem shows as low throughput, not a start-up error. Sending the remote key is not part of registration.

## 4

Why does an unreliable datagram queue pair, UD, scale better than RC for a service that talks to thousands of peers, and what does it give up?

A, one queue pair reaches any peer, but it gives up the use of the doorbell. B, one queue pair reaches any peer, and it loses reliability and large messages. C, it shares one remote key for all peers, but gives up remote writes. D, it caches more queue pair context, but it gives up GPUDirect RDMA.

[think]

The answer is B: one queue pair reaches any peer, and it loses reliability and large messages.

A UD queue pair names its destination on each send with an address handle, so one queue pair serves every peer and the card holds one context instead of thousands. The price is that UD offers only send, each message fits in one packet, at most the 4,096-byte MTU, and there are no acknowledgements or ordering, so the application must provide reliability. UD still uses the doorbell and the same data path, and remote keys are not involved because UD has no RDMA write or read.

## 5

A dashboard shows 12,000 flush error completions and one remote access error on a queue pair, all in the same second. What happened?

A, the responder ran out of posted receives and refused 12,000 sends. B, one write used a bad remote key; the queue pair entered the error state and flushed the rest. C, the completion queue overflowed and the card rewrote the statuses. D, 12,000 work requests failed independently because of congestion.

[think]

The answer is B: one write used a bad remote key, and the queue pair entered the error state and flushed the rest.

A remote access error is fatal: the queue pair moves to the error state, and every outstanding and later work request completes with a flush error without being sent. The one error that is not a flush is the root cause: a stale or wrong remote key, a missing remote-write flag, or an address outside the region. Running out of receives produces receiver-not-ready NAKs and retry-exceeded errors, not flushes, and congestion does not produce error completions.

## 6

Which work on an RDMA data path goes through the kernel?

A, posting each work request, which needs a system call. B, polling each completion, which the kernel copies out. C, ringing the doorbell, which the kernel validates on every write. D, none of it: only setup, such as registration and queue pair creation.

[think]

The answer is D: none of it, only setup, such as registration and queue pair creation.

At setup the kernel driver pins memory, programs the translations, and maps the queues and a doorbell page into the application's address space. After that, posting a work request is a write to memory plus a doorbell write, and polling is a memory read, all in user space. The kernel remains the security boundary because it decided, at setup, which queues and memory the application may use.
