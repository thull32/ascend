---
slug: what-a-model-is
title: "What a model is: parameters, loss and gradient descent"
description: A model is a function with adjustable numbers, a loss that scores it and an optimiser that tunes it. Worked by hand on a four-point linear regression through three full gradient steps, with the conditioning that makes training slow, the learning rate that makes it diverge, what Adam and mixed precision do under the hood, and how it fails in production.
minutes: 45
difficulty: easy
tags: [machine-learning, linear-regression, gradient-descent, loss-functions, optimisation]
problems: []
---
Your team runs nightly batch jobs, and the scheduler needs to know how long each one will take before it starts. You have history: a job over 1 million rows took 3 minutes, 2 million took 5, 3 million took 8, 4 million took 9. Tomorrow's job has 2.5 million rows. You could eyeball it and write `minutes = 2 * rows + 1` into the scheduler, but the table has ten thousand rows and forty columns, and the relationship drifts every time the cluster changes.

Machine learning replaces the hand-written rule with a procedure that *finds* the rule from data. The procedure has exactly three parts, and they are the same three parts whether you are fitting this four-point line or training a language model with 70 billion parameters: a **function with adjustable numbers**, a **loss** that scores how wrong it is, and an **optimiser** that nudges the numbers to reduce the loss. This lesson builds all three by hand, then opens up what a real training framework does with them.

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
3. It punishes big errors disproportionately: one error of 10 costs as much as a hundred errors of 1. That is the trap. If one job in your history ran for 90 minutes because a node died, MSE bends the whole line towards it.

Choosing the loss is a product decision, and the alternatives differ in what they predict:

| Loss | Formula per example | Best constant prediction | Outlier sensitivity | Gradient |
|---|---|---|---|---|
| MSE | $(\hat{y} - y)^2$ | the mean | high: grows with the square | proportional to the error |
| MAE | $\lvert \hat{y} - y \rvert$ | the median | low: grows linearly | constant size, undefined at 0 |
| Huber ($\delta$) | squared below $\delta$, linear above | between mean and median | bounded | proportional, then capped |
| Pinball ($\tau$) | $\tau(y - \hat{y})$ if under, $(1-\tau)(\hat{y} - y)$ if over | the $\tau$-quantile | low | two constant slopes |

The pinball row is the one schedulers want. If a late job costs a missed SLA and an early one costs idle capacity, you do not want the mean runtime; you want "a runtime we exceed only 10% of the time". Train with the pinball loss at $\tau = 0.9$ and under-prediction is charged $0.9 / 0.1 = 9$ times more than over-prediction, so the fitted line settles at the 90th percentile.

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

With many features the same idea becomes the **normal equations**, $w = (X^\top X)^{-1} X^\top y$, which cost $O(nd^2 + d^3)$ for $n$ examples and $d$ features. That is fine for $d = 40$ and hopeless for $d = 10^9$. Libraries do not form $X^\top X$ literally: at the time of writing, scikit-learn's `LinearRegression` calls SciPy's least-squares solver, which uses an SVD-based LAPACK routine, because forming $X^\top X$ squares the condition number (defined below) and throws away half the floating-point digits. More importantly, the moment the model is not linear in its parameters (a neural network, a transformer) there is no closed form at all. You need a method that only asks "which way is downhill from here?".

## Gradient descent

The **gradient** of the loss is the vector of its partial derivatives, one per parameter. It points in the direction in which the loss increases fastest, so you step the opposite way:

$$w \leftarrow w - \eta \frac{\partial L}{\partial w}, \qquad b \leftarrow b - \eta \frac{\partial L}{\partial b}$$

The step size $\eta$ (eta) is the **learning rate**. For MSE on a line, the derivatives are (chain rule on $(\hat{y} - y)^2$):

$$\frac{\partial L}{\partial w} = \frac{2}{n} \sum (\hat{y}_i - y_i)\, x_i, \qquad \frac{\partial L}{\partial b} = \frac{2}{n} \sum (\hat{y}_i - y_i)$$

