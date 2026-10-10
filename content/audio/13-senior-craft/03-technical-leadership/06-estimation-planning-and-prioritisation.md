---
lesson: estimation-planning-and-prioritisation
source: 00796423a48b6c26
fit: partial
desk:
  - "The task breakdown and the three-point table, with means, deviations and variances"
  - "The Monte Carlo schedule script, its percentiles and the histogram"
  - "The throughput forecast script and its done-by-week table"
  - "The cone of uncertainty table and the re-estimates at three milestones"
  - "The RICE and WSJF tables on one backlog, and the commit-and-stretch comparison"
  - "The capacity sheet and the risk register"
  - "Exercise: from three-point estimates to a commitment date"
---
## Introduction

"How long will the notification preferences page take?" "About three weeks." Seven weeks later, it ships.

Nobody lied. The engineer added up the most likely durations of five tasks, 16 days. He forgot that a working week holds about three days of focused project time. He did not mention that the data migration could take two days or twelve. And he gave a single number, which everyone upstream wrote down as a promise. Marketing had already booked the launch.

An estimate is a probability distribution communicated under social pressure. Senior engineers are not trusted with estimates because they guess better. They break work down until the unknowns show, state ranges with a confidence level, schedule the riskiest unknowns first, and trade scope rather than quality when reality diverges. And because work always exceeds capacity, they rank it with explicit criteria and say no without burning trust.

Four ideas, then: why a sum of best guesses is wrong, what correlated risk does to your commitment date, how two prioritisation frameworks disagree on one backlog, and how to say no to a fixed date.

## Why estimates go wrong

Durations are right-skewed. A four-day task rarely finishes in two, but it can take twelve. The tails do not cancel, so a sum of most-likely values sits below the expected total.

Then there is invisible work: review, test data, the deploy pipeline, another team's API, all missing from "writing the feature". There is the focus factor: meetings, reviews, interviews and on-call take a big share of the week, and three focused days in five is a fair default until you measure your own. And there is what Kahneman and Tversky called the planning fallacy: imagining your plan going well even when similar plans did not. Anchoring makes it worse. The first number spoken sticks.

The first fix is to decompose until each task is at most two or three days. A task you cannot break down that far is an unknown, and the plan for an unknown is a spike: a time-boxed investigation whose output is an estimate. Estimate in ideal days, uninterrupted engineering time, and convert to calendar time once, at the end. And write down what is excluded, so that "the other team's API was late" does not turn into "your estimate was wrong".

## Three points, and why variances add

For each task, give three numbers: optimistic, most likely, pessimistic. PERT, built for the US Navy's Polaris programme in the late 1950s, turns those into a mean: the optimistic, plus four times the most likely, plus the pessimistic, all over six. The spread is the range, pessimistic minus optimistic, over six.

Take the migration: 2, 4 or 12 days. Its mean is 5, a day above the most likely value, because the bad tail is eight days long and the good one is two. Every task does this, so the five most-likely values sum to 16 days while the means sum to about 18 and a third.

Now the rule that trips people up. Variances add; standard deviations do not. Add the five spreads directly and you get about four and two-thirds days. Add the variances and take the square root, and you get 2.3 days. So the total is about 18 days, give or take 2.3.

Commit at 90 percent and you land around 21 ideal days. Convert with the focus factor and that is about 35 working days. The honest answer was "six weeks at even odds, seven at 90 percent". Even the plain sum of modes, converted, is over five weeks. The skew costs a week; forgetting to convert costs the rest.

Here is the number that decides where you spend your effort. The migration holds 53 percent of the total variance. A two-day spike on a production snapshot that narrows it to 3, 4 or 6 days pulls the 90 percent point from about 21 to under 20 days. So: spike the largest variance, not the largest mean.

One warning about the formula. Dividing by six treats your optimistic and pessimistic values as near-certain bounds. Calibration research has long found that people's stated ranges are too narrow, so your pessimistic number is more likely a 90th percentile. If it is, divide the range by about 2.56 instead, and the total spread for this project becomes about 5.4 days, not 2.3. Ask for the pessimistic value as "the number you would exceed one time in ten".

## Correlated risk, simulated

A Monte Carlo simulation samples every task, sums them, and repeats a hundred thousand times, so you can read percentiles straight off the results. It also lets you model a risk the table leaves out.

Suppose, illustratively, there is a 30 percent chance the legacy schema is messy, and if it is, the backend, the migration and the frontend each take 50 percent longer. Run it two ways. In one, each task rolls its own dice. In the other, the realistic one, a single roll decides for all three, because one messy schema slows them all.

Before I give you the result: which of the two has the higher average?

[pause]

Neither. Both average about 20.4 days, as they must, because each task has the same chance of the same slowdown either way. Correlation moves the tail, not the mean. The shared version actually has a lower median, because 70 percent of projects escape entirely. But its tail is fatter: the 95th percentile is 28.7 days against 26.4. Assume independence when one cause drives several tasks, and your 95 percent date is more than two days early.

Two more things from the simulation. Even with no schema risk, only 88 percent of runs finish by the table's "90 percent" date, because the skew survives the sum. And the bigger lesson: with the schema risk in, that table date holds only about two times in three. A risk left out costs more than a correlation mis-modelled.

