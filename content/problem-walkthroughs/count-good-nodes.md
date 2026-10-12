---
problem: count-good-nodes
args: [{"$tree": [3, 1, 4, 3, null, 1, 5]}]
frames: 54
source: 4f38e0d2a868f85a
---
@0-5
The root is 3. Its left child is 1, which has a left child of 3. Its right child is 4, with children 1 and 5. A node is good if nothing on the path from the root down to it is bigger than it. That sounds like it needs the whole path, but it needs only one number: the largest value seen so far on the way down. A node is good if it is at least that maximum. So the recursion carries the maximum down as a parameter. The root starts with minus infinity, so it is always good. 3 is good, and the maximum becomes 3.

@6-9
Down to the left child, 1, carrying a maximum of 3. One is less than 3, so it is not good. The maximum stays 3.

@10-13
Its left child is 3, and the maximum on the way down is 3. Three is at least 3, so it is good. A tie counts: nothing above it is greater. This is the case that catches people who compare with strictly greater.

@14-24
Below that 3 there is nothing, and the 1 has no right child, so the empty calls return zero. The left 3 reports one good node, and the left 1 passes that up: one good node on the root's whole left side.

@25-28
Now the root's right child, 4. Notice the maximum it receives is 3, the root's value, not anything from the left side. Because the maximum is a parameter, each branch gets its own copy, and siblings never see each other's values. Four beats 3, so it is good, and its maximum becomes 4.

@29-39
Its left child is 1, against a maximum of 4. Not good.

@40-50
Its right child is 5, against 4. Good. The maximum would become 5, but there is nothing below.

@51-53
The counts add up on the way back: 4 reports itself plus the 5, which is 2. The root adds its own 1, the left side's 1, and the right side's 2. The answer is 4: the root 3, the lower 3, the 4, and the 5.

Every node is visited once, so time is linear, and space is the height of the tree for the recursion. This is a top-down recursion: information flows from parent to child as a parameter, rather than up as a return value. The mistakes to avoid: strictly greater instead of at least, starting the maximum at zero, which miscounts trees with negative values, and keeping the maximum in one shared variable, which leaks one branch's values into its sibling.
