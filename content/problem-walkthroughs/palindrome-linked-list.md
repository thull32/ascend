---
problem: palindrome-linked-list
args: [{"$list": [1, 2, 2, 1]}]
frames: 51
source: 563a434ba3ab0c32
---
@0
The list is 1, 2, 2, 1. Is it a palindrome, using constant extra space? Copying the values into an array would be easy, but that is linear space. The insight: a palindrome check compares the front half with the reverse of the back half. Find the middle with a slow and a fast pointer, reverse the back half in place, and walk the two halves together.

@1-8
More than one node, so we look for the middle. Slow moves one node per step, fast moves two. After one step, slow is on the first 2 and fast on the second 2. After another, slow is on the second 2 and fast has run off the end. Slow is now the first node of the back half.

@9-17
Reverse from there. The back half is 2, 1. The usual three-pointer reversal: remember the next node, point the current node backwards, then step forward. The 2 now points at nothing, because it will be the tail.

@18-24
The 1 points back at the 2. The reversed back half reads 1, 2.

@25-27
Look at the front: 1, 2, 2. The first 2 still points at the second 2, which is now the end of the reversed half. So the front is one node longer than the back. That is why the comparison loop runs while the back half has nodes, not the front. Walking until the front runs out would step off the end of the back half and crash.

@28-30
Compare 1 with 1: equal. Step both.

@31-33
Compare 2 with 2: equal. The back half is used up, and every pair matched, so the answer is true.

@34-48
Before returning, reverse the back half again to put the list back as we found it. A test might not notice a mangled input, but a code reviewer will.

@49-50
The list reads 1, 2, 2, 1 again, and we return true. Finding the middle, reversing twice and comparing are each a linear pass at most, so time is linear and extra space is constant. The other classic mistake is pairing the wrong middle with the wrong reversal start, which leaves one half a node too long for even lengths.
