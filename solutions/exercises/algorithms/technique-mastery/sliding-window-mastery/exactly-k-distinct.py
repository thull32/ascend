def subarrays_with_k_distinct(nums, k):
    def at_most(m):
        if m <= 0:
            return 0
        counts = {}
        left = 0
        total = 0
        for right, x in enumerate(nums):
            counts[x] = counts.get(x, 0) + 1
            while len(counts) > m:
                y = nums[left]
                counts[y] -= 1
                if counts[y] == 0:
                    del counts[y]
                left += 1
            total += right - left + 1
        return total

    return at_most(k) - at_most(k - 1)
