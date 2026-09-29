function gradient_descent_step(xs, ys, w, b, lr) {
  const n = xs.length;
  let dwSum = 0;
  let dbSum = 0;
  for (let i = 0; i < n; i++) {
    const err = (w * xs[i] + b) - ys[i];
    dwSum += err * xs[i];
    dbSum += err;
  }
  const dw = (2 * dwSum) / n;
  const db = (2 * dbSum) / n;
  return [w - lr * dw, b - lr * db];
}
