def calls(n):
    if n <= 1:
        return 1
    return 1 + calls(n // 2) + calls(n - n // 2)
