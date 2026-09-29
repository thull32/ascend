function coordinator_read(replies, r) {
  const contacted = [];
  for (let i = 0; i < replies.length; i++) {
    const rep = replies[i];
    if (rep !== null) {
      contacted.push([i, rep[0], rep[1]]);
      if (contacted.length === r) break;
    }
  }

  if (contacted.length < r) return null;

  let winner = contacted[0];
  for (const c of contacted) {
    if (c[2] > winner[2] || (c[2] === winner[2] && c[1] > winner[1])) {
      winner = c;
    }
  }

  const repair = contacted
    .filter((c) => !(c[1] === winner[1] && c[2] === winner[2]))
    .map((c) => c[0])
    .sort((a, b) => a - b);

  return [winner[1], repair];
}
