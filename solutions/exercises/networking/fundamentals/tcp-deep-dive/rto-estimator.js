function rto_estimates(samples) {
  const out = [];
  let srtt = null;
  let rttvar = null;

  for (const r of samples) {
    if (srtt === null) {
      srtt = r;
      rttvar = r / 2;
    } else {
      rttvar = 0.75 * rttvar + 0.25 * Math.abs(srtt - r);
      srtt = 0.875 * srtt + 0.125 * r;
    }

    let rto = srtt + 4 * rttvar;
    rto = Math.max(200, Math.min(120000, rto));
    out.push(Math.floor(rto));
  }

  return out;
}
