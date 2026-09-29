def build_dns_query(txid, name, qtype):
    header = bytes(
        [
            (txid >> 8) & 0xFF,
            txid & 0xFF,
            0x01,
            0x00,
            0x00,
            0x01,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
        ]
    )

    qname = bytearray()
    labels = [label for label in name.split(".") if label != ""]
    for label in labels:
        data = label.encode("ascii")
        qname.append(len(data))
        qname.extend(data)
    qname.append(0)

    footer = bytes([(qtype >> 8) & 0xFF, qtype & 0xFF, 0x00, 0x01])

    return (header + bytes(qname) + footer).hex()
