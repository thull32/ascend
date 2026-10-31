---
lesson: links-frames-and-ethernet
source: 695fb7f5159d6c00
---
## 1

A full-size frame of 1,518 bytes crosses 100 metres of fibre between two switches connected at 400 gigabits per second. On an idle link, which delay is largest for this one frame?

A, queueing, about 1 microsecond, because every frame waits in a buffer. B, propagation, about 500 nanoseconds, set by the length of the fibre. C, serialisation, about 31 nanoseconds, because the frame is full size. D, serialisation, about 120 nanoseconds, because of preamble and FEC overhead.

[think]

The answer is B: propagation, about 500 nanoseconds, set by the length of the fibre.

Light in fibre covers about 5 nanoseconds per metre, so 100 metres costs about 500 nanoseconds at any link speed. Serialising the frame's 12,304 bits of wire time at 400 gigabits takes 30.76 nanoseconds; the 120 nanosecond figure is the time at 100 gigabits. On an idle link there is no queueing. That is why a faster link barely changes latency inside a site, and not at all across sites.

## 2

Which of these destination MAC addresses is a multicast address?

A, zero two, four two, a c, one one, zero zero, zero two, because its second bit is set. B, zero one, eight zero, c two, zero zero, zero zero, zero e, because its first byte is odd. C, zero zero, zero zero, five e, zero zero, five three, zero a, because it is reserved for documentation. D, zero zero, zero zero, five e, zero zero, zero one, zero one, because its OUI belongs to IANA.

[think]

The answer is B: the address starting zero one, eight zero, c two, because its first byte is odd.

The individual or group bit is the lowest bit of the first byte, and the first bit on the wire. When it is 1, which means an odd first byte, the address names a group; this one is the LLDP group address. The address starting zero two, four two has the universal or local bit set, which makes it locally administered but still unicast. The IANA OUI says who allocated an address, not whether it is multicast.

## 3

A monitoring system polls the 32-bit input octet counter of a 10 gigabit link every 30 seconds. It reports about 1 gigabit per second, but the link is actually carrying 8. What is the most likely cause?

A, the counter wraps every 3.4 seconds, so most wraps between polls are lost. B, the counter reports frames, not bytes, so the result needs scaling. C, the 30-second average flattens microbursts, lowering the mean. D, the counter leaves out the preamble and gap, under-reporting eight times.

[think]

The answer is A: the counter wraps every 3.4 seconds, so most wraps between polls are lost.

A 32-bit byte counter holds about 34.4 gigabits, which a 10 gigabit link moves in 3.4 seconds. Thirty seconds of traffic wraps it about seven times, and the poller sees only the remainder. The fix is the 64-bit counter. Averaging flattens peaks but does not change the mean, and leaving out preamble and gap costs about 1 percent, not a factor of eight.

## 4

A server is set to an MTU of 9,000 and its leaf port to 1,500. What happens?

A, every frame is fragmented by the leaf, so throughput falls slightly. B, the two ends negotiate down to 1,500 when the link comes up. C, large frames are dropped as oversize at the leaf, and small ones pass. D, the link stays operationally down until the MTUs are made equal.

[think]

The answer is C: large frames are dropped as oversize at the leaf, and small ones pass.

Ethernet does not negotiate MTU, and the link comes up normally. The leaf drops frames above its limit and counts them as oversize, or giants, with no message to the sender, so small pings and short requests work while large transfers hang. A switch does not fragment Ethernet frames, and routers fragment only IPv4 packets without the don't-fragment bit.

## 5

A 400 gigabit leaf-spine link reports 390 gigabits per second out and 50 in over the last minute. What should a tool conclude?

A, the link is at 55 percent overall and has plenty of headroom left. B, the link is at 110 percent of its rating, so the counters are wrong. C, the outbound direction is near saturation, and inbound is not. D, both directions share 400 gigabits, so the link is at 440.

[think]

The answer is C: the outbound direction is near saturation, and inbound is not.

Data center links are full duplex: two independent 400 gigabit channels. Outbound at 390 is 97.5 percent utilised and probably dropping during bursts, while inbound has capacity to spare. Adding or averaging the two directions hides exactly this case.

## 6

Why does Ethernet keep a 64-byte minimum frame size on full-duplex links that can never collide?

A, the preamble needs 64 bytes of payload to lock the clock. B, it was set for collision detection, and kept for compatibility. C, switch buffers are allocated in 64-byte cells and need full cells. D, the CRC-32 cannot detect errors in frames under 64 bytes.

[think]

The answer is B: it was set for collision detection, and kept for compatibility.

On shared, half-duplex Ethernet, a sender had to still be transmitting when news of a collision from the far end returned: 512 bit times at 10 megabits. Full duplex removed collisions, but the rule stayed so that every device and frame format remains compatible. CRC-32 works on short frames, and the preamble does not depend on the payload size.
