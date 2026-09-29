def mod_pow(base, exp, mod):
    result = 1 % mod
    base = base % mod
    while exp > 0:
        if exp & 1:
            result = (result * base) % mod
        base = (base * base) % mod
        exp //= 2
    return result
