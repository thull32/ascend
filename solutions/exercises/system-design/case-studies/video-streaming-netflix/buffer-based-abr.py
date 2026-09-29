def simulate_abr(ladder, throughput_kbps, segment_s, reservoir_s, cushion_s):
    buffer_s = 0.0
    rebuffer_s = 0.0
    rungs = []
    lo = ladder[0]
    hi = ladder[-1]

    for i, throughput in enumerate(throughput_kbps):
        b = buffer_s
        if b <= reservoir_s:
            r = lo
        elif b >= reservoir_s + cushion_s:
            r = hi
        else:
            r = lo
            for rung in ladder:
                if (rung - lo) * cushion_s <= (b - reservoir_s) * (hi - lo):
                    r = rung
        rungs.append(r)

        download_time = r * segment_s / throughput
        if i == 0:
            buffer_s = segment_s
        else:
            if download_time > buffer_s:
                rebuffer_s += download_time - buffer_s
                buffer_s = 0.0
            else:
                buffer_s -= download_time
            buffer_s += segment_s

    return {"rungs": rungs, "rebuffer_s": rebuffer_s}
