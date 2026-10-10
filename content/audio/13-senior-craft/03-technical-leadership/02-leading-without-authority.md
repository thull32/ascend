---
lesson: leading-without-authority
source: 3068e425576d03aa
fit: great
desk:
  - "The stakeholder map, with its power, what-would-make-it-a-yes and position-after columns"
  - "The seven-conversation table and the two annotated dialogues"
  - "The filled decision brief and the joint escalation template"
  - "What RFC 9457 actually says about extension members and the type URI"
  - "The decision-method comparison and failure-mode tables"
  - "Exercise: lint a decision brief"
---
## Introduction

Your company has twelve HTTP services owned by five teams, and they return errors in four different shapes. The mobile app carries three separate error parsers. Last quarter one of them failed to recognise a payments error, showed "something went wrong", and the app's automatic retry sent three times the normal traffic to payments for forty minutes.

You want one error format everywhere. You manage none of the five teams. Each has its own roadmap, and two of the tech leads have never heard of you. An email saying "please adopt the new format by September 30" will be read, agreed with, and ignored.

This is the normal shape of senior work. The problems worth solving cross boundaries, and the people who must act report to someone else. What works is influence: making the right outcome cheap to agree with, making the decision and its decider explicit, and handling disagreement so it improves the decision instead of stalling it.

The lesson traces this one decision, an illustrative scenario, through seven conversations over three weeks. Three ideas come out of it: map before you persuade, make yes the cheapest answer, and commit in actions, not words.

## Where influence comes from

Influence has sources. Expertise: people ask you because you are usually right about this area. Track record: your past proposals shipped and worked. Relationships: people take your call and give you the benefit of the doubt. Clarity: your writing makes the decision easy. And alignment: your ask advances their goals, not only yours. Those five last for years, or at least for the decision.

The sixth is a borrowed mandate: a director has said this matters. It buys compliance once, and costs goodwill each time.

The first five behave like a ledger. Deposits are delivering what you said, giving public credit, admitting mistakes quickly, keeping confidences. Withdrawals are surprising people in meetings, going around someone to their manager, relitigating settled questions, and overstating certainty. Senior engineers make deposits long before they need to withdraw.

## Map, then talk, in order

Before persuading anyone, list who must act, who can block, and what each one needs. The cast here: Priya, the director over all five teams, who approves. Marco, the checkout tech lead, with the most clients, against it because it is churn before his third-quarter launch. Aisha, the mobile lead, neutral, who needs old app versions to keep working. Kenji, the payments lead, for a standard, but a different one. Dana, the support lead, for it, and soon its champion. And your own manager, who controls your time.

Three columns of that map do the work. Power tells you the order of conversations: high-power sceptics before the meeting, never in it. What would make it a yes is the column you fill by asking, not guessing. And position after is a tracker you update after every conversation. When a row stops moving, that is where the next conversation goes.

Now the order. First, Dana: where does error translation cost you? 41 tickets last quarter, about six hours a week. The problem now has a number and someone who feels it. Second, your manager: can I spend 20 percent of this quarter on it, and is Priya the right approver? Time secured, and the decider named before any persuading. Third, Marco, the highest-power sceptic. Fourth, Aisha: which app versions must keep working, and for how long? Six months. So the rollout changes from a switch to additive, then remove. Fifth, Kenji and his rival proposal. And only sixth, Priya.

Why not start with the director?

[pause]

Asked first, she would have said come back when the teams agree. And talking to Marco in the meeting would have produced a public no that he would then defend.

## The sceptic and the rival

The conversation with Marco is the model for every sceptic. You open by saying his team owns the most clients, so you wanted his view before anything is decided. He says, we have bigger problems; this is churn.

You do not defend the idea. You ask what it would cost him. Two or three weeks, he says, plus a mobile release, and not before the launch. You agree with the estimate, then offer evidence he can check, tied to his own on-call: support spends six hours a week translating codes, mostly on checkout flows, and last quarter's retry storm started in a parser. Then the direct question: what would it take for you to support this? Old format valid until after the launch, he says, and someone other than my team writes the shared parser. You say: I will own the parser, and I will write both conditions into the brief so you can hold me to them. Objections became written commitments.

Kenji wanted RFC 9457, the standard "problem details" error format. The first ten minutes were a disagreement about everything. Splitting it into kinds shrank it. Facts: does the standard permit extra members? Checked in the document during the meeting: yes. Predictions: will clients branch on a URI as easily as on a short code? Checkable later. Values: follow the standard exactly, or prefer short codes that humans read in dashboards.

With the fact settled, both could live with a standard body plus a short code member. The one remaining question, which field clients branch on, was a values question, and values questions go to the decider. One footnote the lesson adds: reading the whole standard, not just the sentence that answered the question, showed it names the type URI as the primary identifier. So the brief should map every short code to exactly one type URI, and the two kinds of client can never disagree.

## Make yes the cheapest answer

