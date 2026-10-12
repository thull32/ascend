---
problem: smallest-range-k-lists
args: [[[1, 5, 8], [4, 12], [7, 8, 10]]]
frames: 49
source: a93580e7c5035c43
---
@0
Three sorted lists: 1, 5, 8, then 4, 12, then 7, 8, 10. We want the narrowest range that contains at least one number from every list. Picture one pointer per list. The pointed-at numbers always form a valid range, from their minimum to their maximum. To find a narrower one, you must raise the low end, and the only way to do that without dropping a list is to advance the pointer that holds the minimum. A min heap finds that minimum quickly, and hi tracks the largest number pointed at.

@1-13
Every pointer starts at the front of its list: 1, 4 and 7. Each goes into the heap with its list and position, and hi becomes 7. After heapify, the smallest, 1, is on top. The first candidate is 1 to 7, width 6, and it is the best so far.

@14-21
Pop the minimum, 1, from list zero. The range 1 to 7 is not narrower than the best, since it is the best. List zero has more, so its pointer moves to 5. hi stays 7, because 5 is smaller. 5 goes into the heap.

@22-29
Pop 4, from list one. The pointers now cover 4, 5 and 7, so the range is 4 to 7, width 3. That is narrower than 6, so it becomes the best. List one's next number is 12, so hi jumps to 12, and 12 goes into the heap.

@30-36
Pop 5. The range is 5 to 12, width 7. Not better. List zero moves on to 8.

@37-43
Pop 7, from list two. The range 7 to 12 is width 5. Still not better than 3. List two moves on to its own 8.

@44-48
Pop 8 from list zero. The range 8 to 12, width 4, does not beat 3. And list zero has nothing after 8. That is the stopping rule: raising the low end any further would mean dropping list zero entirely, so no later range can be valid. We return 4 to 7.

The comparison uses strictly less than, which is the tie break: low ends are visited in increasing order, so the first range of a given width has the smallest low end, and later ranges of equal width never replace it. Each number is pushed and popped once, so time is the total count of numbers times log of the number of lists, and the heap holds one entry per list. The mistakes are using less than or equal, which breaks the tie rule, and skipping an exhausted list and carrying on, which produces ranges that no longer cover every list.
