---
slug: neural-networks
title: "Neural networks: neurons, layers and backpropagation by hand"
description: Why stacking linear layers needs a non-linearity, what a forward pass computes, a two-neuron warm-up and then a complete forward and backward pass through a 2-2-1 network with every intermediate value, what autograd records, how initialisation decides whether signals survive ten layers, and the failure modes that show up in real training runs.
minutes: 40
difficulty: medium
tags: [machine-learning, neural-networks, backpropagation, activation-functions, chain-rule]
problems: []
---
A linear model can only draw straight lines. That is fine for "runtime grows with row count", and useless for most things you actually want to predict. Whether a video stream rebuffers depends on the *ratio* of bitrate to bandwidth, not on either alone. Whether a login is suspicious depends on *combinations*: new device and new country is alarming, either one alone is normal. The simplest version of that second problem is XOR: output 1 when exactly one of two inputs is 1. Plot the four cases and you will find no straight line that puts (0,1) and (1,0) on one side and (0,0) and (1,1) on the other.

A neural network fixes this by composing many simple units, each a linear function followed by a small non-linear bend. With enough units the composition can approximate essentially any function, and the same gradient descent loop from [What a model is](/learn/ai-and-llms/ml-foundations/what-a-model-is) still trains it. The piece that makes training possible is backpropagation, and by the end of this lesson you will have run it by hand on a network with two inputs, two hidden neurons and one output, every intermediate value written down.

## The neuron

A single neuron takes a vector of inputs, computes a weighted sum plus a bias, and passes the result through an **activation function** $\varphi$:

$$z = w \cdot x + b, \qquad a = \varphi(z)$$

