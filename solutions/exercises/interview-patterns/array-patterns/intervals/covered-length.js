function covered_length(intervals) {
  if (intervals.length === 0) return 0;
  const ivs = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = ivs[0][0], curEnd = ivs[0][1];
  for (let i = 1; i < ivs.length; i++) {
    const [start, end] = ivs[i];
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    }
  }
  total += curEnd - curStart;
  return total;
}
