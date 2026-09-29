const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function decodeBbox(gh) {
  const latRange = [-90.0, 90.0];
  const lonRange = [-180.0, 180.0];
  let isLon = true;
  for (const c of gh) {
    const idx = BASE32.indexOf(c);
    for (let bit = 4; bit >= 0; bit--) {
      const bitval = (idx >> bit) & 1;
      if (isLon) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        if (bitval) lonRange[0] = mid;
        else lonRange[1] = mid;
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        if (bitval) latRange[0] = mid;
        else latRange[1] = mid;
      }
      isLon = !isLon;
    }
  }
  return [latRange, lonRange];
}

function encode(lat, lon, precision) {
  const latRange = [-90.0, 90.0];
  const lonRange = [-180.0, 180.0];
  let geohash = "";
  let bit = 0;
  let ch = 0;
  let even = true;
  while (geohash.length < precision) {
    if (even) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (lon >= mid) {
        ch |= (1 << (4 - bit));
        lonRange[0] = mid;
      } else {
        lonRange[1] = mid;
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        ch |= (1 << (4 - bit));
        latRange[0] = mid;
      } else {
        latRange[1] = mid;
      }
    }
    even = !even;
    if (bit < 4) {
      bit += 1;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

function geohash_neighbors(gh) {
  const [latRange, lonRange] = decodeBbox(gh);
  const latCenter = (latRange[0] + latRange[1]) / 2;
  const lonCenter = (lonRange[0] + lonRange[1]) / 2;
  const latHeight = latRange[1] - latRange[0];
  const lonWidth = lonRange[1] - lonRange[0];
  const precision = gh.length;

  function wrapLon(lon) {
    while (lon < -180) lon += 360;
    while (lon >= 180) lon -= 360;
    return lon;
  }

  const directions = [
    [latHeight, 0],
    [latHeight, lonWidth],
    [0, lonWidth],
    [-latHeight, lonWidth],
    [-latHeight, 0],
    [-latHeight, -lonWidth],
    [0, -lonWidth],
    [latHeight, -lonWidth],
  ];

  return directions.map(([dlat, dlon]) => {
    const nlat = latCenter + dlat;
    const nlon = wrapLon(lonCenter + dlon);
    return encode(nlat, nlon, precision);
  });
}
