def broker_dedupe(batches):
    state = {}
    out = []

    for pid, epoch, first_seq, count in batches:
        last_seq = first_seq + count - 1
        st = state.get(pid)

        if st is None:
            if first_seq == 0:
                state[pid] = {"epoch": epoch, "last": last_seq, "cache": [(first_seq, last_seq)]}
                out.append("accept")
            else:
                out.append("out-of-order")
            continue

        if epoch < st["epoch"]:
            out.append("fenced")
            continue

        if epoch > st["epoch"]:
            if first_seq == 0:
                state[pid] = {"epoch": epoch, "last": last_seq, "cache": [(first_seq, last_seq)]}
                out.append("accept")
            else:
                out.append("out-of-order")
            continue

        # same epoch
        if (first_seq, last_seq) in st["cache"]:
            out.append("duplicate")
        elif first_seq == st["last"] + 1:
            st["last"] = last_seq
            st["cache"].append((first_seq, last_seq))
            if len(st["cache"]) > 5:
                st["cache"].pop(0)
            out.append("accept")
        else:
            out.append("out-of-order")

    return out
