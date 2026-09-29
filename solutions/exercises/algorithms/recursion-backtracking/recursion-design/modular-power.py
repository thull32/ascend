def mod_pow(base, exp, mod):
    if exp == 0:
        return 1 % mod
    half = mod_pow(base, exp // 2, mod)
    result = (half * half) % mod
    if exp % 2 == 1:
        result = (result * base) % mod
    return result
