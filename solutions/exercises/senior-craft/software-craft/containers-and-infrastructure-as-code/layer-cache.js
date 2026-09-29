function matchesInput(input, path) {
  if (input === ".") return true;
  if (input.endsWith("/")) return path.startsWith(input);
  return path === input;
}

function rebuilt_layers(layers, changed) {
  let first = -1;
  for (let i = 0; i < layers.length; i++) {
    const hit = layers[i].inputs.some((inp) => changed.some((p) => matchesInput(inp, p)));
    if (hit) {
      first = i;
      break;
    }
  }
  if (first === -1) return [];
  return layers.slice(first).map((l) => l.cmd);
}
