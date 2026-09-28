// Server-Sent Events parsing, per the WHATWG HTML "event stream" rules.
//
// `EventSource` cannot POST a JSON body, so the app reads the stream with
// `fetch` and parses it here. The details that matter:
//
// * A line ends at CRLF, LF or a lone CR. The server (axum) starts a new
//   `data:` line after every CR or LF inside a payload, so a reply that
//   contains "\r" arrives as two `data:` lines split at the CR. Splitting on
//   "\n" alone would leave "a\rdata: b" as one line and show the prefix.
// * A chunk can end between the CR and the LF of a CRLF. A trailing CR is
//   held back until the next chunk (or the end of the stream) says whether an
//   LF follows; otherwise one CRLF would count as two line ends and dispatch
//   a half-built event.
// * A blank line dispatches the event. Multiple `data:` lines join with "\n".
//   One space after the colon is removed. Lines starting with ":" are
//   comments (the server's keep-alive pings).

export interface SseEvent {
  event: string;
  data: string;
}

export interface SseParser {
  /** Feed decoded text; complete events are passed to `onEvent`. */
  feed(chunk: string): void;
  /** The stream ended: flush a pending line and a pending event. */
  end(): void;
}

export function createSseParser(onEvent: (e: SseEvent) => void): SseParser {
  let buffer = "";
  let event = "";
  let data: string[] = [];

  const dispatch = () => {
    if (data.length > 0) onEvent({ event: event || "message", data: data.join("\n") });
    data = [];
    event = "";
  };

  const line = (text: string) => {
    if (text === "") return dispatch();
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    // `id` and `retry` are part of the format but this client does not
    // reconnect, so they are ignored, as are unknown fields.
  };

  // Emit every complete line in `buffer`. A CR as the very last character is
  // ambiguous (it may be the first half of a CRLF) unless the stream ended.
  const drain = (final: boolean) => {
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const c = buffer[i];
      if (c === "\n") {
        line(buffer.slice(start, i));
        start = i + 1;
      } else if (c === "\r") {
        if (i + 1 === buffer.length && !final) break;
        line(buffer.slice(start, i));
        if (buffer[i + 1] === "\n") i++;
        start = i + 1;
      }
    }
    buffer = buffer.slice(start);
  };

  return {
    feed(chunk) {
      buffer += chunk;
      drain(false);
    },
    end() {
      drain(true);
      if (buffer !== "") line(buffer);
      buffer = "";
      dispatch();
    },
  };
}
