// Greedy: whenever the running tank since the current candidate start goes
// negative, no station in that range can be a valid start, so advance past it.
function can_complete_circuit(gas, cost) {
  let total = 0; // net fuel over the whole lap
  let tank = 0; // fuel since the current candidate start
  let start = 0;
  for (let i = 0; i < gas.length; i++) {
    const diff = gas[i] - cost[i];
    total += diff;
    tank += diff;
    if (tank < 0) {
      start = i + 1;
      tank = 0;
    }
  }
  return total >= 0 ? start : -1;
}
