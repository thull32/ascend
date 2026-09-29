import bisect


def closest_subset_sum(nums, goal):
    n = len(nums)
    mid = n // 2
    left, right = nums[:mid], nums[mid:]

    def subset_sums(arr):
        sums = [0]
        for x in arr:
            sums = sums + [s + x for s in sums]
        return sums

    left_sums = subset_sums(left)
    right_sums = sorted(subset_sums(right))

    best = None
    for l in left_sums:
        target = goal - l
        idx = bisect.bisect_left(right_sums, target)
        for cand in (idx - 1, idx):
            if 0 <= cand < len(right_sums):
                diff = abs(l + right_sums[cand] - goal)
                if best is None or diff < best:
                    best = diff
    return best
