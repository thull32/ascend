def cubic_window(w_max, times):
    C, BETA = 0.4, 0.7
    k = ((w_max * (1 - BETA)) / C) ** (1 / 3)

    out = []
    for t in times:
        w = C * (t - k) ** 3 + w_max
        out.append(round(w, 1))
    return out
