def max_batch(gpu_gib, weights_gib, layers, kv_heads, head_dim, bytes_per_value, seq_len):
    free_gib = gpu_gib - weights_gib
    if free_gib <= 0:
        return 0

    free_bytes = free_gib * (2 ** 30)
    kv_bytes_per_token = 2 * layers * kv_heads * head_dim * bytes_per_value
    bytes_per_seq = kv_bytes_per_token * seq_len
    return free_bytes // bytes_per_seq
