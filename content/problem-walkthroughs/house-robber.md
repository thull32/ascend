---
problem: house-robber
args: [[1, 3, 1, 3, 100]]
frames: 14
source: 24a773c00203c05f
---
@0-1
Five houses on a street, holding one, three, one, three and a hundred. You cannot rob two neighbours. Look only at the last house you have reached, and there are two cases. Skip it, and you keep the best total so far. Take it, and you add its value to the best total from two houses back, because its neighbour is off limits. So two numbers are all the state you need: the best up to the previous house, called one back, and the best up to the house before that, called two back. Both start at zero.

@2-3
The first house holds one. Taking it gives zero plus one, which beats skipping, so one back becomes one.

@4-5
The second house holds three. Taking it means three plus two back, which is zero: three. Skipping keeps one. Take wins, so one back is three. And the old one back, one, slides into two back. Both values shift one house to the right on every step.

@6-7
The third house holds one. Taking it gives one plus one, which is two. Skipping keeps three. Skip wins: one back stays three, and two back becomes three.

@8-9
The fourth house holds three. Taking it gives three plus three: six. That beats three, so one back is six. Notice what we have been doing without any special handling: a run of choices that is neither every other house from the start nor every other house from the second.

@10-11
The last house holds a hundred. Here is the moment that matters. Taking it adds a hundred to two back, which is three, for a hundred and three. Skipping keeps six. Take wins by a mile: one back is a hundred and three.

@12-13
We return one hundred and three: the three in the second house and the hundred in the last. Those are positions one and four, so the robber skipped two houses in a row in between. The tempting shortcut, taking either all the even positions or all the odd ones, gives a hundred and two or six, and misses this. The recurrence never assumes a pattern, so it finds it.

Time is one pass, linear in the number of houses, and space is two variables. Starting both at zero means the first house needs no special case. The classic mistakes: greedy on the largest value, which on eight, nine, eight takes the nine and misses sixteen; the even or odd split; and an off by one between the table's prefix length and the house's index, if you write the table version.
