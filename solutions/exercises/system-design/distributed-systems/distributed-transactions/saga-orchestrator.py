def run_saga(steps, pivot, outcomes):
    actions = []
    done = []
    attempt_count = {}
    i = 0
    while i < len(steps):
        name = steps[i]
        attempt = attempt_count.get(name, 0)
        outs = outcomes.get(name, [])
        outcome = outs[attempt] if attempt < len(outs) else "ok"
        attempt_count[name] = attempt + 1
        actions.append(name)

        if outcome == "ok":
            done.append(name)
            i += 1
        elif outcome == "timeout":
            continue
        else:  # fail
            if i <= pivot:
                for d in reversed(done):
                    actions.append("undo " + d)
                return {"actions": actions, "status": "compensated"}
            continue

    return {"actions": actions, "status": "committed"}
