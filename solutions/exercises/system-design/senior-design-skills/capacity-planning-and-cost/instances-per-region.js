function instances_per_region(peak_rps, per_instance_rps, target_pct, regions) {
  const load = regions > 1 ? peak_rps / (regions - 1) : peak_rps;
  const usable = (per_instance_rps * target_pct) / 100;
  const n = Math.ceil(load / usable);
  return Math.max(n, 2);
}
