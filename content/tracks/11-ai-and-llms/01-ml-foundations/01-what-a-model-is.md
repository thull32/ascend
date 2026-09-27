---
slug: what-a-model-is
title: "What a model is: parameters, loss and gradient descent"
description: A model is a function with adjustable numbers, a loss that scores it and an optimiser that tunes it. Worked by hand on a four-point linear regression, including why the learning rate makes or breaks training.
minutes: 31
difficulty: easy
tags: [machine-learning, linear-regression, gradient-descent, loss-functions, optimisation]
problems: []
---
Your team runs nightly batch jobs, and the scheduler needs to know how long each one will take before it starts. You have history: a job over 1 million rows took 3 minutes, 2 million took 5, 3 million took 8, 4 million took 9. Tomorrow's job has 2.5 million rows. You could eyeball it and write `minutes = 2 * rows + 1` into the scheduler, but the table has ten thousand rows and forty columns, and the relationship drifts every time the cluster changes.

Machine learning replaces the hand-written rule with a procedure that *finds* the rule from data. The procedure has exactly three parts, and they are the same three parts whether you are fitting this four-point line or training a language model with 70 billion parameters: a **function with adjustable numbers**, a **loss** that scores how wrong it is, and an **optimiser** that nudges the numbers to reduce the loss. This lesson builds all three by hand.

## A model is a function with knobs

A model is a function $\hat{y} = f(x; \theta)$. The input $x$ is what you know (rows to process), the output $\hat{y}$ ("y-hat") is the prediction (minutes), and $\theta$ is a vector of **parameters**: the numbers that training adjusts. The *form* of the function is chosen by you and is called the architecture or model family. The parameters pick one specific function out of that family.

For the batch jobs, a reasonable family is a straight line:

$$\hat{y} = w \cdot x + b$$

with two parameters: the slope $w$ (minutes per million rows) and the intercept $b$ (fixed startup cost). Every pair $(w, b)$ is a different model; training means choosing the pair.

| Model | Function | Parameters |
|---|---|---|
| Line | $w x + b$ | 2 |
| Linear regression on 40 features | $w \cdot x + b$ with $w \in \mathbb{R}^{40}$ | 41 |
| Small neural network | layers of $\text{ReLU}(Wx + b)$ | thousands |
| 7B-class language model | a stack of transformer blocks mapping tokens to next-token probabilities | about 7,000,000,000 |

Two words you will hear constantly. **Training** is the search for good parameters, done once (or periodically) and expensive. **Inference** is evaluating $f(x; \theta)$ with fixed parameters, done on every request and needs to be fast. A senior engineer keeps these two cost profiles separate: a model that takes a week of GPU time to train can still answer in 5 ms, and a model that is cheap to train can be too slow to serve.

## Loss: one number for "how wrong"

To search for good parameters you need to compare candidates, so you need a single number that says how bad a given $(w, b)$ is. That number is the **loss**. For predicting a quantity, the standard choice is the **mean squared error** (MSE):

$$L(w, b) = \frac{1}{n} \sum_{i=1}^{n} (\hat{y}_i - y_i)^2$$

The difference $y_i - \hat{y}_i$ is the **residual** for example $i$. Try two guesses on the four jobs:

| $x$ (M rows) | $y$ (min) | guess A: $w=0, b=0$ | guess B: $w=2, b=1$ |
|---|---|---|---|
| 1 | 3 | 0 (error −3) | 3 (error 0) |
| 2 | 5 | 0 (error −5) | 5 (error 0) |
| 3 | 8 | 0 (error −8) | 7 (error −1) |
| 4 | 9 | 0 (error −9) | 9 (error 0) |
| **MSE** | | $(9+25+64+81)/4 = 44.75$ | $1/4 = 0.25$ |

Guess B is much better, and the loss says so with a single comparable number.

Why *squared* error? Three reasons, one of which is a trap:

1. Squaring makes every error positive, so errors above and below the line do not cancel.
2. It is smooth and differentiable everywhere, which the optimiser needs.
3. It punishes big errors disproportionately: one error of 10 costs as much as a hundred errors of 1. That is the trap. If one job in your history ran for 90 minutes because a node died, MSE will bend the whole line towards it. **Mean absolute error** (MAE, $\frac{1}{n}\sum |\hat{y}_i - y_i|$) is robust to that outlier and predicts something closer to the median; MSE predicts the mean. Choosing the loss is a product decision: do you care more about typical accuracy or about never being wildly wrong?

