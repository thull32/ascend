def count_pairs_with_diff(nums, k):
    seen = {}
    total = 0
    for x in nums:
        if k == 0:
            total += seen.get(x, 0)
        else:
            total += seen.get(x - k, 0) + seen.get(x + k, 0)
        seen[x] = seen.get(x, 0) + 1
    return total
