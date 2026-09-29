def retrieval_metrics(results, relevant, k):
    recall_sum = 0.0
    rr_sum = 0.0
    evaluated = 0

    for qid, rel_ids in relevant.items():
        if not rel_ids:
            continue
        ranking = results.get(qid, [])[:k]
        rel_set = set(rel_ids)
        hits = sum(1 for d in ranking if d in rel_set)
        recall = hits / len(rel_ids)

        rr = 0.0
        for idx, d in enumerate(ranking, start=1):
            if d in rel_set:
                rr = 1.0 / idx
                break

        recall_sum += recall
        rr_sum += rr
        evaluated += 1

    if evaluated == 0:
        return {"recall_at_k": 0, "mrr": 0, "evaluated": 0}
    return {
        "recall_at_k": round(recall_sum / evaluated, 3),
        "mrr": round(rr_sum / evaluated, 3),
        "evaluated": evaluated,
    }
