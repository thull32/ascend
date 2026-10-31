---
problem: routing-loop-detect
args: ["gw1", [["leaf1", "spine1"], ["spine1", "leaf2"], ["leaf2", "spine1"]]]
frames: 75
source: 56299e48c8616c68
---
@0
A microloop, caught mid-convergence. Traffic is headed for gateway 1. Spine 1 has just reconverged and hands the packet down to leaf 2; leaf 2 has not heard the news and sends it back. Leaf 1 points at spine 1 too. Each router has at most one next hop, so a packet's path is fully determined, and it can only end three ways: at the destination, at a router with no route, or in a cycle. The insight is that a router's fate is its next hop's fate. Remember fates as you find them, and the only thing left to detect is the loop: a walk that comes back to a router on itself.

@1-8
First, a dictionary from each router to its next hop. Then the set of every router named anywhere, as a router or as a next hop, so a router with no entry of its own still gets classified. Here that is leaf 1, leaf 2 and spine 1. The destination is removed from the set, so nobody ever starts a walk there.

@9-10
The outcome dictionary is seeded with the destination as delivered. A walk stops the moment it reaches the destination, so any stale entry the destination carries is never followed. The list of cycles starts empty.

@11-17
The routers are taken in sorted order, so leaf 1 goes first. Every walk starts with a fresh path and a fresh position map, which records each router's index on this walk. The outcome dictionary, by contrast, is shared by every walk. Leaf 1 is not finished, not on the path, and not missing, so it goes in at index 0, and we step to its next hop, spine 1.

@18-25
Spine 1 is new too: index 1, and on to leaf 2. Leaf 2 goes in at index 2, and its next hop is spine 1 again.

@26
The loop condition checks three things, and the third one fails: spine 1 is already in the position map, on the walk we are doing now. Not a router seen before, but one on this very walk: we have closed a cycle.

@27-29
So this is the cycle branch. The cycle is the path from spine 1's index onward: index 1 to the end, which is spine 1, then leaf 2. Leaf 1, at index 0, is the tail. Its packets loop, but it is not part of the loop.

@30-31
The cycle must start at its smallest name and stay in forwarding order, so we rotate it rather than sort it. The smallest name, leaf 2, sits at index 1, so the cycle becomes leaf 2, then spine 1. In a longer loop, sorting would scramble the order.

@32-39
The fate is loop, and every router on the path gets it: leaf 1, spine 1 and leaf 2. One walk classified all three.

@40-47
The next start is leaf 2. Its walk gets a fresh path and position map, but leaf 2 is already in the outcome dictionary, so the loop body never runs. The walk is empty and simply inherits the fate it found, loop. This shortcut is what makes the solution linear.

@48-56
Spine 1 goes the same way: already classified, an empty walk, done.

@57-74
Last, the answer. The single cycle is leaf 2, spine 1. Every router whose outcome is loop goes in the looping list, sorted: leaf 1, leaf 2, spine 1. Nobody is black-holed, so that list is empty.

Each router enters a path exactly once over the whole run, so the walks are linear in the number of routers, and sorting the output dominates at n log n. The classic mistake is a single visited set doing two jobs. Reaching a router from an earlier walk is a known answer, not a loop; only a router on the current walk closes a cycle. That is why the position map is reset for every start while the outcome dictionary is shared. The other traps: forgetting routers that appear only as a next hop, following the destination's own entry, putting the tail into the cycle, and a recursive version that overflows the stack on a long chain.
