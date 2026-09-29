def total_n_queens(n):
    full = (1 << n) - 1

    def solve(cols, d1, d2):
        if cols == full:
            return 1
        free = full & ~(cols | d1 | d2)
        count = 0
        while free:
            bit = free & (-free)
            free ^= bit
            count += solve(cols | bit, (d1 | bit) << 1, (d2 | bit) >> 1)
        return count

    return solve(0, 0, 0)
