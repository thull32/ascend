function rfc_status(events, fcp_days, day) {
  let state = "draft";
  let since = 0;
  let windowStart = null;

  function closeIfNeeded(uptoDay) {
    if (state === "fcp" && windowStart !== null) {
      const closingDay = windowStart + fcp_days;
      if (closingDay <= uptoDay) {
        state = "accepted";
        since = closingDay;
        windowStart = null;
      }
    }
  }

  for (const [evDay, kind] of events) {
    if (evDay > day) break;

    closeIfNeeded(evDay);
    if (state === "accepted" || state === "rejected" || state === "withdrawn") {
      continue;
    }

    if (kind === "submit" && state === "draft") {
      state = "in-review";
      since = evDay;
    } else if (kind === "resolve" && state === "in-review") {
      state = "fcp";
      since = evDay;
      windowStart = evDay;
    } else if (kind === "block" && state === "fcp") {
      state = "in-review";
      since = evDay;
      windowStart = null;
    } else if (kind === "reject" && (state === "in-review" || state === "fcp")) {
      state = "rejected";
      since = evDay;
      windowStart = null;
    } else if (
      kind === "withdraw" &&
      (state === "draft" || state === "in-review" || state === "fcp")
    ) {
      state = "withdrawn";
      since = evDay;
      windowStart = null;
    }
  }

  closeIfNeeded(day);

  return { state, since };
}
