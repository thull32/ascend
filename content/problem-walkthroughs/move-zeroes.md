---
problem: move-zeroes
args: [[0, 1, 0, 3, 12]]
frames: 25
source: 5cc777432ac36144
---
@0
The array is 0, 1, 0, 3, 12. We want the zeros at the end, the other numbers in their original order, and no second array. This is a read and write two-pointer job. The read pointer looks at every element. The write pointer marks the end of the compacted run of non-zeros at the front. Every non-zero is copied to the write position, and the write pointer moves on. Because write never gets ahead of read, a copy can never overwrite something we have not read yet.

@1-3
Both pointers start at zero. The first element is a zero, so we skip it, and only read moves.

@4-7
Read is at 1, which holds 1. Copy it to the write position, index 0, and move write to 1. The array briefly reads 1, 1, 0, 3, 12. That leftover 1 looks wrong, but it sits in territory we have already read, and it will be overwritten.

@8-9
Index 2 is a zero. Skip it.

@10-13
Index 3 holds 3. Copy it to index 1, and write moves to 2.

@14-17
Index 4 holds 12. Copy it to index 2, and write moves to 3. Now the front reads 1, 3, 12, in their original order, and the tail still holds stale values, 3 and 12.

@18-22
The second pass fills everything from the write position onward with zeros: index 3, then index 4. Forget this pass and the stale values stay; on the array 0, 1 you would get 1, 1.

@23-24
We return 1, 3, 12, 0, 0. Linear time, constant extra space, and at most n writes. The swap variant does it in one pass by swapping instead of copying. The mistake to avoid is swapping zeros with the last position, which moves the zeros but scrambles the order of everything else.
