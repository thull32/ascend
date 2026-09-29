function huffman_cost(freqs) {
  const heap = [...freqs];
  let total = 0;
  while (heap.length > 1) {
    heap.sort((x, y) => x - y);
    const a = heap.shift();
    const b = heap.shift();
    total += a + b;
    heap.push(a + b);
  }
  return total;
}
