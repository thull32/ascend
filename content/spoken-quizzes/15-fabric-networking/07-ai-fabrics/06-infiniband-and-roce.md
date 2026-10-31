---
lesson: infiniband-and-roce
source: 7d41e8b0ffe93905
---
## 1

An InfiniBand sender on virtual lane zero has sent 260 blocks in total, and the last credit limit it received is 321. Its next packet needs 65 blocks. What does it do?

A, sends it, and lets the switch drop it if its buffer is full. B, waits, because 321 minus 325, modulo 4,096, is 4,092, which is above 2,048. C, waits for a PFC resume frame from the switch before sending. D, sends it, because 321 is larger than 260 and credit remains.

[think]

The answer is B: waits, because 321 minus 325, modulo 4,096, is 4,092, which is above 2,048.

The test is the credit limit minus the total after this packet, modulo 4,096, which must be at most 2,048. Here 260 plus 65 is 325, and 321 minus 325 is minus 4, which wraps to 4,092. Only 61 blocks of credit remain and the packet needs 65, so it waits for a flow control packet with a higher limit. Comparing the limit with the total alone ignores the packet's own size, and InfiniBand links do not drop for lack of buffer and use credits, not PFC.

## 2

Why does RoCE version 2 carry the InfiniBand transport inside UDP rather than directly in IP?

A, UDP's checksum replaces the transport's own reliability checks. B, UDP retransmits lost RDMA packets more quickly than IP does. C, UDP ports give ECMP per queue pair entropy and mark the packet as RoCE. D, UDP is faster than TCP, so RDMA runs at a lower latency.

[think]

The answer is C: UDP ports give ECMP per queue pair entropy and mark the packet as RoCE.

IP makes the packet routable, and UDP adds ports for 8 bytes. The card varies the source port per queue pair, so switches hash different queue pairs onto different paths, and destination port 4791 tells the receiver it is RoCE. UDP provides no reliability and its checksum is usually zero; ordering, acknowledgement and retransmission stay in the transport header, handled by the card. TCP is not involved.

## 3

The only subnet manager of an InfiniBand fabric crashes. What happens next?

A, nothing visible, because switches compute their own routes. B, switches elect a new manager among themselves within seconds. C, Active ports keep forwarding, but new or rebooted ports never go Active. D, every port drops to Initialize and all traffic stops at once.

[think]

The answer is C: Active ports keep forwarding, but new or rebooted ports never go Active.

The subnet manager writes the forwarding tables and brings ports to Active, but it is not in the packet path, so existing ports keep forwarding on the tables they hold. Without it, a rebooted server's port stays in Initialize, failures are not routed around, and path queries go unanswered. InfiniBand switches never compute routes, and failover happens only if a standby manager is already running.

## 4

A RoCE test between two servers in the same VLAN passes. The same job between servers on different leaves hangs with retry-exceeded errors, and a capture shows EtherType 8915 in hex. What is wrong?

A, the job uses a RoCE version 1 GID, whose frames cannot be routed. B, the leaves lack PFC, so every cross-leaf packet is dropped. C, the RDMA packet size is too large for the uplinks between the leaves. D, the UDP source port is fixed, so ECMP sends nothing across.

[think]

The answer is A: the job uses a RoCE version 1 GID, whose frames cannot be routed.

That EtherType is RoCE version 1: the InfiniBand headers directly on Ethernet with no IP header, so the frame is forwarded only within one layer-2 domain and dropped at the first router. The job selected a version 1 entry in the GID table; the fix is the version 2 index. Missing PFC causes drops under load, not total failure, and a packet size problem or a fixed source port would still show IP and UDP port 4791 in the capture.

## 5

InfiniBand links cannot drop a packet for lack of buffer. Which statement about congestion on such a fabric is correct?

A, congestion cannot occur, because senders wait for credit. B, congestion is handled only by the subnet manager re-routing. C, credit stalls spread upstream, so the fabric still needs congestion control. D, congestion only appears on links that carry IP over InfiniBand.

[think]

The answer is C: credit stalls spread upstream, so the fabric still needs congestion control.

A port with no credit stops everything queued behind it on that virtual lane, including traffic for other destinations, so a hot spot spreads backwards hop by hop. InfiniBand therefore adds virtual lanes, forward and backward congestion notification, and adaptive routing. Waiting for credit prevents drops, not queueing, and the subnet manager is not involved at packet timescales.

## 6

At a 4,096-byte RDMA packet size, how much does header overhead differ between InfiniBand, RoCE version 2 and iWARP, and what follows?

A, about 10 percent, which explains why InfiniBand is still preferred. B, none at all, because every option uses identical framing. C, under 2 percent, so the choice rests on loss, control plane and operations. D, about 25 percent, because TCP doubles iWARP's per-packet headers.

[think]

The answer is C: under 2 percent, so the choice rests on loss, control plane and operations.

InfiniBand adds 26 bytes per packet, RoCE version 2 over IPv4 82 counting preamble and gap, and iWARP about 110: efficiency from about 97.4 to 99.4 percent. The decision is made on how each handles loss and congestion, how it is controlled and operated, and who supplies it. The framings do differ, so the overhead is not identical, only small.
