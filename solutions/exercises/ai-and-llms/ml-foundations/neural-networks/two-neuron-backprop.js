function backprop_step(x, y, w1, b1, w2, b2, lr) {
  const z1 = w1 * x + b1;
  const h = 1 / (1 + Math.exp(-z1));
  const yHat = w2 * h + b2;

  const dYhat = yHat - y;
  const dW2 = dYhat * h;
  const dB2 = dYhat;
  const dH = dYhat * w2;
  const dZ1 = dH * h * (1 - h);
  const dW1 = dZ1 * x;
  const dB1 = dZ1;

  return [w1 - lr * dW1, b1 - lr * dB1, w2 - lr * dW2, b2 - lr * dB2];
}
