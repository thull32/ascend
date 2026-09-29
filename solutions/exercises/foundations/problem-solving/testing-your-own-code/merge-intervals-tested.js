function merge_intervals(intervals) {
  if (intervals.length === 0) return [];
  const ordered = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [[ordered[0][0], ordered[0][1]]];
  for (let i = 1; i < ordered.length; i++) {
    const [start, end] = ordered[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}
