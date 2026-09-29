function granules_to_read(marks, prefix) {
  const k = prefix.length;
  const cmp = (a, b) => {
    for (let i = 0; i < k; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  };

  const n = marks.length;
  const result = [];
  for (let i = 0; i < n; i++) {
    if (cmp(marks[i], prefix) > 0) continue;
    if (i === n - 1 || cmp(marks[i + 1], prefix) >= 0) result.push(i);
  }
  return result;
}
