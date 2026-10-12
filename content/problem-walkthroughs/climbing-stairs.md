---
problem: climbing-stairs
args: [5]
frames: 12
source: b453aa1a76c4a6a0
---
@0
We are counting the ways to climb five steps, one or two at a time. The insight is to ask about the last move, not the first. Any climb that ends on step i finished with a one-step from step i minus 1, or a two-step from step i minus 2. Those two groups never overlap, so the ways to reach step i are the ways to reach the step below plus the ways to reach the step two below. Each count needs only the two before it, so this solution keeps just two numbers. The first line sets both to one: one way to stand on step zero, the empty climb, and one way to reach step one.

@1-2
The loop starts at step 2. Right now prev2 is one and prev1 is one: the counts for step zero and step one. The update slides the window up a step in one line. The old prev1 becomes the new prev2, and the new prev1 is the sum of the two.

@3-4
So step 2 has two ways: two single steps, or one double step. Now prev2 is one and prev1 is two, and the loop moves to step 3.

@5-6
Step 3 has three ways, two plus one. The window now holds two and three.

@7-8
Step 4: three plus two is five. The window holds three and five, and we move to step 5, the last one.

@9
Step 5: five plus three is eight. Read that as a sentence: five of the climbs arrive from step 4 with a single step, and three arrive from step 3 with a double step. prev2 is five, prev1 is eight, and the range is used up.

@10-11
We return prev1, eight. You will recognise the sequence one, one, two, three, five, eight: these are the Fibonacci numbers, shifted by one. The cost is one addition per step, so linear time, and constant space, because we never keep more than two counts. For n equal to 1, the loop never runs and the answer is the starting one.

The classic mistake is the base case. If you say there are zero ways to stand on step zero, step 2 comes out as one instead of two, and every later count is off. The empty climb is one way. The other trap is writing the plain recursion without remembering results: it recomputes the same steps over and over and times out at 45.
