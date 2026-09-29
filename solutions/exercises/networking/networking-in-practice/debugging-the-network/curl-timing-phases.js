function curl_phases(t) {
  const dns = t.namelookup;
  const tcp = t.connect - t.namelookup;
  const tls = t.appconnect > 0 ? t.appconnect - t.connect : 0;
  const server = t.starttransfer - t.pretransfer;
  const transfer = t.total - t.starttransfer;
  return { dns, tcp, tls, server, transfer };
}
