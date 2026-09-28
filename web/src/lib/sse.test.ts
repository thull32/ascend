import { describe, expect, it } from "vitest";
import { createSseParser, type SseEvent } from "./sse";

function parse(chunks: string[]): SseEvent[] {
  const out: SseEvent[] = [];
  const p = createSseParser((e) => out.push(e));
  for (const c of chunks) p.feed(c);
  p.end();
  return out;
}

describe("SSE parser", () => {
  it("parses named events and joins multi-line data with LF", () => {
    expect(parse(["event: delta\ndata: one\ndata: two\n\n"])).toEqual([{ event: "delta", data: "one\ntwo" }]);
  });

  it("treats a lone CR as a line end, as axum emits it", () => {
    // axum's own encoding of the payload "sunset bye\r" (from its tests).
    expect(parse(["event: delta\ndata: sunset bye\rdata: \n\n"])).toEqual([{ event: "delta", data: "sunset bye\n" }]);
  });

  it("round-trips axum's encoding of a payload full of CR and LF", () => {
    // axum encodes "{\r\"foo\":  \n\r\r   \"bar\\n\"\n}" like this.
    const wire = 'data: {\rdata: "foo":  \ndata: \rdata: \rdata:    "bar\\n"\ndata: }\n\n';
    expect(parse([wire])).toEqual([{ event: "message", data: '{\n"foo":  \n\n\n   "bar\\n"\n}' }]);
  });

  it("does not split one CRLF into two line ends across chunks", () => {
    // Without holding the trailing CR, the CR would end the data line and
    // the LF would then read as a blank line and dispatch early.
    expect(parse(["event: delta\r\ndata: a\r", "\ndata: b\r\n\r\n"])).toEqual([{ event: "delta", data: "a\nb" }]);
  });

  it("handles a chunk boundary anywhere, including mid-field", () => {
    const wire = "event: delta\ndata: hello\n\nevent: done\ndata: {\"output_tokens\":3}\n\n";
    const whole = parse([wire]);
    for (let cut = 1; cut < wire.length; cut++) {
      expect(parse([wire.slice(0, cut), wire.slice(cut)])).toEqual(whole);
    }
  });

  it("ignores comments (keep-alive pings) and strips only one leading space", () => {
    expect(parse([":ping\n\ndata:  two spaces\n\n"])).toEqual([{ event: "message", data: " two spaces" }]);
  });

  it("dispatches nothing for an event without data, and resets the event name", () => {
    expect(parse(["event: delta\n\ndata: x\n\n"])).toEqual([{ event: "message", data: "x" }]);
  });

  it("flushes a final event that lacks the closing blank line", () => {
    expect(parse(["event: error\ndata: interrupted"])).toEqual([{ event: "error", data: "interrupted" }]);
  });
});
