---
problem: search-2d-matrix
args: [[[1, 3, 5, 7], [10, 11, 16, 20], [23, 30, 34, 60]], 13]
frames: 24
source: 21b1474a3f35553a
---
@0
We are looking for 13 in a grid of three rows: 1, 3, 5, 7, then 10, 11, 16, 20, then 23, 30, 34, 60. Each row is sorted, and each row starts above where the previous one ended. That second property is the key: read the rows end to end and you have one sorted list of twelve numbers. We never build that list. Position k in it is simply row k divided by the row length, column k modulo the row length. So one ordinary binary search does the job.

@1-3
Three rows of four, so the virtual list runs from position zero to position eleven. lo is zero and hi is eleven.

@4-8
The middle is position 5. Five divided by four is row one, with remainder one, so column one: the cell holding 11. 11 is less than 13, so 13 can only be further right. lo moves past the middle, to 6.

@9-14
Now the range is 6 to 11, and the middle is position 8: row two, column zero, which is 23. That is too big, so hi moves just before it, to 7. Notice this probe jumped across a row boundary without any special handling. The flat index does that for free.

@15-20
The range is 6 to 7. The middle is position 6: row one, column two, holding 16. Still too big, so hi drops to 5.

@21-23
Now lo is 6 and hi is 5. The range is empty, and every cell that could hold 13 has been ruled out. 13 would sit between 11 and 16, and there is nothing there, so we return false. Three probes for twelve cells.

Time is logarithmic in the number of cells, which is the same as log of the rows plus log of the columns, and space is constant. The classic slip is swapping the roles in the index arithmetic: the row is the flat index divided by the number of columns, not by the number of rows. Another is finding the right row by binary search and then scanning it, which is no longer logarithmic. If an interviewer drops the guarantee that each row starts above the last one ended, the flat list is no longer sorted, and the right tool becomes the staircase walk from the top right corner, linear in rows plus columns.
