def granules_to_read(marks, prefix):
    k = len(prefix)
    key = tuple(prefix)
    n = len(marks)
    result = []
    for i in range(n):
        if tuple(marks[i][:k]) > key:
            continue
        if i == n - 1 or tuple(marks[i + 1][:k]) >= key:
            result.append(i)
    return result
