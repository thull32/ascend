def merge_intervals(intervals):
    if not intervals:
        return []
    ordered = sorted(intervals, key=lambda iv: iv[0])
    result = [[ordered[0][0], ordered[0][1]]]
    for start, end in ordered[1:]:
        last = result[-1]
        if start <= last[1]:
            last[1] = max(last[1], end)
        else:
            result.append([start, end])
    return result
