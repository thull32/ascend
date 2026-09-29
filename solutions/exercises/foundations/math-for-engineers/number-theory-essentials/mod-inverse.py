def mod_inverse(a, m):
    def extended_gcd(a, b):
        if b == 0:
            return (a, 1, 0)
        g, x1, y1 = extended_gcd(b, a % b)
        return (g, y1, x1 - (a // b) * y1)

    g, x, _ = extended_gcd(a, m)
    if g != 1:
        return -1
    return ((x % m) + m) % m
