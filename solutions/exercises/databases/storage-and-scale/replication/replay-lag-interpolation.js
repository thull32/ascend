function replay_lag_ms(samples, replay_lsn, now_ms) {
  if (replay_lsn >= samples[samples.length - 1][1]) return 0;

  let i = 0;
  for (let idx = 0; idx < samples.length; idx++) {
    if (samples[idx][1] >= replay_lsn) {
      i = idx;
      break;
    }
  }

  let t;
  if (i === 0) {
    t = samples[0][0];
  } else {
    const [tPrev, lsnPrev] = samples[i - 1];
    const [tCur, lsnCur] = samples[i];
    t = tPrev + ((replay_lsn - lsnPrev) * (tCur - tPrev)) / (lsnCur - lsnPrev);
  }

  return Math.round(now_ms - t);
}
