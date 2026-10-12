---
problem: car-fleet
args: [12, [10, 8, 0, 5, 3], [2, 4, 1, 1, 3]]
frames: 23
source: bc961d33763d58fd
---
@0-2
Five cars on a one-lane road to mile 12. They start at miles 10, 8, 0, 5 and 3, with speeds 2, 4, 1, 1 and 3. Do not simulate. Two facts make this simple. A car is only ever held up by the car directly ahead of it. And whether it catches that car before the target depends only on when each would arrive if the road were empty: if the car behind would arrive no later, their paths must cross on the way, and from then on the pair moves as one fleet at the leader's pace. So the first line sorts the cars by position, nearest to the target first: 10, 8, 5, 3, then 0. The list of fleet arrival times starts empty.

@3-6
The car at mile 10 has 2 miles to go at 2 miles an hour: it arrives in one hour. There is no fleet ahead of it, so it starts the first one, arriving at one hour.

@7-9
The car at mile 8 has 4 miles to go at speed 4: also one hour. That is not later than the fleet ahead, so it catches it, exactly at the target, and joins it. This is the edge case the problem calls out. The test is strictly later, not later or equal. With later or equal, this car would be counted as a fleet of its own.

@10-13
The car at mile 5 has 7 miles to go at speed 1: seven hours. That is later than one hour, so it never catches the leaders. It starts a second fleet, arriving at seven hours.

@14-16
The car at mile 3 has 9 miles at speed 3: three hours on an empty road. But three is not later than seven, so it catches the slow car at mile 5 before the target. Once it does, it crawls at that car's pace, and its own three hours stops mattering to anyone behind. It joins the second fleet, and nothing is added.

@17-20
The car at mile 0 has 12 miles at speed 1: twelve hours. Later than seven, so it is a third fleet, alone.

@21-22
Three fleets. The sort costs n log n and the scan is linear. Notice the list never pops and we only ever read its last entry, so it is really just one number, the arrival time of the fleet directly ahead, plus a counter.

The mistakes: forgetting to sort, so the car ahead is the wrong neighbour; comparing speeds instead of arrival times, because a faster car behind does not always catch up before the target; and integer division for the time, which can make two different times look equal.
