import re

STOP = {"a", "an", "and", "the", "of", "to", "in", "is"}


def _analyze(text):
    tokens = re.split(r"[^a-z0-9]+", text.lower())
    return [t for t in tokens if t and t not in STOP]


def search(docs, query):
    query_terms = set(_analyze(query))
    if not query_terms:
        return []

    scored = []
    for i, doc in enumerate(docs):
        counts = {}
        for term in _analyze(doc):
            counts[term] = counts.get(term, 0) + 1
        if all(t in counts for t in query_terms):
            score = sum(counts[t] for t in query_terms)
            scored.append((i, score))

    scored.sort(key=lambda p: (-p[1], p[0]))
    return [i for i, _ in scored]
