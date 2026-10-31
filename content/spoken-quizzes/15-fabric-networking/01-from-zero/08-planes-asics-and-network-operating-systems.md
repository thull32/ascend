---
lesson: planes-asics-and-network-operating-systems
source: 1af8f042b051f764
---
## 1

A BGP session between leaf1 and the route reflector rr1 has been Established for 40 days. What does that prove about transit traffic through leaf1?

A, that the ECMP groups towards both spines are complete. B, that the punt path and the CPU handle small packets. C, that transit packets in every traffic class are forwarded. D, that every route BGP selected is in the hardware FIB.

[think]

The answer is B: that the punt path and the CPU handle small packets.

KEEPALIVEs are punted to the CPU through a protected control-plane policing class, so an Established session proves the punt path, the CPU, the kernel's TCP stack and the daemon work for small packets in one class. Transit traffic depends on what was written into the ASIC. A failed FIB write, an incomplete ECMP group or a bad ACL drops it while the session stays up.

## 2

A new ACL rule permits TCP from any source port between 1024 and 65535 to any destination port between 1024 and 65535. On a chip without hardware range checkers, how many TCAM entries does this one rule need?

A, 1, because a TCAM entry can hold any range. B, 2, one entry for each port range. C, 36, the product of six blocks per range. D, 12, six blocks for each of the two ranges.

[think]

The answer is C: 36, the product of six blocks per range.

A TCAM entry is a value and a mask, so it can express only an aligned power-of-two block. The range from 1024 to 65535 splits into six blocks, from 1024 to 2047 up to 32768 to 65535. An entry must fix both fields at once, so every source block pairs with every destination block: six times six. Adding the blocks instead of multiplying them is the tempting mistake.

## 3

A host behind leaf1 floods 2 million ARP requests per second. Control-plane policing is configured with separate queues and policers per class. What is the most likely effect?

A, the ASIC stops forwarding until the CPU recovers. B, transit traffic through leaf1 slows to the policer rate. C, the excess ARP is dropped in hardware, and BGP stays up. D, BGP flaps, because the CPU queue is full of ARP.

[think]

The answer is C: the excess ARP is dropped in hardware, and BGP stays up.

The ARP policer passes its configured rate and drops the rest in the ASIC, and BGP has its own protected queue, so its keepalives still reach the BGP daemon. The flap happens when everything shares one policer, where a keepalive's chance of getting through falls to about half a percent. Transit traffic is forwarded by the ASIC and never passes through control-plane policing at all.

## 4

A monitoring system pings the loopback of every switch once a second and reports 2 percent loss on spine2, yet applications see no loss through it. What is the most likely explanation?

A, the hardware FIB is missing spine2's loopback route. B, ECMP is sending the pings over a congested path. C, there is a gray failure on one of spine2's links. D, spine2's control-plane policing is limiting its ICMP class.

[think]

The answer is D: spine2's control-plane policing is limiting its ICMP class.

Pings to a switch are punted to its CPU and pass a policer, so loss there measures the control-plane path. Transit traffic never touches it, which is why applications see nothing. A gray failure or congestion would hurt transit traffic as well. Loss should be measured with probes that cross devices.

## 5

2,000 tenant prefixes behind leaf3 resolve to its loopback, which uses a next-hop group containing spine1 and spine2. Spine2 fails. Why does leaf1 converge about as fast as it would for a single prefix?

A, only one next-hop group object is rewritten. B, IS-IS recomputes shortest path first for the loopback only. C, BGP withdraws all 2,000 prefixes in one UPDATE. D, the ASIC reprograms 2,000 entries in parallel.

[think]

The answer is A: only one next-hop group object is rewritten.

In a hierarchical FIB the prefixes point at a shared next-hop group, so removing spine2 is one write to the group and every prefix moves at once. That is prefix-independent convergence. With a flat FIB, each route holds its own next hops, and the update time grows with the prefix count, however the protocols signal it.

## 6

An operator moves NTP from the out-of-band network to the data network to save cost. Why is this risky?

A, control-plane policing always drops NTP on data-plane ports. B, NTP over the fabric is less accurate by seconds. C, the fabric's time now depends on the fabric itself. D, NTP packets are too large for fabric MTUs.

[think]

The answer is C: the fabric's time now depends on the fabric itself.

A device that boots with a wrong clock is corrected only after the fabric is up, so protocols that started under the wrong time can misbehave when the clock steps, as in the purge storm where an IS-IS database suddenly looked expired. The management plane should never depend on the data plane it exists to rescue. NTP accuracy over a fabric is fine; the risk is the circular dependency.
