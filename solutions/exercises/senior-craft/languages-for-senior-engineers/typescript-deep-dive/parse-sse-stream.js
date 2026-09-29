function splitLines(text) {
  const lines = [];
  let i = 0;
  const n = text.length;
  let start = 0;
  while (i < n) {
    const c = text[i];
    if (c === "\n") {
      lines.push(text.slice(start, i));
      i += 1;
      start = i;
    } else if (c === "\r") {
      lines.push(text.slice(start, i));
      if (i + 1 < n && text[i + 1] === "\n") {
        i += 2;
      } else {
        i += 1;
      }
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < n) lines.push(text.slice(start, n));
  return lines;
}

function parse_sse(chunks) {
  const events = [];
  let eventName = null;
  let dataLines = [];

  function dispatch() {
    if (dataLines.length > 0) {
      events.push([eventName || "message", dataLines.join("\n")]);
    }
    eventName = null;
    dataLines = [];
  }

  for (const line of splitLines(chunks.join(""))) {
    if (line === "") {
      dispatch();
      continue;
    }
    if (line.startsWith(":")) continue;
    let field, value;
    const idx = line.indexOf(":");
    if (idx !== -1) {
      field = line.slice(0, idx);
      value = line.slice(idx + 1);
      if (value.startsWith(" ")) value = value.slice(1);
    } else {
      field = line;
      value = "";
    }
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  }

  dispatch();
  return events;
}
