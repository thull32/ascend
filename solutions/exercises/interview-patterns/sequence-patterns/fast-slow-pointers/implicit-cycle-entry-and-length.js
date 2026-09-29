function find_cycle(nxt, start) {
  let slow = start, fast = start;
  do {
    slow = nxt[slow];
    fast = nxt[nxt[fast]];
  } while (slow !== fast);

  let entry = start;
  while (entry !== slow) {
    entry = nxt[entry];
    slow = nxt[slow];
  }

  let length = 1;
  let cur = nxt[entry];
  while (cur !== entry) {
    cur = nxt[cur];
    length += 1;
  }

  return [entry, length];
}
