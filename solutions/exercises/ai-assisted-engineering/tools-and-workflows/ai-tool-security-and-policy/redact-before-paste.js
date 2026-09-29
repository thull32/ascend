const LINE_RE = /^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*[=:][ \t]*)(\S.*)$/;
const API_KEY_RE = /asc_(?:live|test)_[0-9a-f]{24}/g;
const BEARER_RE = /Bearer ([A-Za-z0-9\-._~+/=]+)/g;

const SENSITIVE_WORDS = ["SECRET", "PASSWORD", "TOKEN"];

function redactLine(line) {
  const m = LINE_RE.exec(line);
  if (!m) return line;
  const [, prefix, name, sep, value] = m;
  const upper = name.toUpperCase();
  if (SENSITIVE_WORDS.some(word => upper.includes(word))) {
    return prefix + name + sep + "[REDACTED]";
  }
  return line;
}

function redact(text) {
  let result = text.split("\n").map(redactLine).join("\n");
  result = result.replace(API_KEY_RE, "[REDACTED]");
  result = result.replace(BEARER_RE, "Bearer [REDACTED]");
  return result;
}
