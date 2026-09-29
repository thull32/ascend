# Parse a sequence of HTTP/2 frame headers from hex-encoded bytes.

TYPE_NAMES = {
    0: "DATA",
    1: "HEADERS",
    2: "PRIORITY",
    3: "RST_STREAM",
    4: "SETTINGS",
    5: "PUSH_PROMISE",
    6: "PING",
    7: "GOAWAY",
    8: "WINDOW_UPDATE",
    9: "CONTINUATION",
}


def parse_h2_frames(hex_str):
    b = bytes.fromhex(hex_str)
    frames = []
    pos = 0
    n = len(b)
    while pos + 9 <= n:
        length = (b[pos] << 16) | (b[pos + 1] << 8) | b[pos + 2]
        frame_type = b[pos + 3]
        flags = b[pos + 4]
        stream_id = (
            (b[pos + 5] << 24) | (b[pos + 6] << 16) | (b[pos + 7] << 8) | b[pos + 8]
        ) & 0x7FFFFFFF
        if pos + 9 + length > n:
            break
        type_name = TYPE_NAMES.get(frame_type, "UNKNOWN")
        frames.append([type_name, flags, stream_id, length])
        pos += 9 + length
    return frames
