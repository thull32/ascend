const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function geohash_encode(lat, lng, precision) {
  let latLo = -90.0;
  let latHi = 90.0;
  let lngLo = -180.0;
  let lngHi = 180.0;
  let isLng = true;
  let bitCount = 0;
  let value = 0;
  const out = [];

  while (out.length < precision) {
    if (isLng) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) {
        value = value * 2 + 1;
        lngLo = mid;
      } else {
        value = value * 2;
        lngHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) {
        value = value * 2 + 1;
        latLo = mid;
      } else {
        value = value * 2;
        latHi = mid;
      }
    }

    isLng = !isLng;
    bitCount += 1;
    if (bitCount === 5) {
      out.push(BASE32[value]);
      bitCount = 0;
      value = 0;
    }
  }

  return out.join("");
}
