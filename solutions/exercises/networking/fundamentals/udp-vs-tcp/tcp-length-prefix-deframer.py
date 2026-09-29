def deframe(chunks):
    messages = []
    buf = bytearray()

    for chunk_hex in chunks:
        buf.extend(bytes.fromhex(chunk_hex))
        while True:
            if len(buf) < 2:
                break
            length = (buf[0] << 8) | buf[1]
            if len(buf) < 2 + length:
                break
            payload = bytes(buf[2 : 2 + length])
            messages.append(payload.hex())
            del buf[: 2 + length]

    return messages
