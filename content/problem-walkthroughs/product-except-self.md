---
problem: product-except-self
args: [[2, 3, 0, 4]]
frames: 32
source: 42e9a0c01a50eb4d
---
@0
The array is 2, 3, 0, 4. For each position we want the product of every other element, without division. Dividing the total by each element would break on that zero anyway. The insight: everything except position i is the product of everything to its left times the product of everything to its right. Both are running products, one from each end. We store the left products in the output, then sweep back from the right with a single running number.

@1-4
The output starts as all ones, and the running product of nothing is 1. Position 0 has nothing to its left, so it gets 1.

@5-7
Now the running product takes in the 2. Position 1 gets 2, the product of everything to its left. The order matters: write first, then multiply. The other way round would put each element into its own product.

@8-10
The running product becomes 2 times 3, which is 6, and position 2 gets 6.

@11-15
Now the 0 goes into the running product, which becomes zero. Position 3 gets 0, because the zero is to its left. No special case: the arithmetic does it. The left pass is done: 1, 2, 6, 0.

@16-19
The right pass starts again from 1. Position 3 has nothing to its right, so its value is multiplied by 1 and stays 0. Then the running product takes in the 4.

@20-22
Position 2 holds 6, the product to its left, and the running product is 4, the product to its right. 6 times 4 is 24, the product of 2, 3 and 4. This is the one position whose answer skips the zero.

@23-29
The running product takes in the zero and stays zero from now on, so positions 1 and 0 both become zero.

@30-31
We return 0, 0, 24, 0. Two linear passes, and apart from the output, a single running number of extra space. The prefix idea needs no counting of zeros: one zero leaves only its own position non-zero, as here, and two zeros would make everything zero. The classic slip is the off-by-one in the left pass, multiplying before writing.
