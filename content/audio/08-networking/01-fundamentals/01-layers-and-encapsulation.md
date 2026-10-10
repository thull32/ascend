---
lesson: layers-and-encapsulation
source: f292a88a90cb85e7
fit: partial
desk:
  - "The HTTPS request taken apart byte by byte, and the script that builds that frame"
  - "The MTU, MSS and per-packet overhead tables"
  - "The fragmentation trace and the PMTUD black-hole diagnosis commands"
  - "Exercise: parse an IPv4 and TCP header"
  - "Exercise: fragment an IPv4 packet, or refuse to"
---
## Introduction

A team moves a service behind a site-to-site VPN. Health checks pass. Small API calls work. And every response larger than about 1.4 kilobytes hangs until a 30 second timeout. Nobody changed any code.

Here is what happened. The tunnel's MTU is 1,420 bytes. A firewall on the path drops the one ICMP message that would have told the server to send smaller packets, so the server keeps retransmitting 1,500 byte packets into a hole. The difference between saying "the network is flaky" and saying "path MTU discovery is black-holed on the tunnel, clamp the MSS to 1,380" is understanding how headers nest.

And they nest on every write. You write 4,000 bytes to a TCP socket. What arrives at the other side is not one thing but three segments, of 1,448, 1,448 and 1,104 bytes, each wrapped in 66 bytes of headers you never wrote, each of which may take a different path and arrive in a different order.

Three ideas, then. How layers and encapsulation let a frame find the right process. The arithmetic behind 1,500, 1,460 and 1,448. And the places where the clean layer model leaks in production, starting with that VPN.

## Layers and encapsulation

The internet is a chain of independently owned networks that must work together without coordinating. Layering gives each piece a narrow contract. Ethernet moves frames between two devices on one link. IP moves packets between any two hosts across many links. TCP turns unreliable packets into a reliable byte stream. TLS makes that stream private. HTTP gives the bytes meaning.

Each layer talks only to the layer directly above and below. A router forwards IP packets and does not parse TCP. A switch forwards Ethernet frames and does not parse IP. Your application writes to a socket and never sees a packet. That contract is what lets any layer be replaced without touching the others: Wi-Fi replaced Ethernet on your laptop, IPv6 is replacing IPv4, and QUIC is replacing TCP for a growing share of web traffic.

You will hear two models. The OSI model has seven layers and is a vocabulary. The TCP/IP model has four, five if you split the link layer, and it is what actually runs. OSI is least honest at layers five and six. So when an interviewer asks which layer TLS is, the senior answer is: it runs on top of TCP and under HTTP, the OSI number is fuzzy, and what matters is that routers cannot see inside it and the load balancer that terminates it can.

Encapsulation is the mechanism. Each layer prepends its own header to whatever the layer above handed it, and treats that as an opaque payload. On the way down the sender's stack the packet grows. On the way up the receiver's stack, each layer strips its header, reads one field to decide who gets the rest, and hands it up.

Those fields are the whole routing mechanism inside a host. The Ethernet header's EtherType says IPv4 follows. The IP header's protocol number says TCP, which is 6, or UDP, which is 17. The TCP destination port says which process: 443 for HTTPS, 5432 for Postgres. And the TLS record's content type says handshake or application data. A frame arriving on a network card ends up in the right socket in the right process by reading five fields, in that order.

## One request on the wire

The lesson builds one real frame: the first data packet of a curl request for example.com over HTTP 1.1, after the handshakes. The HTTP request itself is 74 bytes of text.

TLS encrypts it into one record of 91 bytes: the 74 bytes of plaintext, one byte for the inner content type, and a 16 byte authentication tag. TCP puts the record in one segment with a 32 byte header, which is 20 bytes plus 12 of timestamp options. IP adds 20 bytes. Ethernet frames it for the first hop. The whole frame is 162 bytes, and with the checksum trailer, preamble and gap between frames it occupies 186 bytes of wire time.

Here is the number to remember: 186 bytes on the wire to carry 74 bytes of HTTP. That is 40 percent efficiency before a single response byte flows. Small messages are expensive.

Two details in that frame carry real lessons. The TCP checksum covers a pseudo-header that includes both IP addresses, even though they live in the IP header. That is why a NAT that rewrites an IP address must also patch the TCP checksum. And the TLS record header is five plaintext bytes that every middlebox can read, which is how a firewall tells handshake records from data records without decrypting anything.

On the receiving side, there is a latency trap. TLS can only decrypt a whole record. A full 16 kilobyte record spans about 12 TCP segments. If the first segment is lost, the receiver holds the other eleven and cannot give the application any of it until the retransmission arrives, one round trip later at best. So servers that care about time to first byte start connections with records sized to fit one segment, and grow them once the connection has warmed up. Go's TLS library does this by default, and Cloudflare patched it into their proxies.

## MTU and MSS

Two terms. The MTU, the maximum transmission unit, is the largest IP packet a link carries in one frame: 1,500 bytes on Ethernet. The MSS, the maximum segment size, is the largest TCP payload each side is willing to receive. Each side announces it in its SYN, derived from its MTU.

The arithmetic is subtraction. 1,500, minus 20 bytes of IPv4 header, minus 20 bytes of TCP header, is 1,460. That is what Linux announces. But Linux also turns on TCP timestamps by default, which take 12 bytes in every segment, so the real payload per segment is 1,448. Through a WireGuard tunnel with an MTU of 1,420, the MSS is 1,380.

