---
problem: valid-parenthesis-string
args: ["(*))"]
frames: 31
source: 4a29bcbb684ac63d
---
@0
The string is an open bracket, a star, then two close brackets. A star can stand for an open bracket, a close bracket, or nothing. Here the star has to act as an open bracket, so that open, open, close, close balances. Without stars, one counter decides validity: the number of unmatched open brackets, which must never go negative and must end at zero. A star makes that count uncertain, but the possible counts always form an unbroken range, because each star moves a count by minus one, zero or plus one. So we track just the range: lo, the fewest unmatched openers possible, and hi, the most. Both start at zero.

@1-7
An open bracket. Every possibility gains an opener, so lo and hi both become 1. hi is not negative, and lo needs no clamping.

@8-14
The star. Read as a close bracket, it lowers the count to zero, so lo becomes zero. Read as an open bracket, it raises it, so hi becomes 2. The range is now zero to 2: every count in between is reachable.

@15-19
A close bracket. Both ends drop by one: lo to minus 1, hi to 1. hi is still at least zero, so some reading survives.

@20-21
Now the clamp. A count of minus 1 means an unmatched close bracket, which is not a real state. It came from reading the star as a close bracket, but that same star read as nothing gives a count of zero instead. So lo is raised back to zero. The range is zero to 1.

@22-28
The last close bracket. lo drops to minus 1 and is clamped to zero again. hi drops to zero, which is still allowed. If hi had gone below zero, even the most generous reading, every star an opener, would have a close bracket too many, and we would return false on the spot.

@29-30
The range has ended at zero to zero, so a count of zero is reachable, and the string is valid. The star was an open bracket.

One pass with two integers: linear time, constant space. Interviewers probe the two boundary rules. Treating a negative lo as failure is wrong: open, star, close is valid with the star as nothing, yet lo dips below zero. And skipping the check that hi is negative lets a string with too many early closers recover later, which it cannot. Counting stars against brackets is not enough either, because the order matters: a star before an opener can never close it.
