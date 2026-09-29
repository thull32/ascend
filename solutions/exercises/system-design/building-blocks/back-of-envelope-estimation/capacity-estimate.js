function estimate(dau, writes_per_user, read_write_ratio, peak_factor,
                  bytes_per_write, retention_days, replication, rps_per_server) {
  const dailyWrites = dau * writes_per_user;
  const writeRps = Math.ceil(dailyWrites / 86400);
  const readRps = Math.ceil(dailyWrites * read_write_ratio / 86400);
  const peakRps = Math.ceil(dailyWrites * (1 + read_write_ratio) / 86400 * peak_factor);
  const storageGb = Math.ceil(dailyWrites * bytes_per_write * retention_days * replication / 1e9);
  const servers = Math.ceil(peakRps / rps_per_server) + 1;
  return {
    write_rps: writeRps,
    read_rps: readRps,
    peak_rps: peakRps,
    storage_gb: storageGb,
    servers: servers,
  };
}
