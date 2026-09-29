def map_reduce_word_count(splits, num_reducers):
    def partition(word):
        return sum(ord(c) for c in word) % num_reducers

    shuffled = 0
    reducer_counts = [{} for _ in range(num_reducers)]

    for split in splits:
        words = split.split()
        combined = {}
        for w in words:
            combined[w] = combined.get(w, 0) + 1
        shuffled += len(combined)
        for w, c in combined.items():
            p = partition(w)
            reducer_counts[p][w] = reducer_counts[p].get(w, 0) + c

    reducers = [
        [[w, count] for w, count in sorted(rc.items())]
        for rc in reducer_counts
    ]

    return {"shuffled": shuffled, "reducers": reducers}
