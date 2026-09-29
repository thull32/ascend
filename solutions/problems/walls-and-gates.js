// Multi-source BFS from every gate simultaneously: the first time a room is
// reached is its shortest distance to any gate.
function walls_and_gates(rooms) {
  const INF = 2147483647;
  if (!rooms || !rooms[0]) return rooms;
  const rows = rooms.length, cols = rooms[0].length;
  const queue = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rooms[r][c] === 0) queue.push([r, c]);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && rooms[nr][nc] === INF) {
        rooms[nr][nc] = rooms[r][c] + 1;
        queue.push([nr, nc]);
      }
    }
  }
  return rooms;
}
