import math


def estimate(dau, writes_per_user, read_write_ratio, peak_factor,
             bytes_per_write, retention_days, replication, rps_per_server):
    daily_writes = dau * writes_per_user
    write_rps = math.ceil(daily_writes / 86400)
    read_rps = math.ceil(daily_writes * read_write_ratio / 86400)
    peak_rps = math.ceil(daily_writes * (1 + read_write_ratio) / 86400 * peak_factor)
    storage_gb = math.ceil(daily_writes * bytes_per_write * retention_days * replication / 1e9)
    servers = math.ceil(peak_rps / rps_per_server) + 1
    return {
        "write_rps": write_rps,
        "read_rps": read_rps,
        "peak_rps": peak_rps,
        "storage_gb": storage_gb,
        "servers": servers,
    }
