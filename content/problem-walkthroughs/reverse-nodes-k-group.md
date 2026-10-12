---
problem: reverse-nodes-k-group
args: [{"$list": [1, 2, 3, 4, 5]}, 2]
frames: 62
source: 5d41348c8bbf76f1
---
@0
We are reversing one, two, three, four, five in groups of two, so the answer should be two, one, four, three, five, with the lone five left alone. Reversing a group is the ordinary list reversal, bounded to k steps. What makes this problem hard is the bookkeeping: count k ahead before touching anything, reverse exactly k, then reconnect. We start with a dummy node, zero, in front of the head, so the first group needs no special case.

@1-2
group prev is the anchor. It always sits just before the next group, and right now that is the dummy.

@3-10
Step one: is there a full group ahead? kth starts at the anchor and walks k steps: to node one, then to node two. Neither step falls off the list, so the group is full. Checking first is the point: we never start reversing a group we would have to repair.

@11-13
We note what comes after the group: group next is three, four, five. Now the small trick. The reversal's prev starts at group next, three, not at nothing. cur starts at the group's first node, one.

@14-17
Save one's next, which is two. Flip one's arrow onto prev. Watch head: it now reads one, three, four, five. Node one already points past the group, at three, because of how prev started. Then prev moves onto one.

@18-23
cur moves onto two. Save its next, three, flip two's arrow back at one, and move prev onto it. prev now reads two, one, three, four, five. After exactly two steps the loop stops, with cur on three.

@24-26
Reconnect. Before we change anything, first records the anchor's next node, which is still one: the old first node and now the group's tail. The anchor, the dummy, is pointed at kth, node two. The dummy now reads zero, two, one, three, four, five. Then the anchor moves to node one, the tail of the group we just finished, not to kth. Moving it to kth is a classic bug.

@27-36
Second round. Count two ahead from node one: three, then four. A full group. Group next is five.

@37-48
The reversal again, with prev starting at five. Three is flipped onto five, then four is flipped onto three. prev reads four, three, five.

@49-51
Reconnect. first is three. The anchor, node one, now points at four, so the dummy reads zero, two, one, four, three, five. The anchor moves to three.

@52-59
Third round. Count ahead from three: one step reaches five, and the second step falls off the list. Only one node is left, a partial group.

@60-61
So we return straight away, leaving five in place. The answer is the node after the dummy: two, one, four, three, five.

Each node is visited twice, once by the count ahead and once by the reversal, so time is linear, and the extra space is a handful of pointers. The mistakes are reversing first and checking the length afterwards, which mangles a partial tail, and advancing the anchor to kth instead of to the old first node.
