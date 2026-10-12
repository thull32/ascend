---
problem: palindromic-substrings
args: ["abba"]
frames: 57
source: d228074310643e5f
---
@0
The string is A, B, B, A. How many of its substrings are palindromes? Palindromes nest: a string is one exactly when its ends match and the inside is one. So instead of checking every substring from scratch, stand at a centre and expand outwards, one character on each side, counting a palindrome at every successful step. There are two kinds of centre: each character, for odd lengths, and each gap between characters, for even lengths. Four characters give seven centres.

@1-10
Centre 0 is the first character. Low and high both start on it. A single A matches itself: count 1. Expanding moves low off the left end, so we stop.

@11-14
Centre 1 is the gap between A and B. Low is 0 and high is 1, and A does not match B. Nothing to count, and no point expanding further.

@15-22
Centre 2 is the first B: count 2. Expanding compares the A on the left with the second B on the right. No match.

@23-29
Centre 3 is the gap between the two Bs. This is the centre that matters. B matches B: the pair B, B is a palindrome, count 3. Expand: A on the left, A on the right.

@30-34
They match too, so the whole string, A, B, B, A, is a palindrome: count 4. Low runs off the left end, and we stop. A solution that only expanded around characters would never find these two, and would answer 4 instead of 6.

@35-42
Centre 4 is the second B: count 5. Its neighbours, B and A, differ.

@43-46
Centre 5 is the gap between B and A. No match.

@47-54
Centre 6 is the last A: count 6. High runs off the right end.

@55-56
We return 6: four single letters, B B, and the whole string. Each successful step counts exactly one palindrome, so the work is the answer plus one failed check per centre. That is n squared in the worst case, a string of one repeated letter, where the answer itself is that large, and constant extra space. The other classic mistake is counting distinct strings with a set: A, A, A has six palindromic substrings, not three.
