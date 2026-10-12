---
problem: reorganize-string
args: ["aaabb"]
frames: 39
source: 65ef444782809716
---
@0
We are rearranging a, a, a, b, b so that no two neighbours match. The greedy rule is the whole solution: at every step, write the letter with the most copies left, except the one you just wrote. The letter you hold back gets one turn off, then goes back into the running. First we count the letters: three a's and two b's.

@1
Before any building, the feasibility check. A letter can appear at most half the length, rounded up, times. Five letters, so the limit is three. a appears exactly three times, which just fits, so we carry on. Four a's would return the empty string right here.

@2-5
Next a heap of count and letter pairs. Python's heap pops the smallest item, so the counts are stored negated: minus three for a, minus two for b. The most frequent letter now sits at the top.

@6-8
The output starts empty, and nothing is held back yet.

@9-12
First round. We pop a, the letter with three copies, and write it. There is nothing held to put back. Then a is held out with one copy fewer: minus two, so two a's remain.

@13-18
Second round. The heap only offers b, which is the point: a cannot be popped twice in a row, because it is not in the heap. We write b, giving a, b. Now the held a has copies left, so it goes back into the heap, and b takes its place in the holding spot with one copy remaining.

@19-24
Third round. The heap holds a with two copies, so we write a: a, b, a. The held b goes back, and a is held with one copy left.

@25-30
Fourth round, the same dance. Pop b, write it: a, b, a, b. Push the held a back in, and hold b. Its count is now zero, meaning no copies of b remain.

@31-35
Fifth round. Pop the last a and write it: a, b, a, b, a. This time the check on the held letter fails: b's count is zero, so it is dropped rather than pushed back. That check is what lets letters leave the game for good.

@36-38
The heap is empty, so the loop ends, and we join the letters: a, b, a, b, a. No two neighbours match, and every letter was used.

Why can the greedy never get stuck? The only letter ever held back is the one just written, and the up-front check guarantees there is always another letter available to separate it from itself. Time is n log k for k distinct letters, which is linear for a fixed alphabet, and the heap never holds more than k entries. The classic mistakes are pushing the letter you just used straight back into the heap, which lets the leader be popped twice in a row, and writing the check as more than half the length rounded down: then a, a, b would be wrongly rejected.
