---
problem: remove-nth-from-end
args: [{"$list": [1, 2, 3, 4, 5]}, 2]
frames: 23
source: c60547a52cef7485
---
@0
The list is 1 to 5, and we remove the second node from the end, the 4, in one pass. We do not know the length, and we do not need it. What we need is a pointer that trails another by a fixed gap. If the lead pointer is n plus one nodes ahead, then when it steps off the end, the trailing pointer sits on the node just before the target, which is the node whose link we must rewrite.

@1-3
First a dummy node in front of the head. Both pointers start on it. The dummy means that even removing the head is just rewriting a link, with no special case.

@4-9
The lead moves n plus one steps, three here: to 1, to 2, to 3. The trail is still on the dummy, three nodes behind.

@10-13
Now both move together. Lead goes to 4, trail to 1.

@14-16
Lead goes to 5, trail to 2.

@17-19
Lead steps off the end, and trail lands on 3, the node just before the 4. The gap of three did exactly that.

@20-21
Rewrite 3's link to skip over the 4, straight to the 5. The list now reads 1, 2, 3, 5.

@22
We return the node after the dummy, which is the right head even if the original head had been removed. The two pointers make about L moves in total, so it is linear time and constant space. The classic off-by-one is moving the lead only n steps, which leaves the trail on the target instead of before it, and then there is no way to unlink it. Trace the two-node cases, removing the first and removing the second, before you call it done.
