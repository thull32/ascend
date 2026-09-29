// Parse a text/event-stream into dispatched events, per the HTML spec.

function parse_sse(chunks) {
  const text = chunks.join("");
  const lines = [];
  let pos = 0;
  const n = text.length;
  while (pos < n) {
    let i = pos;
    while (i < n && text[i] !== "\r" && text[i] !== "\n") i++;
    lines.push(text.slice(pos, i));
    if (i >= n) {
      pos = i;
      break;
    }
    if (text[i] === "\r" && i + 1 < n && text[i + 1] === "\n") {
      pos = i + 2;
    } else {
      pos = i + 1;
    }
  }

  const events = [];
  let eventType = "";
  let dataBuf = [];
  let lastId = "";

  for (const line of lines) {
    if (line === "") {
      if (dataBuf.length === 0) {
        eventType = "";
        dataBuf = [];
        continue;
      }
      const data = dataBuf.join("\n");
      events.push([eventType || "message", data, lastId]);
      eventType = "";
      dataBuf = [];
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
    if (field === "event") eventType = value;
    else if (field === "data") dataBuf.push(value);
    else if (field === "id") lastId = value;
  }

  return events;
}
