# Encode a single, final WebSocket frame as lowercase hex.

def ws_frame(opcode, payload_hex, mask_hex):
    payload = bytes.fromhex(payload_hex)
    mask = bytes.fromhex(mask_hex)
    masked = len(mask) == 4

    out = bytearray()
    out.append(0x80 | opcode)

    length = len(payload)
    mask_bit = 0x80 if masked else 0x00
    if length < 126:
        out.append(mask_bit | length)
    elif length < 65536:
        out.append(mask_bit | 126)
        out += length.to_bytes(2, "big")
    else:
        out.append(mask_bit | 127)
        out += length.to_bytes(8, "big")

    if masked:
        out += mask
        out += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    else:
        out += payload

    return out.hex()
