def estimate_rows(stats, op, value):
    rows = stats["rows"]
    null_frac = stats["null_frac"]
    n_distinct = stats["n_distinct"]
    mcv = stats["mcv"]
    histogram = stats["histogram"]

    mcv_sum = sum(freq for _, freq in mcv)
    rest = 1 - null_frac - mcv_sum

    if op == "=":
        for v, freq in mcv:
            if v == value:
                selectivity = freq
                break
        else:
            denom = n_distinct - len(mcv)
            selectivity = rest / denom if denom > 0 else 0
    else:  # "<"
        selectivity = sum(freq for v, freq in mcv if v < value)
        if histogram:
            k = len(histogram) - 1
            b0 = histogram[0]
            bk = histogram[-1]
            if value <= b0:
                f = 0
            elif value >= bk:
                f = 1
            else:
                i = 0
                for j in range(len(histogram) - 1):
                    if histogram[j] <= value:
                        i = j
                f = (i + (value - histogram[i]) / (histogram[i + 1] - histogram[i])) / k
        else:
            f = 0
        selectivity += rest * f

    return round(selectivity * rows)
