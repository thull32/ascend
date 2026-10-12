---
problem: add-two-numbers
args: [{"$list": [9, 9]}, {"$list": [1]}]
frames: 33
source: a0d209eb21bc5f41
---
@0
We are adding 99 and 1, stored the way this problem stores numbers: least significant digit first. So 99 is the list nine, nine, and 1 is a single node holding one. That order is the whole trick. It is the order you add in on paper, units column first, carrying as you go, so one pass down both lists does the job. The first lines set up a dummy head, so we never special-case the first node of the answer, a tail pointer to append to, and a carry of zero.

@3-4
The loop condition is the line to remember: keep going while either list has a node, or while there is still a carry. Right now both lists have nodes. The column total starts as the carry, zero.

@5-10
Each list contributes its digit if it has one, and steps forward. Nine from the first list makes the total nine; one from the second makes it ten. The second list is now empty.

@11-13
divmod splits ten into a carry of one and a digit of zero. We append a node holding zero to the answer, and move the tail onto it. The answer so far reads zero.

@14-18
Second column. The total starts at the carried one. The second list is empty, so it contributes nothing, which is the same as treating it as a zero. The first list's other nine brings the total to ten again.

@19-22
Ten splits into another carry of one and another zero. The answer now reads zero, zero, and both lists are finished.

@23
Here is where a common bug lives. Both lists are empty, but the carry is still one, so the loop runs once more. A loop that only checked the lists would stop here and return zero, zero: the number 0 instead of 100.

@24-29
This column has no digits at all, only the carry. The total is one, so the digit is one and the carry is zero. We append a node holding one.

@30-32
Now the lists are empty and the carry is zero, so the loop ends. We return the node after the dummy: zero, zero, one, which is 100 read least significant digit first. That is right, because 99 plus 1 is 100. The cost is one step per column, so time is linear in the longer list, and the only state carried between columns is a single digit.
