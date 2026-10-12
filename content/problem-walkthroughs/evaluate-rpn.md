---
problem: evaluate-rpn
args: [["4", "-7", "2", "/", "-"]]
frames: 28
source: 12099fdd9f3a5a3e
---
@0-1
The tokens are 4, minus 7, 2, divide, minus. In postfix, each operator applies to the two values produced most recently and not yet used. Most recent, not yet used: that is a stack. There is never any doubt about which values an operator takes, which is why postfix needs no parentheses and no precedence rules. This example is small, but it sets three traps: a negative number, division that has to truncate toward zero, and the order of operands for minus.

@2-4
The first token, 4, is not an operator, so it is a number. Push 4.

@5-7
Minus 7. It starts with a minus sign, but it is not the operator on its own, so it is a number too. Checking whether the token is all digits would get this wrong: minus 7 is not all digits. That is why the code checks against the four operators instead. Push minus 7.

@8-10
Push 2. The stack is 4, minus 7, 2.

@11-14
Divide. Pop the right operand first, b is 2, because it was pushed last. Then the left operand, a is minus 7.

@15-18
Minus 7 divided by 2 is minus 3.5, and the problem wants truncation toward zero: minus 3. That is why the code converts the true quotient to an integer instead of using Python's floor division, which rounds down to minus 4. Push minus 3. The stack is 4, minus 3.

@19-24
Minus, the operator. Pop b, minus 3, then a, 4. The result is a minus b: 4 minus minus 3, which is 7. Pop the other way round and you compute minus 3 minus 4, minus 7, the classic order bug. The earlier value is always on the left.

@25-27
The tokens are done, and the stack holds exactly one value: 7. Each token is handled once with constant-time pushes and pops, so time is linear, and the stack is at most the number of tokens.

Remember the three traps from this one example: pop the right operand first, detect numbers by ruling out operators rather than by testing for digits, and truncate toward zero, not down.
