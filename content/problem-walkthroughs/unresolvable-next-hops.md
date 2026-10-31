---
problem: unresolvable-next-hops
args: ["leaf1", [["leaf1", "10.255.1.11"], ["leaf2", "10.255.1.12"], ["leaf3", "10.255.1.13"]], [["leaf1", "spine1", "up"], ["leaf3", "spine1", "down"], ["spine1", "leaf2", "up"]], [["10.1.1.0/24", "10.255.1.11"], ["10.1.2.0/24", "10.255.1.13"], ["10.1.2.0/24", "10.255.1.12"], ["10.1.3.0/24", "10.255.1.13"], ["192.0.2.0/24", "198.51.100.2"]]]
frames: 70
source: 25f53b3c0abc24a9
---
@0
We are checking the BGP table on leaf one. A path is usable only if the IGP can reach the router owning its next hop. Every such question starts from the same router, so one traversal answers them all: find the routers leaf one can reach, once, and each path becomes two lookups. The fabric is tiny. Leaf one, leaf two and leaf three each have one link to spine one, and leaf three's link is down. Each leaf owns a loopback, 10 dot 255 dot 1 dot 11, 12 and 13. The spine has none.

@1-4
First, the graph. Only links that are up become edges, and each goes in both directions, because an IGP adjacency is two way. Leaf one to spine one is up, so leaf one lists spine one and spine one lists leaf one.

@5-7
Leaf three to spine one is down. The loop skips it with continue. A down link is not a weaker edge; it is no edge at all.

@8-12
The last link is listed the other way round, spine one to leaf two. It does not matter: both directions go in, and spine one now lists leaf one and leaf two.

@13-14
The traversal is a breadth first search from leaf one. The reached set starts with leaf one itself, because a router always reaches its own loopback, even with every link down. The queue starts with leaf one too.

@15-21
We pop leaf one. Its only neighbour is spine one, not yet reached, so it joins the reached set and the queue.

@22-30
We pop spine one. Its first neighbour is leaf one, already reached, so nothing happens. Its second is leaf two, which is new: reached, and queued. Spine one owns no loopback, so it is never a next hop, but it still carries traffic: without it, leaf two is out of reach.

@31-36
We pop leaf two. Its only neighbour, spine one, is already reached, and the queue is empty. The reached set is leaf one, spine one and leaf two. Leaf three is missing: its one link is down.

@37-41
Next hops are addresses and the reached set holds names, so we build a map from each loopback address to its owner. Then an empty dictionary of flags, one per prefix, in order of first appearance.

@42-46
The first route, 10 dot 1 dot 1 dot 0 slash 24, has next hop 10 dot 255 dot 1 dot 11. It is a new prefix, so its flag starts as false. The owner is leaf one, which is in the reached set, so the flag flips to true.

@47-50
Next, 10 dot 1 dot 2 dot 0 slash 24, with next hop ending in 13. New prefix, flag false. The owner is leaf three, which we cannot reach, so the flag stays false.

@51-54
But the same prefix comes again, a second path, with next hop ending in 12. The prefix is already recorded, so its flag is not reset. The owner is leaf two, reached through the spine, so the flag becomes true. BGP simply uses the live path.

@55-58
10 dot 1 dot 3 dot 0 slash 24 has a single path, to leaf three. Its flag starts false and stays false.

@59-62
The last route, 192 dot 0 dot 2 dot 0 slash 24, has next hop 198 dot 51 dot 100 dot 2, an ISP's link address that no router owns. This is the missing next hop self. The owner lookup uses get, so it returns nothing instead of raising, and nothing is never in the reached set. Flag false.

@63-69
The loop ends, and we return every prefix whose flag is still false, in first seen order: 10 dot 1 dot 3, cut off with leaf three, and 192 dot 0 dot 2, pointing at an address the IGP never carried.

The cost is one pass to build the graph, one breadth first search, and one pass over the table: linear in routers, links and routes together. The classic mistakes are a search per route, repeating the same traversal thousands of times, and reporting per path, which would flag 10 dot 1 dot 2 even though it still forwards.
