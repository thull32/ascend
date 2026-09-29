def max_subarray_sum(nums):
    def best(lo, hi):
        if lo == hi:
            return nums[lo]
        mid = (lo + hi) // 2
        left_best = best(lo, mid)
        right_best = best(mid + 1, hi)

        running = 0
        left_cross = nums[mid]
        running = 0
        for i in range(mid, lo - 1, -1):
            running += nums[i]
            if running > left_cross:
                left_cross = running

        right_cross = nums[mid + 1]
        running = 0
        for i in range(mid + 1, hi + 1):
            running += nums[i]
            if running > right_cross:
                right_cross = running

        crossing = left_cross + right_cross
        return max(left_best, right_best, crossing)

    return best(0, len(nums) - 1)
