def halvings(n):
    count = 0
    while n > 0:
        n //= 2
        count += 1
    return count
