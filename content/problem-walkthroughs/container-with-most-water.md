---
problem: container-with-most-water
args: [[1, 8, 6, 2, 5, 4, 8, 3, 7]]
frames: 45
source: bf8146f936855ece
---
@0-2
Nine lines, with heights 1, 8, 6, 2, 5, 4, 8, 3 and 7. A container is two lines; it holds the distance between them times the shorter one. Trying every pair is quadratic. Instead, start with the widest container, the two ends, and walk inward. The rule that makes it work: always move the shorter line. Every container that keeps the shorter line and pulls the other end in is narrower and can be no taller than that shorter line, so none of them can beat what we just measured. The shorter line is finished, and we can throw it away. Lo starts at zero, hi at 8, and best at zero.

@3-7
The ends: heights 1 and 7. The shorter is 1, and the width is 8, so this holds 8. Best is 8. The left line, height 1, is shorter, so it is done: every narrower container using it holds less than 8. Lo moves to 1.

@8-12
Now heights 8 and 7, width 7. The shorter is 7, so the area is 49. Best becomes 49. This time the right line is shorter, so hi moves in to 7.

@13-17
Heights 8 and 3, width 6. The shorter is 3: 18, no better. The right is shorter again, so hi moves to 6.

@18-22
Heights 8 and 8, width 5: 40. A tie. Moving either pointer is safe, because the same bound applies to both lines. The code moves lo, to 2.

@23-27
Heights 6 and 8, width 4: 24. The left is shorter, so lo moves to 3.

@28-42
The rest is quick. Height 2 against 8 at width 3 holds 6. Height 5 at width 2 holds 10. Height 4 at width 1 holds 4. None comes near 49, and each time the left line is shorter, so lo walks right until it meets hi.

@43-44
We return 49: the lines at positions 1 and 8, heights 8 and 7, seven apart. Each step discards one line for good, so this is linear time and constant space, against quadratic for every pair.

The interviewer will ask you to prove it never skips the best pair. The proof is the sentence from the start: any container that keeps the shorter line and moves the other end inward is narrower and no taller, so it is already beaten. The mistake is moving the taller line, or moving whichever side looks promising. The argument only holds for the shorter one.
