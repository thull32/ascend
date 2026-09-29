function min_meeting_rooms(intervals) {
  if (intervals.length === 0) return 0;
  const starts = intervals.map((iv) => iv[0]).sort((a, b) => a - b);
  const ends = intervals.map((iv) => iv[1]).sort((a, b) => a - b);
  let e = 0;
  let rooms = 0;
  let maxRooms = 0;
  for (let s = 0; s < starts.length; s++) {
    while (e < ends.length && ends[e] <= starts[s]) {
      rooms--;
      e++;
    }
    rooms++;
    if (rooms > maxRooms) maxRooms = rooms;
  }
  return maxRooms;
}
