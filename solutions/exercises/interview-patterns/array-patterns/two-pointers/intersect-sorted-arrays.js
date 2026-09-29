function intersect_sorted(a, b) {
  let i = 0, j = 0;
  const result = [];
  while (i < a.length && j < b.length) {
    if (a[i] < b[j]) {
      i += 1;
    } else if (a[i] > b[j]) {
      j += 1;
    } else {
      result.push(a[i]);
      i += 1;
      j += 1;
    }
  }
  return result;
}
