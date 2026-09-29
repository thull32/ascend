function _normalize(s) {
  s = s.replace(/[​‌‍⁠﻿]/g, "");
  s = s.normalize("NFKC");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s;
}

function flag_injection(text, phrases) {
  const paddedText = " " + _normalize(text) + " ";
  const matches = new Set();
  for (const phrase of phrases) {
    const paddedPhrase = " " + _normalize(phrase) + " ";
    if (paddedText.includes(paddedPhrase)) {
      matches.add(phrase);
    }
  }
  return [...matches].sort();
}
