def frame_violations(frames, max_frames):
    problems = []

    if not frames:
        return ["no frames"]

    for i, frame in enumerate(frames):
        note = frame["note"]
        if note.strip() == "":
            problems.append(f"{i}: empty note")
        elif "undefined" in note or "NaN" in note:
            problems.append(f"{i}: bad note")

        nodes = set(frame["nodes"])
        for from_id, to_id in frame["messages"]:
            if from_id not in nodes:
                problems.append(f"{i}: unknown node {from_id}")
            if to_id not in nodes:
                problems.append(f"{i}: unknown node {to_id}")

    if len(frames) > max_frames + 1:
        problems.append("too many frames")

    if frames[-1]["tag"] != "done":
        problems.append("last frame not done")

    return problems
