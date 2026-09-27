---
slug: negotiation
title: "Negotiation: levelling, compensation structures and the offer"
description: Why level is the biggest lever, how base, bonus, equity and sign-on bonuses actually pay out, a worked comparison of two offers with different vesting shapes, the step-by-step offer process, and a negotiation email template.
minutes: 17
difficulty: easy
tags: [career, negotiation, compensation, equity, levelling, offers]
---
Most engineers negotiate the wrong thing, at the wrong time, with the wrong tool. They push for a few percent more base salary, which is usually the least flexible part of an offer. They do it after saying "that sounds great" on the phone, when the company already believes the deal is done. And they use a vague "is there any flexibility?" that is easy to answer with a small, token increase. Meanwhile the choices that can be worth six figures over four years (the level, the equity grant, the sign-on bonus, the vesting shape) go unexamined.

Negotiating well is not about being aggressive. Recruiters negotiate every week and you do it a few times a decade, so the goal is to close that gap with preparation: understand what you are being offered, know what you want and why, get competing information, and ask clearly and specifically for things the company can actually give. This lesson walks through each of those steps. It uses US-style compensation terms because that is where most published data comes from; structures, taxes and norms differ by country, so adapt the specifics.

## Level is the biggest lever

Before any number, there is the level. Compensation bands are set per level, and although adjacent bands often overlap at the edges, their midpoints are far apart.

An illustrative example: suppose a company's senior level pays around \$350k a year in total compensation and the level below around \$250k. A strong in-band negotiation at the lower level might add 10–15%, roughly \$25–40k. Being levelled correctly is worth about \$100k a year, and refreshers and future promotions, which are also set by level, compound the difference. No amount of negotiating within a band beats being in the right band.

Levelling is decided mostly in the loop, by your system design depth and the scope of your behavioural stories (see [The FAANG loop](/learn/senior-craft/getting-the-job/the-faang-loop)). You can still influence it:

- **Before the loop,** tell the recruiter the level you are targeting and why, with evidence: "I'm currently leading a team of five and own a system at this scale; I'm looking at senior roles." Ask what the level means at their company.
- **During the loop,** tell stories that show the scope of the target level.
- **After a down-level offer,** ask which feedback drove it, and whether the decision can be revisited with more information, such as an extra system design round. If it cannot, ask what the concrete path to the next level looks like and on what timeline, and decide whether the lower level still beats your alternatives. Sometimes it does: a strong team at the level below, with a real promotion case, can be the better career move. Make that a deliberate choice, not a default.

## How compensation is structured

| Component | How it works | How negotiable | Watch out for |
|---|---|---|---|
| **Base salary** | Fixed annual pay within a band for your level | Somewhat; bands have limits | The band's top; base drives bonus and some benefits |
| **Annual bonus** | Usually a target percentage of base, scaled by company and individual performance | Rarely; usually formulaic | Target versus what is actually paid historically |
| **Equity (RSUs at public companies)** | A grant valued in dollars, vesting over years, often four, frequently with a one-year cliff | Often the most negotiable part | The vesting schedule's shape; stock price movement; refresher policy |
| **Sign-on bonus** | One-off cash, sometimes split over the first two years | Very negotiable | Clawback if you leave within a set period, often a year |
| **Refreshers** | Additional equity grants in later years | Not negotiated at the offer, but ask about typical practice | Without them, pay falls sharply once the first grant vests |
| **Startup options** | The right to buy shares at a strike price | Negotiable, but valuing them is hard | Preferred versus common stock, dilution, the exercise window after leaving, liquidity |

Some companies depart from this template. Netflix, for example, has described paying mostly in salary and letting employees choose how much to take as stock options; see [Netflix: culture and interviews](/learn/senior-craft/getting-the-job/netflix-culture-and-interviews). Always ask for the full breakdown and the vesting schedule in writing.

## Comparing offers: the vesting shape matters

Two illustrative offers for the same role:

- **Offer A:** base \$210k, 15% target bonus, \$400k of RSUs vesting evenly over four years, \$30k sign-on.
- **Offer B:** base \$230k, no bonus, \$360k of RSUs vesting back-loaded (5%, 15%, 40%, 40%), sign-on of \$75k in year one and \$50k in year two.

Some large companies have used back-loaded schedules like B's, paired with a two-year sign-on to smooth the early years. Compute both year by year:

```python
def yearly_tc(base, bonus_pct, equity_total, vest, signon=()):
    """Cash and vested equity per year, ignoring raises, refreshers and stock price moves."""
    years = []
    for year, fraction in enumerate(vest):
        sign_on = signon[year] if year < len(signon) else 0
        years.append(base + base * bonus_pct + equity_total * fraction + sign_on)
    return years

a = yearly_tc(210_000, 0.15, 400_000, [0.25, 0.25, 0.25, 0.25], signon=[30_000])
b = yearly_tc(230_000, 0.00, 360_000, [0.05, 0.15, 0.40, 0.40], signon=[75_000, 50_000])
# a -> [371500, 341500, 341500, 341500], total 1,396,000
# b -> [323000, 334000, 374000, 374000], total 1,405,000
```

