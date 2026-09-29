function first_borrow_error(stmts) {
  const creation = new Map(); // name -> [createdIndex, kind]
  const lastUse = new Map();

  stmts.forEach((s, i) => {
    if (s[0] === "shared" || s[0] === "mut") {
      creation.set(s[1], [i, s[0]]);
      if (!lastUse.has(s[1])) lastUse.set(s[1], i);
    } else if (s[0] === "use") {
      lastUse.set(s[1], i);
    }
  });

  let moved = false;
  for (let i = 0; i < stmts.length; i++) {
    const kind = stmts[i][0];
    if (kind === "use") continue;
    if (moved) return i;

    let liveShared = false;
    let liveMut = false;
    for (const [name, [created, borrowKind]] of creation) {
      if (created < i && i < lastUse.get(name)) {
        if (borrowKind === "shared") liveShared = true;
        else liveMut = true;
      }
    }

    if (kind === "shared" || kind === "read") {
      if (liveMut) return i;
    } else if (kind === "mut" || kind === "write" || kind === "move") {
      if (liveShared || liveMut) return i;
    }

    if (kind === "move") moved = true;
  }

  return -1;
}
