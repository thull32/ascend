import re

LINE_RE = re.compile(
    r'^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*[=:][ \t]*)(\S.*)$'
)
API_KEY_RE = re.compile(r'asc_(?:live|test)_[0-9a-f]{24}')
BEARER_RE = re.compile(r'Bearer ([A-Za-z0-9\-._~+/=]+)')

SENSITIVE_WORDS = ("SECRET", "PASSWORD", "TOKEN")


def _redact_line(line):
    m = LINE_RE.match(line)
    if not m:
        return line
    prefix, name, sep, value = m.groups()
    if any(word in name.upper() for word in SENSITIVE_WORDS):
        return prefix + name + sep + "[REDACTED]"
    return line


def redact(text):
    text = "\n".join(_redact_line(line) for line in text.split("\n"))
    text = API_KEY_RE.sub("[REDACTED]", text)
    text = BEARER_RE.sub("Bearer [REDACTED]", text)
    return text
