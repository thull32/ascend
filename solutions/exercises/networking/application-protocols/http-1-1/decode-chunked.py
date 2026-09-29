# Decode a chunked HTTP/1.1 body.

HEX = set("0123456789abcdefABCDEF")


def decode_chunked(data):
    pos, body = 0, []
    n = len(data)
    while True:
        nl = data.find("\r\n", pos)
        if nl == -1:
            return {"error": "incomplete"}
        size_line = data[pos:nl]
        size_text = size_line.split(";", 1)[0]
        if not size_text or any(c not in HEX for c in size_text):
            return {"error": "malformed"}
        size = int(size_text, 16)
        pos = nl + 2
        if size > 0:
            if pos + size + 2 > n:
                return {"error": "incomplete"}
            chunk = data[pos:pos + size]
            if data[pos + size:pos + size + 2] != "\r\n":
                return {"error": "malformed"}
            body.append(chunk)
            pos = pos + size + 2
        else:
            # size == 0: skip trailer lines until an empty line
            while True:
                nl2 = data.find("\r\n", pos)
                if nl2 == -1:
                    return {"error": "incomplete"}
                if nl2 == pos:
                    pos = nl2 + 2
                    break
                pos = nl2 + 2
            return {"body": "".join(body), "consumed": pos}
