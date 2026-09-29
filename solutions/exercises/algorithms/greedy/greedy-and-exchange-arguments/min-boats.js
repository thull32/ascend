function min_boats(people, limit) {
  const sorted = [...people].sort((a, b) => a - b);
  let i = 0, j = sorted.length - 1;
  let boats = 0;
  while (i <= j) {
    boats++;
    if (i < j && sorted[i] + sorted[j] <= limit) i++;
    j--;
  }
  return boats;
}
