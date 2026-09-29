function recover(disk, log) {
  const state = { ...disk };

  const committed = new Set(log.filter((rec) => rec[0] === "commit").map((rec) => rec[1]));

  // Redo: forward pass, apply every update's new_value.
  for (const rec of log) {
    if (rec[0] === "update") {
      const [, , key, , newValue] = rec;
      state[key] = newValue;
    }
  }

  // Undo: backward pass, restore old_value for losers.
  for (let i = log.length - 1; i >= 0; i--) {
    const rec = log[i];
    if (rec[0] === "update") {
      const [, txn, key, oldValue] = rec;
      if (!committed.has(txn)) {
        state[key] = oldValue;
      }
    }
  }

  return state;
}
