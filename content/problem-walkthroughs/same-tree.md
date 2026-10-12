---
problem: same-tree
args: [{"$tree": [1, 2, 3]}, {"$tree": [1, 2, 4]}]
frames: 21
source: af3ab1f57845f37d
---
@0
Two small trees. Both have 1 at the root and 2 on the left. On the right, the first has 3 and the second has 4. Identity is recursive: two trees are the same if their roots match, their left subtrees are the same, and their right subtrees are the same. So we walk both trees at once, comparing node with node, and stop at the first difference. Watch the order of the three checks, because it is the whole solution.

@1-2
At the roots. First: are both empty? No. Second: is exactly one empty? No. Only now is it safe to read the values, and both are 1.

@3-7
So we recurse, left with left first. The call stack grows: we are comparing the two left children, both 2. Neither is empty, and the values match, so we recurse again into their left children.

@8-10
Both are empty. That is the first check, and it returns true. Two empty trees are the same as each other. If the check for exactly one empty came first, it would fire here and wrongly call two empty trees different.

@11-14
The right children of the two 2 nodes are also both empty, so that is true as well. Both halves agree, and the comparison of the left subtrees returns true.

@15-19
Now the right subtrees: 3 against 4. Neither is empty, so we reach the value check, and 3 is not 4. This call returns false.

@20
At the root, the left side was true and the right side is false, so the whole answer is false. The and also short circuits: had the left subtrees differed, the right side would never have been visited.

Time is bounded by the smaller tree, since the walk stops as soon as one side runs out or a value differs, and the space is the recursion depth, the height of the shorter tree. The mistakes are reading a value before checking for an empty node, and testing for one empty node before testing for two. A related trap is comparing traversals of values alone: without markers for the missing children, two different shapes can produce the same sequence.
