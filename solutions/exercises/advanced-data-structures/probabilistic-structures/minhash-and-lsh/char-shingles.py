def shingles(text, k):
    if len(text) < k:
        return []
    out = {text[i:i + k] for i in range(len(text) - k + 1)}
    return sorted(out)
