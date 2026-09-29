ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _encode(n, width):
    digits = "0" if n == 0 else ""
    while n > 0:
        digits = ALPHABET[n % 62] + digits
        n //= 62
    return digits.rjust(width, "0")


def create_links(existing, draws, n, width, max_attempts):
    taken = set(existing)
    keys = []
    collisions = 0
    draw_idx = 0
    ran_out = False

    for _ in range(n):
        if ran_out:
            keys.append(None)
            continue

        result = None
        for _attempt in range(max_attempts):
            if draw_idx >= len(draws):
                ran_out = True
                break
            val = draws[draw_idx]
            draw_idx += 1
            key = _encode(val, width)
            if key not in taken:
                taken.add(key)
                result = key
                break
            collisions += 1

        keys.append(result)

    return {"keys": keys, "collisions": collisions}
