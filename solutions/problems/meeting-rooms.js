// Meeting Rooms: sort by start, check each meeting against the previous one's end.
function can_attend_meetings(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] < sorted[i - 1][1]) {
      return false;
    }
  }
  return true;
}
