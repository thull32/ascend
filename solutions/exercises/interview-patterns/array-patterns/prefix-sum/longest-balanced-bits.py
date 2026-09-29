def longest_balanced(bits):
    first_index = {0: 0}
    prefix = 0
    best = 0
    for j, bit in enumerate(bits):
        prefix += 1 if bit == 1 else -1
        if prefix in first_index:
            best = max(best, (j + 1) - first_index[prefix])
        else:
            first_index[prefix] = j + 1
    return best
