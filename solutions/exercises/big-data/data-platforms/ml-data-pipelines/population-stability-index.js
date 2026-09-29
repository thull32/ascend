function psi(expected, actual) {
  const totalE = expected.reduce((a, b) => a + b, 0);
  const totalA = actual.reduce((a, b) => a + b, 0);

  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    let e = totalE ? expected[i] / totalE : 0;
    let a = totalA ? actual[i] / totalA : 0;
    if (e === 0) e = 0.0001;
    if (a === 0) a = 0.0001;
    result += (a - e) * Math.log(a / e);
  }

  return Math.round(result * 10000) / 10000;
}
