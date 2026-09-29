function cpython_capacities(n) {
  let allocated = 0;
  const result = [];
  for (let newsize = 1; newsize <= n; newsize++) {
    if (newsize > allocated) {
      allocated = (newsize + (newsize >> 3) + 6) & ~3;
      result.push(allocated);
    }
  }
  return result;
}