Read those as sentences. The gradient for $b$ is twice the average error: if you are predicting too low on average, raise $b$. The gradient for $w$ weights each error by its input: errors on big jobs say more about the slope than errors on small jobs.

## Three steps by hand

Start at $w = 0$, $b = 0$ with $\eta = 0.05$. Each row computes the four errors $\hat{y} - y$ from the *current* parameters, turns them into the two gradients, and applies the update.

| Step | $w$, $b$ before | Errors $\hat{y} - y$ | $\partial L/\partial w$ | $\partial L/\partial b$ | $w$, $b$ after | Loss after |
|---|---|---|---|---|---|---|
| 1 | 0, 0 | −3, −5, −8, −9 | $\tfrac{2}{4}(-73) = -36.5$ | $\tfrac{2}{4}(-25) = -12.5$ | 1.825, 0.625 | 1.398 |
| 2 | 1.825, 0.625 | −0.55, −0.725, −1.9, −1.075 | $\tfrac{2}{4}(-12.0) = -6.0$ | $\tfrac{2}{4}(-4.25) = -2.125$ | 2.125, 0.731 | 0.218 |
| 3 | 2.125, 0.731 | −0.144, −0.019, −0.894, +0.231 | $\tfrac{2}{4}(-1.94) = -0.969$ | $\tfrac{2}{4}(-0.825) = -0.413$ | 2.173, 0.752 | 0.186 |

Check row 2 yourself: the predictions are $1.825x + 0.625 = 2.45, 4.275, 6.1, 7.925$, so the errors are as shown; $\sum e_i x_i = -0.55 - 1.45 - 5.7 - 4.3 = -12.0$; the update is $w = 1.825 - 0.05 \times (-6.0) = 2.125$ and $b = 0.625 - 0.05 \times (-2.125) = 0.731$. Notice the gradients shrink by a factor of about six per step: the steps get smaller on their own, without anyone lowering $\eta$, because the gradient is proportional to the remaining error.

Keep going and the loss settles on the least-squares optimum:

| step | $w$ | $b$ | loss |
|---|---|---|---|
| 0 | 0 | 0 | 44.75 |
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

The whole loop in plain Python (no libraries, so you can run it anywhere):

```python
xs = [1.0, 2.0, 3.0, 4.0]   # millions of rows
ys = [3.0, 5.0, 8.0, 9.0]   # minutes

def loss(w, b):
    return sum((w * x + b - y) ** 2 for x, y in zip(xs, ys)) / len(xs)

def grad(w, b):
    errs = [w * x + b - y for x, y in zip(xs, ys)]      # y_hat - y for each example
    dw = 2 * sum(e * x for e, x in zip(errs, xs)) / len(xs)
    db = 2 * sum(errs) / len(xs)
    return dw, db

w, b, lr = 0.0, 0.0, 0.05
for step in range(1, 501):
    dw, db = grad(w, b)                  # both gradients from the OLD (w, b)
    w, b = w - lr * dw, b - lr * db
print(round(w, 3), round(b, 3), round(loss(w, b), 3))   # 2.1 1.0 0.175
```

The tuple assignment on the last line of the loop matters: updating `w` first and then computing the `b` gradient from the new `w` is a different (and wrong) algorithm.

## Why the last 0.01 of loss took a hundred steps

Look at the table again. The loss is within about 6% of optimal after three steps, but $b$ crawls from 0.75 to 1.00 over hundreds of steps. That is not bad luck; it is the shape of the bowl.

The curvature of the MSE surface is described by its matrix of second derivatives (the Hessian), which here is $\begin{pmatrix} 2\overline{x^2} & 2\bar{x} \\ 2\bar{x} & 2 \end{pmatrix} = \begin{pmatrix} 15 & 5 \\ 5 & 2 \end{pmatrix}$. Its eigenvalues are about **16.7** and **0.30**. The bowl is a long, narrow valley: steep across, almost flat along. In the steep direction, each step with $\eta = 0.05$ multiplies the remaining error by $|1 - 0.05 \times 16.7| = 0.17$, which is why the first steps are dramatic. In the flat direction the factor is $1 - 0.05 \times 0.30 = 0.985$, so the remaining error halves only every 46 steps.

