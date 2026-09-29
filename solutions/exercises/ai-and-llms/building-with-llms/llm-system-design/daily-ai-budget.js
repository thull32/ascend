function run_budget(limits, events) {
  const s = { requests: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 };
  const results = [];

  for (const event of events) {
    if (event[0] === "reserve") {
      const billedInput =
        s.input + Math.floor((s.cache_write * 5) / 4) + Math.floor(s.cache_read / 10);
      if (
        s.requests < limits.requests &&
        billedInput < limits.input &&
        s.output < limits.output
      ) {
        s.requests += 1;
        results.push("ok");
      } else {
        results.push("refused");
      }
    } else if (event[0] === "record") {
      const [, inp, out, cacheRead, cacheWrite] = event;
      s.input += inp;
      s.output += out;
      s.cache_read += cacheRead;
      s.cache_write += cacheWrite;
    }
  }

  return results;
}
