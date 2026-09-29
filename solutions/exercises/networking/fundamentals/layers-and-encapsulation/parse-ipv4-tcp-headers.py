def parse_tcp_packet(hex_str):
    b = bytes.fromhex("".join(hex_str.split()))

    ihl = (b[0] & 0x0F) * 4
    total_length = (b[2] << 8) | b[3]
    flags_byte = b[6]
    df = bool(flags_byte & 0x40)
    ttl = b[8]
    src = ".".join(str(x) for x in b[12:16])
    dst = ".".join(str(x) for x in b[16:20])

    tcp = b[ihl:]
    sport = (tcp[0] << 8) | tcp[1]
    dport = (tcp[2] << 8) | tcp[3]
    seq = int.from_bytes(tcp[4:8], "big")
    ack = int.from_bytes(tcp[8:12], "big")
    data_offset = (tcp[12] >> 4) * 4
    tcp_flags_byte = tcp[13]
    window = (tcp[14] << 8) | tcp[15]

    tcp_header_len = ihl + data_offset
    payload_len = total_length - tcp_header_len

    letters = ""
    if tcp_flags_byte & 0x01:
        letters += "F"
    if tcp_flags_byte & 0x02:
        letters += "S"
    if tcp_flags_byte & 0x04:
        letters += "R"
    if tcp_flags_byte & 0x08:
        letters += "P"
    if tcp_flags_byte & 0x20:
        letters += "U"
    if tcp_flags_byte & 0x40:
        letters += "E"
    if tcp_flags_byte & 0x80:
        letters += "W"
    if tcp_flags_byte & 0x10:
        letters += "."

    return {
        "src": src,
        "dst": dst,
        "ttl": ttl,
        "df": df,
        "sport": sport,
        "dport": dport,
        "seq": seq,
        "ack": ack,
        "window": window,
        "payload_len": payload_len,
        "flags": letters,
    }