The ratio of the two curvatures (about 56 here) is the **condition number**, and it is the single best predictor of how painful gradient descent will be. It is large here because $x$ is not centred: slope and intercept are tangled together.

Now standardise the feature: subtract the mean 2.5 and divide by the standard deviation 1.118, giving $z = (-1.342, -0.447, 0.447, 1.342)$. The Hessian becomes $\begin{pmatrix} 2 & 0 \\ 0 & 2 \end{pmatrix}$: curvature 2 in every direction, condition number 1, a perfectly round bowl. With $\eta = 1/2$ (one over the curvature), a single step lands exactly on the minimum, $w_z = 2.348$, $b_z = 6.25$, which maps back to $w = 2.348 / 1.118 = 2.1$ and $b = 6.25 - 2.1 \times 2.5 = 1.0$. On the raw feature the same accuracy (three decimal places) took about 100 steps for the loss and about 400 for $b$. This is why every ML pipeline normalises its inputs, and why modern optimisers such as Adam keep a separate, adaptive step size for every parameter (under the hood, below).

## The learning rate decides everything

Run the same ten steps with four different learning rates:

| $\eta$ | loss after 10 steps | what happened |
|---|---|---|
| 0.01 | 1.338 | too timid: still descending slowly |
| 0.05 | 0.183 | fast and stable |
| 0.10 | 0.196 | overshoots each step, oscillates, still converges |
| 0.20 | about $10^9$ | **diverges**: 44.75, 244, 1337, 7319, … |

The divergence has an exact explanation. Along the steep direction each step multiplies the error by $1 - \eta \lambda$ where $\lambda = 16.7$ is the curvature. At $\eta = 0.1$ that factor is $-0.67$: the step jumps past the minimum to the other side, but lands closer, so it zig-zags inward. At $\eta = 0.2$ the factor is $-2.34$: every step lands 2.34 times further away than it started, and the loss (which is squared error) grows by $2.34^2 \approx 5.5\times$ per step. Check the sequence: $244 \times 5.5 \approx 1337$, $1337 \times 5.5 \approx 7319$. Gradient descent is stable only when $\eta < 2 / \lambda_{\max}$, which is 0.12 for this data.

