def recover(disk, log):
    state = dict(disk)

    committed = {rec[1] for rec in log if rec[0] == "commit"}

    # Redo: forward pass, apply every update's new_value.
    for rec in log:
        if rec[0] == "update":
            _, txn, key, old_value, new_value = rec
            state[key] = new_value

    # Undo: backward pass, restore old_value for losers.
    for rec in reversed(log):
        if rec[0] == "update":
            _, txn, key, old_value, new_value = rec
            if txn not in committed:
                state[key] = old_value

    return state
