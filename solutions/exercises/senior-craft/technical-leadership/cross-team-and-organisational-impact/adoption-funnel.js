function adoption_status(services) {
  if (services.length === 0) {
    return { by_count: 0, by_traffic: 0, stalled: [], bottleneck: null };
  }

  const onLibrary = services.filter(
    (s) => s.stage === "adopted" || s.stage === "complete"
  );
  const by_count = Math.floor((100 * onLibrary.length) / services.length);
  const by_traffic = onLibrary.reduce((sum, s) => sum + s.calls, 0);

  const stalled = services
    .filter((s) => s.stage !== "adopted" && s.stage !== "complete" && s.weeks >= 4)
    .map((s) => s.name)
    .sort();

  const aware = services.filter((s) => s.stage === "aware").length;
  const trial = services.filter((s) => s.stage === "trial").length;
  let bottleneck;
  if (aware === 0 && trial === 0) bottleneck = null;
  else if (aware >= trial) bottleneck = "aware";
  else bottleneck = "trial";

  return { by_count, by_traffic, stalled, bottleneck };
}
