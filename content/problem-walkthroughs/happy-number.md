---
problem: happy-number
args: [19]
frames: 81
source: fa9b67854345b9b9
---
@0
Is 19 a happy number? Replace a number by the sum of the squares of its digits, again and again. If you reach one, it is happy. If you loop forever, it is not. The insight is that this is the linked list cycle problem in disguise: the digit-square function plays the role of next, and Floyd's tortoise and hare finds the loop with two numbers of state instead of a set of everything seen. The first line just defines the helper, step.

@1-11
The hare starts one step ahead of the tortoise, so we call step on 19. Divmod peels off the last digit: nineteen becomes one, with a digit of nine, and the total gains eighty one. Then one becomes zero with a digit of one, and the total gains one. Eighty two.

@12
So slow is 19 and fast is 82. The loop runs while fast has not reached one and the two have not met. Neither has happened.

@13-23
The tortoise takes one step. Step of 19 is 82 again, the same digits, the same answer.

@24-34
The hare takes two steps. The first is step of 82: a two gives four, an eight gives sixty four, total sixty eight.

@35-44
The second is step of 68: an eight gives sixty four, a six gives thirty six, total one hundred.

@45
Now slow is 82 and fast is 100. Still not one, still not equal. Go again.

@46-56
The tortoise steps from 82 to 68, which the hare passed through a moment ago. The tortoise always walks the same road, only slower.

@57-70
The hare steps twice. Step of 100 peels off a zero, another zero, and a one: the total is one.

@71-77
And step of one is one. That is the fixed point: one maps to itself forever. Fast is one.

@78-80
The loop condition sees fast equal to one and stops. We return true: 19 is happy, by way of 82, 68 and 100.

Why must every sequence end in one or a loop? A number with four or more digits always shrinks under this map, and anything with three digits maps to at most 243. So the values live in a small finite set, and a walk on a finite set must repeat. An unhappy number, like 2, never reaches one: slow and fast chase each other round a cycle and meet at 42, so the answer is false. Space is constant, and time is a small constant number of steps, each costing one pass over the digits. The classic bug is starting slow and fast at the same value with a loop that runs while they differ: it exits before taking a single step. Starting the hare one step ahead avoids that.
