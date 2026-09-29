def rga_text(ops):
    seq = []  # elements: [id, ch, deleted]

    def find_index(anchor):
        if anchor is None:
            return -1
        for i, el in enumerate(seq):
            if el[0] == anchor:
                return i
        return -1

    for op in ops:
        if op[0] == "ins":
            _, id_, anchor, ch = op
            pos = find_index(anchor) + 1
            while pos < len(seq) and seq[pos][0] > id_:
                pos += 1
            seq.insert(pos, [id_, ch, False])
        else:  # del
            _, id_ = op
            for el in seq:
                if el[0] == id_:
                    el[2] = True
                    break

    return "".join(el[1] for el in seq if not el[2])
