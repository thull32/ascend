def merge(intervals):
    if not intervals:
        return []
    ivs = sorted(intervals, key=lambda iv: iv[0])
    result = [list(ivs[0])]
    for start, end in ivs[1:]:
        last = result[-1]
        if start <= last[1]:
            last[1] = max(last[1], end)
        else:
            result.append([start, end])
    return result
