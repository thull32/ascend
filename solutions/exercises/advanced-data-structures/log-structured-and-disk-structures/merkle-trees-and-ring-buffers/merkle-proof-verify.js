function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function merkle_proof_verify(leaf, index, proof, root) {
  let h = fnv1a(leaf);
  for (const sibling of proof) {
    if (index % 2 === 0) {
      h = fnv1a(String(h) + ":" + String(sibling));
    } else {
      h = fnv1a(String(sibling) + ":" + String(h));
    }
    index = Math.floor(index / 2);
  }
  return h === root;
}
