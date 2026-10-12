---
lesson: presenting-a-design
source: 64b1e092da668af1
---
## 1

It is minute 25 of a 45-minute design interview, and you are still refining the high-level diagram. What is the best move?

A, finish the diagram, since a complete diagram is what gets scored. B, start the wrap-up early, so that you finish on time. C, announce the move, and go deep where the estimates point. D, ask the interviewer for ten more minutes to cover depth.

[think]

The answer is C: announce the move, and go deep where the estimates point.

The deep dive is where senior is decided, and running out of time before it is the most common failure. An announced cut to the deep dive the estimates point to shows prioritisation. A polished diagram with no depth scores as mid-level.

## 2

The interviewer raises data deletion for privacy while you are drawing the high-level design. You do not want to derail. What should you do?

A, switch at once to designing the deletion path. B, ignore it, and continue so the flow is not broken. C, park it on the board, and return to it at the end. D, tell the interviewer that privacy is out of scope here.

[think]

The answer is C: park it on the board, and return to it at the end.

Writing it in the parking lot, and saying you will return, shows you heard it and are prioritising, and covering it in the wrap-up shows follow-through. Ignoring or dismissing it loses the signal, and switching immediately hands the agenda to whatever is raised next.

## 3

The interviewer says: "I don't think last-writer-wins works here." What response scores best?

A, ask where it fails, then answer from the data. B, agree at once, and switch to a consensus-based store. C, offer three other conflict strategies to choose from. D, explain that last-writer-wins is Cassandra's default.

[think]

The answer is A: ask where it fails, then answer from the data.

Locating the disagreement first shows you treat pushback as a probe. Then the answer comes from the data: positions should take the latest action, so last-writer-wins by server time is right, while a counter would need a CRDT or a home region. Folding looks like there were no reasons, citing the default is not a reason, and a menu of options hands the decision back.

## 4

In the lesson's transcript, a candidate designs the Continue Watching row for a Netflix-scale service. Why did the candidate write only pause and stop events synchronously to the database, while heartbeats went through Kafka?

A, heartbeats are never stored, so they need no database write. B, synchronous writes are cheaper per event than Kafka writes. C, device switches happen at those moments, so they must be visible fast. D, Kafka cannot guarantee ordering for pause and stop events.

[think]

The answer is C: device switches happen at those moments, so they must be visible fast.

The device-switch requirement applies at the moments a person stops watching, so those events must be visible within seconds. Heartbeats are the bulk of the load, and tolerate asynchronous delay. Paying the synchronous cost only for the rare events meets the requirement without putting 350,000 writes a second on the synchronous path; heartbeats are still stored, asynchronously.

## 5

In the lesson's model of the interview clock, the checkpoint at minute 15 or minute 25 fired in 91 percent of simulated rounds. What is the right conclusion?

A, the plan is a budget to enforce, not a forecast. B, most candidates are too slow to pass the round. C, the model proves interviewers ask too many questions. D, the checkpoints are set too early, and should move.

[think]

The answer is A: the plan is a budget to enforce, not a forecast.

Small, typical overruns compound, so by minute 22 most rounds are behind, and the checkpoints convert that slippage into a shorter diagram, instead of a missing deep dive and wrap-up. Moving them later only moves the loss to the end. The model's inputs are assumptions, so it supports the budgeting habit, not claims about candidates or interviewers.

## 6

Why does an interviewer's note such as "estimated 350,000 writes a second, keyed Kafka by profile for ordering" carry more weight in a debrief than "strong communicator"?

A, committees read only the technical parts of the notes. B, adjectives are not permitted in written feedback at all. C, numbers show that the design was memorised in advance. D, debriefs calibrate on evidence, not adjectives.

[think]

The answer is D: debriefs calibrate on evidence, not adjectives.

A debrief compares evidence against a shared bar for each level. A concrete decision with its reason can be checked against that bar; an adjective cannot, so it carries little weight. Your job in the room is to generate quotable evidence in every phase.
