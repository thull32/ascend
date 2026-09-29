// Non-overlapping Intervals: sort by end, greedily keep the earliest-ending compatible interval.
function erase_overlap_intervals(intervals) {
  if (intervals.length === 0) {
    return 0;
  }
  const sorted = [...intervals].sort((a, b) => a[1] - b[1]);
  let removed = 0;
  let lastEnd = sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    if (start < lastEnd) {
      removed += 1;
    } else {
      lastEnd = end;
    }
  }
  return removed;
}
