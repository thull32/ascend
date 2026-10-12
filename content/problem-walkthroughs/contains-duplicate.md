---
problem: contains-duplicate
args: [[3, 1, 4, 1, 5]]
frames: 14
source: f471bbd6be872b73
---
@0-1
Five numbers: 3, 1, 4, 1, 5. Does any value appear twice? Comparing every pair is quadratic. But look at what the inner loop of that brute force really asks: have I seen this value before? That is a membership question, and a hash set answers it in constant time on average. So we walk the array once, carrying a set of the values seen so far. It starts empty.

@2-4
The first value is 3. It is not in the set, so we add it. The set holds 3.

@5-7
Next, 1. Not seen yet, so it goes in. The set holds 1 and 3.

@8-10
Then 4. Also new. The set now holds 1, 3 and 4.

@11-13
Then 1 again, and this time the set already holds it. We return true straight away. Notice that the 5 is never even looked at. That early return is the practical advantage over the one-liner that builds a set of everything and compares its size with the array's length: that version is correct, but it always does the full pass.

The cost is linear time on average and linear space in the worst case, when every value is distinct. If memory is the constraint, sort in place instead: duplicates end up next to each other, so one scan comparing neighbours finds them, at n log n time and no extra space. Interviewers like hearing both. The mistake to avoid is calling count inside the loop, which quietly makes the whole thing quadratic again.
