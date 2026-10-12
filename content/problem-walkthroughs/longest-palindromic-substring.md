---
problem: longest-palindromic-substring
args: ["abaab"]
frames: 84
source: 32379f0b4e3ab5f1
---
@0-1
The string a b a a b. What is its longest palindromic substring? The table version of this problem says a substring is a palindrome when its two ends match and its inside is a palindrome. So every palindrome grows outward from its centre, one character on each side at a time. This version skips the table and grows each palindrome directly. There are two kinds of centre: a character, for odd lengths, and the gap between two characters, for even lengths. Five characters give nine centres. The best so far is the first character alone: start zero, length one.

@2-9
Centre zero is the first character, a. Low and high both start on it, and a character always matches itself. Then we step outward: low falls off the left end, so the expansion stops. The loop always overshoots by one on each side, so the length is high minus low minus one: one. Not better than one.

@10-15
Centre one is the gap between a and b. Low is zero, high is one, and a does not match b, so this centre grows nothing. Length zero.

@16-28
Centre two is the b. It matches itself, then we step out to the a on each side, and they match. Step out again and low falls off the edge. The loop stopped at minus one and three, so the length is three: a b a. That beats one, so the best is start zero, length three.

@29-34
Centre three is the gap between b and a. They differ, length zero.

@35-43
Centre four is the first of the two middle a's. One step out finds b on the left and a on the right. No match, so length one.

@44-56
Centre five is the gap between the two a's. This is the even case. The two a's match, so we step out, and the b's on either side match too. Then high runs off the end. The length is four: b a a b. That beats three, so the best is now start one, length four. An expansion that only used characters as centres would never find this one.

@57-80
The remaining centres are short. The last a reaches only itself, because b and a differ; the gap between a and b grows nothing; and the final b is a palindrome of one.

@81-83
We return the slice from position one, four characters long: b a a b.

Each of the two n minus one centres expands at most n steps, so the worst case is n squared, on a string of one repeated letter. But most expansions stop after a comparison or two, and the extra space is constant. The classic mistakes: forgetting the even centres, which misses b a a b and noon; confusing substring with subsequence; and reversing the string and taking the longest common substring, which can match something that is not a palindrome at all.
