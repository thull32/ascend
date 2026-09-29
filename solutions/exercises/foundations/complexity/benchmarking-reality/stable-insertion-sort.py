def _key(v):
    return v[0] if isinstance(v, list) else v


def insertion_sort(nums):
    out = list(nums)
    for i in range(1, len(out)):
        x = out[i]
        xk = _key(x)
        j = i - 1
        while j >= 0 and _key(out[j]) > xk:
            out[j + 1] = out[j]
            j -= 1
        out[j + 1] = x
    return out
