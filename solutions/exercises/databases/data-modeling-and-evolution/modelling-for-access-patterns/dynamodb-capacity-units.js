function units(nBytes, unitSize) {
  return Math.max(1, Math.ceil(nBytes / unitSize));
}

function capacity_units(op, sizes, strong) {
  if (op === "get") {
    const total = sizes.reduce((s, x) => s + units(x, 4096), 0);
    return strong ? total : total / 2;
  }
  if (op === "query") {
    const total = units(sizes.reduce((s, x) => s + x, 0), 4096);
    return strong ? total : total / 2;
  }
  if (op === "transact_get") {
    const total = sizes.reduce((s, x) => s + units(x, 4096), 0);
    return total * 2;
  }
  if (op === "write") {
    return sizes.reduce((s, x) => s + units(x, 1024), 0);
  }
  if (op === "transact_write") {
    return sizes.reduce((s, x) => s + units(x, 1024), 0) * 2;
  }
  throw new Error(op);
}
