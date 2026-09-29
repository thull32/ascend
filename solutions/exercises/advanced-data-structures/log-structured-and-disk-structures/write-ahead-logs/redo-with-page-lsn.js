function redo(pages, log, checkpointLsn) {
  const pagesAfter = {};
  for (const [pid, entry] of Object.entries(pages)) {
    pagesAfter[pid] = entry.slice();
  }
  let applied = 0;

  for (const [lsn, pageId, value] of log) {
    if (lsn < checkpointLsn) continue;
    const [pageLsn] = pagesAfter[pageId] || [0, null];
    if (lsn > pageLsn) {
      pagesAfter[pageId] = [lsn, value];
      applied += 1;
    }
  }

  return [pagesAfter, applied];
}
