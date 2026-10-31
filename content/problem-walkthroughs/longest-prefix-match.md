---
problem: longest-prefix-match
args: [[["0.0.0.0/0", "gw1.ams"], ["192.0.0.0/2", "gw2.ams"]], ["203.0.113.9"]]
frames: 93
source: 7d30b33304184a28
---
@0-3
A routing table with two entries: the default route, 0 dot 0 dot 0 dot 0 slash zero, to gateway one, and 192 dot 0 dot 0 dot 0 slash two, to gateway two. We look up one destination, 203 dot 0 dot 113 dot 9. The insight: a prefix is just a string of bits, and the router wants the longest stored prefix of the destination's bit string. That is the question a trie answers. So we build a binary trie, one level per bit, a child for zero and a child for one, and we hang each next hop on the node where its prefix ends. The first line makes the root: two empty child slots and no next hop.

@4-19
The first route. We split off the length, zero, and turn the address into a 32 bit number. The helper shifts each of the four bytes into place, and for 0 dot 0 dot 0 dot 0 the number is simply zero.

@20-22
Now we walk the first L bits of the prefix, and L is zero, so the loop does not run at all. The next hop lands on the root itself: gateway one. The default route lives at the root, at depth zero, because it constrains no bits.

@23-38
The second route, slash two. The helper puts 192 in the top byte, giving about 3.2 billion. What matters is how it starts in binary: 192 is one, one, then six zeros.

@39-47
Bit one is a one. The root has no child on that side, so we create one and step down to it.

@48-55
Bit two is also a one. Again there is no child, so we create it and step down. We are now at depth two.

@56-57
The loop has walked its two bits and stops. Gateway two goes on the depth two node. The other 30 bits of 192 dot 0 dot 0 dot 0 are never looked at. That is what makes host bits irrelevant: a prefix is only its first L bits.

@58-74
The table is built. We take the destination and convert it: 203 dot 0 dot 113 dot 9 becomes a number of about 3.4 billion. Its top byte, 203, is one, one, zero, zero, one, zero, one, one in binary.

@75
Before reading a single bit, best starts as the root's next hop: gateway one. This line is easy to forget. If we only checked nodes after stepping to a child, the default route at the root would never be seen.

@76-79
Bit one is a one, so we step to the depth one node. It exists, but it holds no next hop. It is only part of the path to the slash two, not a route of its own. Sharing some bits with a prefix is not a match.

@80-84
Bit two is a one. We step to the depth two node, and it holds gateway two. That is a longer match than the default, so best becomes gateway two. We have passed two matches, and we keep walking. Returning at the first one would have given gateway one, the shortest match, not the longest.

@85-88
Bit three of 203 is a zero. The depth two node has no child on the zero side, so the walk falls off the trie, and we break. Falling off is the normal way a lookup ends. It does not mean no match: the best we remembered is the answer.

@89-92
We append gateway two and return it. That is right: 203 is between 192 and 255, so it sits inside 192 dot 0 dot 0 dot 0 slash two, and slash two beats slash zero.

Building costs one node per bit of each prefix, so time and space are the number of routes times 32. Each lookup walks at most 32 nodes, however large the table grows, which is what a router needs. The classic mistakes are the ones this trace stepped past: stopping at the first match, which returns the default route; treating a fall off the trie as a miss; forgetting to check the root, which loses the default route; and inserting all 32 bits of the address instead of only the first L.
