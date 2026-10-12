---
lesson: leading-without-authority
source: 6e94ddad1d42e283
---
## 1

Three teams agree your migration matters, but none of them has scheduled it. What is the most effective next step?

A, wait for an incident to prove the risk and create the urgency. B, lower their cost: a codemod, your own pull requests, and dates in their plans. C, ask a director to mandate it, so it lands on every team's roadmap. D, send a firmer email to the leads, with a deadline and the risks.

[think]

The answer is B: lower their cost, with a codemod, your own pull requests, and dates in their plans.

Agreement without scheduling is a cost problem, not a persuasion problem. Lowering the cost of yes, and getting the work into their planning, produces commitment. A mandate buys compliance and spends goodwill, and waiting for an incident accepts the very risk you are trying to remove.

## 2

In the lesson's story, why was the director the sixth conversation, rather than the first?

A, she was the least important stakeholder, so she came last in the map. B, talking to her first would count as escalating over the tech leads. C, directors should only be told about decisions after they have been made. D, asked first, she would defer until all of the teams' costs were known.

[think]

The answer is D: asked first, she would defer until all of the teams' costs were known.

An approver asked to decide before the contributors have been heard will usually say: come back when the teams agree. Pre-wiring the sceptics and the rival proposal first means the brief arrives with costs, conditions and a single open question, so the decision takes fifteen minutes. The approver still decides; she is not merely informed.

## 3

Two leads argue about whether RFC 9457 allows extra members in an error body. How should that part of the disagreement be settled?

A, send it to the approver, since it is a values question. B, read the RFC, since a published source settles it. C, prototype both, and load test them against each other. D, hold a vote among the five affected tech leads.

[think]

The answer is B: read the RFC, since a published source settles it.

Whether a published standard permits something is a fact, and facts are settled by looking them up. Predictions need evidence, such as a prototype, and only values and priorities go to the decider. Sending a fact to the approver, or putting it to a vote, wastes the time of people who could have read the answer.

## 4

After the decision, which behaviour shows that the dissenting lead has committed?

A, his team's migration ticket is in a sprint, with a date. B, he implements the format his own way, to stay compliant. C, he agrees that the decision was correct after all. D, he stops raising the topic in design meetings.

[think]

The answer is A: his team's migration ticket is in a sprint, with a date.

Commitment is visible in actions: scheduled work, a first migration, defending the decision in hallways. Silence can hide a pocket veto, changing his opinion is not required, and implementing his own variant is the fake commitment the lesson describes.

## 5

Twelve weeks later, the same lead proposes revisiting the decision. When is that legitimate?

A, when the revisit trigger in the decision log has fired. B, when he is willing to argue it again at planning. C, when enough time has passed that the context may differ. D, when a new engineer joins who shares his preference.

[think]

The answer is A: when the revisit trigger in the decision log has fired.

Reopening a decision is legitimate with new evidence, and the recorded trigger defines what counts: here, clients branching on both fields, or a new constraint, such as a gateway that only routes on one of them. Time passing, new allies or persistence are not evidence.

## 6

You want a cross-team standard adopted. Which person is usually the real approver?

A, the lowest manager above every team that must spend capacity. B, the tech lead of the team that benefits most from the change. C, whoever the driver chooses, provided the choice is announced. D, the most senior engineer who has an opinion on the standard.

[think]

The answer is A: the lowest manager above every team that must spend capacity.

Only someone who can trade one team's roadmap against another's can make a decision that costs several teams capacity; anyone below that level can be overridden by a team's own priorities. Seniority or benefit does not confer that right, and a driver cannot appoint an approver the affected teams do not report to.
