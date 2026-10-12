---
problem: sqrt-x
args: [8]
frames: 23
source: a035984965adb294
---
@0
We want the square root of 8, rounded down, which is 2. Rephrase it: find the largest whole number r whose square is at most 8. The test "r squared is at most 8" is true for 0, 1 and 2, then false for every larger r. A yes, yes, yes, then no, no, no pattern is exactly what binary search finds. Here we want the last yes. The simplest way to get that right is to remember every probe that passed. The search range is zero to 8.

@1-5
answer starts at zero. The first middle is 4. 4 squared is 16, more than 8, so 4 and everything above it fail. hi drops to 3.

@6-10
The range is zero to 3, and the middle is 1. 1 squared is 1, which is at most 8, so 1 works. We record it as the answer so far, and look for something larger: lo moves to 2.

@11-15
The range is 2 to 3, and the middle is 2. 4 is at most 8, so 2 works too. The answer becomes 2, and lo moves to 3.

@16-19
The range is just 3. 3 squared is 9, more than 8, so it fails, and hi drops to 2.

@20-22
lo has passed hi, so the search is over. We return the last value that passed: 2. We never needed to work out which pointer ends where, because the answer was written down the moment it was proven.

The loop runs about log of x times, roughly 31 iterations at the top of the 32 bit range, with constant space. Three mistakes come up. In Java, C or Go, the square of mid overflows a 32 bit integer once mid passes about 46 thousand, so use a 64 bit product, or compare mid with x divided by mid. Python's integers never overflow, and saying so out loud is expected. Starting lo at 1 mishandles x equal to zero. And returning lo after the loop instead of the recorded answer is off by one. For speed in practice, Newton's iteration converges much faster, doubling the correct digits each step.
