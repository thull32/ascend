function transformer_params(d, n_layers, n_heads, n_kv_heads, d_ff, vocab, tied) {
  const headDim = Math.floor(d / n_heads);
  const perLayer = 2 * d * d + 2 * d * n_kv_heads * headDim + 3 * d * d_ff;
  let total = perLayer * n_layers;
  total += vocab * d;
  if (!tied) {
    total += vocab * d;
  }
  return total;
}
