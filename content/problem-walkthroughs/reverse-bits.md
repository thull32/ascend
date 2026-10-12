---
problem: reverse-bits
args: [6]
frames: 101
source: d8f30f1f97e55f63
---
@0
We are reversing the 32 bits of the number 6. In binary, 6 is one, one, zero: bits one and two are set, and the other thirty bits are zeros. Picture n as a stack of bits you pop from the bottom, and the result as a stack you push onto from the bottom. The first bit popped gets shifted up by every later push, so after 32 pushes it sits at the very top. First we mask n to 32 bits, which leaves 6 unchanged, and start the result at zero.

@2-4
Round one. The lowest bit of 6 is a zero. The result shifts left one place and takes that zero on the end, so it stays zero. Then n shifts right, dropping the bit it just gave away.

@5-7
n is now 3, binary one, one. Round two: its lowest bit is a one. The result shifts left and takes the one, so the result becomes 1.

@8-10
n is 1. Round three pushes another one: the result shifts to 2 and takes the one, making 3.

@11-13
Now n is zero. Every remaining bit of the input is zero. This is the moment the classic bug lives in. A loop written as "while n is not zero" would stop here and return 3, which is wrong. Those leading zeros are real positions, and the reversal has to move them too. So round four pushes a zero: the result doubles from 3 to 6.

@14-97
From here on, each round pushes a zero, and the only effect is that the result doubles. 6 becomes 12, then 24, and on through 32 rounds in total. The two one bits climb a place each round. In the last rounds the result goes from about 400 million to about 800 million, and the final push makes it one billion, six hundred and ten million, six hundred and twelve thousand, seven hundred and thirty six.

@98-100
The loop has run exactly 32 times, and we return the result, masked to 32 bits for safety. Bits one and two of the input now sit at bits thirty and twenty nine. That is the reversal: bit i moves to bit 31 minus i.

Time and space are constant: always exactly 32 rounds. The count is the point. Stopping when n reaches zero drops the leading zeros, so reversing 1 would give back 1 instead of 2 to the power 31. In Python, the masks are how you impose a 32 bit width on integers that never overflow; in JavaScript, the bit operators are signed, so you finish by reinterpreting the result as unsigned.
