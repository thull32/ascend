def max_product_word_lengths(words):
    masks = []
    for w in words:
        mask = 0
        for ch in w:
            mask |= 1 << (ord(ch) - ord('a'))
        masks.append(mask)

    best = 0
    n = len(words)
    for i in range(n):
        for j in range(i + 1, n):
            if masks[i] & masks[j] == 0:
                product = len(words[i]) * len(words[j])
                if product > best:
                    best = product
    return best
