---
problem: longest-increasing-subsequence
args: [[3, 1, 8, 2, 5, 9, 4]]
frames: 32
source: 58225077318b10c1
---
@0-1
Seven numbers: three, one, eight, two, five, nine, four. The longest strictly increasing subsequence has length four, for example one, two, five, nine. The quadratic dynamic program looks back at every earlier element. This version is faster because it changes what it remembers. Tails, at position k, holds the smallest value that any increasing subsequence of length k plus one can end on. Why the smallest? A lower ending is easier to extend later. And tails is always sorted, so we can binary search it.

@2-5
Three arrives. Binary search for the first tail that is at least three. Tails is empty, so the position is zero, the end of the list. That means three extends the longest subsequence so far: append it. Tails is three.

@6-9
One arrives. The first tail at least one is at position zero, the three. So one replaces three. A subsequence of length one can now end as low as one, which is better for whatever comes next.

@10-13
Eight. Every tail is smaller, so the position is one, past the end. Append: tails is one, eight. There is an increasing pair, one then eight.

@14-17
Two. The first tail at least two is the eight, at position one. Replace it: a length-two subsequence can end on two, as in one, two, instead of eight. The length is unchanged, but the bar is lower.

@18-25
Five is bigger than every tail, so append: one, two, five. Nine too: one, two, five, nine. Length four. That lower bar paid off: five could extend one, two, but could never have extended one, eight.

@26-29
Four. The first tail at least four is the five, at position two. Replace it. Tails now reads one, two, four, nine. Careful: that is not a subsequence of the input, because the four comes after the nine. Tails is not one sequence. It records, for each length, the lowest possible ending. Replacing five with four says a length-three subsequence can now end at four, which would help a later five or six.

@30-31
We return the length of tails: four.

Each element costs one binary search, so the time is n log n, against n squared for the table version, and space is the length of the answer. The classic mistakes: using bisect right, which lets equal values append and counts five, five, five as length three; reporting tails as the subsequence itself; and, in the quadratic version, returning the last entry instead of the maximum, since the longest subsequence can end anywhere.
