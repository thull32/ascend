def total_copies(n):
    size = 0
    capacity = 1
    total = 0
    for _ in range(n):
        if size == capacity:
            total += size
            capacity *= 2
        size += 1
    return total