In real training you never know $\lambda_{\max}$, so you find a learning rate empirically: start small, increase until the loss curve goes unstable, back off. Large models use a **schedule**: a short warm-up from near zero (the early loss surface is chaotic and the optimiser's statistics are not yet reliable) followed by a slow decay (big steps to cover ground early, small steps to settle into the minimum later). When an engineer says "the run diverged at step 40k", the first suspects are the learning rate and a bad batch of data.

## Mini-batches: the same loop at scale

The gradient above averages over all $n$ examples. That is fine for 4 rows and impossible for a language model trained on trillions of tokens, where one exact gradient would take longer than the whole training budget.

**Stochastic gradient descent** (SGD) estimates the gradient from a random **mini-batch** of examples (say 32, or a few million tokens for an LLM). The estimate is noisy but unbiased: on average it points the right way, and each step costs the same no matter how big the dataset is. One pass over the full dataset is an **epoch**. In outline:

```text
for epoch in range(num_epochs):
    for xb, yb in batches(data, batch_size=32, shuffle=True):
        grads = gradient(loss(model(xb, theta), yb), theta)   # backprop
        theta = theta - lr * grads                            # or Adam
```

That loop is how every model in this track is trained. A frontier LLM runs it with $\theta$ holding tens or hundreds of billions of numbers, the gradient computed by backpropagation (next lesson), a fancier update rule than `theta - lr * grads`, and thousands of GPUs sharing the work. The concepts do not change.

Batch size is an engineering trade-off. Bigger batches use the GPU's parallelism better and give smoother gradients (the noise in the average falls as $1/\sqrt{B}$), but you get fewer updates per epoch, and beyond some size doubling the batch no longer halves the number of steps you need. Small batches are noisy, and that noise is sometimes helpful: it tends to steer training away from sharp minima that generalise poorly.

## Under the hood: what a training framework does per step

A framework such as PyTorch runs the same three parts, with three pieces of machinery you should know by name.

**Autograd.** You write only the forward computation. The framework records each operation as it runs, and `loss.backward()` walks that record in reverse applying the chain rule, which is backpropagation (worked by hand in the next lesson). The gradients land in each parameter's `.grad` field and are **added** to whatever is already there, which is why every training loop calls `optimizer.zero_grad()` before `backward()`: forget it and step $t$ uses the sum of $t$ gradients.

**The optimiser's state.** Plain SGD stores nothing beyond the parameters. **Adam**, the default for neural networks, keeps two running averages per parameter: $m$ (the mean gradient, a momentum term) and $v$ (the mean squared gradient), and steps by $\eta \cdot \hat{m} / (\sqrt{\hat{v}} + \epsilon)$:

```python
import math

def adam(grad, params, lr=0.1, beta1=0.9, beta2=0.999, eps=1e-8, steps=300):
    m = [0.0] * len(params)              # running mean of gradients (momentum)
    v = [0.0] * len(params)              # running mean of squared gradients
    for t in range(1, steps + 1):
        g = grad(*params)
        for i in range(len(params)):
            m[i] = beta1 * m[i] + (1 - beta1) * g[i]
            v[i] = beta2 * v[i] + (1 - beta2) * g[i] ** 2
            m_hat = m[i] / (1 - beta1 ** t)          # undo the bias towards 0 of early averages
            v_hat = v[i] / (1 - beta2 ** t)
            params[i] -= lr * m_hat / (math.sqrt(v_hat) + eps)
    return params

adam(grad, [0.0, 0.0], lr=0.1, steps=1)     # [0.1, 0.1]   (uses grad from the loop above)
adam(grad, [0.0, 0.0], lr=0.5, steps=300)   # [2.1, 1.0]
```

Trace step 1 on the batch-job data. The gradients are −36.5 and −12.5; after bias correction $\hat{m} = g$ and $\hat{v} = g^2$, so each step is $\eta \cdot g / |g| = \eta$ in the downhill direction. Both $w$ and $b$ move by exactly 0.1, although one gradient is three times the other. Adam divides out each parameter's gradient scale, which is the per-parameter answer to the conditioning problem above. The price is memory: two extra numbers per parameter.

## Under the hood: precision and training memory

Large models train in mixed precision: the forward and backward passes run in 16-bit bfloat16, but a 32-bit master copy of the weights receives the updates. The reason is visible in a two-line experiment. bfloat16 stores only 7 mantissa bits (8 bits of precision counting the implicit leading 1), against float32's 23, so the gap between 1.0 and the next representable number is $2^{-7} = 0.0078$. Add an update of 0.001 to a weight of 1.0 in bfloat16 and the result rounds back to 1.0; do it 100 times and the weight is still 1.0, where float32 reaches 1.1. Small updates vanish unless the master copy has the digits to hold them. The accounting that follows, from Microsoft's ZeRO paper, is 16 bytes per parameter for mixed-precision Adam (2 for 16-bit weights, 2 for 16-bit gradients, 12 for the 32-bit master weights, $m$ and $v$), so a 7-billion-parameter model needs about $7 \times 10^9 \times 16 = 112$ GB of training state before a single activation is stored, against 14 GB to serve it in 16-bit. That factor of eight is why training needs a cluster and inference fits on one accelerator.

## What the model actually learned

The fitted line $\hat{y} = 2.1x + 1.0$ is the best line *for these four points*, and it knows nothing else. Three limits follow directly from the mechanism, and they apply to every model up to and including LLMs:

- **It learns correlation, not cause.** If every large job in your history also ran on the old cluster, the slope silently includes "old cluster is slow". Move to new hardware and the model is confidently wrong.
- **It interpolates better than it extrapolates.** Ask about a 100M-row job and the line says 211 minutes. The data never showed it what happens when the job spills to disk at 50M rows. The model has no way to say "I have never seen anything like this".
- **It optimises the loss you gave it, not the goal you had.** If under-predicting runtime causes missed SLAs while over-predicting only wastes a little capacity, MSE treats both errors identically and you have chosen the wrong loss (the pinball loss above is the fix).

## Failure modes in production

**The loss goes to NaN.** *Symptom:* the loss curve rises for a few steps, then prints `nan` or `inf`. *Diagnosis:* each step multiplies the error by $|1 - \eta\lambda| > 1$, the geometric blow-up traced above; common triggers are a learning rate copied from another model, a feature left unscaled (rows as 2,000,000 instead of 2.0 multiplies the curvature by $10^{12}$), or a single corrupt batch with an enormous value. *Fix:* standardise features, lower $\eta$ or add warm-up, clip the gradient norm, and assert that inputs are finite before each step.

**Gradients accumulate across steps.** *Symptom:* training looks fine for a few steps and then oscillates and diverges, with an effective step size that grows over time. *Diagnosis:* `zero_grad()` is missing or in the wrong place, so step $t$ applies the sum of all gradients so far. *Fix:* zero before every `backward()`; if you accumulate on purpose to simulate a bigger batch, divide by the number of accumulated micro-batches.

**Training-serving skew.** *Symptom:* offline error is 0.2 minutes, production error is 20 minutes, and no error is logged anywhere. *Diagnosis:* the model was trained on standardised features with the training set's mean and standard deviation, and the serving path either skips the scaling or recomputes it per request batch; log the feature values at serving and compare their distribution with training. *Fix:* ship the scaler with the model as one artifact, and test that the serving code produces identical features for a fixed input.

**Slow drift.** *Symptom:* the model was accurate at launch and its error creeps up over months. *Diagnosis:* the world moved (new hardware, bigger tables) and the fitted relationship is now correlation with conditions that no longer hold; plot residuals against time and against input size. *Fix:* monitor residuals as a service metric, retrain on a schedule or on drift alerts, and guard inputs outside the training range. [ML data pipelines](/learn/big-data/data-platforms/ml-data-pipelines) covers the plumbing that makes retraining routine.

## Choosing a solver

| Method | Cost per step | Extra memory | Tuning | Works for non-linear models | Typical use |
|---|---|---|---|---|---|
| Closed form (QR or SVD least squares) | one $O(nd^2)$ solve | $O(d^2)$ or $O(nd)$ | none | no | linear models up to tens of thousands of features |
| Full-batch gradient descent | $O(nd)$ | none | learning rate | yes | small data, teaching |
| Mini-batch SGD with momentum | $O(Bd)$ | 1 number per parameter | learning rate, schedule | yes | vision models, very large linear models |
| Adam / AdamW | $O(Bd)$ | 2 numbers per parameter | learning rate, betas, schedule | yes | transformers and most neural networks |

The table's most useful column is the last-but-one. A linear model with forty features should be solved in closed form and checked against a median baseline before anyone mentions a GPU.

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

## Interviewer follow-ups

**"Why not always use the closed-form solution?"** *Model answer:* it costs $O(nd^2 + d^3)$ and $O(d^2)$ memory, which is fine for tens of features and impossible for millions; it exists only for models linear in their parameters; and done naively through $X^\top X$ it squares the condition number, so libraries use QR or SVD. For anything non-linear, iterative optimisation is the only option. *Common wrong answer:* "gradient descent is more accurate", when on a convex problem both reach the same optimum and the closed form gets there exactly.

**"How would you pick a learning rate for a new model?"** *Model answer:* a range test (increase $\eta$ geometrically over a few hundred steps and pick a value somewhat below where the loss turns up), a warm-up and decay schedule, and a check that the chosen value survives a change of batch size; the theory says stability needs $\eta < 2/\lambda_{\max}$, which you cannot compute for a network but can find empirically. *Common wrong answer:* "0.001, because it is Adam's default", with no check.

**"The loss went to NaN at step 40,000 of a long run. What do you check?"** *Model answer:* the gradient-norm history in the steps before (a spike points to a bad batch or a learning-rate schedule step), the data at that step for non-finite or extreme values, and overflow in 16-bit arithmetic; restart from the last checkpoint with gradient clipping and that batch skipped. *Common wrong answer:* "the model is too big", which says nothing about why step 40,000 differed from step 39,999.

**"Why do we standardise features?"** *Model answer:* it fixes the conditioning. On the batch-job data the condition number falls from about 56 to exactly 1, and a single step at $\eta = 0.5$ reaches the optimum that took hundreds of steps before. *Common wrong answer:* "so the numbers fit in floating point", which is true only at extremes and misses the convergence argument.

**"MSE or MAE for predicting job runtime?"** *Model answer:* neither by default; ask what an error costs. MSE predicts the mean and chases outliers, MAE predicts the median, and a scheduler that must rarely under-estimate wants a high quantile, which the pinball loss at $\tau = 0.9$ fits directly. *Common wrong answer:* "MSE, it is the standard".

## What mid-level engineers get wrong

- **Reading training loss as model quality.** A low training loss says the optimiser worked, not that the model predicts tomorrow; [Training and generalisation](/learn/ai-and-llms/ml-foundations/training-and-generalisation) is about that gap.
- **Treating the learning rate as a constant to copy.** The stable range depends on curvature, which depends on the features and the architecture; a value that works for one model diverges on another.
- **Declaring convergence when the loss stops falling fast.** In a badly conditioned problem the loss flattens while a parameter is still far off, as $b$ was here after step 3.
- **Scaling features in the notebook and not in the service.** Training-serving skew is the most common way a correct model produces wrong answers.
- **Defaulting to MSE when the cost of errors is asymmetric.** The loss is the specification of what "good" means; the wrong one optimises the wrong thing perfectly.
- **Budgeting training memory as model size.** Adam in mixed precision needs about 16 bytes per parameter, eight times the 16-bit weights.

## Senior signals

- You describe any ML system in four parts: the **model family**, the **loss**, the **optimiser** and the **data**, and you can say which one is the problem.
- You check whether a **closed form or a simple baseline** (least squares, a median, last week's value) already meets the bar before proposing anything that needs a GPU.
- You read loss curves: loss exploding means the learning rate is too high or there is a bad batch; a fast drop then a long crawl means **poor conditioning**, fixed by normalising features or using an adaptive optimiser.
- You choose the loss deliberately, knowing that **MSE chases outliers and predicts the mean**, MAE predicts the median and the pinball loss predicts a quantile, and that the loss is only a proxy for the business cost of errors.
- You keep **training cost and inference cost** separate in every design discussion, and you can estimate training memory at about 16 bytes per parameter for mixed-precision Adam.
- You say out loud that a fitted model **interpolates, does not extrapolate, and learns correlation**, and you plan for inputs outside the training range and for drift.

## Check yourself

```quiz
- q: >-
    Gradient descent on a line fit uses learning rate 0.2 and the loss goes 44.75, 244, 1337, 7319. What is happening and what do you change?
  options: ["The mini-batch gradient is too noisy; increase the batch size", "Outliers dominate the squared loss; switch from MSE to MAE", "Each step overshoots the minimum; lower the learning rate", "The model is underfitting the data; add more parameters so it can fit"]
  answer: 2
  explanation: >-
    A loss that grows by a constant factor per step is the signature of a learning rate above 2 divided by the largest curvature: every update jumps past the minimum and lands further up the other side. Lowering the learning rate (here below about 0.12) fixes it. More parameters, a different loss or a bigger batch do not change the overshoot.
- q: >-
    After three steps the loss is within about 6% of optimal, but the intercept b takes hundreds more steps to settle. What is the most effective fix?
  options: ["Raise the learning rate so the intercept takes much bigger steps", "Switch to the MAE loss so large residuals stop dominating b", "Keep training for more epochs until the intercept settles", "Standardise the input feature to zero mean and unit variance"]
  answer: 3
  explanation: >-
    The slow crawl comes from a badly conditioned, elongated valley: uncentred x tangles slope and intercept. Standardising the feature makes the curvature 2 in every direction, so one step at learning rate 0.5 reaches the optimum. Raising the learning rate would make the steep direction diverge long before it speeds up the flat one; more epochs only waits it out.
- q: >-
    Your runtime history contains one 90-minute job caused by a node failure among hundreds of 3 to 10 minute jobs. With MSE loss, what happens to the fitted line?
  options: ["It barely moves, because one point among hundreds has negligible weight", "It ignores the point, because gradient descent discounts points it cannot fit", "It is pulled toward the outlier, because squaring amplifies large errors", "It fails to converge, because the outlier makes the loss surface non-convex"]
  answer: 2
  explanation: >-
    Squaring makes an error of 80 minutes cost as much as 6,400 errors of 1 minute, so the optimum shifts noticeably toward the outlier; one point among hundreds is not negligible under MSE. MAE, a robust loss such as Huber, or cleaning the data are the usual remedies. The optimisation still converges fine (MSE on a line is a convex bowl); it converges to a worse line.
- q: >-
    Why do large-scale training runs use mini-batch gradients rather than the exact gradient over the full dataset?
  options: ["Full-batch gradients cannot be computed for deep neural networks", "The exact gradient costs a full pass over all the data for every update", "Mini-batch gradients are more accurate than the exact full-batch one", "Mini-batches remove the need to choose and tune a learning rate"]
  answer: 1
  explanation: >-
    At trillions of examples, a full pass per update is infeasible. The mini-batch gradient is noisier, not more accurate, but it is an unbiased estimate whose cost does not grow with the dataset, so you get millions of cheap updates instead of a handful of exact ones. Full-batch gradients are computable for any differentiable model; they are too expensive per step, and mini-batch training still needs a learning rate.
- q: >-
    A model fitted on jobs of 1 to 4 million rows predicts 211 minutes for a 100-million-row job. What is the right senior reaction?
  options: ["Retrain with a lower learning rate so the line generalises to bigger jobs", "Add more parameters so the model can represent very large jobs", "Trust it, because the line fits the training data almost perfectly", "Treat it as an extrapolation beyond the training range and add a guard"]
  answer: 3
  explanation: >-
    A good fit inside the data range says nothing about behaviour far outside it; effects such as disk spill never appeared in training. The right move is to detect out-of-range inputs and fall back or flag them, and to collect data in that range. The learning rate and the parameter count are irrelevant to missing evidence.
- q: >-
    You plan to train a 7-billion-parameter model with Adam in mixed precision. Roughly how much memory do the weights, gradients and optimiser state need, before activations?
  options: ["About 14 GB, the size of the 16-bit weights", "About 28 GB, the weights plus their gradients", "About 56 GB, the 32-bit weights plus gradients", "About 112 GB, around 16 bytes per parameter"]
  answer: 3
  explanation: >-
    Mixed-precision Adam holds 16-bit weights and gradients (4 bytes per parameter) plus a 32-bit master copy and the two moment estimates m and v (12 bytes), about 16 bytes per parameter or 112 GB for 7 billion. The 14 GB figure is what serving the 16-bit weights needs, which is why training needs several accelerators when inference fits on one.
```
