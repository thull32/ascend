function rebuild(events, snapshot) {
  const balances = {};
  const versions = {};
  const held = {};
  let applied = 0;
  let skipped = 0;

  for (const stream of Object.keys(snapshot)) {
    const [bal, ver] = snapshot[stream];
    balances[stream] = bal;
    versions[stream] = ver;
  }

  function applyVal(bal, typ, amount) {
    if (typ === "Opened") return amount;
    if (typ === "Deposited") return bal + amount;
    return bal - amount; // Withdrawn
  }

  for (const [stream, version, typ, amount] of events) {
    const last0 = versions[stream] || 0;
    if (!held[stream]) held[stream] = {};
    const streamHeld = held[stream];
    if (version <= last0 || Object.prototype.hasOwnProperty.call(streamHeld, version)) {
      skipped += 1;
      continue;
    }
    if (version === last0 + 1) {
      balances[stream] = applyVal(balances[stream] || 0, typ, amount);
      applied += 1;
      let last = version;
      versions[stream] = last;
      while (Object.prototype.hasOwnProperty.call(streamHeld, last + 1)) {
        const [ntyp, namount] = streamHeld[last + 1];
        delete streamHeld[last + 1];
        balances[stream] = applyVal(balances[stream] || 0, ntyp, namount);
        applied += 1;
        last += 1;
        versions[stream] = last;
      }
    } else {
      streamHeld[version] = [typ, amount];
    }
  }

  const stalled = Object.keys(held).filter(s => Object.keys(held[s]).length > 0).sort();
  return { balances, applied, skipped, stalled };
}
