import math


def distinct_in_ranges(nums, queries):
    n = len(nums)
    q = len(queries)
    if q == 0:
        return []

    b = max(1, int(math.sqrt(n)))
    order = sorted(
        range(q),
        key=lambda idx: (queries[idx][0] // b, queries[idx][1]),
    )

    answers = [0] * q
    counts = {}
    distinct = 0
    cur_l, cur_r = 0, -1

    def add(pos):
        nonlocal distinct
        v = nums[pos]
        counts[v] = counts.get(v, 0) + 1
        if counts[v] == 1:
            distinct += 1

    def remove(pos):
        nonlocal distinct
        v = nums[pos]
        counts[v] -= 1
        if counts[v] == 0:
            distinct -= 1

    for idx in order:
        l, r = queries[idx]
        while cur_r < r:
            cur_r += 1
            add(cur_r)
        while cur_l > l:
            cur_l -= 1
            add(cur_l)
        while cur_r > r:
            remove(cur_r)
            cur_r -= 1
        while cur_l < l:
            remove(cur_l)
            cur_l += 1
        answers[idx] = distinct

    return answers
