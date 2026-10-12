---
problem: permutation-in-string
args: ["ab", "eidbaooo"]
frames: 96
source: e0f8a7993edc6410
---
@0
Does the string E, I, D, B, A, O, O, O contain some rearrangement of A, B? A rearrangement is a window of the same length with the same letter counts. The window has a fixed size, two here, so when it slides one step, one letter enters, one letter leaves, and everything else stays the same. We keep the counts up to date in constant time per slide. And instead of comparing all 26 counts each time, we track one number, matches: how many of the 26 letters have exactly the count we need.

@1-10
The pattern is not longer than the text, so we start. Two arrays of 26 counts: need, from the pattern, holds one A and one B. Have, from the first window of the text, holds one E and one I.

@11-62
Now count the letters whose counts agree. A and B are needed but absent; E and I are present but not needed. The other 22 letters are zero in both. So matches starts at 22, short of 26.

@63-69
Slide. D enters and E leaves. D's count goes from zero to one, but we need zero. It was matching and now it is off by one, so matches drops to 21.

@70-74
E's count drops back to zero, which is what we need. It was off and is now right, so matches climbs back to 22. The window is I, D.

@75-79
Slide again. B enters. Its count reaches one, exactly what we need: matches 23.

@80-84
I leaves, and its count returns to zero: matches 24. The window is D, B.

@85-89
Slide again. A enters and reaches the one we need: matches 25.

@90-95
D leaves and returns to zero: matches 26. Every letter agrees, so the window B, A is a rearrangement of A, B, and we return true. The rules are the part to get right: matches goes up when a count becomes exactly right, goes down when it was right and now is off by one, and otherwise stays. A slide touches two letters, so each step is constant work, and the whole scan is linear. The classic mistake is checking for 26 before the leaving letter has been removed, which tests a window one letter too long.
