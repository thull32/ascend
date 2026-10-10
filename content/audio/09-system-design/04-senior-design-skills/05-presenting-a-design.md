---
lesson: presenting-a-design
source: 630d63521a01df55
fit: great
desk:
  - "The scoring dimensions table and the minute-by-minute plan with checkpoints"
  - "The interview-clock simulation script and its results"
  - "The whiteboard layout, the API sketch and the high-level diagram from the transcript"
  - "The pushback table, weak and strong answers side by side"
---
## Introduction

Two candidates get the same prompt and know roughly the same things. One gets a strong hire. The other gets "lean no hire, did not demonstrate senior judgement". Their whiteboards look alike: similar boxes, similar databases, a queue in each.

The difference was in the forty-five minutes. The first scoped the problem in five minutes, derived the architecture from arithmetic, took the two hardest parts to mechanism level, and named the weakest part of the design before being asked. The second answered questions well, one at a time, in the interviewer's order, and ran out of time halfway through the first deep dive.

The design round measures judgement, and judgement is visible only if you present it. Four things: what the panel actually records, how to hold the clock, a strong candidate driving a design end to end, and how to take pushback and recover from your own mistakes.

## What the panel scores

Most large companies score some variant of the same dimensions: scoping, estimation, architecture, depth, trade-offs, operations and communication. At each one, the mid-level and senior signals differ in the same way. Mid-level designs everything mentioned; senior negotiates scope and parks the rest. Mid-level recites numbers and ignores them; senior says how the numbers change the design. Mid-level names components; senior goes into mechanisms, failure modes and numbers.

Candidates underrate the last row, communication. "Drove the discussion" or "needed prompting" appears on almost every scorecard and colours how the rest is read.

Here is why, in how feedback becomes a decision. Interviewers write feedback independently, as evidence mapped to dimensions: what you said, often close to verbatim. A debrief then calibrates it against a shared bar for each level. Feedback without evidence, "seemed sharp", carries little weight. Feedback with it, "estimated 350 thousand writes a second, keyed Kafka by profile for per-profile ordering, rejected coalescing because it loses five minutes of progress", carries a lot.

So your job in every phase is to produce quotable evidence: a number, a decision with its reason, a rejected option. And levelling is decided here. A correct design the interviewer had to drive is often recorded as mid-level evidence, and an offer one level down is a common outcome of a design round that was right but not driven.

## Holding the clock

The plan for forty-five minutes. Two minutes to restate the problem and set an agenda. Five on requirements, ending with an out-of-scope list. Four on estimates, ending with one sentence on what dominates. Four on the API and data model. Seven on the high-level diagram, every arrow labelled. Fifteen on two deep dives, each ending with a failure mode and its mitigation. Five on failure, scale and evolution. And three to wrap up: a summary, what you left out, and the weakest part.

A plan is useful only if you know when you are behind it. Two checkpoints matter most. At minute 15, if you have not started the diagram, state the API in one line and draw. At minute 25, if you are not in a deep dive, stop polishing and pick one.

How often do they fire? The lesson's toy model assumes each early phase runs a little over plan, a median of 10 percent, plus an occasional clarifying question. Simulating 20 thousand rounds, the checkpoints fired in 91 percent of them. What should you conclude from that?

[pause]

That the plan is a budget to enforce, not a forecast. Small overruns compound: by minute 22 the typical round is five minutes behind. Without checkpoints, the deep dive started at a median of minute 27 and a half, and only 37 percent of rounds had four minutes left for failure modes and the wrap-up. With them, the deep dive started by minute 25 in nine rounds out of ten, and every round kept that time at the end, at a cost of under a minute of diagram time. Without checkpoints, the loss lands at the end, exactly where operations and the weakest part are scored.

Keep a consistent board layout: requirements and numbers at the top, API and data model on the left, the diagram on the right, and a parking lot along the bottom. The parking lot is the underrated zone. When the interviewer raises something you do not want to derail into, write it there, say you will come back, and come back in the wrap-up. In a virtual interview, narrate what you draw, because the interviewer cannot see your hand.

And signpost. One sentence at each transition: "Those are the requirements; I will estimate next unless you want to add any." Each costs five seconds, and each is evidence you are running the agenda rather than following it. When you need to think, do not go silent for a minute: "I am weighing two keys; give me twenty seconds to compare them out loud."

## The transcript, condensed

The prompt is one sentence: design the Continue Watching row for a Netflix-scale streaming service.

