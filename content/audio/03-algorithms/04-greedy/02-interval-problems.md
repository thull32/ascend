---
lesson: interval-problems
source: c1204b036dfd5960
fit: partial
desk:
  - "The table of seven interval problems with their sort key, state and rule"
  - "The merge trace on six intervals, the merge code, and the insert-interval walk"
  - "The non-overlapping trace and the swap table on four half-open intervals"
  - "Meeting Rooms II: the heap trace, the heap visualisation, the side-by-side heap and sweep table, and the difference-array visualisation"
  - "Under the hood: sort and heap costs, memory per interval, and PostgreSQL range types with an exclusion constraint"
  - "Minimum interval to include each query: the offline sweep"
  - "Exercises: merge intervals, and minimum meeting rooms"
---
## Introduction

A calendar service stores every meeting as a start and an end. The product team wants five things by Friday. Collapse overlapping busy blocks into one. Add a new meeting into a sorted calendar. Tell a user how many meetings to decline so none overlap. Say whether a person can attend all their meetings. And report how many rooms the office needs at peak.

Five features, five interval problems, and they are all the same algorithm wearing different sort orders. The entire difficulty is one decision: sort by start, or sort by end? Get it right and the loop writes itself. Get it wrong and you produce an answer that looks plausible and fails on the fourth test case.

Three ideas. Which endpoint to sort by, and why. Two ways to count meeting rooms, and the tie-break that decides whether they are right. And the one comparison in every interval problem where hidden tests live.

## The convention, and the rule of thumb

By convention an interval is half-open: it includes its start and excludes its end. So a meeting from 1 to 4 and one from 4 to 5 do not overlap, and a meeting ending at 4 frees the room for one starting at 4. Some problems use closed intervals, where 1 to 4 and 4 to 5 do touch. The difference is exactly one less-than versus less-than-or-equal in your code. Ask which convention applies before you write the comparison. It is the first thing an interviewer checks.

Two intervals overlap when each starts before the other ends. Once intervals are sorted by start, that simplifies: the next interval overlaps the previous one exactly when it starts before the previous one ends. That simplification is why sorting is step one of everything here.

Now the rule of thumb to carry out of this episode. Problems that combine intervals sort by start, because you need to know what came before to extend it. Problems that select intervals sort by end, because the interval that ends earliest leaves the most room for the rest. That second half is the activity-selection exchange argument from the previous lesson.

## Sort by start: merging

To merge, sort by start and walk the list keeping a current block. If the next interval starts before the current block ends, extend the block's end to the larger of the two ends. Otherwise emit the block and start a new one.

Why is the walk correct? The invariant: after the first i intervals, the output is their exact merge, and only its last block can be touched by the next interval. Every earlier block ended before the last one started, and the next interval starts no earlier than the last block's start, because you sorted by start. So it cannot reach back.

The trap is the word "larger". Take 1 to 10, then 2 to 3. The second sits entirely inside the first. Write "set the end to the next interval's end" instead of taking the larger, and the block shrinks to 1 to 3. Add a 4 to 5 after it, and that now comes out as a separate block, so the 3-to-10 stretch is simply lost. Contained intervals are the standard hidden test, and a good interviewer plants one.

Inserting one interval into an already sorted, non-overlapping calendar is a cousin. Do not append and re-merge; that is n log n for a linear problem. Walk in three phases: copy everything that ends before the new interval starts, absorb everything that overlaps it, then copy the rest.

## Sort by end: selecting

Non-overlapping Intervals asks for the fewest removals so nothing overlaps. That is n minus the largest set of mutually non-overlapping intervals, which is activity selection. Sort by end, keep an interval if it starts at or after the end of the last one kept.

Why end and not start? Here is the counterexample, and it is three intervals. 1 to 100, 2 to 3, 4 to 5. Sort by start and keep greedily, and you keep 1 to 100 and remove the other two. Removing the long one alone was optimal. Sort by end and you keep 2 to 3, then 4 to 5, and remove only the long one.

The proof is one sentence. Swapping the earliest-ending interval into any optimal set never shrinks the set and never pushes an end time later, so it never breaks feasibility for whatever follows. Earliest start has no such argument: swapping in the earliest-starting interval can push the end time later and knock out everything behind it.

Minimum arrows to burst balloons is the same sort with a different loop. Balloons are intervals on a line, and an arrow at a point pops every balloon containing it. Sort by end, shoot at the end of the first balloon, skip every balloon that starts at or before that point, and shoot again at the end of the next survivor. The lesson's example: balloons 1 to 6, 2 to 8, 7 to 12 and 10 to 16. An arrow at 6 pops the first two. 7 to 12 starts after 6, so the next arrow goes at 12, and it also pops 10 to 16. Two arrows.

