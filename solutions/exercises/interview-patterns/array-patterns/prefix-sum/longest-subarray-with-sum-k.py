def longest_subarray_sum_k(nums, k):
    first_index = {0: 0}
    prefix = 0
    best = 0
    for j, value in enumerate(nums):
        prefix += value
        if prefix - k in first_index:
            best = max(best, (j + 1) - first_index[prefix - k])
        if prefix not in first_index:
            first_index[prefix] = j + 1
    return best
