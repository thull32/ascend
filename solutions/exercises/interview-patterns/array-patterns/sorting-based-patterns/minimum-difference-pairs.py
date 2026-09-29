def min_diff_pairs(nums):
    arr = sorted(nums)
    min_gap = min(arr[i + 1] - arr[i] for i in range(len(arr) - 1))
    result = []
    for i in range(len(arr) - 1):
        if arr[i + 1] - arr[i] == min_gap:
            result.append([arr[i], arr[i + 1]])
    return result
