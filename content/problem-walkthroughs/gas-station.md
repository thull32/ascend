---
problem: gas-station
args: [[3, 1, 4, 2], [2, 3, 1, 3]]
frames: 28
source: edc0555b796b0bc2
---
@0-3
Four stations on a loop. The gas you collect at each is 3, 1, 4 and 2, and the legs out of them cost 2, 3, 1 and 3. Where can you start and drive the whole circle? Simulating from every station is quadratic. Two facts make it one pass. First, the totals decide whether any start works: if the whole loop burns more than it collects, nothing can succeed. Second, a failure rules out a whole range. If you start at s and first run dry leaving station j, then every start between s and j fails too, because you reached each of them with at least zero in the tank, and starting there means arriving with exactly zero. So the next start worth trying is j plus 1. We keep the total over the whole loop, the tank since the current candidate start, and the candidate itself, station zero.

@4-8
Station zero: collect 3, spend 2, a net of plus 1. The total is 1, and the tank is 1. Still going.

@9-12
Station 1: collect 1, spend 3, a net of minus 2. The total drops to minus 1, and the tank drops to minus 1. The tank has gone negative on the leg out of station 1.

@13-15
So neither station zero nor station 1 can be the start. The candidate jumps to station 2, past the station that broke the tank, not to it, and the tank resets to zero. Resetting to station 1 instead is a classic slip: it is inside the range we just ruled out.

@16-19
Station 2: collect 4, spend 1, plus 3. The total is 2, and the tank is 3.

@20-25
Station 3: collect 2, spend 3, minus 1. The total is 1, and the tank is 2. Still not negative, so station 2 survives to the end of the sweep.

@26-27
Now the check that makes the answer valid: the total over the whole loop is 1, which is not negative, so a full lap is possible, and the surviving candidate, station 2, is the start. We never simulate the wrap-around back to stations zero and 1; the non-negative total guarantees it works. From station 2 the tank reads 3, 2, 3, 1 after each leg.

One pass, three numbers: linear time and constant space. The mistakes: returning the candidate without checking the total, so a loop with too little gas still gets an answer; resetting the start to the failing station instead of the one after it; and treating an empty tank as failure, when arriving with exactly zero is allowed.
