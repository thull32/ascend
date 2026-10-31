---
lesson: incidents-and-what-they-teach
source: 5dbf556c7db1ea44
---
## 1

During an upgrade that reboots one leaf at a time, every reboot is followed a minute later by a site-wide loss of tenant traffic, while no link and no IS-IS adjacency goes down. Which pair of signals best identifies the cause?

A, CRC errors on the rebooted leaf's uplinks, followed by ECMP rehashing. B, a clock step on the rebooted leaf, then LSP counts collapsing on every router. C, a CPU spike on both spines, followed by a drop in interface utilisation. D, a BGP hold-timer expiry on the rebooted leaf, followed by session resets.

[think]

The answer is B: a clock step on the rebooted leaf, then LSP counts collapsing on every router.

A purge storm empties every router's link-state database with no link or adjacency down. The device that purged is the one whose clock just stepped, and the collapse appears on every router in the flooding domain at once. CRC errors and CPU spikes are local and would not remove the whole topology. BGP session resets are a consequence in large domains, not the cause, and they would not name the leaf that started it.

## 2

A border gateway is taken out of the IGP before its BGP is withdrawn. Its eBGP session stays Established, and the ISP link shows normal inbound utilisation. Why does utilisation look normal?

A, the ISP has already failed over, so the traffic seen is only control-plane keepalives. B, interface counters freeze while a device is in a maintenance window. C, packets still arrive on the link and are discarded inside the gateway. D, the gateway forwards the inbound traffic to the other gateway over iBGP.

[think]

The answer is C: packets still arrive on the link and are discarded inside the gateway.

Interface utilisation counts arrivals, not delivery. The ISP still prefers the gateway's announcement, so traffic arrives at the normal rate and is dropped on the discard route; only the discard counter and an external probe show it. Counters do not freeze in maintenance, keepalives are a few bytes every few seconds, and iBGP carries routes, not packets.

## 3

A new leaf's Globex VRF was built from a copy of Acme's tenant block, and the import route target 65000 colon 50001 was left in. Which check finds it before any traffic is affected?

A, a pre-push check that every import route target belongs to the VRF's own tenant. B, pinging Globex hosts on the new leaf from the new leaf itself. C, comparing the leaf's BGP session count with a baseline of other leaves. D, watching interface error counters on the new leaf's uplinks.

[think]

The answer is A: a pre-push check that every import route target belongs to the VRF's own tenant.

The fault is in configuration, so a check of rendered configuration against intent catches it before the push. Session counts are normal, because the sessions are fine. Pings from the leaf itself succeed, because local entries outrank the leaked routes there. And interface errors have nothing to do with route targets.

## 4

One of a leaf's four uplinks loses 2 percent of its frames but stays up. The leaf's dashboard reports 0.5 percent loss on its uplinks. Why is that number misleading?

A, it is measured on the sender, which overcounts loss by a factor of four. B, it is sampled, so the true loss on every link is about 2 percent. C, it averages one sick link over four, while a quarter of the flows lose 2 percent. D, it counts only TCP traffic, while the loss affects only UDP flows.

[think]

The answer is C: it averages one sick link over four, while a quarter of the flows lose 2 percent.

ECMP pins each flow to one uplink, so the flows on the sick link lose 2 percent while the rest lose nothing, and averaging over the group divides that by four. Those flows run far slower, because TCP throughput falls roughly with the square root of the loss rate. A sender cannot see receive-side frame check failures at all, so it undercounts rather than overcounts.

## 5

In a RoCE cluster, all training jobs stall. The switches show zero drops and zero errors, and one leaf port facing a server has been paused for 999 milliseconds of every second. What is the most likely root cause?

A, a failed spine optic, with ECMP sending a quarter of the traffic into it. B, a routing loop between two leaves, visible as TTL expiry. C, a NIC whose receive path stalled and keeps sending PAUSE. D, an ECN marking threshold set too low, throttling every sender.

[think]

The answer is C: a NIC whose receive path stalled and keeps sending PAUSE.

A device pausing its neighbour continuously is the root of a PFC storm: the pauses spread upstream and stop every lossless flow behind them, with no drops. A healthy NIC rarely sends PAUSE at all. A low ECN threshold slows senders but does not freeze them. A failed optic would show errors or a link down, and a loop would show TTL expiry, though in a lossless fabric it can turn into a deadlock.

## 6

In the Facebook outage of October 2021, why did a mechanism designed to protect users make the outage complete?

A, it rerouted traffic to a single backup site that was then overloaded. B, every DNS site withdrew at once, because they all shared the failed backbone. C, it throttled DNS queries, so resolvers gave up on Facebook's names. D, it required RPKI validation, which failed and rejected Facebook's own routes.

[think]

The answer is B: every DNS site withdrew at once, because they all shared the failed backbone.

Each DNS edge site withdrew its anycast announcement when it could not reach the data centers, which is right when one site is sick. The backbone failure was a shared cause, so every site withdrew together and the DNS prefixes disappeared from the internet. RPKI was not involved, since the legitimate origin withdrew its own routes, and there was no throttling or single backup site.