## Meeting rooms: the heap and the sweep

Meeting Rooms one, can one person attend everything, is just "does anything overlap?". Sort by start and check whether any meeting starts before the previous one ends.

Meeting Rooms two asks for the minimum number of rooms, which is the largest number of meetings in progress at any instant. There are two standard solutions, and you should know both.

The first is a min-heap of end times. Sort by start. For each meeting, if the earliest-ending occupied room is free by this meeting's start, pop it and reuse that room. Then push this meeting's end. The heap's peak size is the answer. Why pop only one room? Because this meeting only needs one. Other free rooms stay in the heap harmlessly and get popped by later meetings; the size only grows when no room is free.

The second is a sweep line. Turn each meeting into two events, plus one at its start and minus one at its end. Sort the events by time and keep a running count. The largest count is the answer.

Picture five meetings: 1 to 4, 2 to 5, 3 to 6, 4 to 7 and 5 to 8. At time 3, three meetings are running. At time 4 one ends and another starts, and the same happens at time 5, so the count never climbs past three. Both methods report 3.

Why is the peak the minimum, and not only a lower bound? Lower bound: at time 3, three meetings are in progress, and no two can share a room. Achievability: the heap opens a new room only when none is free at that instant, so it never holds more rooms than meetings in progress. A lower bound that one construction achieves is the answer.

Now the detail that decides correctness. Before I say it: when an end and a start fall at the same time, which do you process first?

[pause]

For half-open intervals, the end goes first, so the room freed at 4 can host the meeting starting at 4. Take 1 to 4 and 4 to 5. Ends first, the count goes 1, 0, 1, 0: one room. Starts first, it goes 1, 2, 1, 0: two rooms for meetings that never overlap. In a booking system that is a phantom conflict on every back-to-back pair, which is most pairs in a real calendar. Sort events as pairs of time and delta, with minus one for ends, and you get the right tie-break for free, because minus one sorts before plus one. For closed intervals, flip it.

Which to use? The heap generalises to room assignment: store the room id with each end time, and you can say which room each meeting gets. The sweep generalises to load over time: it gives the count at every moment in one pass, which is what production capacity systems run.

## Scale and the database

If times are small integers you can skip the sort with a difference array: add one at each start, subtract one at each end, then take a running sum. But it is a trap on real timestamps. Milliseconds over one day is about 86 million slots, around 0.7 gigabytes of pointers in a Python list, for a problem whose sorted-events version needs a few megabytes. A job that worked on per-minute data and runs out of memory on milliseconds has made exactly that mistake. Sort the events instead.

The live path of a booking service does not re-sweep on every insert. It asks the database. PostgreSQL range types have an overlap operator, a GiST index answers overlap queries in logarithmic time, and an exclusion constraint rejects a double-booking at insert time with no application code. That constraint is the interval-overlap test, enforced by the database. In memory, the equivalent is an interval tree.

One more pattern from the hard end of this family. Minimum Interval to Include Each Query asks, for each query point, the size of the smallest interval containing it. The trick is to sort the queries too, and sweep them in order with a heap keyed by interval size. Whenever a problem hands you many point queries over intervals, sorting the queries is the first thing to try.

## In the interview

"The intervals are closed. What changes?"

[pause]

Exactly three comparisons. Merge when the next start is less than or equal to the current end. Keep an interval for selection only when it starts strictly after the last kept end. And in the sweep, process starts before ends at equal times. The wrong answer is "nothing", which gives off-by-one room counts on every touching pair.

"Meetings arrive one at a time and must be accepted or rejected immediately." The batch sort is gone. Keep accepted intervals in an ordered structure keyed by start, a balanced tree or a database range column with a GiST index, and test the newcomer against its predecessor and successor, logarithmic time per arrival. Re-running the merge on every insert is n log n per arrival.

"Each meeting has a value; maximise the total." That is weighted interval scheduling, a DP over meetings sorted by end with a binary search. Earliest-end greedy maximises the count, not the value.

## Recap

Four things to remember. Combine sorts by start, select sorts by end, because the earliest end leaves the most room. When merging, take the larger end, or a contained interval shrinks the block. Meeting Rooms two has two answers: a heap of end times for room assignment, a sweep of plus-one and minus-one events for load over time, and the peak is the minimum because a lower bound meets a construction. And settle the convention first: half-open means ends before starts at equal times, and the one comparison where less-than meets less-than-or-equal is where hidden tests live.

At your desk: the problem table, the merge and insert traces, the selection swap table, the meeting-room traces and visualisations, the database and memory notes, the query sweep, and the two exercises.
