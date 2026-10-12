---
problem: interleaving-string
args: ["ca", "cb", "cbca"]
frames: 64
source: ec8a3c4fb6bc8ec7
---
@0-3
Can c b c a be built by interleaving c a and c b, keeping each string's own order? Greedy fails here: if you take the first c from c a, the next letter you need is b, and neither string offers it. The insight is that the state of the search is just how many letters of each input you have used, i and j. The position in the target is then forced: i plus j. So the answer is a grid of true or false, one cell per pair, and each cell asks whether the last letter placed could have come from the first string or the second. First, the lengths: two plus two is four, the target's length, so we go on. We keep only one row of the grid, three cells wide.

@4-7
Row zero means nothing used from c a yet. The corner cell, nothing used from either, is true: the empty prefix interleaves trivially.

@8-14
Cell zero, one: one letter of c b used. The letter just placed is the target's first, c. It cannot come from the first string, since we have used none of it. From the second: the cell to the left is true and c b starts with c. So this cell is true.

@15-20
Cell zero, two: the target's second letter, b, from c b's second letter, b. True again. Row zero reads true, true, true, because c b is exactly the first two letters of the target.

@21-28
Row one: one letter of c a used. At column zero the letter is c, and c a starts with c, with the cell above true. So true. Here is the trick of the single row. Before we overwrite a cell, it still holds the row above; the cell to its left already holds this row.

@29-34
Cell one, one: the target's second letter, b. From the first string we would need c a's first letter, c. From the second, c b's first letter, also c. Neither is b, so this cell is false. This is exactly where greedy died: one letter from each string cannot make c b.

@35-40
Cell one, two: the target's third letter, c. From above, cell zero, two is true, and c a's first letter is c. True. The path is c b from the second string, then c from the first.

@41-48
Row two: both letters of c a used. Column zero would need c a to equal the target's first two letters, c b. It does not: the letter is b and c a offers a. False.

@49-53
Cell two, one: the letter is c, but the cell above and the cell to the left are both false. Nothing reaches it. False.

@54-59
The last cell, two, two: the target's last letter, a. From above, cell one, two is true, and c a's second letter is a. True.

@60-63
We return the last cell: true. The interleaving is c b from the second string, then c a from the first.

The grid has one cell per pair of prefixes, so time is the product of the two lengths, and one row of space is enough. The classic mistakes: greedy tie breaking, as we saw; forgetting the length check; and adding a third index for the target, which is redundant because it is always i plus j.
