function idGreater(a, b) {
  if (a[0] !== b[0]) return a[0] > b[0];
  return a[1] > b[1];
}

function idEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function rga_text(ops) {
  const seq = []; // elements: {id, ch, deleted}

  function findIndex(anchor) {
    if (anchor === null) return -1;
    for (let i = 0; i < seq.length; i++) {
      if (idEqual(seq[i].id, anchor)) return i;
    }
    return -1;
  }

  for (const op of ops) {
    if (op[0] === "ins") {
      const [, id, anchor, ch] = op;
      let pos = findIndex(anchor) + 1;
      while (pos < seq.length && idGreater(seq[pos].id, id)) {
        pos += 1;
      }
      seq.splice(pos, 0, { id, ch, deleted: false });
    } else {
      const [, id] = op;
      for (const el of seq) {
        if (idEqual(el.id, id)) {
          el.deleted = true;
          break;
        }
      }
    }
  }

  return seq.filter(el => !el.deleted).map(el => el.ch).join("");
}
