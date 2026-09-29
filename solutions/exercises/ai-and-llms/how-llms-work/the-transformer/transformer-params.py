def transformer_params(d, n_layers, n_heads, n_kv_heads, d_ff, vocab, tied):
    head_dim = d // n_heads
    per_layer = 2 * d * d + 2 * d * n_kv_heads * head_dim + 3 * d * d_ff
    total = per_layer * n_layers
    total += vocab * d
    if not tied:
        total += vocab * d
    return total
