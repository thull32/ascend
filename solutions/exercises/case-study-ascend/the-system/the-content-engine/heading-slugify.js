const KEEP = /[\p{Alphabetic}\p{Mark}\p{Nd}\p{Pc}]/u;

function slugify(text) {
  text = text.toLowerCase();
  let out = "";
  for (const c of text) {
    if (c === " " || c === "-") {
      out += "-";
      continue;
    }
    if (KEEP.test(c)) out += c;
  }
  return out;
}

function heading_ids(headings) {
  const ids = [];
  const counts = {};
  const taken = new Set();

  for (const heading of headings) {
    const slug = slugify(heading);
    let candidate = slug;
    if (taken.has(candidate)) {
      let n = (counts[slug] || 0) + 1;
      candidate = `${slug}-${n}`;
      while (taken.has(candidate)) {
        n += 1;
        candidate = `${slug}-${n}`;
      }
      counts[slug] = n;
    }
    taken.add(candidate);
    ids.push(candidate);
  }

  return ids;
}
