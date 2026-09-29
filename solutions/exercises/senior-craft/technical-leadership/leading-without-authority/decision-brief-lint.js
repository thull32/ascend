function norm(s) {
  return s.trim().toLowerCase();
}

function lint_brief(brief) {
  const issues = [];

  if (brief.approvers.length !== 1) issues.push("approver");

  if (!brief.decide_by) issues.push("deadline");

  const normOptions = brief.options.map(norm);
  const hasDoNothing = normOptions.includes("do nothing");
  if (!hasDoNothing) issues.push("do-nothing");

  const alternatives = normOptions.filter((o) => o !== "do nothing");
  if (alternatives.length < 2) issues.push("alternatives");

  const rec = brief.recommendation;
  if (!rec || !normOptions.includes(norm(rec))) issues.push("recommendation");

  const flip = brief.flip_condition;
  if (!flip || !flip.trim()) issues.push("flip-condition");

  const consulted = new Set(brief.consulted);
  for (const contributor of brief.contributors) {
    if (!consulted.has(contributor)) issues.push(`unconsulted:${contributor}`);
  }

  return issues;
}
