def run_budget(limits, events):
    s = {"requests": 0, "input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    results = []

    for event in events:
        if event[0] == "reserve":
            billed_input = s["input"] + (s["cache_write"] * 5) // 4 + s["cache_read"] // 10
            if (
                s["requests"] < limits["requests"]
                and billed_input < limits["input"]
                and s["output"] < limits["output"]
            ):
                s["requests"] += 1
                results.append("ok")
            else:
                results.append("refused")
        elif event[0] == "record":
            _, inp, out, cache_read, cache_write = event
            s["input"] += inp
            s["output"] += out
            s["cache_read"] += cache_read
            s["cache_write"] += cache_write

    return results