For classification (spam or not, fraud or not), the standard loss is **cross-entropy**, which you meet in [Neural networks](/learn/ai-and-llms/ml-foundations/neural-networks). Language models are trained with cross-entropy over the next token; the principle is identical.

If you plot $L(w, b)$ over every pair $(w, b)$ you get a surface. For a linear model with MSE the surface is a bowl: **convex**, with a single lowest point and no false bottoms. Neural networks give you a mountain range instead, which is why their training is less predictable.

## The closed-form answer

For a line with MSE, calculus gives the bottom of the bowl directly. Set both partial derivatives to zero and solve, and you get **ordinary least squares**:

$$w = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sum (x_i - \bar{x})^2}, \qquad b = \bar{y} - w \bar{x}$$

Work it through. The means are $\bar{x} = 2.5$ and $\bar{y} = 6.25$. The deviations of $x$ are $(-1.5, -0.5, 0.5, 1.5)$ and of $y$ are $(-3.25, -1.25, 1.75, 2.75)$.

- Numerator: $(-1.5)(-3.25) + (-0.5)(-1.25) + (0.5)(1.75) + (1.5)(2.75) = 4.875 + 0.625 + 0.875 + 4.125 = 10.5$
- Denominator: $2.25 + 0.25 + 0.25 + 2.25 = 5$
- $w = 10.5 / 5 = 2.1$, and $b = 6.25 - 2.1 \times 2.5 = 1.0$

The fitted model is $\hat{y} = 2.1x + 1.0$. Its predictions are 3.1, 5.2, 7.3, 9.4; the residuals are −0.1, −0.2, 0.7, −0.4; the MSE is $(0.01 + 0.04 + 0.49 + 0.16)/4 = 0.175$. No other line does better on these four points. Tomorrow's 2.5M-row job is predicted at $2.1 \times 2.5 + 1.0 = 6.25$ minutes.

```viz
{"type": "ml", "algorithm": "linear-regression", "points": [[1,3],[2,5],[3,8],[4,9]],
 "title": "Least squares on the batch-job data",
 "caption": "Centre the data, compute the slope from co-movement over spread, and read off the residuals."}
```

With many features the same idea becomes the **normal equations**, $w = (X^\top X)^{-1} X^\top y$, which cost $O(nd^2 + d^3)$ for $n$ examples and $d$ features. That is fine for $d = 40$ and hopeless for $d = 10^9$. More importantly, the moment the model is not linear in its parameters (a neural network, a transformer) there is no closed form at all. You need a method that only asks "which way is downhill from here?".

## Gradient descent

The **gradient** of the loss is the vector of its partial derivatives, one per parameter. It points in the direction in which the loss increases fastest, so you step the opposite way:

$$w \leftarrow w - \eta \frac{\partial L}{\partial w}, \qquad b \leftarrow b - \eta \frac{\partial L}{\partial b}$$

The step size $\eta$ (eta) is the **learning rate**. For MSE on a line, the derivatives are (chain rule on $(\hat{y} - y)^2$):

$$\frac{\partial L}{\partial w} = \frac{2}{n} \sum (\hat{y}_i - y_i)\, x_i, \qquad \frac{\partial L}{\partial b} = \frac{2}{n} \sum (\hat{y}_i - y_i)$$

Read those as sentences. The gradient for $b$ is twice the average error: if you are predicting too low on average, raise $b$. The gradient for $w$ weights each error by its input: errors on big jobs say more about the slope than errors on small jobs.

### One step by hand

Start at $w = 0$, $b = 0$ with $\eta = 0.05$.

1. Predictions are all 0, so the errors $\hat{y} - y$ are $(-3, -5, -8, -9)$.
2. $\sum (\hat{y} - y)\,x = -3 - 10 - 24 - 36 = -73$, so $\partial L / \partial w = \frac{2}{4}(-73) = -36.5$.
3. $\sum (\hat{y} - y) = -25$, so $\partial L / \partial b = \frac{2}{4}(-25) = -12.5$.
4. Update: $w = 0 - 0.05 \times (-36.5) = 1.825$ and $b = 0 - 0.05 \times (-12.5) = 0.625$.

The loss goes from 44.75 to 1.40 in a single step. Keep going:

