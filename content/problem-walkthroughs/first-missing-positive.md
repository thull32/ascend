---
problem: first-missing-positive
args: [[3, 1, -1, 1]]
frames: 22
source: f744d4f9580f5fc9
---
@0-1
The array is 3, 1, minus 1, 1, and we want the smallest positive number missing from it, in linear time and constant extra space. Two observations. With four elements, the answer is between 1 and 5: if 1 to 4 are all present it is 5, otherwise something from 1 to 4 is missing. So anything below 1 or above 4 is irrelevant. And the values that matter, 1 to 4, line up with the four positions: value v has a natural home at position v minus 1. The array itself can be the hash table. Move every useful value home, then scan for the first position whose occupant is wrong.

@2-6
Position zero holds 3. It is in range, and its home, position 2, does not already hold a 3, so we swap it there. Position zero now holds minus 1, which is out of range, so the inner loop stops. The array is minus 1, 1, 3, 1.

@7-11
Position 1 holds 1, whose home is position zero. Swap: the 1 goes home, and the minus 1 lands at position 1, where it stops the loop. The array is 1, minus 1, 3, 1.

@12-13
Position 2 holds 3, which is already home. Nothing to do.

@14-15
Position 3 holds the second 1. It is in range, but its home, position zero, already holds a 1. This is the duplicate guard, and it is the line that matters most. Without it, we would swap a 1 with a 1, nothing would change, and the loop would spin forever. The guard asks not "am I at home" but "does my home already hold the right value", and that counts as done.

@16-21
Now the scan. Position zero holds 1, correct. Position 1 should hold 2, but it holds minus 1. So 2 is missing, and we return it.

The nested loop looks quadratic, but each swap puts one value in its home for good, so there are at most n swaps over the whole run. Time is linear, extra space constant. The mistakes: the infinite loop on duplicates; checking only the upper bound and then indexing with a negative value, which Python quietly allows; recomputing the home after the swap has already changed the value; and forgetting that if everything from 1 to n is present, the answer is n plus 1.
