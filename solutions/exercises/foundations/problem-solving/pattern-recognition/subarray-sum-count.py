def subarray_sum(nums, k):
    counts = {0: 1}
    prefix = 0
    total = 0
    for x in nums:
        prefix += x
        total += counts.get(prefix - k, 0)
        counts[prefix] = counts.get(prefix, 0) + 1
    return total
