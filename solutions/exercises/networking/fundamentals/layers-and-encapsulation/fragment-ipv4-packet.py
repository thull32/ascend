def fragment_ipv4(total_length, header_len, mtu, df):
    if total_length <= mtu:
        return [[0, total_length, False]]

    if df:
        return f"ICMP frag-needed mtu={mtu}"

    payload = total_length - header_len
    per_frag_payload = (mtu - header_len) // 8 * 8

    fragments = []
    sent = 0
    while sent < payload:
        remaining = payload - sent
        if remaining > per_frag_payload:
            chunk = per_frag_payload
            more = True
        else:
            chunk = remaining
            more = False
        offset = sent // 8
        fragments.append([offset, header_len + chunk, more])
        sent += chunk

    return fragments
