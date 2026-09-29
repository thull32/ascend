def replay_lag_ms(samples, replay_lsn, now_ms):
    if replay_lsn >= samples[-1][1]:
        return 0

    i = 0
    for idx in range(len(samples)):
        if samples[idx][1] >= replay_lsn:
            i = idx
            break

    if i == 0:
        t = samples[0][0]
    else:
        t_prev, lsn_prev = samples[i - 1]
        t_cur, lsn_cur = samples[i]
        t = t_prev + (replay_lsn - lsn_prev) * (t_cur - t_prev) / (lsn_cur - lsn_prev)

    return round(now_ms - t)
