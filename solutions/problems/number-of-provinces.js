// Number of Provinces: union-find over the adjacency matrix, only scanning the upper triangle.
function count_provinces(is_connected) {
  const n = is_connected.length;
  const parent = new Array(n);
  const size = new Array(n).fill(1);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  let count = n;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (is_connected[i][j]) {
        let ri = find(i);
        let rj = find(j);
        if (ri !== rj) {
          if (size[ri] < size[rj]) {
            [ri, rj] = [rj, ri];
          }
          parent[rj] = ri;
          size[ri] += size[rj];
          count -= 1;
        }
      }
    }
  }
  return count;
}
