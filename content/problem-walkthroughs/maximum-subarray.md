---
problem: maximum-subarray
args: [[3, -4, 5, -1, 2, -6, 4]]
frames: 22
source: 5d7071bddd69810f
---
@0-1
Seven numbers: three, minus four, five, minus one, two, minus six, four. Which contiguous run has the largest sum? Fix where the run ends instead of trying every start and end. The best run ending at this position is one of two things: this number alone, or this number added to the best run ending one step earlier. Extending wins exactly when that earlier run is positive. So here is the rule to hold onto: a running sum that has gone negative is dead weight. Drop it and start again. Best here and best both start at the first number, three.

@2-4
Minus four arrives. Alone it is minus four; extending gives three minus four, minus one. Minus one is larger, so best here is minus one. The overall best stays three.

@5-7
Five arrives. Alone it is five; extending the run gives minus one plus five, four. The running sum was negative, so it would only drag five down. We restart: best here is five, and best becomes five. This is the greedy decision in action.

@8-10
Minus one. Extending gives four, which beats minus one alone. Best here is four. Notice the dip does not trigger a restart. We restart when the running sum goes negative, not when a single number is negative, and four is still positive.

@11-13
Two. Extending gives six. Best here is six, and best becomes six: the run five, minus one, two. Crossing the small dip was worth it.

@14-16
Minus six. Extending gives zero, which beats minus six. Best here is zero. Best stays six.

@17-19
Four. Alone it is four; extending zero gives four as well. A tie. Best here is four, and six still wins overall.

@20-21
We return six.

One pass, two variables: linear time, constant space. It is a dynamic program whose state has collapsed to one number, and a greedy choice, extend or restart, that is never revisited. The classic mistakes: starting best at zero, which on an all-negative array returns the sum of an empty run, which is not allowed; and restarting when the current number is negative rather than when the running sum is, which on two, minus one, two returns two instead of three.