## The cone, and other ways to estimate

Barry Boehm published the shape in 1981, and Steve McConnell named it the cone of uncertainty. At the initial concept, outcomes range from a quarter of the estimate to four times it: sixteen-fold. With an approved product definition, half to double. By the time the detailed design is done, within about 10 percent either way.

The cone is a best case, and it narrows only when decisions are made, not as time passes. A project in week six with an open product definition is still sixteen-fold wide. And when your bottom-up range comes out much narrower than the cone at that stage, treat it as a warning: three-point numbers only price the unknowns you listed.

The cheapest correction for optimism is history: Kahneman's outside view, which Bent Flyvbjerg developed into reference class forecasting. If your last five migrations came in at between 1.3 and 2.2 times their estimates, with a median of 1.5, multiply the next one by 1.5 for even odds.

And for many similar-sized items, skip task estimates and simulate from measured throughput, which already includes meetings and on-call. A team finishing about 5 items a week has 40 to go. The naive answer is 8 weeks, but week 8 is a coin flip. Week 10 is 96 percent. So: "even odds by week 8; I commit to week 10." And if the backlog grows to 50 as you learn, the 90 percent date moves from week 10 to week 12.

When you communicate, give a range with a confidence level, never a bare number. Separate the estimate, which is the distribution; the target, which is what the business wants; and the commitment, which is the point you promise, usually the 80th to 90th percentile. And report a slip the day you know it, with options, while the cheap ones are still open.

## Planning and prioritising

Put the riskiest work first: spikes, other teams' integrations, the migration on real data. A risk found in week one leaves every option open. In week six it leaves only the date.

When reality diverges, the levers are scope, time and people. Brooks's law, "adding manpower to a late software project makes it later", has a mechanism: newcomers take ramp-up time from the people who know the code, and the number of pairs who must coordinate goes from 6 with four people to 15 with six. Quality is not a lever. Cutting tests to hit a date moves the cost into the next incident.

Now prioritising. Intercom's RICE scores reach times impact times confidence, divided by effort. On an illustrative backlog of seven items, a faster page load wins easily: twenty thousand users, low effort. What sinks is instructive. Single sign-on for a deal closing this quarter ranks fifth. A database upgrade with support ending in four months ranks fourth. RICE has no term for time.

Don Reinertsen's alternative is cost of delay: the value lost per week something is not live, divided by duration. Say X is worth 50 thousand dollars a week and takes 5 weeks, and Y is worth 20 thousand a week and takes 1. Do Y first, and the total delay cost is 320 thousand. Do X first, and it is 370 thousand. The shorter, less valuable job goes first and saves 50 thousand. SAFe's relative version, weighted shortest job first, adds a time-criticality score, and there the single sign-on deal jumps to second.

So the frameworks disagree. Use the disagreement as a question. A contract date and an end of support are constraints, not scores: filter them in first, then rank the rest. And ask the question that settles more than any score: is the deal's date real, and what does the customer lose if it is a month late?

## Saying no

Every yes is an implicit no to something else, so a senior no is a visible trade-off.

The hard version: a VP says the CEO has told customers team workspaces launch in five weeks. Your 90 percent forecast for the full scope is twelve weeks. What is your first move?

[pause]

Accept the date as a constraint, and move the conversation to scope. "Understood, the date is fixed. What exactly was promised?" The answer is smaller than the spec: invites, up to ten members, shared saved searches. Then the gap, without apology: the full spec is 9 weeks at even odds and 12 at 90 percent, and five is not on that distribution. Then a slice sized to the date: invites and shared searches on the web, behind a flag, billing handled manually, about 85 percent likely by the date.

When the VP asks for more people, explain the mechanism: two new engineers need about two weeks each before they help, taken from the four who know the code. They help phase two, not this date. Then name the displacement, keep quality off the table, and get the decision in writing. The engineer never says "no". The VP hears yes to the goal, a price, and a choice.

## In the interview

"How do you prioritise tech debt against features?" In the same currency. A flaky deploy pipeline costing five engineer-hours a week has that as its cost of delay, and a three-week fix, 120 hours, pays back in 24 weeks. Keep a standing allocation for upkeep and attach debt to feature work in the same code. The wrong answers: "we always reserve 20 percent" with nothing measured, or "when there is time", which is never.

"Your product manager wants a date for something nobody has designed." Give a cone-stage range and the decision that narrows it: "Today, one to six months; after product definition and a spike, within about 50 percent either way." Not one number "to be helpful", and not a refusal to estimate.

## Recap

Five things to remember. Sum most-likely values and you get a number below the mean; convert ideal days with a focus factor. Variances add, standard deviations do not, so spike the task with the largest variance. Correlation leaves the mean alone and fattens the tail you commit to. The cone narrows only when decisions are made. And say no as "yes, if": the goal accepted, the price named, the choice handed back, the decision written down.

At your desk: the three-point table, the Monte Carlo and throughput scripts with their output, the cone table, the RICE and WSJF tables, the capacity sheet and risk register, and the commitment exercise.