| step | $w$ | $b$ | loss |
|---|---|---|---|
| 0 | 0 | 0 | 44.75 |
| 1 | 1.825 | 0.625 | 1.398 |
| 2 | 2.125 | 0.731 | 0.218 |
| 3 | 2.173 | 0.752 | 0.186 |
| 10 | 2.175 | 0.780 | 0.183 |
| 100 | 2.119 | 0.943 | 0.176 |
| 500 | 2.100 | 1.000 | 0.175 |

Gradient descent reaches the least-squares answer (2.1, 1.0) without ever solving an equation. Step through it:

```viz
{"type": "ml", "algorithm": "gradient-descent", "points": [[1,3],[2,5],[3,8],[4,9]], "lr": 0.05, "steps": 10,
 "title": "Gradient descent from w = 0, b = 0",
 "caption": "Each step computes the gradient over all four points and moves against it. Watch the loss curve flatten after step 3."}
```

In numpy the whole thing is a few lines:

```python
import numpy as np

x = np.array([1.0, 2.0, 3.0, 4.0])   # millions of rows
y = np.array([3.0, 5.0, 8.0, 9.0])   # minutes

def loss(w, b):
    return np.mean((w * x + b - y) ** 2)

def grad(w, b):
    err = w * x + b - y              # vector of 4 errors
    return 2 * np.mean(err * x), 2 * np.mean(err)

w, b, lr = 0.0, 0.0, 0.05
for step in range(1, 501):
    dw, db = grad(w, b)
    w, b = w - lr * dw, b - lr * db
# after 500 steps: w ≈ 2.100, b ≈ 1.000, loss ≈ 0.175
```

### Why the last 0.01 of loss took 490 steps

Look at the table again. The loss is within about 6% of optimal after three steps, but $b$ crawls from 0.75 to 1.00 over hundreds of steps. That is not bad luck; it is the shape of the bowl.

The curvature of the MSE surface is described by its matrix of second derivatives, which here is $\begin{pmatrix} 2\overline{x^2} & 2\bar{x} \\ 2\bar{x} & 2 \end{pmatrix} = \begin{pmatrix} 15 & 5 \\ 5 & 2 \end{pmatrix}$. Its eigenvalues are about **16.7** and **0.30**. The bowl is a long, narrow valley: steep across, almost flat along. In the steep direction, each step with $\eta = 0.05$ shrinks the error by a factor $|1 - 0.05 \times 16.7| = 0.17$, which is why the first steps are dramatic. In the flat direction the factor is $1 - 0.05 \times 0.30 = 0.985$, so the remaining error halves only every 46 steps.

The ratio of the two curvatures (about 56 here) is the **condition number**, and it is the single best predictor of how painful gradient descent will be. It is large here because $x$ is not centred: slope and intercept are tangled together. Standardise the feature (subtract the mean, divide by the standard deviation) and the valley becomes a round bowl that converges in a handful of steps. This is why every ML pipeline normalises its inputs, and why modern optimisers such as Adam keep a separate, adaptive step size for every parameter.

## The learning rate decides everything

Run the same ten steps with four different learning rates:

| $\eta$ | loss after 10 steps | what happened |
|---|---|---|
| 0.01 | 1.338 | too timid: still descending slowly |
| 0.05 | 0.183 | fast and stable |
| 0.10 | 0.196 | overshoots each step, oscillates, still converges |
| 0.20 | about $10^9$ | **diverges**: 44.75, 244, 1337, 7319, … |

The divergence has an exact explanation. Along the steep direction each step multiplies the error by $1 - \eta \lambda$ where $\lambda = 16.7$ is the curvature. At $\eta = 0.1$ that factor is $-0.67$: the step jumps past the minimum to the other side, but lands closer, so it zig-zags inward. At $\eta = 0.2$ the factor is $-2.34$: every step lands 2.34 times further away than it started, and the loss (which is squared error) grows by $2.34^2 \approx 5.5\times$ per step. Check the sequence: $244 \times 5.5 \approx 1337$, $1337 \times 5.5 \approx 7319$. Gradient descent is stable only when $\eta < 2 / \lambda_{\max}$, which is 0.12 for this data.

In real training you never know $\lambda_{\max}$, so you find a learning rate empirically: start small, increase until the loss curve goes unstable, back off. Large models use a **schedule**: a short warm-up from near zero (the early loss surface is chaotic) followed by a slow decay (big steps to cover ground early, small steps to settle into the minimum later). When an engineer says "the run diverged at step 40k", the first suspects are the learning rate and a bad batch of data.

## Mini-batches: the same loop at scale

