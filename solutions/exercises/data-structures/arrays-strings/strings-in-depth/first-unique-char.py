def first_unique_char(s):
    counts = [0] * 128
    for ch in s:
        counts[ord(ch)] += 1
    for i, ch in enumerate(s):
        if counts[ord(ch)] == 1:
            return i
    return -1
