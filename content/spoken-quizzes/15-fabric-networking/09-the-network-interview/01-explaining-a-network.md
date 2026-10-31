---
lesson: explaining-a-network
source: 1acb0186be61c727
---
## 1

A principal network engineer asks why Meridian's spines need no BGP, even though tenant routes are carried in BGP EVPN. Which answer is correct?

A, IS-IS carries the tenant prefixes to the spines from each leaf. B, the route reflectors forward tenant packets on behalf of the spines. C, tenant packets reach the spines inside VXLAN, addressed to leaf loopbacks. D, the spine ASICs lack the table space to hold tenant routes.

[think]

The answer is C: tenant packets reach the spines inside VXLAN, addressed to leaf loopbacks.

The ingress leaf looks the destination up in EVPN and wraps the packet in VXLAN, with an outer header addressed to the egress leaf's loopback, which IS-IS carries. So a spine only ever looks up a loopback. IS-IS never carries tenant prefixes, route reflectors relay routes rather than packets, and table size is not the reason: encapsulation is.

## 2

Your first draft of the two-minute answer takes 54 seconds and names Arista, SONiC, 400 gig optics, EVPN, VXLAN and route reflectors. What is its main problem?

A, it is too short, so it should be padded to two minutes. B, it names protocols but explains no mechanism, and has gaps. C, it should open with the overlay, since EVPN is the core. D, it names too few protocols to show breadth across the stack.

[think]

The answer is B: it names protocols but explains no mechanism, and has gaps.

Length was never the issue. The draft lists products and protocols but gives no numbers, no inter-site design, no underlay job and no first-person ownership, so a panel has nothing to probe. Padding it or adding more names makes the product tour worse, and opening with the overlay breaks the order, because the overlay only makes sense once the listener knows what underlay it rides on.

## 3

Amsterdam and Singapore are joined by a square of two 100 gigabit per second circuits, carrying 80 gigabits per second between them. One circuit is cut. What is the steady state once the fabric converges?

A, both sites lose reachability until BGP reconverges between them. B, traffic shifts to the San Jose square until the circuit is repaired. C, the survivor carries all 80 gigabits at 80 percent, with no loss. D, the survivor carries 40 gigabits and the other 40 are dropped.

[think]

The answer is C: the survivor carries all 80 gigabits at 80 percent, with no loss.

Each circuit ran at 40 percent, so the survivor can carry both shares, which is why the planning rule keeps each circuit below half. Nothing is dropped once IS-IS converges, because the path through the second spine and its circuit is still valid. Meridian has no Amsterdam to San Jose circuit to shift to, and it is IS-IS, not BGP, that restores the path, in well under a second.

## 4

Asked what LSP refresh interval your devices run, you do not know the configured value. Which response is strongest?

A, give 900 seconds as the value your devices use, to sound sure. B, say you would defer to the network team on it, and stop there. C, move on to how your team runs its Kubernetes clusters instead. D, give the mechanism and the defaults, defer the value, and name an alert.

[think]

The answer is D: give the mechanism and the defaults, defer the value, and name an alert.

The three-part move shows how close to the edge you got, names exactly what you don't know, and ends on what you would build, such as an alert on the LSP count collapsing alongside clock steps. Stating a default as your configuration is a bluff the next question can expose. A bare defer leaves nothing to score, and pivoting to an unrelated strength dodges the question.

## 5

Which question should a software engineer interviewing for a network automation role answer directly, rather than defer?

A, how to make outbound traffic prefer ISP1 over ISP2. B, the command that shows the IS-IS database on Junos. C, which BFD intervals your switch ASIC supports in hardware. D, the exact PFC headroom in bytes for a 100 metre cable at 400 gig.

[think]

The answer is A: how to make outbound traffic prefer ISP1 over ISP2.

Outbound preference is a fundamental the role's tools read and set: raise local preference on routes learned from ISP1. Hardware BFD limits vary by platform and version, so deferring and measuring is honest. For PFC headroom the method matters more than the exact bytes, and vendor commands are outside a role that does not configure devices.

## 6

You extend the answer into the one-story pattern. Why does it end with a failure, such as the BGP black hole?

A, panels score candidates by how many incidents they can name. B, it shows the network was badly designed before you joined the team. C, failures are shorter to tell than a packet walk across the fabric. D, it shows you can predict how the design breaks, and what signals it.

[think]

The answer is D: it shows you can predict how the design breaks, and what signals it.

Predicting how the mechanism breaks is a deeper test than describing it, and the failure moves the conversation to signals and tooling, a software engineer's ground, with a follow-up you have prepared. Panels do not count incidents, and length is not the reason. Nor is it criticism of an earlier design: the black hole is the design that encapsulation avoids.
