function send_completion_times(capacity, produce, consume) {
  const n = produce.length;
  const sent = new Array(n).fill(0);
  const received = new Array(n).fill(0);
  const done = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const ready = (i > 0 ? sent[i - 1] : 0) + produce[i];
    if (capacity === 0) {
      const recv = Math.max(ready, i > 0 ? done[i - 1] : 0);
      sent[i] = recv;
      received[i] = recv;
    } else {
      const floor = i >= capacity ? received[i - capacity] : 0;
      sent[i] = Math.max(ready, floor);
      received[i] = Math.max(sent[i], i > 0 ? done[i - 1] : 0);
    }
    done[i] = received[i] + consume[i];
  }

  return sent;
}
