function reservoir_sample(stream, k, draws) {
  const reservoir = stream.slice(0, k);
  for (let i = k; i < stream.length; i++) {
    const d = draws[i - k];
    if (d < k) {
      reservoir[d] = stream[i];
    }
  }
  return reservoir;
}
