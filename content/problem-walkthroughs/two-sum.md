---
problem: two-sum
args: [[3, 2, 4], 6]
frames: 14
source: 78807cc35129ebea
---
@0
Which two positions in 3, 2, 4 hold numbers that add up to 6? The answer is positions 1 and 2, the 2 and the 4. Checking every pair works, but it is quadratic. The insight: for each number, the inner loop of the brute force is only asking one question, "have I already seen the number that completes this one?" That is a membership check, and a hash map answers it in constant time. So we walk once, mapping each value to its position.

@1-4
Position zero, the 3. It needs a partner of 6 minus 3, which is 3. Is 3 already in the map? No, the map is empty. Only after that check do we store 3 at position zero.

@5-8
This is the moment that order matters. If we had stored the 3 before checking, the lookup for 3 would have found the 3 itself, and we would have returned position zero twice, a number paired with itself. Checking first guarantees the partner is a different, earlier position. Next, position 1, the 2. It needs 4. Not in the map, so we store 2 at position 1.

@9-11
Position 2, the 4. It needs 2, and 2 is in the map, stored at position 1.

@12-13
We return 1 and 2: the stored, earlier position first, then the current one.

One pass with a constant time lookup per element: linear time, and the map takes linear space. The mistakes are inserting before checking, which pairs the 3 with itself in exactly this example, and returning values instead of positions. If the input were sorted, two pointers from the ends would do it in constant space.
