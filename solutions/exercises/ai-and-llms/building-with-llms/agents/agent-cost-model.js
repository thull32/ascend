function agent_cost(prefix, adds, budget) {
  let calls = 0, total = 0, write = 0, read = 0;
  let prevInput = null;
  let currentInput = prefix;
  let i = 0;
  while (true) {
    if (total + currentInput > budget) break;
    calls += 1;
    total += currentInput;
    if (prevInput === null) {
      write += currentInput;
    } else {
      write += currentInput - prevInput;
      read += prevInput;
    }
    prevInput = currentInput;
    if (i >= adds.length) break;
    currentInput = prevInput + adds[i];
    i += 1;
  }
  return { calls, total_input: total, cache_write: write, cache_read: read };
}
