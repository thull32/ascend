// nccl-tests' algorithm and bus bandwidth from one measured collective.

const FACTORS = {
  allreduce: (n) => (2 * (n - 1)) / n,
  reducescatter: (n) => (n - 1) / n,
  allgather: (n) => (n - 1) / n,
  alltoall: (n) => (n - 1) / n,
  broadcast: () => 1,
  reduce: () => 1,
};

function bus_bandwidth(op, n, size_bytes, time_us) {
  const algbw = size_bytes / time_us / 1000; // bytes per microsecond / 1000 = GB/s (10^9 bytes)
  const busbw = algbw * FACTORS[op](n);
  const r2 = (x) => Math.round(x * 100) / 100;
  return { algbw: r2(algbw), busbw: r2(busbw) };
}
