def _key_group_range(i, max_parallelism, p):
    start = (i * max_parallelism + p - 1) // p
    end = ((i + 1) * max_parallelism - 1) // p
    return start, end


def rescale_plan(max_parallelism, old_parallelism, new_parallelism):
    old_ranges = [
        _key_group_range(i, max_parallelism, old_parallelism)
        for i in range(old_parallelism)
    ]
    new_ranges = [
        _key_group_range(i, max_parallelism, new_parallelism)
        for i in range(new_parallelism)
    ]

    result = []
    for start, end in new_ranges:
        reads_from = [
            j for j, (os, oe) in enumerate(old_ranges) if os <= end and start <= oe
        ]
        result.append({"range": [start, end], "reads_from": reads_from})

    return result
