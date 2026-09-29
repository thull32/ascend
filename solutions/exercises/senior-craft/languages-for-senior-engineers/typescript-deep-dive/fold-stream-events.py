def fold_stream(events):
    state = {
        "text": "",
        "input_tokens": 0,
        "output_tokens": 0,
        "stop_reason": None,
        "error": None,
        "ignored": 0,
    }
    finished = False
    for e in events:
        if finished:
            state["ignored"] += 1
            continue
        kind = e["kind"]
        if kind == "delta":
            state["text"] += e["text"]
        elif kind == "done":
            state["input_tokens"] = e["input_tokens"]
            state["output_tokens"] = e["output_tokens"]
            state["stop_reason"] = e["stop_reason"]
            finished = True
        elif kind == "error":
            state["error"] = e["message"]
            finished = True
        else:
            state["ignored"] += 1
    return state
