---
lesson: consensus-raft
viz: Election after leader failure
frames: 10
source: 9134c853c5219d4b
---
@0
Three servers, A, B and C, all followers. Each runs an election timer with a random length between 150 and 300 milliseconds. The randomness matters: it makes it unlikely that two of them give up on the leader at the same moment.

@1
A's timer fires first. A increments the term to 2, becomes a candidate, and votes for itself.

@2
A asks the others for their votes. A server grants its vote only if the candidate's term is at least its own, and the candidate's log is at least as up to date as its own. That second rule is what stops a server with missing entries from becoming leader.

@3
Both grant their vote. Each server votes at most once per term, and writes that vote to disk before replying, so a crash cannot make it vote twice.

@4
A now holds all 3 votes, more than the 2 that a majority of three needs, and becomes leader for term 2. Two majorities of the same group always share at least one server, and that server only voted once, so there can be at most one leader per term.

@5
The leader sends heartbeats. Each heartbeat resets the followers' election timers, so no new election starts while the leader keeps talking.

@6
Now a network partition cuts A off. B and C stop hearing heartbeats.

@7
C's timer fires first. It starts term 3 and asks for votes.

@8
B votes for C. C has 2 votes out of 3, which is a majority, even though A cannot be reached.

@9
C leads term 3. When A reconnects, the first message it sees carries a higher term, so it steps down to follower, and any entries it accepted but never committed are overwritten. Notice the shape of the safety argument: terms only go up, and every decision needs a majority.
