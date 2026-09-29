def curl_phases(t):
    dns = t["namelookup"]
    tcp = t["connect"] - t["namelookup"]
    tls = (t["appconnect"] - t["connect"]) if t["appconnect"] > 0 else 0
    server = t["starttransfer"] - t["pretransfer"]
    transfer = t["total"] - t["starttransfer"]
    return {"dns": dns, "tcp": tcp, "tls": tls, "server": server, "transfer": transfer}
