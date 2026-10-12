---
problem: single-number
args: [[7, 3, 5, 3, 7]]
frames: 14
source: 5187f47e6537ed3a
---
@0
In 7, 3, 5, 3, 7, every number appears twice except one, and we want it in one pass with constant space. The tool is XOR, exclusive or, which works bit by bit: a result bit is one when the two input bits differ. Three facts make it perfect. Any number XOR itself is zero. Zero XOR a number gives that number back. And the order does not matter. So if we XOR everything together, each pair cancels wherever its two copies sit, and only the single value is left. The accumulator starts at zero, the identity.

@1-3
First, 7, which is one, one, one in binary. Zero XOR 7 is 7.

@4-5
Next, 3, binary zero, one, one. 7 and 3 differ only in the top bit, so the accumulator becomes one, zero, zero, which is 4. The intermediate values look meaningless, and that is fine. Only the final value matters.

@6-7
Next, 5, binary one, zero, one. 4 and 5 differ only in the lowest bit, so the accumulator becomes 1.

@8-9
The second 3. 1 and 3 differ in the middle bit, giving 2. The two 3s have now cancelled each other, even though a 5 sat between them.

@10-11
The second 7. 2 and 7 differ in the top and bottom bits, giving one, zero, one, which is 5. Both 7s have cancelled.

@12-13
We return 5, the number without a partner.

Time is one pass, and space is a single integer. Negative numbers need no special case, because XOR on two's complement cancels pairs just the same. The common slip is starting the accumulator at the first element and then running over the whole list, which cancels that first element away. Think of it per bit: each paired value contributes an even number of ones to every bit position, and an even count of ones XORs to zero. That bit by bit view is what solves the follow ups: when everything else appears three times, count each bit's ones modulo three instead.
