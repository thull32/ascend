---
problem: distinct-subsequences
args: ["banana", "ban"]
frames: 60
source: 07853b05365275e3
---
@0-3
How many ways can we pick letters of banana, in order, to spell ban? Think about the newest letter of s. Every way of spelling a prefix of t either ignores that letter, or uses it as the last letter picked, which only works if it matches, and then the rest spells one letter less of t. The two groups never overlap, so their counts add. We keep one array, W, where W of j is the number of ways to spell the first j letters of t from the letters of s seen so far. W of zero is one: the empty target can always be spelled, by picking nothing. The others start at zero.

@4-12
The first letter, b. We walk j downwards, from 3 to 1. Only position 1 of t is a b, so W of 1 gains W of zero, which is one. One way to spell b. The array reads 1, 1, zero, zero.

@13-21
The second letter, a. It matches t's a at position 2, so W of 2 gains W of 1: one way to spell b a. Here is why the loop runs downwards. When we update W of 2, W of 1 must still hold its value from before this letter. Going downwards, W of 1 has not been touched yet in this pass. Going upwards, one letter of s could be used twice in the same spelling.

@22-29
The third letter, n. It matches position 3, so W of 3 gains W of 2: one way to spell ban, using the first three letters. The array is all ones.

@30-38
The fourth letter, another a. Position 2 gains W of 1 again, so W of 2 becomes 2: b a can now use either a. The full word count stays 1, because this letter is not an n.

@39-47
The fifth letter, n. W of 3 gains W of 2, which is now 2. So W of 3 becomes 3: the one spelling we already had, plus two new ones ending at this n, one for each a before it.

@48-57
The last letter, a. W of 2 grows to 3, but that only matters for spelling b a. The count for the whole of ban stays 3.

@58-59
We return 3: b, then the first a, then either n; or b, the second a, and the second n. The cost is the length of s times the length of t, with one array the length of t.

The mistakes: on a match, using only the matching term and forgetting that the letter can also be skipped; seeding only the very first empty-target count instead of keeping it at one for every letter; and looping upwards in this one-array version. Also, intermediate counts can be larger than the final answer, so a guarantee that the answer fits in 32 bits does not protect the middle of the table.
