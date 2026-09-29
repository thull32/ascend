def hanoi(n):
    moves = []

    def solve(k, src, dst, spare):
        if k == 0:
            return
        solve(k - 1, src, spare, dst)
        moves.append([src, dst])
        solve(k - 1, spare, dst, src)

    solve(n, "A", "C", "B")
    return moves