| Year | Offer A | Offer B |
|---|---|---|
| 1 | \$371,500 | \$323,000 |
| 2 | \$341,500 | \$334,000 |
| 3 | \$341,500 | \$374,000 |
| 4 | \$341,500 | \$374,000 |
| **4-year total** | **\$1,396,000** | **\$1,405,000** |
| Total if you leave after 2 years | \$713,000 | \$657,000 |

The four-year totals are within 1% of each other, but the offers are very different:

- **A pays more up front.** If there is a real chance you will leave within two years, A is worth about \$56k more.
- **B pays more only if you stay.** Its advantage depends on years three and four, and on the stock price then.
- **The bonus is a target, not a promise.** A's \$31.5k a year depends on performance and company results.
- **Refreshers change everything after year one.** A company with generous refreshers can overtake one with a bigger initial grant by year three. Ask each company what a typical refresher looks like for a solid performer at your level.
- **Equity is volatile.** A \$400k grant is \$400k at today's price. Think about how much of your pay you want exposed to one company's stock.

Always compare offers year by year, and under a "leave after two years" scenario, not just by the headline number.

## The process, step by step

### 1. Before the offer: build your position

- **Run processes in parallel** so offers arrive within a couple of weeks of each other. This matters more than anything else in this lesson.
- **Research the market.** Public, self-reported compensation data such as levels.fyi gives you ranges by company, level and location. Treat it as indicative rather than exact.
- **Avoid naming a number first** where you can (see [Resumes, referrals and screens](/learn/senior-craft/getting-the-job/resume-and-screens) for the recruiter-screen script).

### 2. When the offer arrives

Offers usually arrive by phone. Your only goals on that call are to show enthusiasm, gather information and buy time.

> "Thank you, I'm really excited about this team. Could you send the full details in writing, including the level, the equity grant and vesting schedule, the bonus target and the sign-on terms? I'd like to review everything properly, and I'll come back to you by Friday."

Do not accept, reject or negotiate on that call. Ask your questions: vesting schedule and cliff; refresher practice; bonus target and typical payout; sign-on clawback terms; level and title; start date; remote or location policy.

### 3. Decide your numbers before you counter

Write down three numbers: your **walk-away** (below this you decline), your **target** (what you would be happy with), and your **ask** (a justified number above your target). The ask should be grounded in data or a competing offer, not invented.

### 4. Counter specifically, with a reason and a commitment

A counter has three parts: what you want, why it is reasonable, and what happens if you get it. Ask for the components with the most flexibility, which are usually equity and the sign-on bonus rather than base.

### 5. Iterate once or twice, then close

Most negotiations take one or two rounds. When you get what you asked for, accept promptly and graciously. Do not re-open the deal with a new request after they have met your ask. Get the final terms in writing before you resign from your current job.

## The negotiation email

Email gives you time to be precise and gives the recruiter something concrete to take to the people who approve exceptions.

```text
Subject: Offer: Senior Software Engineer, <Team>

Hi Dana,

Thank you again for the offer, and for walking me through the details on
Tuesday. I'm excited about the <Team> role, especially <specific thing>,
and I'd like to make this work.

I'm finalising another offer at a similar level. It comes to roughly
$<X> in year one and $<Y> a year on average over four years, compared
with $<A> and $<B> here.

If you can bring the equity grant to $<N> over four years and add a
$<S> sign-on bonus, I'm ready to sign this week and withdraw from my
other processes.

Happy to talk it through on a call if that's easier.

Best,
Sam
```

What makes it work: it opens with genuine enthusiasm; it gives a factual reason; it asks for specific amounts on specific components; and it includes a conditional commitment ("if you can…, I'm ready to sign"). Only make that commitment if it is true. Recruiters take it seriously, and so should you.

## Scripts for the hard moments

**"What would it take for you to sign today?"**

> "I'm not in a position to sign today. I want to review the written offer properly, and I'll have an answer by Friday."

**"Do you have other offers?"**

Answer honestly without disclosing more than you need to:

> "I'm in the final stages with two other companies and expect offers this week. This role is my first choice if we can get the numbers right."

If you have none, do not invent one. "I'm early in other processes, but I want to make sure this reflects the market for the level" is honest and still gives a reason.

**An exploding offer** ("this expires in 48 hours"):

> "I understand you need an answer soon. I'm expecting to finish my other processes by the 20th; could we extend the deadline to then? I want to be able to say yes with full confidence."

Reasonable companies usually grant several days to a couple of weeks. A company that will not allow any time to make a major life decision is telling you something about how it operates.

## Competing offers, and negotiating without them

A competing offer at a similar level is the strongest lever there is, because it replaces an argument with a fact. Offers from companies the recruiter considers peers carry the most weight, but any real offer helps. Never invent or inflate one. Recruiters sometimes ask to see the offer letter, and the industry is small.

Without a competing offer you can still negotiate, just more modestly:

