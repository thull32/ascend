// Three passes: intervals fully before the new one, overlapping ones merged
// into it, then intervals fully after.
function insert(intervals, new_interval) {
  let [start, end] = new_interval;
  const result = [];
  let i = 0;
  const n = intervals.length;

  while (i < n && intervals[i][1] < start) {
    result.push(intervals[i]);
    i += 1;
  }

  while (i < n && intervals[i][0] <= end) {
    start = Math.min(start, intervals[i][0]);
    end = Math.max(end, intervals[i][1]);
    i += 1;
  }
  result.push([start, end]);

  while (i < n) {
    result.push(intervals[i]);
    i += 1;
  }
  return result;
}
