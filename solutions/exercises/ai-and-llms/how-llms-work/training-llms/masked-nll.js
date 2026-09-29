function masked_nll(probs, mask) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < probs.length; i++) {
    if (mask[i] === 1) {
      total += -Math.log(probs[i]);
      count += 1;
    }
  }
  if (count === 0) return 0;
  return total / count;
}