- **Market data** for the level and location.
- **Level evidence:** your scope, and how the interviews went.
- **What you give up by leaving:** unvested equity, a bonus you would forfeit, or a retention grant. Asking for a sign-on bonus to "make me whole" on those is standard and usually well received:

> "I'll be forfeiting about \$60k of unvested equity and my annual bonus, which pays out in March. Could we add a sign-on bonus to cover that?"

## What not to do

- **Lie** about offers, current pay or deadlines.
- **Issue ultimatums** you will not carry out.
- **Negotiate after accepting.** A verbal "yes" is treated as a yes.
- **Re-trade:** asking for more after the company has met your stated ask.
- **Treat the recruiter as an opponent.** They are often your advocate with the people who approve exceptions, and they will remember how the process felt.
- **Optimise only for year one** without looking at vesting shape, refreshers and the leave-after-two-years case.

## Beyond money

Some of the most valuable terms are not in the compensation table: the level and title, the team, the start date (time off between jobs is worth a lot), remote or location flexibility, relocation support, and sometimes the vesting start date. If the company cannot move on money, one of these may be easy for them and valuable for you.

## Senior signals

- You treat level as the first negotiation and influence it before, during and after the loop.
- You compare offers year by year, including a leave-after-two-years scenario, and ask about refreshers and vesting shape.
- You run processes in parallel so that offers overlap.
- On the offer call you express enthusiasm, gather information and buy time, and never accept or negotiate on the spot.
- Your counter is specific, justified and conditionally committed, and aimed at the flexible components.
- You never misrepresent offers, and you close cleanly once your ask is met.

## Check yourself

```quiz
- q: >-
    Why is level usually a bigger lever than negotiating within an offer?
  options: ["Because level sets your title, and title is what future employers pay for", "Because pay bands are set per level, and adjacent midpoints are far apart", "Because recruiters cannot change an offer's numbers once it has been approved", "Because base salary is fixed by the band, so only the level can raise your pay"]
  answer: 1
  explanation: >-
    Bands are set per level with midpoints far apart, so a 10–15% in-band improvement is small next to the gap between adjacent levels' bands, and the difference compounds because future refreshers and promotions start from your level. Base salary is negotiable but limited by the band, and equity and sign-on bonuses are usually more flexible still.
- q: >-
    Offer A pays $371.5k, $341.5k, $341.5k and $341.5k over four years; Offer B pays $323k, $334k, $374k and $374k. There is a good chance you will leave after two years. Which is better on these numbers?
  options: ["A, because it pays about $56k more over the two years you are most likely to stay", "B, because its four-year total is higher, and that is what the offer is worth", "They are equivalent, because the sign-on bonuses offset the vesting shape", "Neither; they cannot be compared until you know the stock's future price"]
  answer: 0
  explanation: >-
    B's small four-year advantage is concentrated in years three and four and disappears if you leave early. Over two years A pays $713k against B's $657k. That is why you compare year by year and under a leave-early scenario.
- q: >-
    The recruiter calls with a verbal offer. What should you do on that call?
  options: ["Ask for a month to decide, so they know you are seriously weighing other options", "Counter on the spot with a higher base, while the recruiter is still engaged", "Accept on the call to show enthusiasm, then negotiate the details in writing", "Show enthusiasm, ask for the details in writing, and give a date to respond by"]
  answer: 3
  explanation: >-
    The call is for gathering information and buying reasonable time: express enthusiasm, ask for the full details in writing, ask your questions, and say when you will respond. A verbal yes is treated as a yes, so accepting ends the negotiation; countering without the written details means negotiating blind, and an unreasonably long delay damages goodwill.
- q: >-
    Which counter-offer is strongest?
  options: ["A polite, open-ended question about whether there is any flexibility at all on the numbers", "Specific equity and sign-on figures, backed by a competing offer, with a promise to sign", "A comparison with what engineers you know earn, to show that the offer is below market", "A firm ultimatum on base salary, making it clear you will walk away without the raise"]
  answer: 1
  explanation: >-
    For example: "If you can bring the equity to $N and add a $S sign-on, I'm ready to sign this week", backed by a competing offer's numbers. It is specific, targets flexible components, gives a factual reason and makes a conditional commitment the recruiter can take to approvers. Vague requests invite token increases, ultimatums create conflict, and anecdotes are weak evidence.
- q: >-
    You have no competing offer, and you will forfeit $60k of unvested equity by leaving. What is a reasonable ask?
  options: ["Ask for a sign-on bonus to make you whole for the equity you would forfeit", "Accept the offer as it stands, since without a competing offer you have no leverage", "Mention an unnamed competing offer to create leverage, since it cannot be checked", "Ask for $60k more base salary, so the loss is covered within the first year"]
  answer: 0
  explanation: >-
    Asking to be made whole for forfeited compensation is standard and usually well received, even without a competing offer, and a one-off loss is naturally matched by one-off cash. Base is the least flexible component and a raise recurs every year, so it is a much bigger ask. Inventing an offer is dishonest and risky, and you can still negotiate without one.
```
