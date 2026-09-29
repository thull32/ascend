def apply_frames(last_seq, frames):
    upto = last_seq
    buffer = set()
    rendered = []
    duplicates = 0

    for seq in frames:
        if seq <= upto or seq in buffer:
            duplicates += 1
            continue
        buffer.add(seq)
        while (upto + 1) in buffer:
            upto += 1
            buffer.discard(upto)
            rendered.append(upto)

    gaps = []
    if buffer:
        highest_buffered = max(buffer)
        gaps = [s for s in range(upto + 1, highest_buffered + 1) if s not in buffer]

    return {"rendered": rendered, "gaps": gaps, "duplicates": duplicates}
