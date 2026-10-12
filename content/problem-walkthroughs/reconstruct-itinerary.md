---
problem: reconstruct-itinerary
args: [[["JFK", "SEA"], ["SEA", "LAX"], ["LAX", "JFK"], ["JFK", "ATL"]]]
frames: 51
source: dff3dca40b7fe99b
---
@0
Four tickets: JFK to Seattle, Seattle to Los Angeles, Los Angeles back to JFK, and JFK to Atlanta. Use every ticket once, start at JFK, and when there is a choice, take the alphabetically smaller airport. Here is the trap: from JFK the smaller choice is Atlanta, and Atlanta is a dead end, with three tickets still unused. Airports are nodes and tickets are edges, and a trip that uses every edge once is an Eulerian path. Hierholzer's algorithm finds one without any backtracking: walk until you get stuck, and write an airport into the route only when you leave it for good. Then reverse.

@1-9
Build the graph. The tickets are sorted in reverse, so each airport's list has its smallest destination at the end, where popping it is cheap. JFK's list is Seattle, then Atlanta, with Atlanta on the end.

@10-16
The stack starts at JFK, and the route is empty. JFK has tickets, so take the smallest, Atlanta, and push it.

@17-20
Atlanta has no tickets out. We are stuck, so Atlanta comes off the stack and goes into the route first. That looks backwards, but the route is built in reverse: whatever we get stuck at first ends up last. And a dead end is exactly where the trip has to finish.

@21-24
Back at JFK, one ticket is left: to Seattle. Push Seattle.

@25-32
Seattle's ticket goes to Los Angeles, and Los Angeles's ticket goes back to JFK. The stack is JFK, Seattle, Los Angeles, JFK.

@33-36
JFK has no tickets left now, so it goes into the route: Atlanta, JFK.

@37-48
Every airport on the stack is now out of tickets, so they come off one by one: Los Angeles, Seattle, and finally the starting JFK. The route reads Atlanta, JFK, Los Angeles, Seattle, JFK.

@49-50
Reversed, the trip is JFK, Seattle, Los Angeles, JFK, Atlanta. The early detour to Atlanta became the ending, which is the only place it fits. Each ticket is pushed and popped once, so the walk is linear, and sorting the tickets costs E log E. Common mistakes: marking airports as visited, when it is tickets that are used once; collapsing duplicate tickets into a set; and appending airports when you arrive instead of when you leave, which just replays the greedy walk into the dead end.
