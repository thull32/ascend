def count_inversions(nums):
    n = len(nums)
    if n == 0:
        return 0

    sorted_vals = sorted(set(nums))
    rank = {v: i + 1 for i, v in enumerate(sorted_vals)}
    m = len(sorted_vals)
    tree = [0] * (m + 1)

    def add(i, delta):
        while i <= m:
            tree[i] += delta
            i += i & -i

    def prefix(i):
        s = 0
        while i > 0:
            s += tree[i]
            i -= i & -i
        return s

    inversions = 0
    seen = 0
    for x in nums:
        r = rank[x]
        inversions += seen - prefix(r)
        add(r, 1)
        seen += 1
    return inversions
