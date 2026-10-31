---
lesson: clos-and-leaf-spine
source: b6f9770257b7e16f
---
## 1

Meridian's Amsterdam leaves each have 48 server ports at 100 gigabits per second, and one 400 gigabit uplink to each of 4 spines. If every server on leaf1 sends to servers on other leaves at once, roughly how much can each one get?

A, about 8 gigabits, since 400 gigabits is split 48 ways. B, about 33 gigabits, since 1,600 gigabits is shared by 48. C, about 100 gigabits, since the fabric is a non-blocking Clos. D, about 25 gigabits, since one spine carries a quarter.

[think]

The answer is B: about 33 gigabits, since 1,600 gigabits is shared by 48.

The leaf has 4 times 400, or 1,600 gigabits of uplink, against 4,800 gigabits of server ports: three to one. So each server gets about a third of its port off the leaf. Splitting one spine's 400 gigabits ignores the other three uplinks, full line rate would need one to one, and traffic between servers on the same leaf never touches the uplinks at all.

## 2

A leaf-spine fabric uses spines with 32 ports, one link per leaf per spine. The operator adds four more spines to the existing four. What happens to the maximum number of leaves?

A, it stays at 32, since it depends on each spine's ports. B, it halves to 16, since each leaf needs more uplinks. C, it doubles to 64, since there are twice the spines. D, it rises to 36, since each new spine adds one port.

[think]

The answer is A: it stays at 32, since it depends on each spine's ports.

Each leaf uses one port on every spine, so the number of leaves is bounded by a single spine's port count, however many spines there are. More spines widen every leaf's ECMP group and add capacity, as long as each leaf has an uplink port for every spine. Growing past 32 leaves needs higher-radix spines or a super-spine tier.

## 3

A leaf's uplinks run at 62.5 percent utilisation in the busiest hour, with four spines. One spine fails. What is the utilisation of the remaining uplinks?

A, about 83 percent, since the same load meets three quarters of the capacity. B, about 78 percent, since a quarter of 62.5 percent is added to each link. C, about 62.5 percent, since ECMP drops the failed spine's share. D, about 125 percent, since the survivors take twice the load.

[think]

The answer is A: about 83 percent, since the same load meets three quarters of the capacity.

The offered load does not shrink when a spine fails. It is rehashed over three uplinks instead of four, so utilisation is multiplied by four thirds, to about 83 percent. Adding a quarter of the old utilisation misses that what changed is the capacity. ECMP drops no traffic, it moves it. And 125 percent is the two-spine case, where losing one spine halves the capacity.

## 4

In Clos's three-stage network, each ingress switch has n inputs. Why does strict-sense non-blocking need two n minus one middle switches, rather than n?

A, half the middle switches are reserved as spares for failures. B, each call uses two middle switches, one in each direction. C, the crosspoint count is smallest at exactly two n minus one switches. D, the ingress and egress sides can each block n minus one different ones.

[think]

The answer is D: the ingress and egress sides can each block n minus one different ones.

In the worst case, the other n minus one inputs on the caller's ingress switch use n minus one middle switches, and the other n minus one outputs on the callee's egress switch use n minus one different ones, so the new call needs one more. With only n, calls can still always be placed if existing calls may be moved: rearrangeably non-blocking. A call uses one middle switch, and the number is set by blocking, not by minimising cost.

## 5

A fabric is built one to one, non-blocking. Yet one leaf uplink shows output discards while its sibling uplinks are half idle. What is the most likely explanation?

A, ECMP hashed several large flows onto that uplink, ignoring load. B, spanning tree has blocked the sibling uplinks to prevent a loop. C, the spines are oversubscribed, so the one to one ratio is only nominal. D, the leaf's forwarding table lost the other next hops after a routing change.

[think]

The answer is A: ECMP hashed several large flows onto that uplink, ignoring load.

Non-blocking means enough capacity in total. ECMP picks an uplink per flow by hashing headers and never checks how busy it is, so a few large flows can collide on one link while others idle. Spines in a two-tier fabric have no uplinks to oversubscribe, a routed fabric runs no spanning tree on its links, and a lost next hop would leave the siblings carrying nothing at all, not half idle.

## 6

Meridian builds pods of 16 leaves and 4 spines. Each spine has 32 ports: 16 to its leaves and 16 to super-spines in its plane. Each super-spine has 32 ports. How many leaves can this five-stage fabric hold, and how many switches does traffic between pods cross?

A, 1,024 leaves, and 4 switches between pods. B, 512 leaves, and 5 switches between pods. C, 256 leaves, and 5 switches between pods. D, 512 leaves, and 3 switches between pods.

[think]

The answer is B: 512 leaves, and 5 switches between pods.

Each super-spine has one port per pod, so there are 32 pods of 16 leaves, which is 512. Traffic between pods goes leaf, spine, super-spine, spine, leaf: five switches, hence a 5-stage Clos. Within a pod it is still three. 1,024 leaves would need 64-port super-spines, and 256 would follow from giving each super-spine only 16 pod-facing ports.
