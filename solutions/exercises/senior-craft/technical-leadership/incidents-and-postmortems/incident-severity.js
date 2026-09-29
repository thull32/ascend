const RESPONSE = {
  SEV1: [true, true, 15, "required"],
  SEV2: [true, true, 30, "required"],
  SEV3: [false, false, null, "optional"],
  SEV4: [false, false, null, "none"],
};

function classify_incident(incident) {
  const { users_pct, core_flow, data_or_security, workaround } = incident;

  let sev;
  if (data_or_security || (core_flow && users_pct > 25)) {
    sev = "SEV1";
  } else if (
    (core_flow && users_pct >= 5) ||
    (!core_flow && users_pct > 25 && !workaround)
  ) {
    sev = "SEV2";
  } else if (users_pct > 0) {
    sev = "SEV3";
  } else {
    sev = "SEV4";
  }

  const [page, ic, update_minutes, postmortem] = RESPONSE[sev];
  return { sev, page, ic, update_minutes, postmortem };
}
