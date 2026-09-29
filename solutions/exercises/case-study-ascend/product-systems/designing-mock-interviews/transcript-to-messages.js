const ROLE_MAP = { candidate: "user", interviewer: "assistant" };

function transcript_to_messages(entries) {
  let mapped = entries
    .filter(([role]) => role in ROLE_MAP)
    .map(([role, content]) => [ROLE_MAP[role], content]);

  let i = 0;
  while (i < mapped.length && mapped[i][0] === "assistant") i++;
  mapped = mapped.slice(i);

  const merged = [];
  for (const [role, content] of mapped) {
    if (merged.length > 0 && merged[merged.length - 1][0] === role) {
      merged[merged.length - 1][1] += "\n\n" + content;
    } else {
      merged.push([role, content]);
    }
  }

  while (merged.length > 0 && merged[merged.length - 1][0] === "assistant") {
    merged.pop();
  }

  return merged;
}
