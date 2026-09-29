def tokens(src):
    result = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c == " ":
            i += 1
            continue
        if c.isalpha() or c == "_":
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] == "_"):
                j += 1
            result.append(["name", src[i:j]])
            i = j
        elif c.isdigit():
            j = i + 1
            while j < n and src[j].isdigit():
                j += 1
            result.append(["number", src[i:j]])
            i = j
        else:
            result.append(["op", c])
            i += 1
    return result
