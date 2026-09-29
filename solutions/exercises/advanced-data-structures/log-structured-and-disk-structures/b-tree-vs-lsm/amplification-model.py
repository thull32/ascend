def amplification(row_bytes, page_bytes, data_bytes, l1_bytes, fanout):
    btree_write_amp = page_bytes // row_bytes

    capacity = l1_bytes
    total = 0
    lsm_levels = 0
    while total < data_bytes:
        total += capacity
        lsm_levels += 1
        capacity *= fanout

    lsm_write_amp = 1 + fanout * (lsm_levels - 1)

    return [btree_write_amp, lsm_levels, lsm_write_amp]
