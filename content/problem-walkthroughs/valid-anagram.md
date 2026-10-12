---
problem: valid-anagram
args: ["aab", "abb"]
frames: 22
source: 2e07e303e0f033cb
---
@0
Is a, b, b an anagram of a, a, b? Same letters, same length, but no: the counts differ. Two strings are anagrams exactly when every letter appears the same number of times in both. Sorting both strings and comparing works, but it does more than needed, since order does not matter, only counts. So we build a count for the first string, then spend it down with the second. If any count would go below zero, the second string asked for a letter the first could not supply. The lengths match here, three and three, so we carry on.

@1-8
Count the first string: a twice, b once.

@9-12
Now spend. The first letter of the second string is a. Its count drops from 2 to 1, still fine.

@13-16
Next, b. Its count drops from 1 to 0. Still fine: the one b of the first string has been used.

@17-21
The last letter is another b. Its count would drop to minus 1. The second string wants a second b that the first string does not have, so we return false immediately, without looking at anything else.

Why is the length check needed? Because the spending loop only catches letters the second string has too many of. If the second string were shorter, nothing would go negative. With equal lengths, if nothing went negative, nothing can be left over either, so true is safe. Time is linear, and space is the number of distinct letters, a fixed size for a fixed alphabet. Building two counters and comparing them is also correct, but it cannot exit early the way this does. For Unicode, normalise first, because one accented letter can be written as one code point or two.
