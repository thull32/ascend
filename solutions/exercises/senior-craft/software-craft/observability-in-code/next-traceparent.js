function isHex(s, n) {
  return s.length === n && /^[0-9a-f]+$/.test(s);
}

function next_traceparent(header, span_id, fresh_trace_id) {
  const fresh = () => ({
    traceparent: `00-${fresh_trace_id}-${span_id}-01`,
    continued: false,
  });

  if (header === null || header === undefined) return fresh();

  const fields = header.split("-");
  if (fields.length < 4) return fresh();

  const [version, trace_id, parent_id, flags] = fields;

  if (!isHex(version, 2) || version === "ff") return fresh();
  if (version === "00" && fields.length !== 4) return fresh();
  if (!isHex(trace_id, 32) || trace_id === "0".repeat(32)) return fresh();
  if (!isHex(parent_id, 16) || parent_id === "0".repeat(16)) return fresh();
  if (!isHex(flags, 2)) return fresh();

  const sampled = (parseInt(flags, 16) & 1) === 1;
  return {
    traceparent: `00-${trace_id}-${span_id}-${sampled ? "01" : "00"}`,
    continued: true,
  };
}
