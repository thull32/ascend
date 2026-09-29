function run_saga(steps, pivot, outcomes) {
  const actions = [];
  const done = [];
  const attemptCount = {};
  let i = 0;

  while (i < steps.length) {
    const name = steps[i];
    const attempt = attemptCount[name] || 0;
    const outs = outcomes[name] || [];
    const outcome = attempt < outs.length ? outs[attempt] : "ok";
    attemptCount[name] = attempt + 1;
    actions.push(name);

    if (outcome === "ok") {
      done.push(name);
      i += 1;
    } else if (outcome === "timeout") {
      continue;
    } else {
      // fail
      if (i <= pivot) {
        for (let k = done.length - 1; k >= 0; k--) {
          actions.push("undo " + done[k]);
        }
        return { actions, status: "compensated" };
      }
      continue;
    }
  }

  return { actions, status: "committed" };
}
