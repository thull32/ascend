const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function encode(n, width) {
  let digits = n === 0 ? "0" : "";
  while (n > 0) {
    digits = ALPHABET[n % 62] + digits;
    n = Math.floor(n / 62);
  }
  return digits.padStart(width, "0");
}

function create_links(existing, draws, n, width, max_attempts) {
  const taken = new Set(existing);
  const keys = [];
  let collisions = 0;
  let drawIdx = 0;
  let ranOut = false;

  for (let r = 0; r < n; r++) {
    if (ranOut) {
      keys.push(null);
      continue;
    }

    let result = null;
    for (let attempt = 0; attempt < max_attempts; attempt++) {
      if (drawIdx >= draws.length) {
        ranOut = true;
        break;
      }
      const val = draws[drawIdx];
      drawIdx += 1;
      const key = encode(val, width);
      if (!taken.has(key)) {
        taken.add(key);
        result = key;
        break;
      }
      collisions += 1;
    }

    keys.push(result);
  }

  return { keys, collisions };
}
