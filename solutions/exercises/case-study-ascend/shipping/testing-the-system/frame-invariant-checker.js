function frame_violations(frames, max_frames) {
  const problems = [];

  if (frames.length === 0) return ["no frames"];

  frames.forEach((frame, i) => {
    const note = frame.note;
    if (note.trim() === "") {
      problems.push(`${i}: empty note`);
    } else if (note.includes("undefined") || note.includes("NaN")) {
      problems.push(`${i}: bad note`);
    }

    const nodes = new Set(frame.nodes);
    for (const [from, to] of frame.messages) {
      if (!nodes.has(from)) problems.push(`${i}: unknown node ${from}`);
      if (!nodes.has(to)) problems.push(`${i}: unknown node ${to}`);
    }
  });

  if (frames.length > max_frames + 1) problems.push("too many frames");

  if (frames[frames.length - 1].tag !== "done") problems.push("last frame not done");

  return problems;
}
