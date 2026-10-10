---
lesson: what-a-model-is
source: ef14e3aba5adc41a
fit: partial
desk:
  - "The least-squares calculation and the three gradient-descent steps, row by row"
  - "The curvature matrix, its eigenvalues and the standardised one-step solution"
  - "The plain Python training loop and the Adam code, with the step-one trace"
  - "Exercise: one step of gradient descent"
---
## Introduction

Your team runs nightly batch jobs, and the scheduler needs to know how long each will take before it starts. You have history. A job over 1 million rows took 3 minutes, 2 million took 5, 3 million took 8, and 4 million took 9. Tomorrow's job has two and a half million rows. You could eyeball a rule and hard-code it, but the real table has ten thousand rows and forty columns, and the relationship drifts every time the cluster changes.

Machine learning replaces the hand-written rule with a procedure that finds the rule from data. That procedure has exactly three parts, and they are the same three parts whether you fit this four-point line or train a language model with 70 billion parameters. A function with adjustable numbers. A loss that scores how wrong it is. And an optimiser that nudges the numbers to make the loss smaller.

So: the three parts, worked on those four jobs. Then why training is sometimes slow and sometimes explodes, what a real framework does on every step, and how a correct model goes wrong in production.

## A function with knobs, and a loss

A model is a function. The input is what you know, here the number of rows. The output is the prediction, minutes. And inside are the parameters, the numbers training adjusts. You choose the form of the function, called the architecture or the model family. The parameters pick one specific function out of that family.

For the batch jobs, a straight line is a reasonable family. Two parameters: the slope, minutes per million rows, and the intercept, a fixed startup cost. A line has 2 parameters, linear regression on 40 features has 41, and a 7-billion-parameter language model has, well, about 7 billion.

Two words you will hear constantly. Training is the search for good parameters: done once or periodically, and expensive. Inference is running the function with fixed parameters: done on every request, and it has to be fast. Keep those two cost profiles apart. A model that takes a week of GPU time to train can still answer in 5 milliseconds.

To compare candidate parameters you need one number for how wrong they are. That is the loss. For predicting a quantity, the standard choice is mean squared error: take each prediction's error, square it, and average. Guess zero for everything and the loss on our four jobs is 44.75. Guess "two minutes per million rows plus one" and it is 0.25. One comparable number, and it says the second guess is far better.

Why squared? It makes every error positive, it is smooth for the optimiser, and it punishes big errors disproportionately. One error of 10 costs as much as a hundred errors of 1. That last one is a trap. If one job ran for 90 minutes because a node died, squared error bends the whole line towards it.

So choosing the loss is a product decision. Squared error predicts the mean. Absolute error predicts the median and shrugs off outliers. And the pinball loss predicts a percentile, which is what a scheduler wants. If a late job misses an SLA and an early one only idles some capacity, you want a runtime you exceed only 10 percent of the time. Set the pinball loss to the 90th percentile, and under-predicting is charged 9 times more than over-predicting.

For a line with squared error, the loss over every possible slope and intercept forms a bowl, with one lowest point and no false bottoms. Neural networks give you a mountain range instead, which is why their training is less predictable.

## Two ways down the bowl

For a line, calculus gives the bottom of the bowl directly. It is called ordinary least squares, and the slope is how much x and y move together divided by how much x spreads. On our data that gives a slope of 2.1 and an intercept of 1.0. The loss is 0.175, and no other line does better on these four points. Tomorrow's job is predicted at 6.25 minutes.

So why not always do that? With many features, the closed form costs grow with the cube of the number of features: fine for 40, hopeless for a billion. And the moment the model is not linear in its parameters, a neural network or a transformer, there is no closed form at all. You need a method that only asks: which way is downhill from here?

That method is gradient descent. The gradient is the set of slopes of the loss, one per parameter, pointing uphill. You step the opposite way, scaled by a number called the learning rate. Read the gradients as sentences. The intercept's gradient is twice the average error: if you are predicting too low on average, raise the intercept. The slope's gradient weights each error by its input: errors on big jobs say more about the slope than errors on small ones.

Start at zero, with a learning rate of 0.05. After one step the loss falls from 44.75 to about 1.4. After two, to about 0.22. After three, to 0.186. The gradients shrink by about six times per step on their own, because the gradient is proportional to the remaining error. Keep going, and by step 500 you land on exactly 2.1 and 1.0, the least-squares answer, without ever solving an equation.

## Why the last bit took a hundred steps

Look at that again. After three steps, the loss was within about 6 percent of the best possible. But the intercept then crawled from about 0.75 to 1.0 over hundreds of steps. That is not bad luck. It is the shape of the bowl.

This bowl is a long, narrow valley: steep across, almost flat along. The steep direction has a curvature of about 16.7, and the flat direction about 0.3. In the steep direction, each step cuts the remaining error to about a sixth, which is why the first steps are dramatic. In the flat direction, each step barely moves it, and the remaining error halves only every 46 steps.

The ratio of the steepest curvature to the flattest, about 56 here, is the condition number. It is the single best predictor of how painful gradient descent will be. It is large here because the input is not centred, so slope and intercept are tangled together.

Now standardise the input: subtract its mean and divide by its spread. The valley becomes a perfectly round bowl, condition number exactly 1. With the right step size, a single step lands exactly on the minimum, which maps back to the same 2.1 and 1.0. On the raw input, that took about 100 steps for the loss and about 400 for the intercept. This is why every machine learning pipeline normalises its inputs.

