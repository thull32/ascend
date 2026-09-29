CONFLICTS = {
    "ACCESS SHARE": {"ACCESS EXCLUSIVE"},
    "ROW EXCLUSIVE": {"SHARE", "ACCESS EXCLUSIVE"},
    "SHARE UPDATE EXCLUSIVE": {"SHARE UPDATE EXCLUSIVE", "SHARE", "ACCESS EXCLUSIVE"},
    "SHARE": {"ROW EXCLUSIVE", "SHARE UPDATE EXCLUSIVE", "ACCESS EXCLUSIVE"},
    "ACCESS EXCLUSIVE": {
        "ACCESS SHARE",
        "ROW EXCLUSIVE",
        "SHARE UPDATE EXCLUSIVE",
        "SHARE",
        "ACCESS EXCLUSIVE",
    },
}


def _conflicts(a, b):
    return b in CONFLICTS[a] or a in CONFLICTS[b]


def _any_conflict(mode, others):
    return any(_conflicts(mode, m) for m in others)


def simulate_lock_queue(events):
    granted_log = []
    held = {}  # session -> mode
    waiting = []  # list of [session, mode]

    for ev in events:
        if ev[0] == "acquire":
            _, session, mode = ev
            held_modes = list(held.values())
            waiting_modes = [m for _, m in waiting]
            if not _any_conflict(mode, held_modes) and not _any_conflict(mode, waiting_modes):
                held[session] = mode
                granted_log.append(session)
            else:
                waiting.append([session, mode])
        else:  # "release"
            _, session = ev
            if session in held:
                del held[session]
            else:
                waiting = [w for w in waiting if w[0] != session]

            new_waiting = []
            blocked_modes = []
            for sess, mode in waiting:
                held_modes = list(held.values())
                if not _any_conflict(mode, held_modes) and not _any_conflict(mode, blocked_modes):
                    held[sess] = mode
                    granted_log.append(sess)
                else:
                    blocked_modes.append(mode)
                    new_waiting.append([sess, mode])
            waiting = new_waiting

    return {"granted": granted_log, "waiting": [s for s, _ in waiting]}