The peer can announce less. Measured from the lesson's laptop to example.com, the laptop announced 1,460, but Cloudflare's reply announced 1,400, so the laptop may put only 1,388 bytes in each segment towards it. The smaller of the two announcements applies in each direction. Providers do this on purpose: it costs about 4 percent more packets per byte and leaves headroom for their own internal encapsulation, removing a whole class of MTU failures.

Now the consequence for capacity. A full 1,448 byte segment travels at 94 percent efficiency. A 100 byte payload travels at about 53 percent. At 10 gigabits a second, full segments mean about 810 thousand packets a second. 100 byte messages sent one per packet mean about 6.6 million. And packets per second, not bytes, is usually what saturates a CPU core, a NAT gateway or a virtual network card first. Batch small messages to fill segments.

## Fragmentation and path MTU discovery

What happens when a 1,500 byte packet reaches a link whose MTU is 1,400? One bit in the IP header decides: Don't Fragment.

If the bit is clear, the router fragments. Fragment payloads must be multiples of 8 bytes, so the first fragment carries 1,376 bytes and the second carries the remaining 104. Only the destination reassembles them. It works, and it is awful. Lose either fragment and the whole packet is lost. A firewall or load balancer that routes on ports cannot classify the second fragment, because it has no TCP header. And the reassembly buffer is a memory exhaustion target.

If the bit is set, the router drops the packet and sends back an ICMP "fragmentation needed" message, type 3 code 4, carrying the next hop's MTU. The sender's kernel caches that path MTU, lowers the connection's MSS, and resends smaller segments. That is path MTU discovery, and Linux sets Don't Fragment on every TCP segment, so it is the normal case. IPv6 removed router fragmentation entirely; only the sender fragments, and the "packet too big" message is mandatory.

So back to the VPN. Before I explain it: why does the handshake succeed, small responses work, and only large ones hang?

[pause]

Because the problem depends on size. Handshake packets and small responses fit under 1,420 and pass. Full size segments, with Don't Fragment set, are dropped at the tunnel. The ICMP message that would shrink the server's MSS is filtered by a firewall, so the server keeps retransmitting segments that never arrive. Even ping works.

The fixes: clamp the MSS on the tunnel gateway, set the tunnel interface's MTU, allow ICMP type 3 code 4 through, and turn on Linux's TCP MTU probing, which detects black holes without trusting ICMP. Its measured default on the lesson's machine was 0, off. Setting it to 1 enables probing only after a black hole is detected, which is what you want on hosts that talk through tunnels. And the classic way to cause this outage is blocking all ICMP "for security".

UDP suffers too. Large UDP responses get fragmented, firewalls drop the fragments, and the responses time out, which is why the 2020 DNS Flag Day settled on 1,232 bytes for DNS over UDP, and why QUIC pads its first datagrams to 1,200 bytes and forbids IP fragmentation.

## Under the hood, and where the layers leak

The layer diagram suggests one header added per function call. Linux does something cheaper. TCP builds segments of up to 64 kilobytes, not 1,448 bytes, and hands that super-packet down the stack. The network card cuts it into MSS-sized segments, copies the headers onto each, and computes every checksum. That is segmentation offload. On receive, the card or driver merges consecutive segments of one flow back together, so TCP processes one 64 kilobyte unit instead of 45 packets.

Two consequences surprise people. A capture on the sending host shows TCP segments of 30 or 60 kilobytes, with checksums flagged as incorrect, because the capture point sits above the card that will segment and checksum them. That is normal, not corruption. And turning offloads off to "fix" those checksums multiplies per-packet CPU work by tens.

The model also says each layer ignores the others. Production disagrees in four places. NAT rewrites layers three and four inside a router, addresses and ports, and must patch the TCP checksum. Middleboxes read what they should not, TCP options, TLS server names, HTTP headers, and drop what they do not recognise. That ossification is why TCP extensions take a decade to deploy, and why QUIC encrypts almost everything a middlebox could key on.

Third, a layer seven load balancer means two connections. It terminates TLS, reads the HTTP, and opens a separate TCP and TLS session to the backend. And fourth, layer two is not one hop in a cloud. The same subnet in a VPC is an overlay. AWS allows 9,001 byte jumbo frames inside a VPC, but 1,500 through an internet gateway or VPN. A host that forces 9,001 on traffic leaving through a tunnel is the black hole from the opening.

## In the interview

A classic: why does TCP use 1,460 and not 1,500?

[pause]

1,500 is the Ethernet MTU for the IP packet. 20 bytes of IPv4 header and 20 of TCP leave 1,460, and Linux's timestamps option leaves 1,448 per segment. The peer's MSS can be lower, Cloudflare announces 1,400, and the smaller of the two applies in each direction. The common wrong answer is "the Ethernet header takes 40 bytes", which confuses the frame header, which is not counted in the MTU, with the IP and TCP headers.

And the follow-up: small requests work and large responses hang over a VPN, walk me through it. That pattern is size-dependent loss. Find the path MTU with pings that have Don't Fragment set, look for the missing ICMP in a capture, and fix it with MSS clamping on the gateway or by allowing the ICMP through. Not "increase the timeouts", and not "the server is slow on large responses".

## Recap

Four things to remember. Each layer wraps the one above in its own header, and one field per header, EtherType, protocol, port, decides who gets the rest. 1,500 minus 20 minus 20 is 1,460, minus 12 for timestamps is 1,448, and the smaller announced MSS wins in each direction. "Small requests work, large responses hang" is a path MTU black hole: clamp the MSS, fix the tunnel MTU, and never block ICMP fragmentation-needed. And count packets per second, not just bytes, because headers make small messages expensive.

At your desk: the byte-by-byte packet breakdown, the MTU and overhead tables, the fragmentation trace, and the two exercises, parsing a header and fragmenting a packet.
