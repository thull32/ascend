function fnv1a_32(s) {
  let h = 0x811c9dc5; // offset basis
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}
