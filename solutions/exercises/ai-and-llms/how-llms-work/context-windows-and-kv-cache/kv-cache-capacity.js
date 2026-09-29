function max_batch(gpu_gib, weights_gib, layers, kv_heads, head_dim, bytes_per_value, seq_len) {
  const freeGib = gpu_gib - weights_gib;
  if (freeGib <= 0) return 0;

  const freeBytes = freeGib * 2 ** 30;
  const kvBytesPerToken = 2 * layers * kv_heads * head_dim * bytes_per_value;
  const bytesPerSeq = kvBytesPerToken * seq_len;
  return Math.floor(freeBytes / bytesPerSeq);
}
