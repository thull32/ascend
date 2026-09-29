BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def _decode_bbox(gh):
    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]
    is_lon = True
    for c in gh:
        idx = BASE32.index(c)
        for bit in range(4, -1, -1):
            bitval = (idx >> bit) & 1
            if is_lon:
                mid = (lon_range[0] + lon_range[1]) / 2
                if bitval:
                    lon_range[0] = mid
                else:
                    lon_range[1] = mid
            else:
                mid = (lat_range[0] + lat_range[1]) / 2
                if bitval:
                    lat_range[0] = mid
                else:
                    lat_range[1] = mid
            is_lon = not is_lon
    return lat_range, lon_range


def _encode(lat, lon, precision):
    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]
    geohash = []
    bit = 0
    ch = 0
    even = True
    while len(geohash) < precision:
        if even:
            mid = (lon_range[0] + lon_range[1]) / 2
            if lon >= mid:
                ch |= (1 << (4 - bit))
                lon_range[0] = mid
            else:
                lon_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat >= mid:
                ch |= (1 << (4 - bit))
                lat_range[0] = mid
            else:
                lat_range[1] = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0
    return "".join(geohash)


def geohash_neighbors(gh):
    lat_range, lon_range = _decode_bbox(gh)
    lat_center = (lat_range[0] + lat_range[1]) / 2
    lon_center = (lon_range[0] + lon_range[1]) / 2
    lat_height = lat_range[1] - lat_range[0]
    lon_width = lon_range[1] - lon_range[0]
    precision = len(gh)

    def wrap_lon(lon):
        while lon < -180:
            lon += 360
        while lon >= 180:
            lon -= 360
        return lon

    directions = [
        (lat_height, 0),        # N
        (lat_height, lon_width),  # NE
        (0, lon_width),          # E
        (-lat_height, lon_width),  # SE
        (-lat_height, 0),        # S
        (-lat_height, -lon_width),  # SW
        (0, -lon_width),         # W
        (lat_height, -lon_width),  # NW
    ]

    result = []
    for dlat, dlon in directions:
        nlat = lat_center + dlat
        nlon = wrap_lon(lon_center + dlon)
        result.append(_encode(nlat, nlon, precision))
    return result
