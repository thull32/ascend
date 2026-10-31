---
review: ai-fabrics
source: b0ecd11fdd06c995
---
## Introduction

Twelve questions from the AI fabrics module. Answer out loud before the answer comes.

This set covers the transport and the lossless network beneath it, in the order of the lessons: RDMA from zero, InfiniBand and RoCE, and lossless Ethernet with PFC, ECN and DCQCN. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

srv001 completes an RDMA write of one mebibyte into a buffer on srv002, and its completion entry says success. What does srv002's application know at that moment?

A, nothing: no completion appears on its side. B, it got a completion entry saying one mebibyte arrived. C, it was interrupted when the first packet arrived. D, its receive call returned with the mebibyte.

[think]

The answer is A: nothing, because no completion appears on its side.

A plain RDMA write is one-sided: the responding card checks the remote key and places the data in memory, and no completion, interrupt or system call happens on srv002. To notify the receiver, the sender uses a write with immediate data, which consumes a posted receive and creates a completion there, or follows the write with a send on the same queue pair. There is no receive call for a write.

## Question 2

A reliable connected queue pair sends a 256-packet RDMA write, and the packet with the 10th sequence number is dropped. What does classic RC recovery do?

A, the leaf retransmits the packet from its lossless queue buffer. B, the responder discards the message and the application reposts the work request. C, the responder sends a NAK and the requester resends the 247 packets from the 10th. D, the responder sends a NAK and the requester resends only the 10th packet.

[think]

The answer is C: the responder sends a NAK and the requester resends the 247 packets from the 10th.

The responder accepts only the expected sequence number, so on seeing the 11th it sends one NAK naming the 10th and discards everything after it until the 10th arrives. The requester goes back and resends everything from the 10th packet to the last. That go-back-N cost is why RoCE fabrics avoid drops; selective resend exists on some newer cards but is not the classic behaviour, and switches never retransmit.

## Question 3

Every training job on a new Kubernetes node pool fails at start-up with a memory registration error, while the same image works elsewhere. What is the most likely cause?

A, the queue pairs use RoCE version 1 GIDs, which the leaves cannot route. B, the remote key was sent to the peer over the wrong network. C, the pod's locked-memory limit is too small to pin buffers. D, the card's queue pair context cache is too small for the job.

[think]

The answer is C: the pod's locked-memory limit is too small to pin buffers.

Registration pins pages, which counts against the locked-memory limit, so a container with the small default fails registration as soon as it registers a real buffer. A wrong GID index fails later, when queue pairs try to become ready or exchange traffic, and a context cache problem shows as low throughput, not a start-up error. Sending the remote key is not part of registration.

## Question 4

A dashboard shows 12,000 flush error completions and one remote access error on a queue pair, all in the same second. What happened?

A, the responder ran out of posted receives and refused 12,000 sends. B, one write used a bad remote key; the queue pair entered the error state and flushed the rest. C, the completion queue overflowed and the card rewrote the statuses. D, 12,000 work requests failed independently because of congestion.

[think]

The answer is B: one write used a bad remote key, and the queue pair entered the error state and flushed the rest.

A remote access error is fatal: the queue pair moves to the error state, and every outstanding and later work request completes with a flush error without being sent. The one error that is not a flush is the root cause: a stale or wrong remote key, a missing remote-write flag, or an address outside the region. Running out of receives produces receiver-not-ready NAKs and retry-exceeded errors, not flushes, and congestion does not produce error completions.

## Question 5

Why does RoCE version 2 carry the InfiniBand transport inside UDP rather than directly in IP?

A, UDP's checksum replaces the transport's own reliability checks. B, UDP retransmits lost RDMA packets more quickly than IP does. C, UDP ports give ECMP per queue pair entropy and mark the packet as RoCE. D, UDP is faster than TCP, so RDMA runs at a lower latency.

[think]

The answer is C: UDP ports give ECMP per queue pair entropy and mark the packet as RoCE.

IP makes the packet routable, and UDP adds ports for 8 bytes. The card varies the source port per queue pair, so switches hash different queue pairs onto different paths, and destination port 4791 tells the receiver it is RoCE. UDP provides no reliability; ordering, acknowledgement and retransmission stay in the transport header, handled by the card.

## Question 6

The only subnet manager of an InfiniBand fabric crashes. What happens next?

A, nothing visible, because switches compute their own routes. B, switches elect a new manager among themselves within seconds. C, Active ports keep forwarding, but new or rebooted ports never go Active. D, every port drops to Initialize and all traffic stops at once.

[think]

The answer is C: Active ports keep forwarding, but new or rebooted ports never go Active.

The subnet manager writes the forwarding tables and brings ports to Active, but it is not in the packet path, so existing ports keep forwarding on the tables they hold. Without it, a rebooted server's port stays in Initialize, failures are not routed around, and path queries go unanswered. InfiniBand switches never compute routes, and failover happens only if a standby manager is already running.

## Question 7

A RoCE test between two servers in the same VLAN passes. The same job between servers on different leaves hangs with retry-exceeded errors, and a capture shows EtherType 8915 in hex. What is wrong?

A, the job uses a RoCE version 1 GID, whose frames cannot be routed. B, the leaves lack PFC, so every cross-leaf packet is dropped. C, the RDMA packet size is too large for the uplinks between the leaves. D, the UDP source port is fixed, so ECMP sends nothing across.

