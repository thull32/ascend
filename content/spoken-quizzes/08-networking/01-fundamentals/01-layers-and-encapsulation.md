---
lesson: layers-and-encapsulation
source: 03edbdbcc74c15ab
---
## 1

A WireGuard tunnel has an MTU of 1420 bytes. A client behind it completes the TCP and TLS handshakes with a web server and receives small pages fine, but any response over about 1.4 kilobytes hangs forever. Ping works. What is the most likely cause?

A, the TLS cipher suite produces records that cannot cross the tunnel. B, the tunnel fragments packets and the client fails to reassemble them. C, the server's TCP receive window is too small to carry large bodies. D, the ICMP "fragmentation needed" message is filtered, so path MTU discovery never shrinks the segment size.

[think]

The answer is D: the "fragmentation needed" message is filtered, so path MTU discovery never shrinks the segment size.

Handshake packets and small responses fit under 1420 and pass. Full-size segments marked "don't fragment" are dropped at the tunnel, and the ICMP message that would lower the server's segment size is filtered, so the server keeps retransmitting segments that never arrive. With fragmentation, the transfer would be slower, not dead. The fix is clamping the segment size on the gateway, a lower tunnel MTU, or allowing that ICMP message through.

## 2

A router forwards a TCP segment. Why does it recompute the IPv4 header checksum, but leave the TCP checksum alone?

A, TCP checksums are verified only by the sender, never on the path. B, it decrements the TTL, and treats the TCP segment as opaque payload. C, the TCP checksum is encrypted by TLS, so routers cannot read it. D, routers lack the CPU budget to recompute checksums over payloads.

[think]

The answer is B: it decrements the TTL, and treats the TCP segment as opaque payload.

Decrementing the TTL changes the IP header, so its checksum must be redone. The transport segment is opaque to a layer 3 device, and the receiver verifies it. A NAT is the exception: it rewrites addresses and ports, and because the TCP checksum covers a pseudo-header with both IP addresses, it must patch the TCP checksum too. TLS encrypts the payload, not the TCP header.

## 3

On a Linux client, the ss command shows an advertised MSS of 1448 and an MSS of 1388 for a connection to a CDN. What explains the two numbers?

A, the client's kernel reserves 60 bytes for TLS records on port 443. B, the path MTU shrank to 1428 after an ICMP message from a router on the way. C, the client announced 1460, and the CDN announced 1400 in its SYN-ACK. D, window scaling divides the MSS by the scale factor both sides negotiated.

[think]

The answer is C: the client announced 1460, and the CDN announced 1400 in its SYN-ACK.

Each side announces its own MSS in its opening packet. The client announced 1460, which is 1448 after the 12-byte timestamps option, and the CDN announced 1400, so the client sends at most 1400 minus 12, or 1388 bytes per segment towards it. The kernel knows nothing about TLS record sizes, and window scaling multiplies the window field, not the MSS.

## 4

A service sends 120-byte messages, one per TCP segment, at 200,000 messages per second. Roughly what fraction of the bytes on the wire are headers and framing, and what is the cheapest improvement?

A, it depends only on the bandwidth of the link. B, about 40 percent, so batch several messages into each segment. C, about 90 percent, so move the service over to UDP datagrams. D, about 5 percent, since the headers are too small to be worth it.

[think]

The answer is B: about 40 percent, so batch several messages into each segment.

Each segment costs 66 bytes of Ethernet, IP and TCP headers with timestamps, plus about 24 bytes of checksum and framing: about 90 bytes of overhead for 120 bytes of payload, roughly 43 percent. Batching fills segments towards 1448 bytes and cuts packets per second by an order of magnitude. UDP saves 20 bytes per packet and gives up reliability.

## 5

A 1500-byte IPv4 packet with a 20-byte header, and the "don't fragment" bit clear, reaches a link with an MTU of 1400. What does the second fragment look like?

A, offset 173, 96 payload bytes, the more-fragments flag clear, and a copied TCP header. B, offset 1380, 100 payload bytes, more-fragments set, and a TCP header. C, offset 172, 104 payload bytes, more-fragments clear, and no TCP header. D, offset 0, all 1480 payload bytes, more-fragments clear, once the first piece is dropped.

[think]

The answer is C: offset 172, 104 payload bytes, more-fragments clear, and no TCP header.

Fragment payloads must be multiples of 8 bytes, so the first fragment carries 1376 of the 1480 payload bytes, which is 1380 rounded down, with more-fragments set. The second carries the remaining 104 at offset 1376 divided by 8, which is 172, with the flag clear. Only the first fragment contains the TCP header, which is why port-based firewalls struggle with fragments, and why losing either piece loses the whole packet.

## 6

A capture taken on a busy Linux sender shows outgoing TCP segments of 64,000 bytes, with their checksums marked incorrect. What is happening?

A, segmentation offload hands large units to the network card, which segments and checksums them. B, the path MTU is 64 kilobytes, because the host uses jumbo frames end to end. C, IP fragmentation is splitting the segments after the capture point. D, the network card is corrupting packets and should be replaced before data is lost.

[think]

The answer is A: segmentation offload hands large units to the network card, which segments and checksums them.

The capture point sits above the card. With segmentation offload, the kernel builds large TCP units, and the card cuts them into segments of MSS size and fills in the checksums, so the capture shows neither the real segment sizes nor the final checksums. Jumbo frames top out near 9000 bytes, and disabling offloads to make the capture look right costs a large amount of CPU.
