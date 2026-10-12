---
problem: pow-x-n
args: [2.0, 13]
frames: 25
source: 1988077886c412b4
---
@0
We compute 2 to the power 13. Multiplying 2 by itself thirteen times is fine here, but with an exponent of two billion it is hopeless. The insight: squaring doubles the exponent with one multiplication, so from x you get x squared, x to the fourth, x to the eighth, and so on. And 13 is 8 plus 4 plus 1, which in binary is 1, 1, 0, 1. So 2 to the 13th is 2 to the 8th, times 2 to the 4th, times 2 to the 1st. We read the bits of the exponent from the lowest up, keeping a base that is always x to the next power of two.

@1-3
The exponent is not negative, so there is nothing to invert. The result starts at 1, and the base at 2, which is 2 to the 1st.

@4-8
The lowest bit of 13 is set, so the base goes into the result: the result is 2. Then the base squares to 4, and shifting the exponent right drops the bit we just used: 13 becomes 6.

@9-12
The lowest bit of 6 is zero. The base right now is 4, which is 2 squared, and since this bit is off, it is left out of the result. The base squares to 16, and the exponent becomes 3.

@13-17
The lowest bit of 3 is set, so the result takes the base: 2 times 16 is 32. The base squares to 256, and the exponent becomes 1.

@18-22
The last bit is set too: 32 times 256 is 8,192. The base squares once more, to 65,536, though we will not need it, and the exponent becomes zero.

@23-24
The loop ends, and we return 8,192, rounded to five decimal places to hide floating-point noise. It took four rounds, one per bit, so the time is the logarithm of n: about 31 rounds even for an exponent of two billion. For a negative exponent, invert x and negate n first, and in a language with 32-bit integers, widen before negating, because minus two to the 31st has no positive counterpart. The classic slow answer is recursing on n minus one, and the classic subtle one is calling the half power twice instead of squaring it once, which makes it linear again.
