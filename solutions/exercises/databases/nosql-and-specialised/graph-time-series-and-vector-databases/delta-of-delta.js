function dodBits(dod) {
  if (dod === 0) return 1;
  if (dod >= -63 && dod <= 64) return 9;
  if (dod >= -255 && dod <= 256) return 12;
  if (dod >= -2047 && dod <= 2048) return 16;
  return 36;
}

function encode_timestamps(ts) {
  if (ts.length === 0) return { encoded: [], bits: 0 };
  if (ts.length === 1) return { encoded: [ts[0]], bits: 64 };

  const encoded = [ts[0], ts[1] - ts[0]];
  let bits = 64 + 32;
  let prevDelta = ts[1] - ts[0];

  for (let i = 2; i < ts.length; i++) {
    const delta = ts[i] - ts[i - 1];
    const dod = delta - prevDelta;
    encoded.push(dod);
    bits += dodBits(dod);
    prevDelta = delta;
  }

  return { encoded, bits };
}
