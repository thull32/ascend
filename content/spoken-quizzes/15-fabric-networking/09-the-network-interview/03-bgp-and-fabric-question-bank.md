---
lesson: bgp-and-fabric-question-bank
source: c935ff60d09612ee
---
## 1

Both route reflectors in Amsterdam lose power at once. The spines and fabric links are healthy. What happens to Acme's traffic between leaf1 and leaf3 in Amsterdam?

A, it is rerouted through the spines, which carry the overlay routes as a backup. B, it continues indefinitely on the last routes the leaves learned. C, it stops once the leaves' sessions time out and their overlay routes are deleted. D, it slows down, because the traffic was passing through the reflectors.

[think]

The answer is C: it stops once the leaves' sessions time out and their overlay routes are deleted.

No traffic ever passed through the reflectors, but every overlay route came from them. When the sessions drop, after the 9-second hold time or sooner with BFD, each leaf deletes the routes learned over them, and tenant traffic between leaves stops. Graceful restart bridges a software restart, not a dead pair, and the spines carry no overlay routes.

## 2

gw1 in Amsterdam has its own eBGP path to a prefix via ISP1, with an AS path three ASes long, and an iBGP path via gw2 and ISP2, with an AS path two ASes long. Both have a local preference of 100. Which does it install, and why?

A, its own ISP1 path, because eBGP is preferred over iBGP. B, its own ISP1 path, because it has no IGP cost to reach. C, the path via gw2, because its AS path is one AS shorter. D, the path via gw2, because its MED of 0 beats ISP1's MED.

[think]

The answer is C: the path via gw2, because its AS path is one AS shorter.

AS path length, step five, comes before eBGP over iBGP at step eight and IGP cost at step nine, so the shorter path wins there and the later steps never see the eBGP path. MED is compared only between routes from the same neighbouring AS, so ISP1's and ISP2's are never compared by default. To prefer ISP1 anyway, give its routes a higher local preference, which step three compares first.

## 3

A RoCE fabric shows many PFC pause frames and almost no ECN marks. Why is that a problem, even if no packets are dropped?

A, pauses halt a priority link by link, and spread to other flows. B, pauses make the NIC switch from go-back-N to selective repeat. C, PFC disables ECN marking on every port it pauses. D, pause frames corrupt the RDMA payload they hold up.

[think]

The answer is A: pauses halt a priority link by link, and spread to other flows.

PFC is flow control: it stops one priority on the upstream link, not the source. Pauses propagate hop by hop and block every flow sharing that priority, including flows not headed to the congested port, and they can deadlock or storm. ECN with DCQCN should slow the senders early enough that PFC rarely fires, so few marks alongside many pauses usually means the ECN thresholds or the notification path are wrong.

## 4

A carrier circuit between spine1 in Amsterdam and spine1 in Singapore breaks inside the carrier's network, and both spine ports stay up. With IS-IS at the default 10-second hellos and no BFD, roughly how long until traffic moves to the other circuit?

A, about one second, because IS-IS floods the change immediately. B, about 30 seconds, when the IS-IS hold time runs out. C, about 180 seconds, when the BGP hold timer expires. D, a few milliseconds, because the ports detect the loss of light.

[think]

The answer is B: about 30 seconds, when the IS-IS hold time runs out.

The carrier's equipment keeps the ports lit, so there is no loss of light to detect, and nothing tells IS-IS until its 30-second hold time of three hellos runs out, 20 to 30 seconds after the cut. Flooding, SPF and the FIB write then add about 118 milliseconds. With BFD at 300 milliseconds times three, the whole sequence takes about a second. The BGP hold timer is irrelevant: the underlay reroutes, and the overlay's next hops stay reachable.

## 5

Why does the ingress VTEP set the outer UDP source port of a VXLAN packet from a hash of the inner headers?

A, so the outer packet passes stateful firewalls. B, so spines hashing the outer header spread tenant flows. C, so the egress VTEP can find the tenant's VRF. D, so the receiving VTEP can reorder the packets of a flow.

[think]

The answer is B: so spines hashing the outer header spread tenant flows.

Spines read only the outer header. Between two leaves the outer IPs, protocol and destination port 4789 are constant, so without a varying source port every tenant flow between that pair would hash onto the same uplink. Deriving the port from the inner flow restores entropy while keeping each flow on one path. The VNI, not the port, identifies the tenant segment.

## 6

Someone argues: MPLS must be faster than VXLAN, because a label lookup is cheaper than an IP lookup. What is the best response?

A, disagree: VXLAN skips lookups at the spines entirely. B, agree, but only for packets smaller than 1,500 bytes. C, agree, which is why data centers moved to MPLS. D, disagree: switching chips do longest-prefix match at line rate now.

[think]

The answer is D: disagree: switching chips do longest-prefix match at line rate now.

The lookup-speed argument held for 1990s routers. Modern ASICs do longest-prefix match at line rate, so MPLS's real advantages are traffic engineering, fast reroute and low overhead on expensive circuits, and VXLAN's are that any IP fabric carries it and its source port gives ECMP entropy. Spines in a VXLAN fabric still do an IP lookup, on the outer destination.
