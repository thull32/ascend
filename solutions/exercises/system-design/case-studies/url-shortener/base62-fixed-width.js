const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function base62_encode(n, width) {
  let digits = n === 0 ? "0" : "";
  while (n > 0) {
    digits = ALPHABET[n % 62] + digits;
    n = Math.floor(n / 62);
  }
  return digits.padStart(width, "0");
}
