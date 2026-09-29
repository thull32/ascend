def pack_context(chunks, budget, per_doc, min_score):
    ordered = sorted(chunks, key=lambda c: (-c["score"], c["id"]))
    taken, total = [], 0
    doc_counts = {}
    for c in ordered:
        if c["score"] < min_score:
            continue
        doc = c["doc"]
        if doc_counts.get(doc, 0) >= per_doc:
            continue
        if total + c["tokens"] > budget:
            continue
        taken.append(c["id"])
        total += c["tokens"]
        doc_counts[doc] = doc_counts.get(doc, 0) + 1
    return {"ids": taken, "tokens": total}
