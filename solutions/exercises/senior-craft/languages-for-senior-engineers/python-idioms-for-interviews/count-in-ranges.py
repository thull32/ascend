from bisect import bisect_left, bisect_right


def count_in_ranges(nums, queries):
    s = sorted(nums)
    result = []
    for lo, hi in queries:
        if lo > hi:
            result.append(0)
        else:
            result.append(bisect_right(s, hi) - bisect_left(s, lo))
    return result
