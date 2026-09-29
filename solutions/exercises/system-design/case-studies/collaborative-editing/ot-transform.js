function transform(op, against, op_wins) {
  const result = op.slice();
  const pos = op[1];

  if (against[0] === "ins") {
    const aPos = against[1];
    if (aPos < pos) {
      result[1] = pos + 1;
    } else if (aPos === pos) {
      if (op[0] === "del") {
        result[1] = pos + 1;
      } else if (!op_wins) {
        result[1] = pos + 1;
      }
    }
    return result;
  } else {
    const dPos = against[1];
    if (dPos < pos) {
      result[1] = pos - 1;
    } else if (dPos === pos) {
      if (op[0] === "del") {
        return null;
      }
    }
    return result;
  }
}
