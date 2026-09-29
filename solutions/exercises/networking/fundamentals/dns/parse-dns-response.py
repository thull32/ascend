_TYPE_NAMES = {1: "A", 2: "NS", 5: "CNAME", 6: "SOA"}


def parse_dns_response(hex_str):
    b = bytes.fromhex(hex_str)

    txid = (b[0] << 8) | b[1]
    flags = (b[2] << 8) | b[3]
    rcode = flags & 0x0F
    qdcount = (b[4] << 8) | b[5]
    ancount = (b[6] << 8) | b[7]
    nscount = (b[8] << 8) | b[9]

    def read_name(offset):
        labels = []
        pos = offset
        end_offset = None
        while True:
            length = b[pos]
            if length == 0:
                pos += 1
                if end_offset is None:
                    end_offset = pos
                break
            if (length & 0xC0) == 0xC0:
                pointer = ((length & 0x3F) << 8) | b[pos + 1]
                if end_offset is None:
                    end_offset = pos + 2
                pos = pointer
                continue
            label = b[pos + 1 : pos + 1 + length].decode("ascii")
            labels.append(label)
            pos += 1 + length
        name = ".".join(labels) + "." if labels else "."
        return name, end_offset

    offset = 12
    for _ in range(qdcount):
        _, offset = read_name(offset)
        offset += 4  # QTYPE + QCLASS

    def read_record(offset):
        name, offset = read_name(offset)
        rtype = (b[offset] << 8) | b[offset + 1]
        offset += 2
        offset += 2  # class
        ttl = int.from_bytes(b[offset : offset + 4], "big")
        offset += 4
        rdlength = (b[offset] << 8) | b[offset + 1]
        offset += 2
        rdata_start = offset
        rdata_end = offset + rdlength

        if rtype == 1:
            data = ".".join(str(x) for x in b[rdata_start:rdata_end])
        elif rtype in (2, 5):
            data, _ = read_name(rdata_start)
        elif rtype == 6:
            mname, pos = read_name(rdata_start)
            rname, pos = read_name(pos)
            serial = int.from_bytes(b[pos : pos + 4], "big")
            refresh = int.from_bytes(b[pos + 4 : pos + 8], "big")
            retry = int.from_bytes(b[pos + 8 : pos + 12], "big")
            expire = int.from_bytes(b[pos + 12 : pos + 16], "big")
            minimum = int.from_bytes(b[pos + 16 : pos + 20], "big")
            data = f"{mname} {rname} {serial} {refresh} {retry} {expire} {minimum}"
        else:
            data = b[rdata_start:rdata_end].hex()

        type_name = _TYPE_NAMES.get(rtype, f"TYPE{rtype}")
        return [name, type_name, ttl, data], rdata_end

    answers = []
    for _ in range(ancount):
        record, offset = read_record(offset)
        answers.append(record)

    authority = []
    for _ in range(nscount):
        record, offset = read_record(offset)
        authority.append(record)

    return {"id": txid, "rcode": rcode, "answers": answers, "authority": authority}
