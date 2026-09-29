def radix_sort(nums):
    if not nums:
        return []
    result = list(nums)
    exp = 1
    while max(result) // exp > 0:
        buckets = [[] for _ in range(10)]
        for x in result:
            digit = (x // exp) % 10
            buckets[digit].append(x)
        result = [x for bucket in buckets for x in bucket]
        exp *= 10
    return result
