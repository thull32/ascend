// Partition Labels: greedy interval-merge via last-occurrence tracking.
function partition_labels(s) {
  const last = {};
  for (let i = 0; i < s.length; i++) {
    last[s[i]] = i;
  }
  const sizes = [];
  let start = 0;
  let end = 0;
  for (let i = 0; i < s.length; i++) {
    end = Math.max(end, last[s[i]]);
    if (i === end) {
      sizes.push(end - start + 1);
      start = i + 1;
    }
  }
  return sizes;
}
