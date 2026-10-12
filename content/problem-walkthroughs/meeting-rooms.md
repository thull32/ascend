---
problem: meeting-rooms
args: [[[10, 12], [1, 3], [3, 10], [9, 11]]]
frames: 15
source: 7047059e8f30da8b
---
@0
Four meetings, out of order: 10 to 12, 1 to 3, 3 to 10, and 9 to 11. Can one person attend them all? Checking every pair would work, but there is a better idea. Sort by start time, and then any overlap must show up between neighbours. So one comparison per meeting, against the one just before it, settles the whole question.

@1-9
The first line sorts by start. The key function is called once per meeting and hands back its start: 10, 1, 3 and 9. Sorted, the meetings read 1 to 3, 3 to 10, 9 to 11, and 10 to 12.

@10
Now walk from the second meeting on. At position 1, the meeting 3 to 10 starts at 3, and the one before it ends at 3. Is 3 less than 3? No. Back to back is fine, because the intervals are half-open: the first meeting is over at the very moment the second begins.

@11-12
Position 2 is the meeting 9 to 11. It starts at 9, but the meeting before it runs until 10.

@13
9 is less than 10, so these two overlap, and we return false straight away, without looking at the meeting 10 to 12.

@14
Why is the neighbour enough? After sorting, if every meeting starts no earlier than the previous one ends, each meeting starts after all the earlier ones have finished, so no pair anywhere can clash. The cost is the sort, n log n, then a linear scan. The mistake to avoid is less than or equal in the comparison, which would wrongly reject the back-to-back pair we passed at 3.
