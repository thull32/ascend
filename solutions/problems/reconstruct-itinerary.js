// Reconstruct Itinerary: Hierholzer's algorithm (Eulerian path) with a stack,
// building the route in post-order and reversing at the end.
function find_itinerary(tickets) {
  const sorted = tickets.slice().sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1; // reverse order
    if (a[1] !== b[1]) return a[1] < b[1] ? 1 : -1;
    return 0;
  });

  const graph = new Map();
  for (const [src, dst] of sorted) {
    if (!graph.has(src)) graph.set(src, []);
    graph.get(src).push(dst); // reverse-sorted list: pop() gives the smallest
  }

  const stack = ["JFK"];
  const route = [];
  while (stack.length > 0) {
    const airport = stack[stack.length - 1];
    const dests = graph.get(airport);
    if (dests && dests.length > 0) {
      stack.push(dests.pop());
    } else {
      route.push(stack.pop());
    }
  }
  return route.reverse();
}
