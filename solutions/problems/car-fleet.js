// Sort by starting position nearest the target first; a car joins the fleet
// ahead of it if it would arrive no later than that fleet's leader.
function car_fleet(target, position, speed) {
  const cars = position.map((pos, i) => [pos, speed[i]]);
  cars.sort((a, b) => b[0] - a[0]);
  const fleetTimes = [];
  for (const [pos, spd] of cars) {
    const time = (target - pos) / spd;
    if (fleetTimes.length === 0 || time > fleetTimes[fleetTimes.length - 1]) {
      fleetTimes.push(time);
    }
  }
  return fleetTimes.length;
}
