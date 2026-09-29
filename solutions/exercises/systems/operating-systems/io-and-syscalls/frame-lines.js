function frame_lines(chunks) {
  const lines = [];
  let rest = "";
  for (const c of chunks) {
    if (c === null || c === undefined) continue;
    let start = rest.length;
    rest += c;
    while (true) {
      const idx = rest.indexOf("\n", start);
      if (idx === -1) break;
      lines.push(rest.slice(0, idx));
      rest = rest.slice(idx + 1);
      start = 0;
    }
  }
  return { lines, rest };
}
