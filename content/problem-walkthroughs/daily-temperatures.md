---
problem: daily-temperatures
args: [[73, 74, 75, 71, 69, 72, 76, 73]]
frames: 48
source: 2b71d84c85bb31b3
---
@0-3
Eight days of temperatures: 73, 74, 75, 71, 69, 72, 76, 73. For each day, how long until a strictly warmer one? Scanning forward from every day is quadratic. Turn the question around: instead of asking when day i gets its answer, ask which earlier days today answers. Keep the days still waiting on a stack, by index. Today answers every waiting day that is colder than it, and those are always at the top, because the stack runs from warmest at the bottom to coldest at the top. The answers start at zero, which is also the answer for any day that never resolves.

@4-6
Day zero, 73. Nothing is waiting, so it goes on the stack.

@7-12
Day one, 74. The top of the stack is day zero, at 73, which is colder. So today is its answer: one day later. Pop it and record 1. The stack is empty, and day one goes on.

@13-18
Day two, 75, does the same to day one: another wait of 1. Day two goes on the stack.

@19-24
Day three, 71, is colder than the 75 on top, so it resolves nothing and simply waits. Day four, 69, is colder still, and waits too. The stack holds days two, three and four: 75, 71, 69. Warmest at the bottom, coldest on top, just as promised.

@25-33
Day five, 72. The top is day four, at 69: colder. Pop it, and its wait is 5 minus 4, which is 1. The new top is day three, at 71: also colder. Pop it, and its wait is 5 minus 3, which is 2. The next top is day two, at 75, which is warmer than 72, so we stop. One warm day resolved two waiting days at once. Day five goes on, and the stack holds days two and five.

@34-42
Day six, 76, is the warmest yet. It resolves day five, a wait of 1, and then day two, which has been waiting since 75: 6 minus 2 is a wait of 4. The stack empties, and day six goes on.

@43-45
Day seven, 73, is colder than 76, so it waits. The loop ends with days six and seven still on the stack. Nothing warmer ever comes for them, so their answers stay zero.

@46-47
The answer is 1, 1, 4, 2, 1, 1, zero, zero. The loop inside a loop looks quadratic, but count pushes and pops instead: each day is pushed once and popped at most once, so the whole thing is linear time. That amortised argument is what to say out loud. The mistakes: storing temperatures instead of indices, which loses the distance; and popping on equal temperatures, which treats 70 as warmer than 70.
