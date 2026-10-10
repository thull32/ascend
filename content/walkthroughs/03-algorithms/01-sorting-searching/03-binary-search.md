---
lesson: binary-search
viz: Binary search for 12
frames: 3
source: 8413b183f5397cbe
---
@0
Here are eight sorted numbers: 1, 3, 4, 7, 9, 12, 15 and 20, and we are looking for 12. Two markers, low and high, start at the two ends. Hold onto one sentence, because it is the whole algorithm: if 12 is anywhere in this array, it is between low and high. Every step must keep that sentence true while the range shrinks.

@1
We look at the middle element. Between positions 0 and 7 the middle is position 3, which holds 7. Seven is less than 12, and the array is sorted, so 12 cannot be at position 3 or anywhere to its left. Low moves to position 4. Four elements are gone after a single comparison, and the sentence still holds: if 12 is here, it is between positions 4 and 7.

@2
The new middle is position 5, which holds 12. Found, after 2 comparisons. Each probe halves the range, so the worst case for eight elements is 4 probes: three halvings to get down to one element, and one comparison to check it. A billion elements would take about 30. That logarithm is why binary search is the first tool to reach for whenever the data is sorted, or whenever a yes-no question flips exactly once along a range.
