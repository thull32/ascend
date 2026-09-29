def longest_even_vowels(s):
    vowel_bit = {'a': 0, 'e': 1, 'i': 2, 'o': 3, 'u': 4}
    first = [-1] * 32
    first[0] = 0
    mask = 0
    best = 0
    for j, ch in enumerate(s, start=1):
        if ch in vowel_bit:
            mask ^= 1 << vowel_bit[ch]
        if first[mask] == -1:
            first[mask] = j
        else:
            best = max(best, j - first[mask])
    return best
