function broker_dedupe(batches) {
  const state = new Map();
  const out = [];

  for (const [pid, epoch, firstSeq, count] of batches) {
    const lastSeq = firstSeq + count - 1;
    const st = state.get(pid);

    if (st === undefined) {
      if (firstSeq === 0) {
        state.set(pid, { epoch, last: lastSeq, cache: [[firstSeq, lastSeq]] });
        out.push("accept");
      } else {
        out.push("out-of-order");
      }
      continue;
    }

    if (epoch < st.epoch) {
      out.push("fenced");
      continue;
    }

    if (epoch > st.epoch) {
      if (firstSeq === 0) {
        state.set(pid, { epoch, last: lastSeq, cache: [[firstSeq, lastSeq]] });
        out.push("accept");
      } else {
        out.push("out-of-order");
      }
      continue;
    }

    const cached = st.cache.some(([f, l]) => f === firstSeq && l === lastSeq);
    if (cached) {
      out.push("duplicate");
    } else if (firstSeq === st.last + 1) {
      st.last = lastSeq;
      st.cache.push([firstSeq, lastSeq]);
      if (st.cache.length > 5) st.cache.shift();
      out.push("accept");
    } else {
      out.push("out-of-order");
    }
  }

  return out;
}
