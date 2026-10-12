---
problem: house-robber-ii
args: [[2, 1, 1, 2]]
frames: 25
source: 85c8a0c16152a4d8
---
@0-2
Four houses in a ring, holding two, one, one and two. On a straight street you would take both twos for four. But in a ring the first and last houses are neighbours, so that is illegal. The insight: the ring differs from the street by exactly one edge, between the first house and the last. Any legal selection skips the first house or skips the last. So solve the straight street twice, once without the last house and once without the first, and take the better answer. We note there are four houses, which is more than one, and define the straight-street helper.

@3-5
The first call covers houses zero to two, leaving out the last. The helper keeps two rolling values: the best total up to the house before, and the best up to the house before that. Both start at zero.

@6-7
House zero holds two. Rob it, and the best becomes two.

@8-9
House one holds one. Robbing it means adding one to the best from two houses back, which is zero, for one. Skipping it keeps two. Skip wins, and the best stays two.

@10-13
House two holds one. Rob it, and we add one to the two from two houses back, for three. Skipping keeps two. Rob wins: three. The first path, without the last house, is worth three.

@14-15
The second call covers houses one to three, leaving out the first. The rolling values start at zero again.

@16-17
House one holds one. Rob it: the best is one.

@18-19
House two also holds one. Robbing it would give zero plus one, which is one, no better than skipping. The best stays one, and two houses back is now one.

@20-23
House three holds two. Rob it: one from two houses back, plus two, is three. Skipping keeps one. Three wins. The second path is also worth three.

@24
The answer is the larger of three and three: three. That is right. In the ring you can take one of the twos plus the one that is not next to it, never both twos.

Two linear passes, so time is linear, and the space is constant because each pass keeps only two rolling values and walks an index range instead of copying the array. Two mistakes to watch. Forgetting the single-house case, where both ranges are empty and the answer would come out as zero. And excluding both ends in one run, which throws away every selection that uses exactly one end.
