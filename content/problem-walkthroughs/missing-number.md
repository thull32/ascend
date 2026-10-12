---
problem: missing-number
args: [[3, 0, 4, 1]]
frames: 13
source: 8f67e594ad537014
---
@0
The array is 3, 0, 4, 1. It has four slots, so it should hold every number from 0 to 4, and one is missing. You know exactly what the complete set looks like, so compare an aggregate of the full range with the same aggregate of the array. The one used here is exclusive or. Anything combined with itself cancels to zero, so if we fold in every index and every value, each number that is present shows up twice and vanishes, and the missing one is left alone.

@1-2
The indices only run from 0 to 3, so the accumulator starts at 4, the one number in the range that has no slot.

@3-4
Index 0 holds 3. Fold in both. Think of the accumulator as holding the numbers that are still unmatched: so far 4 and 3, and neither has a partner. As a single number that is 7, but the set is what matters.

@5-6
Index 1 holds 0. The index brings in a 1, and the value 0 changes nothing, because exclusive or with zero is a no-op. Unmatched: 4, 3 and 1, which the accumulator shows as 6.

@7-8
Index 2 holds 4. The value 4 meets the 4 we started with, and the pair cancels. The index 2 joins the unmatched set: 3, 1 and 2. Those three happen to combine to 0, so the accumulator reads zero, though it is not empty.

@9-10
Index 3 holds 1. The index 3 cancels the value 3 from the first slot, and the value 1 cancels the index 1. Only 2 is left, and the accumulator reads 2.

@11-12
We return 2, the number that appeared only once, as an index, never as a value. One pass, constant space, and unlike the sum formula, exclusive or never carries, so it cannot overflow in a language with fixed-size integers. The classic mistake is forgetting to seed with n. Without it, when the top number itself is missing, the loop never sees it and returns zero.
