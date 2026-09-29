def bpe_merge_step(words):
    counts = {}
    for word in words:
        for i in range(len(word) - 1):
            pair = (word[i], word[i + 1])
            counts[pair] = counts.get(pair, 0) + 1

    if not counts:
        return {"merged": None, "words": words}

    best_pair = None
    best_count = -1
    for pair, count in counts.items():
        if count > best_count:
            best_count = count
            best_pair = pair

    merged = best_pair[0] + best_pair[1]
    new_words = []
    for word in words:
        new_word = []
        i = 0
        while i < len(word):
            if i < len(word) - 1 and word[i] == best_pair[0] and word[i + 1] == best_pair[1]:
                new_word.append(merged)
                i += 2
            else:
                new_word.append(word[i])
                i += 1
        new_words.append(new_word)
    return {"merged": merged, "words": new_words}
