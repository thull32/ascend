---
problem: meeting-rooms-ii
args: [[[1, 10], [2, 7], [3, 19], [8, 12], [10, 20], [11, 30]]]
frames: 53
source: 77b94b924b80ed2a
---
@0
Six meetings: 1 to 10, 2 to 7, 3 to 19, 8 to 12, 10 to 20, and 11 to 30. The question is how many rooms you need, and the answer is the peak number of meetings running at the same moment. Concurrency only changes when a meeting starts or ends, so the trick is to stop thinking of meetings as pairs at all. Pull the start times into one sorted list and the end times into another, and sweep.

@1-15
The first line collects every start time and sorts them: 1, 2, 3, 8, 10, 11.

@16-30
The second does the same for the end times, sorted on their own: 7, 10, 12, 19, 20, 30. Notice the 7 now comes first, even though it belongs to the second meeting. That is fine. We never need to know which end goes with which start, only how many meetings have finished.

@31-32
The room count starts at zero, and e, a pointer to the earliest end we have not used yet, starts at zero too, pointing at the end time 7.

@33-35
The first start is 1. Is 1 at least 7? No. Nothing has finished, so every room is busy, and we open a new one. One room.

@36-41
Start 2: still before 7, so a second room. Start 3: still before 7, a third room. Three meetings are running at once.

@42-44
Start 8. Now 8 is at least 7: the meeting that ends at 7 is over, so this meeting takes its room. Rooms stay at three, and e moves to the next end time, 10.

@45-47
Start 10, against the end time 10. This is the tie, and it is the line the problem is about. Meetings are half-open, so one ending at 10 frees its room for one starting at 10. Greater than or equal says reuse, rooms stay at three, and e moves on to 12.

@48-50
Start 11, against the end time 12. The meeting ending at 12 is still running, and so are the others, so we open a fourth room.

@51-52
The starts are done, and we return 4. Rooms never goes down, because each new room is opened at a moment when every room is genuinely busy, so its final value is the peak. The cost is two sorts, n log n, then one linear sweep. The classic mistake is a strict greater than in the comparison: then the tie at 10 opens an extra room, and a chain of back-to-back meetings needs one room each instead of one in total.
