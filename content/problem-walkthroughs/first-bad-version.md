---
problem: first-bad-version
args: [[false, false, false, false, false, true, true, true]]
frames: 16
source: 84aa2de5f862da19
---
@0-1
Eight versions, numbered zero to 7. Versions zero to 4 are good, and from 5 on they are bad. Each check is expensive, a full build and test run, so scanning from the start is out. The array is monotone: good, good, good, then bad from some point on. Checking the middle tells you which side the boundary is on. If the middle is bad, the first bad version is the middle or earlier, so the middle stays in the window. If it is good, the first bad one is strictly after it. The invariant: the answer is always between lo and hi. Lo starts at zero, hi at 7.

@2-5
The middle of zero and 7 is 3. Version 3 is good, so the first bad version is after it. Lo moves to 4.

@6-9
The middle of 4 and 7 is 5. Version 5 is bad. That is a bad version, but not necessarily the first, so we do not return it. Hi moves to 5, keeping it in the window.

@10-13
The middle of 4 and 5 is 4. The division rounds down, so the middle is always below hi while lo is below hi, and the window always shrinks. Version 4 is good, so lo moves to 5. Now lo and hi are both 5, and the loop ends.

@14-15
We return 5, after three checks out of eight versions. Each check halves the window, so the number of checks is logarithmic: about 10 for a thousand versions, 31 for two billion. This is exactly what git bisect does.

This is the cleanest form of the first-true template, worth learning as one unit: loop while lo is below hi; on true, hi becomes mid; on false, lo becomes mid plus one; return lo. The bugs are all small changes to it: returning as soon as you see a bad version, which may not be the first; moving hi to one before the middle, which can skip the answer; and looping while lo is at most hi, which never ends once they meet.
