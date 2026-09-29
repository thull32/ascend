function layoutSize(order) {
  let offset = 0;
  let largest = 0;
  for (const size of order) {
    offset = Math.ceil(offset / size) * size;
    offset += size;
    largest = Math.max(largest, size);
  }
  return Math.ceil(offset / largest) * largest;
}

function struct_size(sizes) {
  const declared = layoutSize(sizes);
  const best = layoutSize([...sizes].sort((a, b) => b - a));
  return [declared, best];
}