## The learning rate decides everything

Run ten steps with four learning rates. At 0.01, training is timid; the loss is still 1.3. At 0.05, fast and stable. At 0.1, each step overshoots the minimum and zig-zags, but still converges. At 0.2, it diverges.

Before I explain it: the loss at 0.2 goes 44.75, then 244, then 1,337, then 7,319. What is happening?

[pause]

In the steep direction, every step jumps past the minimum and lands further up the other side, 2.34 times further away than it started. Because the loss is a squared error, it grows about five and a half times per step, and you can check it against the sequence. The rule is that gradient descent is stable only when the learning rate is below 2 divided by the steepest curvature, which is 0.12 for this data.

In real training you never know that curvature, so you find the learning rate by experiment: start small, increase until the loss curve goes unstable, back off. Large models use a schedule. A short warm-up from near zero, because the early surface is chaotic, then a slow decay: big steps early to cover ground, small steps later to settle. When someone says "the run diverged at step 40 thousand", the first suspects are the learning rate and a bad batch of data.

## The same loop at scale

The gradient so far averaged over every example. That is fine for four rows and impossible for a language model trained on trillions of tokens. So stochastic gradient descent estimates the gradient from a random mini-batch, say 32 examples, or a few million tokens. The estimate is noisy, but on average it points the right way, and each step costs the same however big the dataset gets. One pass over the whole dataset is an epoch.

Bigger batches use the GPU better and give smoother gradients. But you get fewer updates per epoch, and past some size, doubling the batch no longer halves the steps you need. Small batches are noisy, and that noise sometimes helps, steering training away from sharp minima that generalise poorly.

Under the hood, a framework such as PyTorch adds three pieces of machinery. First, autograd: you write only the forward computation, and the framework records it and walks it backwards to get the gradients. Those gradients are added to whatever is already stored, which is why every loop zeroes them before each backward pass. Forget, and step 10 applies the sum of ten gradients.

Second, the optimiser's state. Adam, the default for neural networks, keeps two running averages per parameter: the mean gradient and the mean squared gradient. On its very first step on our data, the two gradients were 36.5 and 12.5, one three times the other. Yet both parameters moved by exactly the learning rate. Adam divides out each parameter's gradient scale, which is the per-parameter answer to the conditioning problem. The price is memory: two extra numbers per parameter.

Third, precision. Large models compute in a 16-bit format called bfloat16, which has only about 8 bits of precision. Add 0.001 to a weight of 1.0 in that format and it rounds straight back to 1.0. Do it 100 times and it is still 1.0, where 32-bit floats reach 1.1. So a 32-bit master copy of the weights receives the updates. The accounting from Microsoft's ZeRO paper: about 16 bytes per parameter for mixed-precision Adam. A 7-billion-parameter model needs about 112 gigabytes of training state before a single activation, against 14 gigabytes to serve it. That factor of eight is why training needs a cluster and inference fits on one accelerator.

## What the model learned, and how it fails

The fitted line is the best line for these four points, and it knows nothing else. Three limits follow from the mechanism, and they apply all the way up to language models. It learns correlation, not cause: if every big job also ran on the old, slow cluster, the slope quietly includes "old cluster is slow". It interpolates better than it extrapolates: ask about a 100-million-row job and it says 211 minutes, with no idea that the job spills to disk at 50 million. And it optimises the loss you gave it, not the goal you had.

In production, four failures. The loss goes to NaN, not a number: that is the geometric blow-up you just heard, usually from a copied learning rate, an unscaled feature, or one corrupt batch. Standardise, lower the rate or add warm-up, clip the gradient, and check inputs are finite. Gradients accumulate because nobody zeroed them, and training oscillates then diverges. Training-serving skew: offline error is 0.2 minutes, production error is 20, and nothing is logged, because the service skipped the scaling the model was trained with. Ship the scaler with the model as one artifact. And slow drift: the world moves, the error creeps up over months, so you monitor residuals as a service metric and retrain.

## In the interview

A classic follow-up. The loss went to NaN at step 40 thousand of a long run. What do you check?

[pause]

The gradient-norm history in the steps before it, because a spike points to a bad batch or a step in the learning-rate schedule. The data at that step, for non-finite or extreme values. And overflow in 16-bit arithmetic. Then restart from the last checkpoint with gradient clipping and that batch skipped. The weak answer is "the model is too big", which says nothing about why step 40 thousand differed from the step before.

And another: why do we standardise features? Not "so the numbers fit in floating point". Because it fixes the conditioning. On the batch-job data the condition number falls from about 56 to exactly 1, and one step reaches the optimum that took hundreds before.

## Recap

Four things to remember. Every model is three parts, a function with parameters, a loss, and an optimiser, plus the data, and you should be able to say which one is the problem. The loss is the specification of what good means: squared error chases outliers and predicts the mean, the pinball loss predicts a percentile. A fast drop followed by a long crawl means poor conditioning, fixed by standardising inputs or an adaptive optimiser, and a loss that grows by a constant factor each step means the learning rate is too high. And budget about 16 bytes per parameter to train with Adam, eight times what it takes to serve.

At your desk: the least-squares and gradient-descent tables, the curvature calculation, the training loop and Adam code, and the one-step gradient descent exercise.
