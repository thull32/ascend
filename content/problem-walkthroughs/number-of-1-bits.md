---
problem: number-of-1-bits
args: [180]
frames: 16
source: 26b769060a8c463e
---
@0
The input is 180. In binary that is 1, 0, 1, 1, 0, 1, 0, 0: the bits worth 128, 32, 16 and 4. We want to count the ones. You could test every bit position, but there is a neater trick. Subtracting 1 from a number turns its lowest one bit into a zero and every zero below it into a one, and leaves the higher bits alone. So n and n minus 1, combined with a bitwise and, is n with its lowest set bit cleared. Repeat until nothing is left, and count the steps.

@1-4
n is not zero, so the loop runs. 180 minus 1 is 179, which ends in 0, 0, 1, 1 where 180 ends in 0, 1, 0, 0. The borrow flipped the 4 bit off and the two bits below it on. Anding the two keeps only what they share, and the 4 is gone: n becomes 176, and the count is 1.

@5-7
176 is 128 plus 32 plus 16. Its lowest set bit is the 16. Clear it: n becomes 160, and the count is 2.

@8-10
160 is 128 plus 32. Clear the 32: n becomes 128, and the count is 3.

@11-13
128 is a single bit. 128 minus 1 is 127, seven ones below it, and the two share nothing. n becomes zero, and the count is 4.

@14-15
n is zero, so we return 4. The loop ran once per set bit, not once per bit position: four iterations here, never more than 32. Be ready to explain the borrow, because the interviewer will ask why it works. The trap in JavaScript or Java is the shift-and-test version using a signed right shift: with the top bit set, the value never reaches zero, and the loop runs forever. Use the unsigned shift, or this loop.
