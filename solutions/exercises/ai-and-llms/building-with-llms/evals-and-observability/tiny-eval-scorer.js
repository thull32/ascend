function score_eval(cases, outputs) {
  let passed = 0;
  const failed = [];
  const by_tag = {};
  const total = cases.length;

  for (const c of cases) {
    const cid = c.id;
    const tags = c.tags || [];
    const mustInclude = c.must_include || [];
    const mustNotInclude = c.must_not_include || [];
    const output = Object.prototype.hasOwnProperty.call(outputs, cid) ? outputs[cid] : undefined;

    let ok = false;
    if (output !== undefined) {
      const lowerOut = output.toLowerCase();
      ok =
        mustInclude.every((s) => lowerOut.includes(s.toLowerCase())) &&
        !mustNotInclude.some((s) => lowerOut.includes(s.toLowerCase()));
    }

    if (ok) {
      passed += 1;
    } else {
      failed.push(cid);
    }

    for (const tag of tags) {
      if (!(tag in by_tag)) by_tag[tag] = [0, 0];
      by_tag[tag][1] += 1;
      if (ok) by_tag[tag][0] += 1;
    }
  }

  const pass_rate = total > 0 ? Math.round((passed / total) * 1000) / 1000 : 0;
  return { pass_rate, failed, by_tag };
}
