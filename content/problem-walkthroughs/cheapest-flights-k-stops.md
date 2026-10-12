---
problem: cheapest-flights-k-stops
args: [4, [[0, 1, 100], [1, 2, 100], [2, 3, 100], [0, 2, 500], [0, 3, 900]], 0, 3, 1]
frames: 39
source: 93e369b27b085434
---
@0-3
Four cities, and we fly from city 0 to city 3 with at most one stop. Five flights: 0 to 1, 1 to 2, and 2 to 3, each costing 100; 0 to 2 for 500; and 0 to 3 direct for 900. The cheapest route overall is the 300 chain through 1 and 2, but it makes two stops, so it is not allowed. One stop means at most two flights. Bellman-Ford fits that limit exactly, because of one invariant: after round i, each price is the cheapest way to reach that city using at most i flights. So we run two rounds. The prices start at infinity everywhere except the start city, which costs zero.

@4-8
Round one. First, the line that makes the invariant hold: we copy the prices. This round reads only last round's prices and writes into the copy. The flight from 0 to 1: zero plus 100 beats infinity, so city 1 costs 100.

@9-12
The flight from 1 to 2. Last round, city 1 was still infinity, so this does nothing. The copy already says 100 for city 1, but we read from the old prices on purpose. Reading the new one here would chain two flights in one round. The same goes for 2 to 3.

@13-18
The flight from 0 to 2 sets city 2 to 500, and the direct flight sets city 3 to 900. After round one, with at most one flight: city 1 costs 100, city 2 costs 500, city 3 costs 900.

@19-27
The copy becomes the new prices, and round two begins with a fresh copy. The flight from 0 to 1 cannot improve on 100. The flight from 1 to 2 now reads city 1 at 100, so city 2 drops to 200: two flights, through city 1.

@28-30
Here is the line that decides the answer. The flight from 2 to 3 reads city 2 from last round, which is 500, not the 200 we just wrote. So city 3 becomes 600, beating 900. The 200 route to city 2 already used two flights; taking a third would be two stops.

@31-36
The remaining flights from city 0 cannot beat the current prices. After round two, with at most two flights: city 1 costs 100, city 2 costs 200, and city 3 costs 600.

@37-38
We return 600: fly 0 to 2, then 2 to 3, one stop. The cost is k plus 1 rounds, each scanning every flight, and linear space.

Two mistakes this problem is built to catch. Relax in place, without the copy, and this edge order chains 0 to 1 to 2 to 3 inside round one and returns 300, ignoring the stop limit. And plain Dijkstra with a visited set fails too: it locks in the cheapest price for a city even when that route used up all the allowed flights, and throws away a pricier route with fewer flights that was the only one able to continue.
