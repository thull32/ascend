import re
import unicodedata

_INVISIBLE = {"​", "‌", "‍", "⁠", "﻿"}


def _normalize(s):
    s = "".join(ch for ch in s if ch not in _INVISIBLE)
    s = unicodedata.normalize("NFKC", s)
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def flag_injection(text, phrases):
    padded_text = " " + _normalize(text) + " "
    matches = set()
    for phrase in phrases:
        padded_phrase = " " + _normalize(phrase) + " "
        if padded_phrase in padded_text:
            matches.add(phrase)
    return sorted(matches)
