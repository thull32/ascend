def _kadane(arr):
    current = arr[0]
    best = arr[0]
    for x in arr[1:]:
        current = max(x, current + x)
        best = max(best, current)
    return best


def max_k_concat(nums, k):
    total = sum(nums)
    if k == 1:
        return _kadane(nums)

    best_two = _kadane(nums + nums)
    if total > 0:
        return best_two + (k - 2) * total
    return best_two