[think]

The answer is A: the job uses a RoCE version 1 GID, whose frames cannot be routed.

That EtherType is RoCE version 1: the InfiniBand headers directly on Ethernet with no IP header, so the frame is forwarded only within one layer-2 domain and dropped at the first router. The job selected a version 1 entry in the GID table; the fix is the version 2 index. Missing PFC causes drops under load, not total failure, and a packet size problem or a fixed source port would still show IP and UDP port 4791 in the capture.

## Question 8

InfiniBand links cannot drop a packet for lack of buffer. Which statement about congestion on such a fabric is correct?

A, congestion cannot occur, because senders wait for credit. B, congestion is handled only by the subnet manager re-routing. C, credit stalls spread upstream, so the fabric still needs congestion control. D, congestion only appears on links that carry IP over InfiniBand.

[think]

The answer is C: credit stalls spread upstream, so the fabric still needs congestion control.

A port with no credit stops everything queued behind it on that virtual lane, including traffic for other destinations, so a hot spot spreads backwards hop by hop. InfiniBand therefore adds virtual lanes, forward and backward congestion notification, and adaptive routing. Waiting for credit prevents drops, not queueing, and the subnet manager is not involved at packet timescales.

## Question 9

On rail1-leaf1, the priority 3 buffer for traffic arriving from srv1 crosses XOFF, because srv1 and srv2 are both sending to srv3. Where does the PFC pause frame go, and what does it stop?

A, to srv1, stopping only its queue pair that sends to srv3. B, to srv1, stopping all of its priority 3 traffic to any receiver. C, to every port on the switch, stopping all priorities briefly. D, to srv3, telling it to stop accepting priority 3 traffic.

[think]

The answer is B: to srv1, stopping all of its priority 3 traffic to any receiver.

PFC acts on the ingress priority group, so the pause goes upstream, out of the port the bytes arrived on, to srv1. It names a priority, not a flow or a destination, so while paused srv1 cannot send priority 3 traffic to anyone, even an idle receiver. Slowing only the queue pair that sends to srv3 is what DCQCN does, end to end, and PFC never pauses the receiver.

## Question 10

A 400 gigabit lossless port's headroom was computed for the switch's default cable length of 100 metres, but the actual run is 300 metres. What happens under a heavy burst?

A, some priority 3 packets are dropped after the pause is sent. B, nothing, because headroom only matters for links of several kilometres. C, PFC fires earlier, because XOFF scales with the cable length. D, the card detects the length and lengthens its pause timer.

[think]

The answer is A: some priority 3 packets are dropped after the pause is sent.

Headroom must absorb the bytes still arriving after the decision to pause: the pause's trip up the cable, the bytes already on it, the card's reaction, and frames in progress. 200 extra metres of fibre add 2 microseconds of round trip, about 100 kilobytes at 400 gigabits, that the reservation does not cover, so the lossless class overflows exactly when it is needed. XOFF does not move with the cable, and nothing adapts on its own.

## Question 11

A RoCE cluster's switches report zero ECN-marked packets during jobs, while PFC pause counters on the same ports rise steadily. Which explanation fits?

A, pauses are expected to rise before the first ECN mark is ever set. B, ECN is working, and marks are only counted on the receiving card. C, the CNP queue is strict priority, so it hides the ECN marks. D, ECN's Kmin is above the dynamic PFC XOFF, or ECN is off for the class.

[think]

The answer is D: ECN's Kmin is above the dynamic PFC XOFF, or ECN is off for the class.

In a correct design ECN marking starts below PFC's XOFF, so marks appear before pauses. Rising pauses with zero switch marks mean marking never engages: thresholds above XOFF, ECN disabled on the lossless traffic class, or traffic sent as not ECN-capable. Switches count their own marks, and how the CNP queue is scheduled has nothing to do with whether data packets are marked.

## Question 12

Why does RoCE version 2 carry its congestion signal back to the sender in a separate CNP, rather than in its acknowledgements, as TCP does with its ECN echo flag?

A, RoCE has no per-packet acknowledgement stream to piggyback on, so the card sends a CNP. B, CNPs are encrypted, and RoCE acknowledgements cannot carry protected fields. C, a CNP is lossless on priority 3, so it is guaranteed to arrive. D, switches drop acknowledgements carrying ECN bits on the lossless priority.

[think]

The answer is A: RoCE has no per-packet acknowledgement stream to piggyback on, so the card sends a CNP.

Reliable connected acknowledgements are coalesced and generated by the transport, not one per data packet, so there is no steady reverse stream to piggyback on. The receiving card sends a dedicated, rate-limited CNP naming the sender's queue pair. CNPs go in a strict-priority, lossy queue, not the lossless class, so arrival is fast but not guaranteed.

## Recap

Three ideas kept coming back. RDMA moves the work into the card: after setup there is no kernel, no interrupt and, for a write, no completion on the receiver, so errors surface as completion statuses and one fatal error flushes a whole queue pair. Loss is expensive, because classic reliable connected recovery goes back and resends everything from the hole, which is why InfiniBand uses credits and RoCE uses PFC. And no-drop is not no-congestion: credits and pauses stop whole lanes and priorities, so the fabric still needs ECN marking below XOFF, CNPs and DCQCN to slow the right senders.
