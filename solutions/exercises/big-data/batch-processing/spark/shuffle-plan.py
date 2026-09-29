def shuffle_plan(map_outputs, num_reducers, threshold):
    def partition(key):
        return sum(ord(c) for c in key) % num_reducers

    blocks = []
    for outputs in map_outputs:
        row = [0] * num_reducers
        for key, nbytes in outputs:
            row[partition(key)] += nbytes
        blocks.append(row)

    reduce_input = [
        sum(blocks[m][p] for m in range(len(blocks))) for p in range(num_reducers)
    ]

    sorted_ri = sorted(reduce_input)
    n = len(sorted_ri)
    if n == 0:
        median = 0
    elif n % 2 == 1:
        median = sorted_ri[n // 2]
    else:
        median = (sorted_ri[n // 2 - 1] + sorted_ri[n // 2]) / 2

    skewed = [
        p for p in range(num_reducers)
        if reduce_input[p] > 5 * median and reduce_input[p] > threshold
    ]

    return {"blocks": blocks, "reduce_input": reduce_input, "skewed": skewed}