The gradient above averages over all $n$ examples. That is fine for 4 rows and impossible for a language model trained on trillions of tokens, where one exact gradient would take longer than the whole training budget.

**Stochastic gradient descent** (SGD) estimates the gradient from a random **mini-batch** of examples (say 32, or a few million tokens for an LLM). The estimate is noisy but unbiased: on average it points the right way, and each step costs the same no matter how big the dataset is. One pass over the full dataset is an **epoch**.

```python
for epoch in range(num_epochs):
    for xb, yb in batches(data, batch_size=32, shuffle=True):
        grads = gradient(loss(model(xb, theta), yb), theta)   # backprop
        theta = theta - lr * grads                            # or Adam
```

That loop is, without exaggeration, how every model in this track is trained. A frontier LLM runs it with $\theta$ holding tens or hundreds of billions of numbers, the gradient computed by backpropagation (next lesson), a fancier update rule than `theta - lr * grads`, and thousands of GPUs sharing the work. The concepts do not change.

Batch size is an engineering trade-off. Bigger batches use the GPU's parallelism better and give smoother gradients, but you get fewer updates per epoch, and beyond some size doubling the batch no longer halves the number of steps you need. Small batches are noisy, and that noise is sometimes helpful: it tends to steer training away from sharp minima that generalise poorly.

## What the model actually learned

The fitted line $\hat{y} = 2.1x + 1.0$ is the best line *for these four points*, and it knows nothing else. Three limits follow directly from the mechanism, and they apply to every model up to and including LLMs:

- **It learns correlation, not cause.** If every large job in your history also ran on the old cluster, the slope silently includes "old cluster is slow". Move to new hardware and the model is confidently wrong.
- **It interpolates better than it extrapolates.** Ask about a 100M-row job and the line says 211 minutes. The data never showed it what happens when the job spills to disk at 50M rows. The model has no way to say "I have never seen anything like this".
- **It optimises the loss you gave it, not the goal you had.** If under-predicting runtime causes missed SLAs while over-predicting just wastes a little capacity, MSE treats both errors identically and you have chosen the wrong loss.

The next lessons build on this loop: [Neural networks](/learn/ai-and-llms/ml-foundations/neural-networks) swap the line for a far more flexible function, and [Training and generalisation](/learn/ai-and-llms/ml-foundations/training-and-generalisation) deals with the gap between fitting the data you have and predicting the data you will get.

## Exercise

```exercise
id: gradient-descent-step
title: One step of gradient descent
prompt: |
  Implement one full-batch gradient-descent step for the model `y_hat = w * x + b`
  with mean-squared-error loss `L = (1/n) * sum((y_hat - y)^2)`.

  Given lists `xs` and `ys` of equal length n >= 1, the current `w` and `b`, and a
  learning rate `lr`, return `[new_w, new_b]` where

  - `dL/dw = (2/n) * sum((y_hat_i - y_i) * x_i)`
  - `dL/db = (2/n) * sum(y_hat_i - y_i)`
  - `new_w = w - lr * dL/dw`, `new_b = b - lr * dL/db`

  Compute both gradients from the *old* parameters before updating either one.
  Return unrounded floats; results are compared to 6 decimal places.
languages: [python, javascript]
entry: gradient_descent_step
starter:
  python: |
    def gradient_descent_step(xs, ys, w, b, lr):
        # your code here
        return [w, b]
  javascript: |
    function gradient_descent_step(xs, ys, w, b, lr) {
      // your code here
      return [w, b];
    }
tests:
  - args: [[1, 2, 3, 4], [3, 5, 8, 9], 0, 0, 0.05]
    expected: [1.825, 0.625]
    label: the worked example from the lesson
  - args: [[2], [4], 1, 0, 0.1]
    expected: [1.8, 0.4]
    label: a single example
  - args: [[1, 2], [5, 5], 3, 3, 0]
    expected: [3, 3]
    label: zero learning rate changes nothing
  - args: [[0, 2], [0.25, 1.25], 0.5, 0.25, 0.1]
    expected: [0.5, 0.25]
    label: a perfect fit has zero gradient
  - args: [[-1, 0, 1], [1, 0, -1], 0.5, 0.5, 0.1]
    expected: [0.3, 0.4]
    hidden: true
    label: negative inputs
  - args: [[1, 2, 3, 4], [3, 5, 8, 9], 0, 0, 0.2]
    expected: [7.3, 2.5]
    hidden: true
    label: a learning rate that will diverge still takes a well-defined first step
hints:
  - "Loop once over the data, accumulating `err = w * x + b - y` into two sums: `err * x` and `err`."
  - "Multiply each sum by 2/n to get the gradients, then update. Using the new `w` to compute the `b` gradient is a common bug."
```

