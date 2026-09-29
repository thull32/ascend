function simulate_abr(ladder, throughput_kbps, segment_s, reservoir_s, cushion_s) {
  let buffer_s = 0;
  let rebuffer_s = 0;
  const rungs = [];
  const lo = ladder[0];
  const hi = ladder[ladder.length - 1];

  for (let i = 0; i < throughput_kbps.length; i++) {
    const throughput = throughput_kbps[i];
    const b = buffer_s;
    let r;
    if (b <= reservoir_s) {
      r = lo;
    } else if (b >= reservoir_s + cushion_s) {
      r = hi;
    } else {
      r = lo;
      for (const rung of ladder) {
        if ((rung - lo) * cushion_s <= (b - reservoir_s) * (hi - lo)) {
          r = rung;
        }
      }
    }
    rungs.push(r);

    const downloadTime = (r * segment_s) / throughput;
    if (i === 0) {
      buffer_s = segment_s;
    } else {
      if (downloadTime > buffer_s) {
        rebuffer_s += downloadTime - buffer_s;
        buffer_s = 0;
      } else {
        buffer_s -= downloadTime;
      }
      buffer_s += segment_s;
    }
  }

  return { rungs, rebuffer_s };
}
