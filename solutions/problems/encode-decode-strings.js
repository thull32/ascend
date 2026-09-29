// Length-prefix encoding: "len#chars" for each string, so decode always
// knows exactly how many characters to take even if they contain '#'.
function encode(strs) {
  return strs.map((s) => `${s.length}#${s}`).join("");
}

function decode(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const j = s.indexOf("#", i); // end of the length field
    const n = parseInt(s.slice(i, j), 10);
    const start = j + 1;
    out.push(s.slice(start, start + n));
    i = start + n;
  }
  return out;
}

function round_trip(strs) {
  return decode(encode(strs));
}
