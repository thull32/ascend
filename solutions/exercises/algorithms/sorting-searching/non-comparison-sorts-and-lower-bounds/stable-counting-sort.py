def counting_sort(nums, k):
    counts = [0] * (k + 1)
    for x in nums:
        counts[x] += 1

    starts = [0] * (k + 1)
    total = 0
    for v in range(k + 1):
        starts[v] = total
        total += counts[v]

    result = [0] * len(nums)
    for x in nums:
        result[starts[x]] = x
        starts[x] += 1
    return result
