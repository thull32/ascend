def range_sums(nums, queries):
    prefix = [0] * (len(nums) + 1)
    for i, x in enumerate(nums):
        prefix[i + 1] = prefix[i] + x
    return [prefix[r + 1] - prefix[l] for l, r in queries]
