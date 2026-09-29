def transform(op, against, op_wins):
    op = list(op)
    pos = op[1]

    if against[0] == "ins":
        a_pos = against[1]
        if a_pos < pos:
            op[1] = pos + 1
        elif a_pos == pos:
            if op[0] == "del":
                op[1] = pos + 1
            elif not op_wins:
                op[1] = pos + 1
        return op
    else:  # against is a delete
        d_pos = against[1]
        if d_pos < pos:
            op[1] = pos - 1
        elif d_pos == pos:
            if op[0] == "del":
                return None
        return op
