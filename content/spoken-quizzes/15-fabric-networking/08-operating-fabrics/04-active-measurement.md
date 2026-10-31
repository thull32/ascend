---
lesson: active-measurement
source: 4101ef8ed230103f
---
## 1

A ping between agents behind leaf1 and leaf3 in Amsterdam gets 100 replies out of 100, while about a quarter of Acme's connections between those racks retransmit heavily. The fabric has four spines. What is the most likely explanation?

A, ICMP is prioritised over TCP, so ping hides the congestion that TCP feels. B, ping uses a smaller MTU, so it passes a link that drops only large frames. C, the ping hashes onto one spine, and a link on another path drops packets. D, the retransmissions are caused by the hosts, since the network showed zero loss.

[think]

The answer is C: the ping hashes onto one spine, and a link on another path drops packets.

ICMP has no ports, so every echo between the two addresses hashes to the same spine and tests one path in four. A gray link on another spine damages the quarter of connections hashed onto it. Prioritisation or an MTU problem could also make ping disagree with TCP, but neither explains a clean quarter split, and 100 clean pings only bound the loss below about 3 percent on one path, so they cannot clear the network.

## 2

A TWAMP sender's clock is 1.5 milliseconds behind the reflector's. What does that do to the measurements?

A, the round trip is correct, but the one-way delays are off by 1.5 milliseconds. B, both the round trip and the one-way delays are off by 1.5 milliseconds. C, the round trip is off by 3 milliseconds, twice the offset, and the one-way delays are correct. D, nothing, because the reflector subtracts the offset before replying.

[think]

The answer is A: the round trip is correct, but the one-way delays are off by 1.5 milliseconds.

The round trip is the sender's receive time minus its send time, less the reflector's dwell, and each of those differences is taken on one clock, so any offset cancels. One-way delay, the reflector's receive time minus the sender's send time, mixes the two clocks and absorbs the whole offset. The reflector reports raw timestamps and an error estimate; it cannot know the sender's offset.

## 3

Probes from leaf1 to leaf3 through spine3 lose 4 percent. Probes from leaf2 to leaf3 through spine3 also lose 4 percent. Probes from leaf1 to leaf2 through spine3 lose nothing. Which element is the prime suspect?

A, spine3 itself, since every bad path crosses it. B, leaf3's uplinks towards all four spines. C, the link from leaf1 up to spine3. D, the link from spine3 down to leaf3.

[think]

The answer is D: the link from spine3 down to leaf3.

The elements common to the two bad paths are spine3 and its downlink to leaf3. The good leaf1 to leaf2 path crosses spine3 and leaf1's uplink to it, which clears both. Only the spine3 to leaf3 link is on every bad path and on no good one. A fault in leaf3's uplinks generally would show on every spine, not on one alone.

## 4

A probe system runs 16 streams with random source ports between each pair of leaves over four spines. Why is that not enough on its own?

A, random source ports are rejected by TWAMP reflectors on UDP port 862. B, sixteen streams always land four on each spine, leaving no margin. C, the hash ignores source ports, so all 16 take the same spine. D, each spine has about a 1 percent chance of receiving no stream at all.

[think]

The answer is D: each spine has about a 1 percent chance of receiving no stream at all.

Hash outputs behave randomly, so the chance that a given spine gets none of 16 streams is three quarters to the power of 16, about 1 percent, and across hundreds of pairs some paths will go unprobed. Real systems map each port to its path with TTL-limited probes and fill the gaps deliberately. The hash does read source ports, which is the whole technique, and the reflector accepts any source port.

## 5

TWAMP shows all of a stream's loss in the reverse direction. Why does that change how you localise?

A, reverse loss is always caused by clock offset and can be ignored. B, reverse loss means the reflector host is dropping, so the fabric is cleared. C, reverse loss means the sender's uplink is faulty, whatever the spine. D, the reply is hashed separately, so group the streams by their return paths.

[think]

The answer is D: the reply is hashed separately, so group the streams by their return paths.

The reply's five-tuple is reversed and hashed by the far leaf with its own function and seed, so it can cross a different spine from the request. Grouping reverse loss by forward spine produces a pattern no element explains; grouping by return path, mapped from the reflector side, names the bad link. Clock offset affects delay, not loss, and direction alone neither clears the fabric nor names the sender's uplink.

## 6

A RoCE training job slows down on a subset of servers. Switch counters show priority flow control pauses but zero drops. Which measurement is most likely to explain it?

A, polling switch interface utilisation more often to catch the bursts. B, pinging each GPU server's management address once a second. C, running classic traceroute between the servers' front-end addresses. D, host NIC counters such as sequence errors, congestion notifications and NIC-sent pauses.

[think]

The answer is D: host NIC counters such as sequence errors, congestion notifications and NIC-sent pauses.

In RoCE the host and the fabric are coupled: a receiving NIC that cannot drain its buffers sends pauses into the switch, so the switch drops nothing while the job waits. NIC counters, such as pauses the NIC sent, out-of-sequence packets, and congestion notifications sent and handled, show the half of the story switch counters miss. Pinging the management network or tracerouting the front-end network tests different networks, and faster utilisation polling still shows no drops.
