---
problem: counting-bits
args: [7]
frames: 18
source: 470efa7337dcab8b
---
@0-1
We want the number of one bits in every number from zero to 7. Counting each number's bits separately costs a few steps per number. The insight is that every number's count is one cheap step away from a smaller number's count. Shift a number right by one, and you drop its last bit. So the bits in i are the bits in i shifted right, which we already know, plus that last bit, which is i and 1. The table starts as eight zeros, and zero is already right: it has no bits.

@2-3
i is 1. Shifted right, it becomes zero, which has zero bits, and its last bit is 1. One bit.

@4-5
i is 2, which is one zero in binary. Shifted right, it is 1, with one bit, and its last bit is zero. One bit.

@6-7
i is 3, one one in binary. Shifted right, it is 1, with one bit, plus a last bit of 1. Two bits.

@8-9
i is 4, one zero zero. Shifted right, it is 2, which has one bit, and the last bit is zero. One bit. Every power of two comes out as one, as it should.

@10-13
5 shifts to 2 and adds a last bit of 1: two bits. 6 shifts to 3, which has two bits, and adds a zero: two bits.

@14-15
7 is one one one. It shifts to 3, with two bits, and adds a 1: three bits.

@16-17
The table reads zero, 1, 1, 2, 1, 2, 2, 3. Each entry takes constant work, so the whole table is linear time, with no space beyond the answer. The number we read is always smaller than i, so filling left to right means it is always ready.

Look at the shape: the second half, 1, 2, 2, 3, is the first half, zero, 1, 1, 2, plus one. That is because the numbers from 4 to 7 are the numbers from zero to 3 with an extra leading one bit. That is the follow-up question. The mistakes are returning n counts instead of n plus one, since both zero and n are included, and calling a built-in bit count on every number, which passes but is not the recurrence the interviewer asked for.
