---
problem: partition-labels
args: ["abcabdefgfe"]
frames: 56
source: 3829b9a7b7a3db84
---
@0
The string is A, B, C, A, B, D, E, F, G, F, E. Cut it into as many parts as possible so that each letter appears in only one part. The insight: a letter owns the span from its first appearance to its last, and any part that contains it must contain that whole span. So as we scan, the current part has to stretch at least to the furthest last appearance of any letter we have seen in it. The moment the scan reaches that point, every letter in the part is finished, and we can cut.

@1-12
First, one pass to record each letter's last position. Later positions overwrite earlier ones, so A ends at 3, B at 4, C at 2, D at 5, G at 8, F at 9 and E at 10.

@13-16
The part starts at 0, and so does its end. Position 0 is an A, whose last appearance is 3, so the part must reach at least position 3.

@17-19
Position 1 is a B, which lasts until 4. The end stretches to 4.

@20-25
Position 2 is a C, which ends at 2. Here is the line to get right: the end is the larger of the current end and C's last position, so it stays at 4. Overwriting it with 2 would shrink the part and split the B. Position 3 is the last A, and the end is still 4.

@26-31
Position 4 is the last B, and the scan has caught up with the end. Every letter in the part has appeared for the last time, so we cut. The part runs from 0 to 4: size 5. The next part starts at 5.

@32-36
Position 5 is a D, the only one. Its end is 5, the scan is already there, and we cut a part of size 1. Next start: 6.

@37-38
Position 6 is an E, and the last E is at 10, at the very end of the string. The end jumps to 10.

@39-50
F, G and F all end before 10, so the end stays put. At position 10, the last E, the scan catches up.

@51-55
Cut a part of size 5, from 6 to 10, and return 5, 1, 5. Cutting at the first legal moment is always optimal: any earlier cut would split some letter's span, and any later one can only merge parts. Two passes over the string make it linear, and the table holds at most 26 letters.
