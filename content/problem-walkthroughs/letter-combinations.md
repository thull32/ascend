---
problem: letter-combinations
args: ["23"]
frames: 106
source: 687fc7cb762a6a65
---
@0-7
The digits two and three, on a phone keypad. Two carries a, b and c; three carries d, e and f. We want every string you could type: one letter per digit. Nested loops would work for exactly two digits and break for any other length. The insight: the answer is a product of small sets, and backtracking builds it one position at a time. At position i, try each letter of that digit, recurse to the next position, then undo. Every path from the top of that tree to a leaf is one answer, so nothing is built and thrown away. We set up the keypad, an empty result, and a path, the letters chosen so far.

@8-11
Position zero is the digit two. The first letter is a. We append it to the path and recurse. Watch the call stack: one level per position.

@12-16
Position one is the digit three. Its first letter is d, so the path is a, d. We recurse again, and now i is two, which is the length of the input.

@17-19
That is a leaf: every digit has a letter. We join the path into a string, a d, and add it to the result. Then return.

@20-23
Back at position one, the line after the recursive call pops d off the path. This is the undo, and it is what lets one shared path serve every branch. The next letter of three is e, so the path becomes a, e.

@24-35
Another leaf: a e joins the result. Pop e, append f, and a f joins too. The three letters of three are done.

@36-40
So position one returns, and back at position zero we pop a. The path is empty again, ready for the next letter of two.

@41-50
Now b. Same shape as before: at position one, d gives the path b, d, which reaches a leaf and is recorded.

@51-69
Then b e and b f, each with a pop before the next letter. Six strings so far.

@70-100
Pop b, and the last letter of two, c, runs the same subtree: c d, c e and c f.

@101-105
Pop c, the outer loop is done, and we return all nine strings, from a d to c f.

There are at most four to the n strings for n digits, and each costs n to join, so time is n times four to the n. Extra space, beyond the output, is the depth of the recursion and the path: just n. The classic mistakes: returning a list with one empty string for empty input, when the answer should be an empty list; building a new string at every level instead of one shared path joined at the leaf; and hard-coding nested loops.
