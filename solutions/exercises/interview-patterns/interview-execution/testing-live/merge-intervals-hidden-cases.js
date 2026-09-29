function merge(intervals) {
  if (intervals.length === 0) return [];
  const ivs = [...intervals].sort((a, b) => a[0] - b[0]);
  const result = [[ivs[0][0], ivs[0][1]]];
  for (let i = 1; i < ivs.length; i++) {
    const [start, end] = ivs[i];
    const last = result[result.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      result.push([start, end]);
    }
  }
  return result;
}
