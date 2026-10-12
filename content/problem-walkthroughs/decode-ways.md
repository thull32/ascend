---
problem: decode-ways
args: ["2101"]
frames: 29
source: 296b12bddb08be53
---
@0-1
The digits are 2, 1, 0, 1, and we count how many letter messages could have produced them, where 1 is A and 26 is Z. The zero is what makes this example interesting. Ask how the last letter was formed: from the last digit alone, or from the last two digits together. Those cases never overlap, so the count for a prefix is the count one digit back, if the last digit can stand alone, plus the count two digits back, if the last two form a number from 10 to 26. We only ever need the last two counts. One back starts at one: the empty prefix has exactly one decoding, the empty message. Two back starts at zero and is never used before it is set.

@2-7
The first digit, 2. It is not a zero, so it can be a letter alone, B: add one back, which is one. There is no pair yet. One decoding so far. Then the window slides: two back becomes one, and one back becomes one.

@8-14
The second digit, 1. It can stand alone, so add one back: one. And the pair 2 1 is between 10 and 26, so it can be the letter U: add two back, another one. Two decodings: B A, or U. The window slides: two back is 1, one back is 2.

@15-20
The third digit, the zero. A zero cannot be a letter on its own, so the one-digit branch adds nothing. The pair 1 0 is 10, the letter J, so we add two back, which is one. The total is one. Look at what just happened: the two decodings of 2 1 are gone, because the 1 is needed to pair with the zero. Only 2 then 10 survives. Now two back is 2 and one back is 1.

@21-26
The last digit, 1. It can stand alone: add one back, which is one. The pair 0 1 has a leading zero, so the string comparison against 10 rejects it. That check matters: read as a number, 0 1 is just 1, which would wrongly count as a letter. One decoding.

@27-28
We return 1: the message B, J, A. One pass with two numbers, so linear time and constant space. The shape is the same as climbing stairs, with conditions on each step.

Three mistakes to avoid. Treating zero like any other digit, which makes 10 decode two ways instead of one. Accepting a leading zero in the pair. And bailing out the moment you see a zero: 2101 is perfectly valid. Only a zero that cannot pair is fatal, and the counts discover that by themselves, because the count drops to zero and stays there.
