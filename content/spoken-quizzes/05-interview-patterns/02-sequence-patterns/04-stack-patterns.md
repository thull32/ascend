---
lesson: stack-patterns
source: 51b32607a1b0ff64
---
## 1

Take this string of brackets: open round, open curly, close curly, close round, open square, open round, close square, close round. It is invalid. Why does counting the opens and closes for each bracket type accept it?

A, counting fails only on inputs whose length is odd. B, counts ignore order, and the last bracket opened must close first. C, the counters overflow once more than one type is present. D, counting per type costs quadratic time once several types mix.

[think]

The answer is B: counts ignore order, and the last opened must close first.

Each type has as many closes as opens, yet the seventh character, a close square, arrives while a round bracket is the innermost open one. Only a structure that remembers the order of the open brackets, the stack, can see that. The string has even length, and the counters are fine.

## 2

A min stack keeps a second stack of minimums, and pushes onto it only when the new value is strictly less than the current minimum. You push 4, push 2, push 2 again, then pop once. What does get-min return?

A, 2, because one 2 is still on the main stack. B, 4, because the only record of 2 on the minimum stack was popped. C, an error, because the minimum stack is empty. D, 2, because the minimum stack stored both copies.

[think]

The answer is B: it returns 4, which is wrong.

With strictly less than, the second 2 is never pushed onto the minimum stack. Popping the top 2 matches the minimum stack's top and removes it, leaving 4 as the recorded minimum while a 2 is still on the main stack. Pushing on less than or equal records both copies and returns the correct answer, 2.

## 3

Evaluating the reverse Polish tokens 7, minus 3, divide, 2, multiply, 10, plus should give 6. A Python solution uses floor division and returns 4. Which fix is exact for integers of every size?

A, round a divided by b, so that negative quotients go to the nearest integer. B, floor-divide the absolute values, and negate the result if the signs differ. C, pop the left operand first, so the division is 7 by minus 3. D, replace floor division with int of a true division, so that it truncates.

[think]

The answer is B: floor-divide the absolute values, and negate if the signs differ.

Floor division gives minus 3 for 7 by minus 3, where truncation wants minus 2. Converting a true division with int does truncate, but it goes through a float with 53 bits of precision, so it is wrong for large operands; the absolute-value form is exact. The operand order was already right, and rounding is a different operation.

## 4

In Car Fleet, a car would arrive at time 8 on its own. The car directly ahead would arrive at time 5 on its own, but it has caught a fleet that arrives at time 11. How should the time-8 car be judged?

A, it heads a new fleet, because 8 is later than 5. B, it depends on the gap between the two cars' positions. C, it joins, because 8 is at most the fleet's time of 11. D, it joins only if its speed is higher than that car's speed.

[think]

The answer is C: it joins, because 8 is at most the fleet's 11.

The car ahead cannot pass its fleet, so it effectively arrives at 11. The stack stores fleet times, and 8 being at most 11 means the new car catches up. Comparing with the unobstructed time of 5 counts an extra fleet, which is the bug traced in the lesson.

## 5

You must validate a stream of a billion characters, made of brackets of three types. What is the least memory any correct algorithm needs?

A, constant, with one counter per bracket type. B, proportional to the depth: the stack of currently open brackets. C, linear, since the whole stream must be buffered. D, order log n, enough bits for the current position.

[think]

The answer is B: proportional to the depth, the stack of open brackets.

With several types, the identity and order of every open bracket matter, so the algorithm must remember the open brackets, which is the stack; per-type counters accept a crossed pair like open round, open square, close round, close square. Buffering the stream is unnecessary, since each character is processed once. With a single type, the stack's contents are all identical, and a counter suffices.

## 6

A service walks user-uploaded JSON with a recursive function, and crashes on one customer's file. Measured in the lesson, what nesting depth breaks CPython's own json loads?

A, around a thousand, where Python frames exhaust the C stack. B, somewhere above 5 thousand: 100 thousand levels raise a RecursionError. C, it never breaks, because the json parser is iterative. D, about 100, the default depth guard of the json module.

[think]

The answer is B: somewhere above 5 thousand; 100 thousand levels raise a RecursionError.

Json loads handled 5 thousand levels, and raised a RecursionError at 100 thousand on CPython 3.14, while a hand-written recursive walker hits the default limit of a thousand frames sooner. V8's JSON parse is iterative and parsed a million levels, but JSON stringify then overflowed at ten thousand. An explicit stack, plus a depth cap on untrusted input, avoids all of these.
