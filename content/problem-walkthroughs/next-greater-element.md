---
problem: next-greater-element
args: [[2, 1, 2, 4, 3]]
frames: 26
source: da0757c737648afa
---
@0
The array is 2, 1, 2, 4, 3. For each element we want the first value to its right that is strictly greater, or minus one. Instead of each element searching forward for its answer, let each new element deliver answers backward. Keep a stack of positions still waiting for an answer. When a new value arrives, every waiting position with a smaller value has just found it, and those positions are all at the top of the stack, because the stack's values never increase from bottom to top.

@1-5
Every answer starts as minus one. The first value, 2 at position 0, finds nobody waiting, so it joins the stack.

@6-8
The value 1 at position 1 is not greater than the 2 on top, so nothing pops. Position 1 waits too. The stack holds positions 0 and 1, values 2 and 1, decreasing as promised.

@9-11
The value 2 arrives at position 2. The top is position 1, holding 1, which is smaller, so position 1's answer is 2. It pops.

@12-13
Now the top is position 0, holding 2. Is 2 less than 2? No. Strictly greater means an equal value is not an answer, so position 0 keeps waiting, and position 2 is pushed on top of it.

@14-16
The value 4 arrives at position 3. The top, position 2, holds 2: its answer is 4.

@17-20
Then position 0, also holding 2: its answer is 4 as well. The stack is empty, and position 3 is pushed.

@21-23
The value 3 at position 4 is smaller than the 4 on top, so it just waits.

@24-25
The input is done. Positions 3 and 4 never found anything greater, so they keep minus one. The answer is 4, 2, 4, minus 1, minus 1. Each position is pushed once and popped at most once, so the inner loop runs at most n times in total: linear time, despite the nested loop. The classic mistake is popping on less than or equal, which would hand position 0 the equal 2 as its answer.
