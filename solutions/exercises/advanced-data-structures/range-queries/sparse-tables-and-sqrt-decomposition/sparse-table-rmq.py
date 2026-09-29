def range_min_queries(values, queries):
    n = len(values)
    log = [0] * (n + 1)
    for i in range(2, n + 1):
        log[i] = log[i // 2] + 1
    k_max = log[n] + 1 if n > 0 else 1

    st = [values[:]]
    k = 1
    while (1 << k) <= n:
        prev = st[-1]
        half = 1 << (k - 1)
        length = n - (1 << k) + 1
        row = [min(prev[i], prev[i + half]) for i in range(length)]
        st.append(row)
        k += 1

    out = []
    for l, r in queries:
        length = r - l + 1
        k = log[length]
        out.append(min(st[k][l], st[k][r - (1 << k) + 1]))
    return out
