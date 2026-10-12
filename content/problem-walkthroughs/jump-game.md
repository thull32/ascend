---
problem: jump-game
args: [[3, 1, 0, 0, 2]]
frames: 22
source: 53b2088d0d56d845
---
@0-2
Five positions, holding three, one, zero, zero, two. Each value is the longest jump you may take from there. Can you get from the first position to the last? Here is the fact that makes this one pass. The positions you can reach always form a prefix: if you can reach position j, you can reach every position before it, because the jump that carried you to j could have stopped short. So one number captures everything: reach, the furthest position reachable so far. It starts at zero, and the last position is four.

@3-5
Position zero is within reach, of course. It holds three, so from here we can reach position three. Reach becomes three. Three is short of four, so we keep going.

@6-9
Position one is within reach. It holds one, so it reaches one plus one, two. That is less than three, so reach stays three.

@10-17
Position two holds zero and reaches only itself. Position three also holds zero, and reaches three. Reach is stuck at three. Every position we can stand on gives up before position four.

@18-21
Now position four. Is four greater than reach? Yes: four is past three. There is a gap nobody can cross, so we return false. It does not matter that position four holds a two. You can never stand on it, so its jump never counts. That check, before we use the step, is what stops a later large value from rescuing an unreachable position.

Each position is visited once, so time is linear, and space is a single integer. The reason greedy is safe is the prefix property: the maximum reach summarises everything about the past, so no choice can turn out wrong later. The classic mistake is greedily jumping as far as possible from each position. On three, one, five, zero, zero, zero, a jump of three lands on a zero and gets stuck, while a jump of two reaches the five and then the end. The sweep never commits to a hop; it considers every position in range. And remember the single-element array: you are already standing on the last position, so the answer is true.
