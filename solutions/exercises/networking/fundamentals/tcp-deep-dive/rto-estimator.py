def rto_estimates(samples):
    out = []
    srtt = None
    rttvar = None

    for r in samples:
        if srtt is None:
            srtt = float(r)
            rttvar = r / 2.0
        else:
            rttvar = 0.75 * rttvar + 0.25 * abs(srtt - r)
            srtt = 0.875 * srtt + 0.125 * r

        rto = srtt + 4 * rttvar
        rto = max(200, min(120000, rto))
        out.append(int(rto // 1))

    return out
