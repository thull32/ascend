---
problem: reverse-integer
args: [1563847412]
frames: 55
source: 8f6f8a9432061d60
---
@0
We are reversing the digits of 1,563,847,412 under one rule: we may only hold 32 bit values. The reversal would be about 2.15 billion and change, just past the largest 32 bit integer, so the right answer is zero. The insight is that reversing digits is a pop and push loop, and the push is the only dangerous step. So before every push, we ask whether it would overflow, using a comparison that cannot overflow itself.

@1-3
The input is positive, so the limit is the largest positive 32 bit value, 2,147,483,647. On the negative side the limit would be one larger. We work on the magnitude, and the result starts at zero.

@4-9
First digit. The remainder after dividing by ten pops the last digit, 2, and floor division removes it from x. Now the check: would ten times the result plus 2 go over the limit? Instead of computing that, we compare the result with the limit minus 2, divided by ten. Zero is nowhere near, so we push: the result becomes 2.

@10-23
The same rhythm repeats. Pop 1, push it: 21. Pop 4: 214. Pop 7: 2,147. Notice the result is spelling out the digits of the limit itself. That is what makes this input dangerous.

@24-48
Pop 4, 8, 3, 6, and 5, each passing the check. After nine digits the result is 214,748,365, and only the leading 1 of the input is left.

@49-52
Last digit. Pop 1, and x becomes zero. Now the check matters. The limit minus 1, divided by ten and rounded down, is 214,748,364. Our result is 214,748,365, one more than that. So pushing the 1 would produce 2,147,483,651, which is over the limit by four.

@53-54
We return zero, and the overflowing number was never formed. That is the whole technique: rearrange the inequality so the dangerous multiplication is never performed.

Time is one step per digit, at most ten, and space is constant. The mistake interviewers are looking for is checking after the push. In Python it happens to work, because integers never overflow. In a fixed width language the value has already wrapped around by the time you check it, so the check is meaningless. The Python specific trap is negative input: floor division rounds toward negative infinity, so working on the magnitude and reapplying the sign at the end is what keeps the digits right.
