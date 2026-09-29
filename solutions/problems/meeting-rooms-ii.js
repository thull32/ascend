// Meeting Rooms II: two sorted pointers over starts/ends, tracking peak concurrency.
function min_meeting_rooms(intervals) {
  const starts = intervals.map((iv) => iv[0]).sort((a, b) => a - b);
  const ends = intervals.map((iv) => iv[1]).sort((a, b) => a - b);
  let rooms = 0;
  let e = 0;
  for (const s of starts) {
    if (s >= ends[e]) {
      e += 1;
    } else {
      rooms += 1;
    }
  }
  return rooms;
}
