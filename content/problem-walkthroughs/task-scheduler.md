---
problem: task-scheduler
args: [["A", "A", "A", "B", "B", "B"], 2]
frames: 11
source: 0da2c07b4b469ffa
---
@0
Three A tasks and three B tasks, and the same task needs a gap of at least two slots between runs. The best schedule is A, B, idle, A, B, idle, A, B: eight slots. The insight is that the most frequent task is the bottleneck. Picture its copies as fence posts. With f copies and a cooldown of n, there are f minus 1 gaps, each n plus 1 slots wide counting the post itself, and then the last copy. Everything else fills in the gaps. So we only need counts, not a simulation. First, count each task: three A's, three B's.

@1
The highest count, f, is 3.

@2-8
Next, m: how many tasks are tied at that highest count. Both A and B appear three times, so m is 2. Ties matter, because each tied task needs one extra slot at the very end: the final A is followed by a final B.

@9-10
Now the formula. f minus 1 is two full frames, each n plus 1, three slots wide: six slots. Plus m, the two tied tasks in the last frame: eight. In the picture, each frame is A, B, and one idle slot, and the last frame is just A, B. Then the answer is the larger of eight and the number of tasks, six. Eight wins, so there is idle time, and we return 8.

That max is the line people forget. When there are enough different tasks to overflow the gaps, there is no idle time at all, and the answer is simply the number of tasks. For example, three A's, two B's and one C with a cooldown of one: the formula gives five, but six tasks must still run. Time is one pass to count, and space is at most 26 counters. The greedy that achieves this bound runs the task with the most remaining work at every step, and a heap simulation of it is what you would write if asked for the actual schedule, or for cooldowns that differ per task, where the formula no longer holds.
