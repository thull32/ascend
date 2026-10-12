---
problem: minimum-window-substring
args: ["AABCB", "ABC"]
frames: 58
source: 01b6a81e32ce6628
---
@0
The string is A, A, B, C, B, and we want the shortest window that contains A, B and C. The insight is that a good window stays good if you grow it, so two edges, both moving forward, are enough. Push the right edge until the window covers everything, then pull the left edge in for as long as it still covers everything, recording the length. The bookkeeping that makes the check instant is one counter, formed: how many distinct characters of the target have their required count met.

@1-9
First count what we need: one A, one B, one C. Three distinct characters are required.

@10-15
The window's counts start empty, formed is zero, the best length is infinity, and the left edge is at zero.

@16-20
The right edge takes the first A. Its count reaches one, which equals what we need, so formed becomes one.

@21-24
The second A. Its count goes to two. This is the first place bugs live: formed only goes up at the moment a count reaches the requirement, exactly equal, not every time it goes past it. Two equals one is false, so formed stays at one. A greater-or-equal test here would count the A twice and call the window good too early.

@25-29
B arrives. Its count reaches one, and formed becomes two.

@30-33
C arrives, formed becomes three, which is everything required. The window A, A, B, C is good.

@34-37
Its length is four, better than infinity, so we record length four starting at zero. Now shrink.

@38-41
The first A leaves. Its count drops to one. The second place bugs live: formed only goes down when a count drops below the requirement, and one is not below one. A surplus copy left, so the window is still good, and the left edge moves to one.

@42-45
The window A, B, C has length three, which beats four. Best is now length three, starting at one.

@46-50
The next A leaves. Its count drops to zero, which is below one, so formed falls to two. The window is no longer good, and shrinking stops with the left edge at two.

@51-55
The right edge takes the last B. B's count goes to two, which is not equal to one, so formed stays at two, still short of an A. The string ends.

@56-57
We return the slice of length three starting at one: A, B, C. Each edge moves forward at most n times and each move is constant work, so the time is linear. Notice we stored a start and a length, not the string, and slice only once at the end. Building the answer inside the loop can turn the whole thing quadratic.
