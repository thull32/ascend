def probe_counts(hashes, capacity):
    occupied = [False] * capacity
    result = []
    for h in hashes:
        i = h % capacity
        count = 1
        while occupied[i]:
            i = (i + 1) % capacity
            count += 1
        occupied[i] = True
        result.append(count)
    return result
