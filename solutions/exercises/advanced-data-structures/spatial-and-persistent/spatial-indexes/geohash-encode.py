BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash_encode(lat, lng, precision):
    lat_lo, lat_hi = -90.0, 90.0
    lng_lo, lng_hi = -180.0, 180.0
    is_lng = True
    bit_count = 0
    value = 0
    out = []

    while len(out) < precision:
        if is_lng:
            mid = (lng_lo + lng_hi) / 2
            if lng >= mid:
                value = value * 2 + 1
                lng_lo = mid
            else:
                value = value * 2
                lng_hi = mid
        else:
            mid = (lat_lo + lat_hi) / 2
            if lat >= mid:
                value = value * 2 + 1
                lat_lo = mid
            else:
                value = value * 2
                lat_hi = mid

        is_lng = not is_lng
        bit_count += 1
        if bit_count == 5:
            out.append(BASE32[value])
            bit_count = 0
            value = 0

    return "".join(out)
