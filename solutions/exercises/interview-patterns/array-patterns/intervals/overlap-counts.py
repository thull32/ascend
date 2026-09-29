from bisect import bisect_left, bisect_right


def overlap_counts(intervals):
    starts = sorted(iv[0] for iv in intervals)
    ends = sorted(iv[1] for iv in intervals)
    result = []
    for s, e in intervals:
        starts_le_e = bisect_right(starts, e)
        ends_lt_s = bisect_left(ends, s)
        result.append(starts_le_e - ends_lt_s - 1)
    return result