$z$ is the **pre-activation**, $a$ the **activation** (the neuron's output). If $\varphi$ is the sigmoid $\sigma(z) = 1/(1 + e^{-z})$, which squashes any number into (0, 1), this one neuron *is* logistic regression, which you will meet again in [Classical ML you should know](/learn/ai-and-llms/ml-foundations/classical-ml-you-should-know).

The common activations, compared on the properties that decide training behaviour:

| Activation | Formula | Largest derivative | Dead-unit risk | Cost per unit | Where you see it |
|---|---|---|---|---|---|
| Sigmoid | $1/(1+e^{-z})$ | 0.25, at $z = 0$ | none, but saturates: $\sigma'(10) = 0.00005$ | one exponential | binary outputs (probabilities) |
| tanh | $\frac{e^z - e^{-z}}{e^z + e^{-z}}$ | 1, at $z = 0$ | none, saturates | exponentials | older recurrent networks |
| ReLU | $\max(0, z)$ | 1 whenever $z > 0$ | high: 0 gradient for $z < 0$ | one comparison | hidden layers of CNNs and MLPs |
| Leaky ReLU | $\max(0.01z, z)$ | 1, and 0.01 below 0 | low | one comparison | when dead units appear |
| GELU / SwiGLU | smooth ReLU-like curves | about 1, non-zero slightly below 0 | low | a few extra operations; SwiGLU adds a third weight matrix | the MLP inside modern transformers |

Backpropagation multiplies derivatives together, so the "largest derivative" column predicts how well gradients survive depth. Keep "sigmoid's derivative is at most 0.25" in mind; it explains a whole era of failed deep networks.

## Why the non-linearity is the whole point

Stack two linear layers without an activation and see what you get:

$$W_2(W_1 x + b_1) + b_2 = (W_2 W_1)\,x + (W_2 b_1 + b_2) = W' x + b'$$

A single linear layer. Ten linear layers are still one linear layer; depth buys nothing. The activation between layers is what breaks the collapse.

Here is XOR solved with two ReLU neurons, weights chosen by hand:

- $h_1 = \text{ReLU}(x_1 + x_2)$
- $h_2 = \text{ReLU}(x_1 + x_2 - 1)$
- $\hat{y} = h_1 - 2 h_2$

| $x_1, x_2$ | $h_1$ | $h_2$ | $\hat{y}$ |
|---|---|---|---|
| 0, 0 | 0 | 0 | 0 |
| 1, 0 | 1 | 0 | 1 |
| 0, 1 | 1 | 0 | 1 |
| 1, 1 | 2 | 1 | 0 |

$h_2$ stays at zero until both inputs are on, then switches on and cancels the double count. Each ReLU is a hinge; a network is a sum of many hinges, which is how it bends a flat plane into whatever shape the data needs. Training finds those weights instead of you.

## Layers are matrix multiplies

A **layer** is many neurons reading the same input. Stack their weight vectors as the rows of a matrix $W$ with shape (outputs × inputs) and the layer is one line: $a = \varphi(Wx + b)$. A network is a chain of these. Process a batch of $B$ examples at once and $x$ becomes a $B \times d_{\text{in}}$ matrix; the whole forward pass is a handful of matrix multiplications, which is what GPUs are built to do.

Parameter counting is mechanical. A layer from $d_{\text{in}}$ to $d_{\text{out}}$ has $d_{\text{in}} d_{\text{out}}$ weights plus $d_{\text{out}}$ biases. A digit classifier with layers 784 → 256 → 10 has $784 \times 256 + 256 + 256 \times 10 + 10 = 203{,}530$ parameters. Each weight costs one multiply and one add per example, so a forward pass is about $2 \times$ (parameter count) floating-point operations per example: 0.4 MFLOP here. That rule of thumb scales all the way up: a 7B-parameter language model spends about 14 GFLOPs per token.

```python
import numpy as np

def relu(z):
    return np.maximum(0.0, z)

def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))

# the 2 -> 3 -> 1 network in the visualisation below
W1 = np.array([[0.5, -0.4], [0.3, 0.8], [-0.6, 0.2]])   # shape (3, 2): one row per hidden unit
b1 = np.array([0.1, -0.2, 0.05])
W2 = np.array([0.7, -0.5, 0.9])                         # shape (3,)
b2 = 0.1

x = np.array([1.0, 0.5])
h = relu(W1 @ x + b1)          # [0.4, 0.5, 0.0]  (third unit: -0.45, switched off)
y_hat = sigmoid(W2 @ h + b2)   # sigmoid(0.13) = 0.53
```

Step through the same computation unit by unit:

```viz
{"type": "ml", "algorithm": "neural-net-forward", "x": [1.0, 0.5],
 "title": "Forward pass through a 2 → 3 → 1 network",
 "caption": "Each hidden unit computes w·x + b then ReLU. The third unit's pre-activation is −0.45, so ReLU switches it off."}
```

## Warm-up: two neurons in a chain

The smallest network that shows every idea has two neurons in a chain. One input $x$, one hidden neuron with a sigmoid, one linear output neuron:

$$z_1 = w_1 x + b_1, \quad h = \sigma(z_1), \quad \hat{y} = w_2 h + b_2, \quad L = \tfrac{1}{2}(\hat{y} - y)^2$$

(The $\tfrac{1}{2}$ cancels the 2 that differentiation brings down.) Take $x = 2.0$, target $y = 1.0$, and $w_1 = 0.3$, $b_1 = -0.2$, $w_2 = 0.8$, $b_2 = 0.1$. Forward: $z_1 = 0.4$, $h = \sigma(0.4) = 1/(1 + 0.6703) = 0.5987$, $\hat{y} = 0.8 \times 0.5987 + 0.1 = 0.5790$, $L = \tfrac{1}{2}(0.4210)^2 = 0.0886$.

Backward, the chain $w_1 \to z_1 \to h \to \hat{y} \to L$ is walked from the loss towards the input, and every step has the same shape: *gradient arriving from above × local derivative of this step*.

| Quantity | Rule | Value |
|---|---|---|
| $\partial L / \partial \hat{y}$ | $\hat{y} - y$ | $-0.4210$ |
| $\partial L / \partial w_2$ | $\partial L / \partial \hat{y} \times h$ | $-0.2521$ |
| $\partial L / \partial b_2$ | $\partial L / \partial \hat{y} \times 1$ | $-0.4210$ |
| $\partial L / \partial h$ | $\partial L / \partial \hat{y} \times w_2$ | $-0.3368$ |
| $\partial L / \partial z_1$ | $\partial L / \partial h \times h(1 - h)$ | $-0.3368 \times 0.2403 = -0.0809$ |
| $\partial L / \partial w_1$ | $\partial L / \partial z_1 \times x$ | $-0.1619$ |
| $\partial L / \partial b_1$ | $\partial L / \partial z_1 \times 1$ | $-0.0809$ |

With $\eta = 0.5$ the update gives $w_1 = 0.3809$, $b_1 = -0.1595$, $w_2 = 0.9260$, $b_2 = 0.3105$, and a second forward pass gives $\hat{y} = 0.9089$ and $L = 0.0041$: one step cut the loss by 95%. The exercise at the end asks you to implement exactly this step.

## Cross-entropy: the loss for probabilities

When the output is a probability, squared error is the wrong loss. Use **cross-entropy**: if the model gives probability $p$ to the correct answer, the loss is $-\ln p$. For a binary label $y \in \{0, 1\}$ that is $L = -[y \ln p + (1 - y)\ln(1 - p)]$.

- Correct answer at $p = 0.9$: loss $= 0.105$
- Coin flip, $p = 0.5$: loss $= 0.693$
- Confidently wrong, $p = 0.1$: loss $= 2.303$

It punishes confident mistakes hard, which is what you want from a classifier. It also pairs with a sigmoid output in a way that makes the backward pass short. With $p = \sigma(z)$, the chain rule gives $\partial L / \partial p = -y/p + (1-y)/(1-p)$ and $\partial p / \partial z = p(1 - p)$; multiply them and everything cancels to

$$\frac{\partial L}{\partial z} = p - y.$$

No small sigmoid factor survives to slow learning, which is the reason classifiers use this pairing (and softmax with cross-entropy for many classes, where the same cancellation gives $p_k - y_k$ per class). That is precisely the training loss of a language model, where the "classes" are the tokens of its vocabulary: 32,000 for Llama 2, 256,000 for Gemma.

## A 2-2-1 network by hand: forward

Now the real thing: two inputs, two hidden sigmoid neurons, one sigmoid output, cross-entropy loss. The hidden weights are the first two rows of the visualised network above (with a sigmoid instead of ReLU so that both units stay alive).

- Input $x = (1.0, 0.5)$, label $y = 1$.
- Hidden unit 1: $w_{11} = 0.5$, $w_{12} = -0.4$, $b_1 = 0.1$. Hidden unit 2: $w_{21} = 0.3$, $w_{22} = 0.8$, $b_2 = -0.2$.
- Output: $v_1 = 0.7$, $v_2 = -0.5$, $c = 0.1$.

| Step | Computation | Value |
|---|---|---|
| 1 | $z_1 = 0.5(1.0) - 0.4(0.5) + 0.1$ | 0.4000 |
| 2 | $z_2 = 0.3(1.0) + 0.8(0.5) - 0.2$ | 0.5000 |
| 3 | $h_1 = \sigma(0.4) = 1/(1 + e^{-0.4})$ | 0.5987 |
| 4 | $h_2 = \sigma(0.5) = 1/(1 + e^{-0.5})$ | 0.6225 |
| 5 | $z_o = 0.7(0.5987) - 0.5(0.6225) + 0.1 = 0.4191 - 0.3112 + 0.1$ | 0.2079 |
| 6 | $p = \sigma(0.2079)$ | 0.5518 |
| 7 | $L = -\ln 0.5518$ | 0.5946 |

The model gives the correct class only 55% probability. Hidden unit 2 is the reason: it is active (0.62) and its output weight is negative, so it drags $z_o$ down.

## A 2-2-1 network by hand: backward and update

Walk backwards. Each hidden unit receives the output error through its own output weight, then scales it by its own sigmoid slope.

| Step | Quantity | Rule | Value |
|---|---|---|---|
| 1 | $\delta_o = \partial L / \partial z_o$ | $p - y$ | −0.4482 |
| 2 | $\partial L / \partial v_1$ | $\delta_o h_1$ | −0.2683 |
| 3 | $\partial L / \partial v_2$ | $\delta_o h_2$ | −0.2790 |
| 4 | $\partial L / \partial c$ | $\delta_o$ | −0.4482 |
| 5 | $\partial L / \partial h_1$ | $\delta_o v_1 = -0.4482 \times 0.7$ | −0.3138 |
| 6 | $\partial L / \partial h_2$ | $\delta_o v_2 = -0.4482 \times (-0.5)$ | +0.2241 |
| 7 | $\sigma'(z_1)$, $\sigma'(z_2)$ | $h(1 - h)$ | 0.2403, 0.2350 |
| 8 | $\delta_1 = \partial L / \partial z_1$ | $-0.3138 \times 0.2403$ | −0.0754 |
| 9 | $\delta_2 = \partial L / \partial z_2$ | $0.2241 \times 0.2350$ | +0.0527 |
| 10 | $\partial L / \partial w_{11}$, $w_{12}$, $b_1$ | $\delta_1 x_1$, $\delta_1 x_2$, $\delta_1$ | −0.0754, −0.0377, −0.0754 |
| 11 | $\partial L / \partial w_{21}$, $w_{22}$, $b_2$ | $\delta_2 x_1$, $\delta_2 x_2$, $\delta_2$ | +0.0527, +0.0263, +0.0527 |

Read the signs as a story. Every output-side gradient is negative, so $v_1$, $v_2$ and $c$ all increase: the output wants to be larger. Hidden unit 1 helps (positive $v_1$), so its gradient is negative and its weights rise, making it fire harder. Hidden unit 2 hurts (negative $v_2$), so its gradient is positive and its weights fall, making it fire less. Nothing in the algorithm "knows" about helping or hurting; the sign of $v$ in step 6 carries it. Note also that $w_{12}$'s gradient is half of $w_{11}$'s because $x_2 = 0.5$: an input that was small contributes little and gets little credit.

Update with $\eta = 1.0$ ($p \leftarrow p - \eta\,\partial L/\partial p$): $w_{11} = 0.5754$, $w_{12} = -0.3623$, $b_1 = 0.1754$, $w_{21} = 0.2473$, $w_{22} = 0.7737$, $b_2 = -0.2527$, $v_1 = 0.9683$, $v_2 = -0.2210$, $c = 0.5482$. Run the forward pass again: $h_1 = 0.6387$, $h_2 = 0.5942$, $z_o = 1.0354$, $p = 0.7380$, $L = 0.3039$. One step raised the probability of the right answer from 0.55 to 0.74 and halved the loss. A real network repeats this for billions of parameters and millions of steps.

The visualisation runs the same algorithm on the 2 → 3 → 1 ReLU network. Watch the switched-off unit.

```viz
{"type": "ml", "algorithm": "backprop", "x": [1.0, 0.5], "target": 1, "lr": 0.5,
 "title": "Backpropagation through the 2 → 3 → 1 network",
 "caption": "Errors flow backwards from the output. The hidden unit whose ReLU was off receives zero gradient, so its incoming weights do not change."}
```

## Checking a gradient numerically

Hand-derived gradients are easy to get wrong, so you verify them with a central finite difference: nudge one parameter by a tiny $\varepsilon$ each way and measure the change in loss. The error of this estimate shrinks as $\varepsilon^2$, so $\varepsilon = 10^{-4}$ agrees with the analytic value to about eight digits in float64. Every one of the nine gradients in the table above was checked this way and agrees to six decimal places.

```python
import math

def loss(w1, b1=-0.2, w2=0.8, b2=0.1, x=2.0, y=1.0):
    h = 1 / (1 + math.exp(-(w1 * x + b1)))
    return 0.5 * (w2 * h + b2 - y) ** 2

eps = 1e-4
print((loss(0.3 + eps) - loss(0.3 - eps)) / (2 * eps))   # -0.16186, matches the warm-up table
```

Nobody writes backward passes by hand in production. Frameworks such as PyTorch and JAX record the forward computation and apply the same table automatically (**autograd**):

```python
import torch

x, y = torch.tensor(2.0), torch.tensor(1.0)
w1 = torch.tensor(0.3, requires_grad=True); b1 = torch.tensor(-0.2, requires_grad=True)
w2 = torch.tensor(0.8, requires_grad=True); b2 = torch.tensor(0.1, requires_grad=True)

loss = 0.5 * (w2 * torch.sigmoid(w1 * x + b1) + b2 - y) ** 2
loss.backward()
print(w1.grad, b1.grad, w2.grad, b2.grad)   # -0.1619, -0.0809, -0.2521, -0.4210
```

Gradient checking is still how you test a custom layer or a hand-written kernel: run it in float64 on a tiny input and compare every gradient with its finite difference.

## Under the hood: what autograd records

When `requires_grad` is set, every operation appends a node to a graph and saves what its backward rule will need. Look at the tables above to see what that is: the sigmoid's backward rule needs its *output* $h$ (for $h(1-h)$), a multiplication needs its *other input* (the $x$ in $\delta_1 x_1$), a ReLU needs only a one-bit mask of which inputs were positive. `backward()` visits the graph in reverse order, calls each node's rule with the gradient arriving from above, and adds the result into `.grad`.

Three consequences follow.

- **Compute.** Each weight needs a gradient for the weight and one for its input, two matrix multiplies where the forward pass had one, so the backward pass costs about twice the forward pass and a training step about three times. For LLMs this gives the rule of about $6 \times$ parameters $\times$ tokens FLOPs, derived properly in [Training LLMs](/learn/ai-and-llms/how-llms-work/training-llms).
- **Memory.** Every saved tensor stays alive until the backward pass consumes it, so activation memory grows with batch size and depth, and for large models it is often more than the weights. **Gradient checkpointing** keeps only some activations and recomputes the rest during the backward pass: one extra forward pass, so about a third more compute, for a large memory saving.
- **Inference is different code.** Under `torch.no_grad()` nothing is recorded or saved, and `model.eval()` switches layers such as dropout and batch normalisation to their deterministic inference behaviour. Forgetting either is a production bug (below).

Optimiser state comes on top: Adam keeps two numbers per parameter, which is why training memory is several times serving memory (the 16-bytes-per-parameter accounting is in the previous lesson).

## Initialisation: will a signal survive ten layers?

Backprop multiplies derivatives, and the forward pass multiplies weight matrices, so scale compounds. Each ReLU layer of width $n$ with weights drawn at standard deviation $s$ multiplies the size of the activations by about $s\sqrt{n/2}$ (the $/2$ because ReLU zeroes half the inputs). Measured on a 10-layer ReLU network of width 128 with random inputs, root-mean-square activation after layers 1, 5 and 10:

| Weight standard deviation | Factor per layer | Layer 1 | Layer 5 | Layer 10 |
|---|---|---|---|---|
| 1.0 | $\sqrt{64} = 8$ | 8.5 | $3.2 \times 10^{4}$ | $1.2 \times 10^{9}$ |
| $1/\sqrt{128} = 0.088$ | 0.71 | 0.75 | 0.17 | 0.034 |
| $\sqrt{2/128} = 0.125$ (He) | 1.0 | 1.07 | 0.97 | 1.08 |
| 0.01 | 0.08 | 0.085 | $3.2 \times 10^{-6}$ | $1.2 \times 10^{-11}$ |

Only the He initialisation, standard deviation $\sqrt{2/\text{fan-in}}$, keeps the signal at a constant scale. Too large and the forward pass overflows to `inf` before training starts; too small and the gradients reaching layer 1 are $10^{-11}$ times the ones at the top. The same experiment in plain Python:

```python
import math, random

def rms_per_layer(std, width=128, layers=10, samples=4, seed=1):
    rng = random.Random(seed)
    Ws = [[[rng.gauss(0, std) for _ in range(width)] for _ in range(width)] for _ in range(layers)]
    xs = [[rng.gauss(0, 1) for _ in range(width)] for _ in range(samples)]
    out = []
    for W in Ws:
        xs = [[max(0.0, sum(w * v for w, v in zip(row, x))) for row in W] for x in xs]   # ReLU(Wx)
        vals = [v for x in xs for v in x]
        out.append(math.sqrt(sum(v * v for v in vals) / len(vals)))
    return out

print([f"{v:.3g}" for v in rms_per_layer(math.sqrt(2 / 128))])   # stays near 1 at every layer
```

Initialising every weight to the same value is a different failure: every neuron in a layer computes the same thing, receives the same gradient and stays identical forever. Randomness breaks the symmetry; the scale keeps the signal alive.

## Why deep networks are hard to train

- **Vanishing gradients.** Sigmoid's derivative is at most 0.25. Through ten sigmoid layers, the gradient reaching the first layer is scaled by at most $0.25^{10} \approx 10^{-6}$; the early layers barely learn. A saturated sigmoid at $z = 10$ has derivative 0.00005 and passes almost nothing back; one of the exercise tests checks exactly that case.
- **Exploding gradients.** Factors above 1 compound the other way. **Gradient clipping** (rescale the gradient if its norm exceeds a threshold, commonly 1.0) is standard in LLM training.
- **Dead ReLUs.** A ReLU whose pre-activation is negative for every input outputs 0 and has derivative 0, so it never receives a gradient and never recovers. The visualisation's third hidden unit is dead for this input. Leaky ReLU and GELU keep a small slope for negative inputs.

The architectural fixes that made very deep networks trainable are the ones inside every transformer block: **residual connections** ($x + f(x)$, whose derivative is $1 + f'(x)$, so the gradient always has a path with factor 1 that skips the block), **normalisation layers** that reset activations to a stable scale at every block, and ReLU-family activations. When you read [The transformer](/learn/ai-and-llms/how-llms-work/the-transformer), you will recognise each of them as an answer to a problem in this section.

## Why depth, and not width alone

The **universal approximation theorem** says one hidden layer with enough units can approximate any continuous function on a closed, bounded domain. It is often quoted as the reason neural networks work, and it says less than it sounds: it does not say how many units you need (for some functions, exponentially many), nor that gradient descent will find the weights. Depth wins because it lets the network build features out of features: pixels into edges, edges into shapes, shapes into objects; or characters into tokens, tokens into phrases, phrases into meaning. A deep network can reuse an intermediate feature many times, where a shallow one has to rebuild it for every case.

## Failure modes in production

**Loss stuck at 0.693.** *Symptom:* a balanced binary classifier's loss sits at 0.693 from the first step. *Diagnosis:* $0.693 = -\ln 0.5$, the loss of predicting 0.5 for everything; the output is disconnected from the input (all hidden units dead, a feature pipeline feeding zeros, labels shuffled relative to inputs). For a 10% positive rate the equivalent constant-predictor loss is $0.325$. *Fix:* check that the model can overfit a single batch of 32 examples to near-zero loss; if it cannot, the bug is in the data or the wiring, not the capacity.

**`inf` or `NaN` from the loss on confident mistakes.** *Symptom:* training is fine for hours, then one batch produces `inf`. *Diagnosis:* the loss computes $\sigma(z)$ and then $\ln(1 - \sigma(z))$ separately; in float32, $\sigma(z)$ rounds to exactly 1.0 from about $z = 17$ (float64 from about 37), so a confident wrong prediction takes $\ln 0$. *Fix:* use the fused loss that takes logits, which evaluates $\max(z, 0) - yz + \ln(1 + e^{-\lvert z\rvert})$ and returns 40 for $z = 40, y = 0$ instead of `inf`.

**Activations overflow at step zero.** *Symptom:* the very first loss is `NaN` or astronomically large. *Diagnosis:* initialisation scale, as in the table above; log activation RMS per layer on the first batch. *Fix:* He (ReLU) or Glorot (tanh, sigmoid) initialisation, plus normalisation layers.

**Units die after a learning-rate spike.** *Symptom:* accuracy plateaus early and a growing fraction of hidden units output zero for every input. *Diagnosis:* a large update pushed biases negative; a histogram of each unit's firing rate over a batch shows the dead ones. *Fix:* warm-up and a lower peak learning rate, leaky ReLU or GELU.

**Predictions change between identical requests.** *Symptom:* the same input scored twice gives different outputs in production. *Diagnosis:* the model is served in training mode, so dropout is still randomly zeroing units. *Fix:* `model.eval()` and `torch.no_grad()` in the serving path, with a test that scores one input twice and asserts equality.

## Exercise

```exercise
id: two-neuron-backprop
title: One backprop step on a two-neuron network
prompt: |
  The network from the lesson has one input `x`, a hidden sigmoid neuron and a
  linear output neuron:

      z1    = w1 * x + b1
      h     = sigmoid(z1)            # 1 / (1 + e^(-z1))
      y_hat = w2 * h + b2
      loss  = 0.5 * (y_hat - y) ** 2

  Implement `backprop_step(x, y, w1, b1, w2, b2, lr)`: run the forward pass,
  compute the gradient of the loss with respect to all four parameters with the
  chain rule, apply one gradient-descent update `p = p - lr * dL/dp` to each, and
  return `[w1, b1, w2, b2]` (the updated values, in that order).

  Compute every gradient from the *old* parameters. Return unrounded floats;
  results are compared to 6 decimal places.
languages: [python, javascript]
entry: backprop_step
starter:
  python: |
    import math

    def backprop_step(x, y, w1, b1, w2, b2, lr):
        # forward pass

        # backward pass

        return [w1, b1, w2, b2]
  javascript: |
    function backprop_step(x, y, w1, b1, w2, b2, lr) {
      // forward pass

      // backward pass

      return [w1, b1, w2, b2];
    }
tests:
  - args: [2.0, 1.0, 0.3, -0.2, 0.8, 0.1, 0.5]
    expected: [0.380929, -0.159535, 0.926039, 0.310525]
    label: the worked example from the lesson
  - args: [1.0, 0.0, 0.5, 0.5, -1.0, 0.2, 0]
    expected: [0.5, 0.5, -1.0, 0.2]
    label: zero learning rate changes nothing
  - args: [0, 1.0, 0.7, 0, 2.0, 0, 0.5]
    expected: [0.7, 0, 2.0, 0]
    label: a perfect prediction has zero gradient
  - args: [1.0, 0.0, 0.5, 0.0, 1.0, 0.0, 1.0]
    expected: [0.35372, -0.14628, 0.612544, -0.622459]
    label: prediction too high pushes parameters down
  - args: [-3.0, 2.0, 0.2, 0.1, -0.5, 1.0, 0.1]
    expected: [0.241905, 0.086032, -0.455119, 1.118877]
    hidden: true
    label: negative input and negative output weight
  - args: [10.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0]
    expected: [0.999546, -0.000045, 0.000091, -0.999955]
    hidden: true
    label: a saturated sigmoid passes almost no gradient to the first layer
hints:
  - "Forward: compute z1, h, y_hat. Backward: start from d_yhat = y_hat - y."
  - "d_w2 = d_yhat * h and d_b2 = d_yhat. Pass the error back through w2 to get d_h = d_yhat * w2."
  - "The sigmoid's local derivative is h * (1 - h), so d_z1 = d_h * h * (1 - h); then d_w1 = d_z1 * x and d_b1 = d_z1."
```

## Interviewer follow-ups

**"Why does backprop cost only about twice the forward pass, when there are millions of parameters?"** *Model answer:* it evaluates the chain rule from the loss backwards and reuses each intermediate gradient ($\delta_1$ in the table serves $w_{11}$, $w_{12}$ and $b_1$), so each weight costs a constant amount of extra work, about two multiply-adds, instead of a separate derivative per parameter. Forward-mode differentiation or finite differences would cost one pass per parameter. *Common wrong answer:* "it approximates the gradient", when backprop is exact.

**"Why sigmoid with cross-entropy, and not sigmoid with squared error, for a classifier?"** *Model answer:* with cross-entropy the output gradient is $p - y$; with squared error it is $(p - y)\,p(1 - p)$, which is near zero when the model is confidently wrong ($p \approx 0$ for $y = 1$), so the worst mistakes learn slowest. *Common wrong answer:* "cross-entropy gives probabilities", when both losses sit on the same sigmoid output.

**"Your network's loss is flat from step one. What do you do?"** *Model answer:* compare the loss with the constant-predictor value (0.693 for balanced binary); try to overfit one batch; check that inputs are not all zeros and labels line up with inputs; log per-layer activation and gradient norms to find dead or saturated layers. *Common wrong answer:* "train longer" or "make it bigger" before proving the pipeline can learn anything.

**"Why do residual connections help deep networks train?"** *Model answer:* the block computes $x + f(x)$, whose Jacobian is $I + f'(x)$, so there is always a path through which the gradient passes with factor 1 regardless of how small $f'$ is; stacking 100 blocks does not multiply 100 small numbers together. *Common wrong answer:* "they add more parameters", when a residual adds none.

## What mid-level engineers get wrong

- **Treating depth as free.** Without careful initialisation and normalisation, the measured activation scale changes by a factor of 8 per layer, which is $10^9$ after ten.
- **Computing the loss from probabilities instead of logits.** Numerically unstable once predictions are confident; the fused loss exists for exactly this.
- **Initialising to zeros "to be safe".** Symmetric weights stay symmetric; the layer behaves as a single neuron.
- **Serving in training mode.** Dropout left on makes predictions random; `no_grad` left off wastes memory saving activations nobody will use.
- **Trusting a hand-derived gradient without a finite-difference check.** A sign error in a custom layer still trains, slowly and badly, and nobody notices.

## Senior signals

- You can explain why a network **without non-linearities collapses to a single linear map**, and why that makes the activation function a design choice rather than a detail.
- You describe backprop as **the chain rule evaluated from the loss backwards, reusing intermediate results**, and you know it costs about 2× the forward pass and needs the forward activations in memory.
- You can run a **2-2-1 forward and backward pass by hand** and explain each gradient's sign from the output weights.
- You connect training problems to their mechanisms: **vanishing gradients** from small derivatives multiplied together, **dead ReLUs**, symmetry and scale from initialisation, and you know the fixes (residuals, normalisation, He initialisation, clipping).
- You estimate cost from parameter count: **about 2 FLOPs per parameter per example forward**, about 6 per parameter per token for training, and several times the weight memory for Adam training.
- You **verify custom gradients with finite differences** and compute losses from logits.

## Check yourself

```quiz
- q: >-
    A colleague proposes a 12-layer network with no activation functions between layers to "capture complex interactions". What is the problem?
  options: ["It will overfit, because twelve layers give it far too many parameters", "Nothing, provided it is trained with Adam and a learning-rate schedule", "It will train slowly, because gradients vanish through twelve layers", "Stacked linear layers collapse into one linear map; depth adds nothing"]
  answer: 3
  explanation: >-
    W2(W1 x + b1) + b2 simplifies to a single W'x + b', and the same holds for any number of layers. Without non-linearities the network can only represent linear functions, however deep it is. Vanishing gradients come from small activation derivatives multiplied together, and this network has no activations at all; overfitting and optimiser choice are separate concerns.
- q: >-
    In the 2-2-1 example, hidden unit 2 has output weight −0.5. Why do its incoming weights decrease after the update, while hidden unit 1's increase?
  options: ["Because unit 2's sigmoid slope is smaller, which reverses its gradient", "Because unit 2 has the larger activation, so it is penalised more", "Because the bias of unit 2 is negative, so its weights must shrink too", "Because the error reaches unit 2 through a negative weight, flipping its sign"]
  answer: 3
  explanation: >-
    Both hidden units receive the same output error −0.4482, multiplied by their own output weight. Through v1 = 0.7 it stays negative (so the weights rise); through v2 = −0.5 it becomes +0.2241 (so the weights fall). The sigmoid slope is always positive and only scales the gradient; it cannot change its sign.
- q: >-
    A hidden ReLU unit has a negative pre-activation for every training example. What happens to its incoming weights during training?
  options: ["They are reset to small random values by the optimiser", "They shrink toward zero, because ReLU's gradient is negative there", "They receive zero gradient and never change, so the unit stays dead", "They grow until the unit activates, since the loss pushes them upward"]
  answer: 2
  explanation: >-
    ReLU's derivative is 0 (not negative) for negative inputs, so the gradient reaching its weights is multiplied by 0 on every example and the unit never recovers. This is the dead ReLU problem; leaky ReLU and GELU keep a small slope for negative inputs to avoid it. (Weight decay could shrink them, but it cannot bring the unit back to life.)
- q: >-
    A 10-layer ReLU network of width 128 is initialised with weights of standard deviation 1.0. What happens on the first forward pass?
  options: ["Activations stay near 1, since ReLU discards the negative half", "Activations oscillate in sign, since the weights are symmetric", "Activations grow about 8 times per layer, near 10^9 by layer 10", "Activations shrink toward 0, since ReLU zeroes half of every layer"]
  answer: 2
  explanation: >-
    Each layer scales the activation size by about s × sqrt(n/2) = 1 × sqrt(64) = 8, so ten layers give roughly 8^10 ≈ 10^9 (measured 1.2 × 10^9). Halving by ReLU is already inside the sqrt(n/2) factor; He initialisation, s = sqrt(2/128), makes the factor 1. ReLU outputs are non-negative, so they cannot oscillate in sign.
- q: >-
    A binary classifier's loss becomes inf after hours of healthy training. The code computes p = sigmoid(z) and then −log(1 − p) for negative labels. What is the most likely cause?
  options: ["The learning rate was too high and the weights overflowed", "A confident logit made p round to exactly 1.0 in float32", "The dataset contains a label that is neither 0 nor 1", "Gradient clipping was disabled, so the gradient exploded"]
  answer: 1
  explanation: >-
    In float32, sigmoid(z) rounds to exactly 1.0 from about z = 17, so a confident wrong prediction on a negative example evaluates log(0). The fused loss that takes logits computes the same quantity stably. An overflow from the learning rate would usually show as NaN in the weights first, and a bad label gives a wrong loss, not an infinite one.
- q: >-
    Serving a 7B-parameter model in 16-bit needs about 14 GB for weights. Why does training it with Adam need far more memory than that?
  options: ["Backpropagation keeps a separate copy of the full network for every layer", "The model has extra parameters during training that are pruned for serving", "Training loads the whole dataset into GPU memory alongside the weights", "It must also hold gradients, Adam's two moments and stored activations"]
  answer: 3
  explanation: >-
    Training memory is weights plus a gradient per parameter plus Adam's two moment estimates (typically fp32, plus an fp32 master copy of the weights) plus the forward activations the backward pass needs. That is commonly about 16 bytes per parameter before activations, versus 2 for serving. The parameter count does not change between training and inference, and data is streamed in batches rather than loaded whole.
```
