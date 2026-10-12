---
problem: regular-expression-matching
args: ["xyyz", "xy*z"]
frames: 98
source: adbe42e958aaa1d1
---
@0
Does the string X, Y, Y, Z match the pattern X, Y star, Z? A dot matches any character, and a star means zero or more copies of the element before it. Trying every way to spend each star is exponential. But whether the rest matches depends only on two positions, how much of the string and how much of the pattern we have used, so the state is a pair of prefix lengths. We fill a table of which string prefixes match which pattern prefixes, one row per string prefix, keeping only the previous row and the current one.

@1-5
Row 0 is the empty string. It matches the empty pattern, so its first cell is true.

@6-21
The empty string cannot match X, or X Y. Column 3 is X, Y star, and here a star may match zero copies, which means looking two columns back, at the pattern X alone. That is false, so this is false too. Z is false. Row 0 is true, then all false.

@22-27
Row 1 is the string X. Against the pattern X: X fits X, and the empty string matched the empty pattern, diagonally up and left. True.

@28-38
Against X, Y: no, the Y does not fit an X. Against X, Y star: zero copies of Y means reusing the column for X, which is true in this row. So X matches X, Y star, with the star taking nothing. Against the full pattern, false.

@39-47
Row 2 is X, Y. Against X, Y, the Y fits Y, and the diagonal cell, X against X, was true. True.

@48-56
Against X, Y star, zero copies would need X, Y to match X, which it does not. So try one more copy: the last Y fits the starred Y, and the cell straight above, X against X, Y star, was true. True. Reading straight above, not diagonally, keeps the star available for more copies. Reading the diagonal instead is the classic bug: it lets a star match at most one character.

@57-75
Row 3 is X, Y, Y. Only the starred column is true: the second Y is one more copy, and the cell above was true.

@76-95
Row 4 is the whole string, X, Y, Y, Z. In the last column, Z fits Z, and the diagonal cell, X, Y, Y against X, Y star, was true. So the last cell is true.

@96-97
We return true. The table has m plus one rows of n plus one cells, each decided in constant time, so the time is m times n, and keeping two rows makes the space linear in the pattern. The other classic mistake is starting row 0 as all false, which would make the empty string fail to match a pattern like A star.
