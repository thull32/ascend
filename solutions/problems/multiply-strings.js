// Multiply Strings: schoolbook column multiplication into a digit-position array with carries.
function multiply(num1, num2) {
  if (num1 === "0" || num2 === "0") {
    return "0";
  }
  const m = num1.length;
  const n = num2.length;
  const pos = new Array(m + n).fill(0);

  for (let i = m - 1; i >= 0; i--) {
    const a = num1.charCodeAt(i) - 48;
    for (let j = n - 1; j >= 0; j--) {
      const b = num2.charCodeAt(j) - 48;
      const total = a * b + pos[i + j + 1];
      pos[i + j + 1] = total % 10;
      pos[i + j] += Math.floor(total / 10);
    }
  }

  let digits = pos.join("").replace(/^0+/, "");
  return digits === "" ? "0" : digits;
}
