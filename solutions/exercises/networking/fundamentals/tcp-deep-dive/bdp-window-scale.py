def window_for_bdp(bandwidth_mbps, rtt_ms):
    bdp = bandwidth_mbps * rtt_ms * 125

    shift = 0
    while shift < 14 and 65535 * (2 ** shift) < bdp:
        shift += 1

    return [bdp, shift]