## Senior signals

- You describe any ML system in four parts: the **model family**, the **loss**, the **optimiser** and the **data**, and you can say which one is the problem.
- You check whether a **closed form or a simple baseline** (least squares, a median, last week's value) already meets the bar before proposing anything that needs a GPU.
- You read loss curves: loss exploding means the learning rate is too high or there is a bad batch; a fast drop then a long crawl means **poor conditioning**, fixed by normalising features or using an adaptive optimiser.
- You choose the loss deliberately, knowing that **MSE chases outliers and predicts the mean** while MAE predicts the median, and that the loss is only a proxy for the business cost of errors.
- You keep **training cost and inference cost** separate in every design discussion.
- You say out loud that a fitted model **interpolates, does not extrapolate, and learns correlation**, and you plan for inputs outside the training range.

## Check yourself

```quiz
- q: >-
    Gradient descent on a line fit uses learning rate 0.2 and the loss goes 44.75, 244, 1337, 7319. What is happening and what do you change?
  options: ["The model is underfitting; add more parameters", "The data has outliers; switch from MSE to MAE", "Each step overshoots the minimum and lands further away; lower the learning rate", "The gradient is being computed on too few examples; increase the batch size"]
  answer: 2
  explanation: >-
    A loss that grows by a constant factor per step is the signature of a learning rate above 2 divided by the largest curvature: every update jumps past the minimum and lands further up the other side. Lowering the learning rate (here below about 0.12) fixes it. More parameters, a different loss or a bigger batch do not change the overshoot.
- q: >-
    After three steps the loss is within about 6% of optimal, but the intercept b takes hundreds more steps to settle. What is the most effective fix?
  options: ["Raise the learning rate until b moves faster", "Standardise the input feature (subtract its mean, divide by its standard deviation)", "Train for more epochs", "Switch to the MAE loss"]
  answer: 1
  explanation: >-
    The slow crawl comes from a badly conditioned, elongated valley: uncentred x tangles slope and intercept. Standardising the feature rounds the bowl so every direction converges at a similar rate. Raising the learning rate would make the steep direction diverge long before it speeds up the flat one; more epochs only waits it out.
- q: >-
    Your runtime history contains one 90-minute job caused by a node failure among hundreds of 3 to 10 minute jobs. With MSE loss, what happens to the fitted line?
  options: ["It is pulled noticeably toward the outlier, because squared error weights a large error far more than many small ones", "Nothing; one point out of hundreds is negligible", "Training fails to converge", "The model automatically ignores points it cannot fit"]
  answer: 0
  explanation: >-
    Squaring makes an error of 80 minutes cost as much as 6,400 errors of 1 minute, so the optimum shifts toward the outlier. MAE, a robust loss such as Huber, or cleaning the data are the usual remedies. The optimisation still converges fine; it converges to a worse line.
- q: >-
    Why do large-scale training runs use mini-batch gradients rather than the exact gradient over the full dataset?
  options: ["Mini-batch gradients are more accurate", "Full-batch gradients cannot be computed for neural networks", "Mini-batches remove the need for a learning rate", "The exact gradient needs a pass over all the data for every single update, which is infeasible at trillions of examples; a mini-batch gives an unbiased estimate at fixed cost"]
  answer: 3
  explanation: >-
    The mini-batch gradient is noisier, not more accurate, but it is an unbiased estimate whose cost does not grow with the dataset, so you get millions of cheap updates instead of a handful of exact ones. Full-batch gradients are computable for any differentiable model; they are just too expensive per step.
- q: >-
    A model fitted on jobs of 1 to 4 million rows predicts 211 minutes for a 100-million-row job. What is the right senior reaction?
  options: ["Trust it; the line fits the training data almost perfectly", "Treat it as an extrapolation far outside the training range, where the model has no evidence, and add a guard or fallback", "Retrain with a lower learning rate", "Add more parameters so the model can represent larger jobs"]
  answer: 1
  explanation: >-
    A good fit inside the data range says nothing about behaviour far outside it; effects such as disk spill never appeared in training. The right move is to detect out-of-range inputs and fall back or flag them, and to collect data in that range. The learning rate and the parameter count are irrelevant to missing evidence.
```
