const AXES = ["scope", "ambiguity", "impact", "influence"];

function axisLevel(items) {
  for (const candidate of [6, 5, 4]) {
    const quarters = new Set(
      items.filter((it) => it.level >= candidate).map((it) => it.quarter)
    );
    if (quarters.size >= 2) return candidate;
  }
  return 0;
}

function packet_level(evidence, target) {
  const axes = {};
  for (const axis of AXES) {
    axes[axis] = axisLevel(evidence.filter((it) => it.axis === axis));
  }

  const atOrAbove = AXES.filter((a) => axes[a] >= target);
  const gaps = AXES.filter((a) => axes[a] < target);

  let supported = false;
  if (atOrAbove.length === 4) {
    supported = true;
  } else if (atOrAbove.length === 3 && gaps.length === 1 && axes[gaps[0]] === target - 1) {
    supported = true;
  }

  return { axes, supported, gaps };
}