The candidate restates it, then sets a plan and predicts the hard part, probably the write path, and invites the interviewer to steer. Is ranking in scope? No, it belongs to another team: parking lot. Must resume be exact after switching from TV to phone? Within a few seconds; that is the complaint. So that becomes the consistency requirement. The candidate classifies criticality per operation: the row is not critical, but the resume position feeds playback, so that read needs a fallback.

Then estimates, aloud, with round numbers. A hundred million profiles watching two hours a day, reporting every 60 seconds: 12 billion heartbeats a day, about 140 thousand writes a second, 350 thousand at the evening peak. Reads about 20 thousand a second at peak. So write-heavy, about 17 to 1, which shapes everything. Serving state is small, about 22 terabytes across replicas and regions. One partition per profile in a wide-column store like Cassandra. And when asked why not the existing member-profile database: it is sized for thousands of writes a second, and login and billing depend on it, so they would share fate with a non-critical feature.

The design: heartbeats go to Kafka keyed by profile, with one consumer group writing the latest position and another feeding the warehouse. Pause and stop are written synchronously, because those are the moments someone switches devices. Conflicts across regions resolve by a timestamp the edge assigns, never the device clock, which can be minutes wrong.

The deep dives are chosen from the estimates: the write path, because that is where cost and correctness live, and the device switch, because it is the complaint. Order matters because a rewind moves the position backwards, so you cannot merge with a maximum. Coalescing heartbeats every five minutes was considered and rejected: five times fewer writes, but a crash loses five minutes of progress, which is the complaint being fixed. Replication lag is "typically" under a second, and the candidate refuses to trust "typically": measure the time from a pause to its visibility in each region as an indicator, and alert on it.

The wrap-up closes the parking lot, raises history deletion as a privacy obligation the interviewer never mentioned, and names the weakest part: cross-region freshness is probabilistic, and if it had to be strict, route each profile's writes to a home region. The last impression is honesty.

## Pushback and recovery

Pushback is a probe, not a verdict. The interviewer wants to see whether you have reasons, whether you can update on a good argument, and whether you can hold a sound position without folding or repeating yourself.

The interviewer says: I don't think last-writer-wins works here. What is the best response?

[pause]

Locate the disagreement first: where do you see it failing? Then answer from the data. For positions, the latest action should win, rewinds included, so a maximum would be wrong and last-writer-wins by server time is right. It would fail for a counter; there you would use a CRDT or a home region. Is there a case you have in mind? Folding looks like there were no reasons. "It is Cassandra's default" is not a reason. And a menu of alternatives hands the decision back.

The same move works everywhere: locate it, answer with a requirement or a number, name what would change your mind. "Your estimate looks high." The driver is the 60-second heartbeat; at five minutes, peak falls to 70 thousand writes a second, the design holds, and the node count drops fivefold. Which assumption would you change? And when the interviewer is right, say so and say what changes. Changing your mind on evidence is a senior signal; changing it without discussion is not.

Catching your own mistake is one of the strongest signals available. At minute 31, the candidate notices that consumers writing with the time they read an event has a bug: a heartbeat delayed in Kafka, sent before the pause, gets a later timestamp and overwrites the pause position. The resume jumps backwards. The fix: assign the timestamp once, at the edge, and have both paths write with it. Nothing else changes. That is the structure to copy: say you are correcting yourself, show the failing interleaving in one sentence, give the fix, and state the blast radius on the rest of the design. Thirty seconds, and a flaw becomes the strongest evidence of the round.

## In the interview

A follow-up after the round: you spent most of the deep dive on the write path. Why?

[pause]

Because the estimates said to. Writes outnumber reads about 17 to 1 at peak, drive the node count and the cost, and carry the correctness risk: ordering, replays, rewinds. The read path is one partition read at 20 thousand a second. The wrong answer is "it is the part I know best", which tells the panel the agenda followed comfort rather than risk.

And: you have six weeks and two engineers; what do you build first? The minimum that meets the device-switch requirement: synchronous pause and stop writes, heartbeats straight to a managed store, single-partition reads, the client fallback. No Kafka yet; analytics from a nightly export. But the event format and idempotency keys are right from day one, because those are expensive to change. Not "the same design with fewer features", which keeps every moving part and cuts the wrong things.

## Recap

Five things to remember. The panel records quotable evidence, and "drove the discussion" colours everything else. Treat the time plan as a budget, with checkpoints at minutes 15 and 25, so the deep dives and the wrap-up survive. Choose the deep dives from the estimates and say why. Take pushback as a probe: locate the disagreement, answer with a number, update on evidence. And flag your own mistakes, close the parking lot, and end by naming the weakest part of your design with its fix.

At your desk: the scoring and timing tables, the clock simulation, the board layout and transcript diagrams, and the pushback table.
