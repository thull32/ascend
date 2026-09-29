def gray_code(n):
    result = [0]
    for b in range(n):
        result += [x | (1 << b) for x in reversed(result)]
    return result
