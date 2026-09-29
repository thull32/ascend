def count_divisible_subarrays(nums, k):
    counts = [0] * k
    counts[0] = 1
    remainder = 0
    total = 0
    for x in nums:
        remainder = (remainder + x) % k
        remainder = (remainder + k) % k
        total += counts[remainder]
        counts[remainder] += 1
    return total
