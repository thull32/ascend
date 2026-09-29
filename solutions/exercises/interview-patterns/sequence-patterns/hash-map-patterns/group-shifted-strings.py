def group_shifted(words):
    groups = {}
    order = []
    for w in words:
        gaps = tuple((ord(w[i]) - ord(w[i - 1])) % 26 for i in range(1, len(w)))
        key = (len(w), gaps)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(w)
    return [groups[key] for key in order]
