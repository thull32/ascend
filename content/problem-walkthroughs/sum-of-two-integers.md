---
problem: sum-of-two-integers
args: [15, 17]
frames: 29
source: 1ded9a4de127041e
---
@0
We are adding 15 and 17 without using plus or minus. In binary, 15 is zero, one, one, one, one, and 17 is one, zero, zero, zero, one. Look at one bit position. The sum bit is one when exactly one input bit is one, which is XOR. A carry appears when both are one, which is AND, and it belongs one place to the left, so we shift it. So a plus b equals a XOR b, plus the carries shifted left. That is another addition, so we repeat until there are no carries left. Watch one number as we go: a plus b stays 32 the whole time.

@1-2
First, both inputs are masked to 32 bits. Python's integers never overflow, so the mask is how we pretend to be a 32 bit register. 15 and 17 are unchanged.

@3-6
Round one. The two numbers share only the lowest bit, so AND gives 1, and shifted left, the carry is 2. XOR gives the sum without carries: 30. Now a is 30 and b is 2. Still 32 in total.

@7-10
Round two. 30 and 2 share bit one, so the carry is 4, and XOR leaves 28. 28 plus 4.

@11-17
The carry keeps climbing, one place per round. 28 and 4 share bit two: carry 8, sum 24. Then 24 and 8 share bit three: carry 16, sum 16. This is a ripple carry adder, the carry walking up through every bit, exactly as in hardware.

@18-25
16 and 16 share bit four, so XOR wipes them out to zero, and the carry is 32. Then zero and 32 share nothing: the carry becomes zero, and a becomes 32.

@26-28
b is zero, so the loop stops. The last line reinterprets bit 31 as a sign: if a were above the largest positive 32 bit value, it would be turned back into Python's negative number. 32 is small, so we return it as it is.

Each round pushes the lowest possible carry position at least one place left, so a 32 bit word needs at most 32 rounds: constant time and space. The masks matter for negatives. Without them, adding minus 1 and 1 in Python never ends, because negative numbers have infinitely many leading ones, and the carry climbs forever. With the mask, the carry falls off bit 32 and disappears, just as it would in a real register. In JavaScript, the bit operators are already 32 bits wide, so the plain loop works.
