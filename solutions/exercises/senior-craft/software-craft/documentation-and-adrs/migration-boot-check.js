function migration_check(applied, image) {
  const appliedSet = new Set(applied);
  const imageSet = new Set(image);

  const unknown = applied.filter((v) => !imageSet.has(v));
  const unknownSorted = Array.from(new Set(unknown)).sort();
  const pending = image.filter((v) => !appliedSet.has(v));

  let plan;
  if (unknownSorted.length === 0 && pending.length === 0) plan = "up_to_date";
  else if (unknownSorted.length === 0) plan = "apply";
  else if (pending.length === 0) plan = "schema_ahead";
  else plan = "diverged";

  return {
    plan,
    boots: plan !== "diverged",
    unknown: unknownSorted,
    will_apply: plan === "apply" ? pending : [],
  };
}
