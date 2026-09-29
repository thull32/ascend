def next_power_of_two(n):
    p = 1
    while p < n:
        p *= 2
    return p
