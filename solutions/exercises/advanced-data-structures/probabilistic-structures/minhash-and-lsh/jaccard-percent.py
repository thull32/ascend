def jaccard_percent(a, b):
    sa, sb = set(a), set(b)
    union = sa | sb
    if not union:
        return 100
    inter = sa & sb
    return round(100 * len(inter) / len(union))
