def _digit_square_sum(n):
    total = 0
    while n > 0:
        n, d = divmod(n, 10)
        total += d * d
    return total


def is_happy(n):
    slow = n
    fast = _digit_square_sum(n)
    while fast != 1 and slow != fast:
        slow = _digit_square_sum(slow)
        fast = _digit_square_sum(_digit_square_sum(fast))
    return fast == 1
