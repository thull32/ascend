import math


def bm25_rank(docs, query):
    k1, b = 1.2, 0.75

    n = len(docs)
    if n == 0:
        return []

    avgdl = sum(len(d) for d in docs) / n

    query_terms = list(dict.fromkeys(query))  # dedupe, preserve order

    doc_freq = {t: 0 for t in query_terms}
    for d in docs:
        d_set = set(d)
        for t in query_terms:
            if t in d_set:
                doc_freq[t] += 1

    idf = {}
    for t in query_terms:
        n_t = doc_freq[t]
        idf[t] = math.log(1 + (n - n_t + 0.5) / (n_t + 0.5))

    scored = []
    for i, d in enumerate(docs):
        counts = {}
        for term in d:
            counts[term] = counts.get(term, 0) + 1
        score = 0.0
        for t in query_terms:
            tf = counts.get(t, 0)
            if tf > 0:
                score += idf[t] * tf / (tf + k1 * (1 - b + b * len(d) / avgdl))
        if score > 0:
            scored.append((i, score))

    scored.sort(key=lambda p: (-p[1], p[0]))
    return [i for i, _ in scored]
