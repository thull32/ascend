ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def base62_encode(n, width):
    digits = ""
    if n == 0:
        digits = "0"
    while n > 0:
        digits = ALPHABET[n % 62] + digits
        n //= 62
    return digits.rjust(width, "0")
