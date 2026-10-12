---
problem: subtree-of-another
args: [{"$tree": [1, 2, 3]}, {"$tree": [1, 2]}]
frames: 57
source: 01f768ee39c55983
---
@0
The big tree is 1, with 2 on the left and 3 on the right. The pattern is 1 with just 2 on the left. The pattern sits right at the top of the big tree, so is it a subtree? No. A subtree means a node and everything below it, and the big tree's 1 also has a 3 that the pattern lacks. That is why the primitive is a full same tree check, not a prefix check. The plan: try every node of the big tree as a starting point, and run the same tree check from there.

@1-5
The big tree is not empty, so we try its root against the pattern's root. Both are 1, so the check goes deeper, left with left.

@6-15
Both left children are 2. Below them, the left children are both missing, and the right children are both missing, so those comparisons return true, and the two 2 subtrees match.

@16-20
Now the right children: the big tree has 3, the pattern has nothing. Exactly one side is empty, so this returns false. One extra descendant is enough to fail the whole match at the root, even though everything the pattern contains was found.

@21-28
So we try the root's left child. Starting at node 2 of the big tree, the same tree check fails at once: 2 is not 1. That early exit is why this approach is usually fast in practice.

@29-38
Node 2's own children are both missing. An empty tree can only match an empty pattern, and the pattern is not empty, so both return false.

@39-45
Then the root's right child. Node 3 against the pattern's 1: different values, false straight away.

@46-56
Node 3's children are missing as well, so they fail too. Every starting point has been tried, and the answer is false.

In the worst case every node starts a comparison that runs most of the way through the pattern, so time is the size of the big tree times the size of the pattern, and space is the height of the tree. Usually the first value comparison fails, so it is much faster. The linear alternative serialises both trees in pre order, with a marker for every missing child and a delimiter before every value, then does a substring search. Both details matter: without markers, different shapes collide, and without delimiters, a 2 can match inside a 12. The classic mistake is a prefix check, which would have said true here.
