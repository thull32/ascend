def covered_length(intervals):
    if not intervals:
        return 0
    ivs = sorted(intervals, key=lambda iv: iv[0])
    total = 0
    cur_start, cur_end = ivs[0]
    for start, end in ivs[1:]:
        if start <= cur_end:
            cur_end = max(cur_end, end)
        else:
            total += cur_end - cur_start
            cur_start, cur_end = start, end
    total += cur_end - cur_start
    return total
