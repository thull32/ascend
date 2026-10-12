---
problem: burst-balloons
args: [[2, 3, 4]]
frames: 91
source: c338b18b4e1c17bb
---
@0-8
Three balloons: 2, 3 and 4. Bursting one earns its value times its current neighbours. The trap is to ask which balloon bursts first, because afterwards the two sides are not independent: they become neighbours. So flip it. Ask which balloon bursts last between two walls that stay standing. When that last balloon goes, everything else between the walls is gone, so its neighbours are exactly the walls. And before that, it stands between the two sides like a wall of its own, so neither side can see the other. The interval splits into two independent smaller intervals. To give the ends walls, we pad with a 1 on each side: positions 0 to 4 hold 1, 2, 3, 4, 1. The table best, of i and j, will hold the most coins from bursting everything strictly between positions i and j. It starts all zeros, which is right for neighbours with nothing between them.

@9-19
We fill intervals by their width, the gap between the walls, starting at 2, so each interval holds exactly one balloon. Walls at 0 and 2: the 1 and the 3, so the wall product is 3. The only balloon inside is the 2, which earns 3 times 2, which is 6. Best of 0 and 2 is 6.

@20-29
Walls at 1 and 3, the 2 and the 4: wall product 8. The 3 inside earns 24. That is the most valuable single burst in this row, and the table records it.

@30-39
Walls at 2 and 4, the 3 and the padding 1: wall product 3. The 4 inside earns 12.

@40-54
Now width 3: two balloons between the walls. Walls at 0 and 3, the padding 1 and the 4, so the wall product is 4. If the 2 bursts last, it earns 4 times 2, 8, plus the best for the interval to its right, the 24 we already have. That is 32. If the 3 bursts last, it earns 12, plus the 6 on its left, which is 18. The better is 32. Notice both halves were already in the table, because they are narrower. That is why we fill by width.

@55-68
Walls at 1 and 4, the 2 and the padding 1: wall product 2. With the 3 last, it earns 6, plus 12 for the 4 on its right: 18. With the 4 last, it earns 8, plus the 24 on its left: 32. Best is 32 again.

@69-87
The whole row: walls at 0 and 4, both padding, so the wall product is 1. Try each balloon as the very last burst. The 2 last: it earns 2, plus 32 for everything to its right: 34. The 3 last: 3, plus 6 on the left and 12 on the right: 21. The 4 last: 4, plus 32 on its left: 36. The best is 36.

@88-90
We return 36. Read the choices back: the 4 bursts last; before it, between the left wall and the 4, the 2 bursts last; and the 3 goes first. So the order is 3, then 2, then 4, earning 24, then 8, then 4. The cost is cubic: every interval tries every balloon inside it. The space is quadratic, and there is no rolling-array trick here, because every interval depends on smaller ones sharing either wall. The mistakes to avoid: thinking about the first burst, forgetting the padding, and filling rows in an order that reads a cell before it has been computed.
