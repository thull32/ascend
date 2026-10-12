---
problem: reverse-linked-list
args: [{"$list": [1, 2, 3]}]
frames: 20
source: 14ef385668e3161b
---
@0
We are reversing the list one, two, three, in place. Walking forwards, the only thing that stops you flipping a node's arrow to point backwards is that you would lose the rest of the list. So save the next node first. Then flipping one arrow is a single assignment, and the whole problem becomes: flip one arrow, advance, repeat. Hold one sentence while you watch: everything behind prev is already reversed, everything from cur onwards is untouched.

@1-2
prev starts as nothing, the head of an empty reversed list. cur starts at node one, the first node not yet flipped.

@3-4
First iteration. Save cur's next node, so nxt now holds two, three. Only then is it safe to touch cur's arrow.

@5-6
The flip: node one now points back at prev, which is nothing. Look at head: it shows just one, because the list has been cut. That is fine, since nxt still holds two, three. Then prev moves onto node one, the reversed list so far.

@7-11
cur moves onto two, and the loop goes again. Save its next, which is three. Flip two's arrow back at prev: now cur reads two, one. Then prev moves onto two, so the reversed part is two, one.

@12-16
cur is now three, the last node. Its next is nothing, and we save that. Flip three's arrow back at two: cur reads three, two, one. prev moves onto it.

@17-19
cur steps onto nothing, so the loop ends. Notice what cur and prev hold. cur is empty, and prev is the old tail, which is the new head. We return prev: three, two, one.

Time is one visit per node, and space is three pointers, no matter how long the list is. Two mistakes are common. Overwriting cur's next before saving it orphans the rest of the list, and you get a one node answer. And returning cur instead of prev returns nothing, because cur is always empty when the loop exits. The recursive version is elegant, but it uses one stack frame per node, so in Python a list of a few thousand nodes hits the recursion limit.
