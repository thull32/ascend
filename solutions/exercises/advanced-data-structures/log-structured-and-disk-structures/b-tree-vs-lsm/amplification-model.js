function amplification(rowBytes, pageBytes, dataBytes, l1Bytes, fanout) {
  const btreeWriteAmp = Math.floor(pageBytes / rowBytes);

  let capacity = l1Bytes;
  let total = 0;
  let lsmLevels = 0;
  while (total < dataBytes) {
    total += capacity;
    lsmLevels += 1;
    capacity *= fanout;
  }

  const lsmWriteAmp = 1 + fanout * (lsmLevels - 1);

  return [btreeWriteAmp, lsmLevels, lsmWriteAmp];
}