Most no's to cross-team requests are not disagreement. They are cost. Marco agreed errors were a mess and still said no, because two or three weeks before a launch is a real price. So lower the price.

Do the shared work: you own the parser library, which saves each team about a week. Make it additive: server middleware emits the new body alongside the old fields, which removes the coordinated mobile release. Do their work: a codemod plus migration pull requests that you open and they review, which brings their cost to about three days. And make progress visible with a tracker linked from the director's weekly review.

Then do the arithmetic, because it goes in the brief. The email costs five teams about two and a half weeks each: 12 and a half engineer-weeks of other people's time. The lowered version costs about four weeks of yours and three of theirs, about seven in total, with most of the cost on the person who wants the change. And doing nothing costs six hours a week of support time, about 312 hours, roughly eight working weeks a year, before the next retry storm.

Here are the numbers to remember: 12 and a half by email, about 7 with your help, 312 support hours a year for nothing. Those three numbers are what made the sceptic's conversation end in conditions instead of a refusal.

## The brief and the meeting

The brief is one page. Driver: you. Approver: Priya. Decide by Friday of week three. Context in three lines with the numbers. Three options: the standard plus a short code; the standard only; do nothing, priced. An additive rollout covering the app's six-month minimum version, with checkout migrating after its launch. A recommendation, with a reason. Then two lines that matter most. What would change it: if clients end up branching on both fields. And the open question for the approver: A or B, with Kenji's preference named.

The "what would change it" line turns a clash of opinions into a question about evidence. The "open question" line tells the approver exactly which disagreement is hers to settle.

The meeting took fifteen minutes, because everything else had happened before it. Priya read the brief in silence. Kenji stated his option in his own words; you stated yours. Priya asked one question: which one does support read at three in the morning? She chose the short code, set the dates, and asked for the decision to be posted within the day. Fifteen minutes is enough when every contributor has seen the brief, both options are written in their owners' strongest words, and nothing in the room is a surprise.

Underneath this sits a rule the lesson calls the lowest common manager. The real approver for a cross-team change is the lowest manager above every team that must spend capacity on it, because only that person can trade one roadmap against another. Anyone below can be vetoed by a team saying, no capacity this quarter. That is why frameworks like DACI insist on exactly one approver. And timing an ask to the other team's planning cycle is often worth more than a better argument.

## Disagree and commit

Amazon's leadership principles say leaders respectfully challenge decisions, and once a decision is made, commit wholly. Commitment is visible in actions.

Kenji, committed, at week three: I still prefer type URIs; I am committing; payments will migrate first, and I will write the payments section of the migration guide; I would revisit if clients branch on both fields. Week four: a migration ticket in his sprint with a date. Week six: when a hallway conversation questions the decision, he says it was decided, here is why, and the trigger is in the log. Week eight: payments is live. Week twelve: he checks the trigger, finds no client branching on both fields, and says so.

Fake commitment looks like "fine, whatever you all think", then "we will get to it after the backlog", then agreeing with the hallway critic, then implementing his own variant "to be standards compliant", then raising it again at planning with no new evidence.

Reopening is legitimate only with new evidence: say, the API gateway can route on the type but not on extension members. The revisit trigger in the decision log is what separates the two. And commit binds the winner too: you owe Marco his two conditions on the promised dates, and you owe Kenji an honest check of his trigger.

When two leads cannot agree, escalation is not failure; surprise escalation is. Escalate together, with one write-up both agree states each position fairly: each option's strongest reason and cost, what you agree on, the impact of waiting, and a line saying you will both commit to whichever is chosen. A manager can decide that in ten minutes.

## In the interview

Here is a follow-up the lesson expects. You lowered the cost, and the other lead still says no. What next?

[pause]

Find out which kind of no it is. A cost no means the price is still too high, so offer more of the work or a later date. A priority no, worth it but not this quarter, is a trade between roadmaps that only the lowest common manager can make, so escalate jointly with the three numbers. A disagreement no goes back through facts, predictions and values. And accept that the approver may choose do nothing; the brief already priced it. The wrong answer is going to the director alone, or opening pull requests against their code without their agreement.

And: tell me about a time you disagreed with a decision that went ahead anyway. How you argued, with evidence, before the decision. What you did to commit, in actions and dates. What happened, and the trigger you set for revisiting. The wrong answer ends with "and I turned out to be right", which tells the interviewer you kept score instead of committing.

## Recap

Four things to remember. Map stakeholders by power and by what would make each a yes, and talk to the sceptics before the decider and never in the meeting. Most no's are cost, so lower the cost of yes and put three numbers in the brief: cost to them, cost to you, cost of doing nothing. Separate facts, predictions and values; look up facts, test predictions, and send only values to one named approver, the lowest common manager. And commit in actions with dates, with dissent recorded and a revisit trigger.

At your desk: the stakeholder map, the seven conversations, the filled brief and the escalation template, the fine print of the error standard, and the brief-linting exercise.
