---
problem: blast-radius
args: [[["leaf1", "spine1"], ["leaf1", "spine2"], ["spine1", "gw1"], ["spine2", "gw1"], ["leaf2", "spine2"]], ["leaf1", "leaf2"], ["gw1"], "spine2"]
max_frames: 400
frames: 370
source: 02eb37203e2e671c
---
@0-23
Two questions about one small fabric. Which leaves does a failure of spine two strand, and which single device strands the most? The trick for both is to add one virtual root joined to every core node, so "reaches some core node" becomes "reaches the root". Then the second question is about cut vertices, and one depth-first search, rooted at that virtual node, answers it. Our fabric: leaf one is cabled to both spines, leaf two only to spine two, both spines link to the one gateway, g w one, and that gateway is the core. We collect the five names, sort them, and number them: gateway zero, leaf one is one, leaf two is two, spine one three, spine two four.

@24-62
The root gets number five. We build the adjacency lists from the five links, both directions each, then join the root to the gateway. Spine two's list is leaf one, the gateway and leaf two: three links, while leaf two has only one. We mark the two leaves, and the failed device, spine two, is number four.

@63-125
The first breadth-first search runs from the root with nothing removed. Root, then the gateway, then both spines, then leaf one, then leaf two. Every device is reached: both leaves were connected to begin with.

@126-170
The second search skips spine two. From the gateway it can only reach spine one, and from there leaf one. Leaf two is never seen.

@171-186
So a leaf is stranded when it was reached before, is not reached after, and is not the failed device itself. Leaf one survives; leaf two is stranded. That answers the first question in linear time.

@187-228
Now the depth-first search, kept on an explicit stack. Each device gets a discovery time and a low value: the earliest discovery time its subtree can reach over one link that is not a tree edge. The root has time zero. The search descends to the gateway at one, spine one at two, and leaf one at three.

@229-261
Leaf one's first neighbour is spine one, already discovered, so its low drops to two. Its next neighbour, spine two, is new and gets time four. Spine two looks back at the gateway, discovered at time one, so spine two's low falls to one. Remember that link: it is the detour.

@262-289
Spine two descends to leaf two at time five. Leaf two's only link goes back to spine two, so its low is four. Leaf two finishes, and the test asks: is leaf two's low, four, at least its parent's discovery time, four? Yes. Nothing under leaf two can get round spine two, so spine two cuts off one leaf.

@290-307
Spine two finishes. Its low, one, is less than leaf one's time, three, so a failure of leaf one strands nothing below it. Then leaf one finishes with low one, less than spine one's time, two. Through spine two, leaf one has a way round spine one. That is dual homing showing up in the numbers.

@308-324
Spine one checks its link to the gateway, then finishes with low one. One is not less than the gateway's time of one, so the gateway cuts off everything below it: both leaves.

@325-354
The gateway's link to the root drops its low to zero. When it finishes, its parent is the root, which is never counted, and the root pops off the stack.

@355-369
The scan runs through the names in sorted order and keeps the first strict maximum: the gateway with two. Spine two's one does not beat it. We return leaf two as stranded, and the gateway as the worst, with two.

Two searches and one depth-first pass, each linear in devices plus links; sorting the names adds a log factor. The classic mistake is running a plain articulation point search without the virtual root, which reports devices that split the graph into halves that each still have a gateway. The other is a recursive search, which crashes on a long daisy chain of leaves.
