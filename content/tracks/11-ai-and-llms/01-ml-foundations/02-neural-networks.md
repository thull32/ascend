---
slug: neural-networks
title: "Neural networks: neurons, layers and backpropagation by hand"
description: Why stacking linear layers needs a non-linearity, what a forward pass computes, and a complete forward and backward pass through a two-neuron network with real numbers.
minutes: 30
difficulty: medium
tags: [machine-learning, neural-networks, backpropagation, activation-functions, chain-rule]
problems: []
---
A linear model can only draw straight lines. That is fine for "runtime grows with row count", and useless for most things you actually want to predict. Whether a video stream rebuffers depends on the *ratio* of bitrate to bandwidth, not on either alone. Whether a login is suspicious depends on *combinations*: new device and new country is alarming, either one alone is normal. The simplest version of that second problem is XOR: output 1 when exactly one of two inputs is 1. Plot the four cases and you will find no straight line that puts (0,1) and (1,0) on one side and (0,0) and (1,1) on the other.

A neural network fixes this by composing many simple units, each a linear function followed by a small non-linear bend. With enough units the composition can approximate essentially any function, and the same gradient descent loop from [What a model is](/learn/ai-and-llms/ml-foundations/what-a-model-is) still trains it. The piece that makes training possible is backpropagation, and by the end of this lesson you will have run it by hand.

## The neuron

A single neuron takes a vector of inputs, computes a weighted sum plus a bias, and passes the result through an **activation function** $\varphi$:

$$z = w \cdot x + b, \qquad a = \varphi(z)$$

$z$ is the **pre-activation**, $a$ the **activation** (the neuron's output). If $\varphi$ is the sigmoid $\sigma(z) = 1/(1 + e^{-z})$, which squashes any number into (0, 1), this one neuron *is* logistic regression, which you will meet again in [Classical ML you should know](/learn/ai-and-llms/ml-foundations/classical-ml-you-should-know).

The common activations, and the property of each that matters in practice:

| Activation | Formula | Derivative | Where you see it |
|---|---|---|---|
| Sigmoid | $1/(1+e^{-z})$ | $\sigma(z)(1-\sigma(z))$, at most 0.25 | Binary outputs (probabilities) |
| tanh | $\frac{e^z - e^{-z}}{e^z + e^{-z}}$ | $1 - \tanh^2 z$, at most 1 | Older recurrent networks |
| ReLU | $\max(0, z)$ | 1 if $z > 0$, else 0 | The default in hidden layers for a decade |
| GELU / SwiGLU | smooth ReLU-like curves | smooth, non-zero for slightly negative $z$ | The MLP inside modern transformers |

The derivative column is the one that matters for training, because backpropagation multiplies these derivatives together. Keep "sigmoid's derivative is at most 0.25" in mind; it explains a whole era of failed deep networks.

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

A **layer** is many neurons reading the same input. Stack their weight vectors as the rows of a matrix $W$ with shape (outputs × inputs) and the layer is one line: $a = \varphi(Wx + b)$. A network is a chain of these. Process a batch of $B$ examples at once and $x$ becomes a $B \times d_{\text{in}}$ matrix; the whole forward pass is a handful of matrix multiplications, which is exactly what GPUs are built to do.

Parameter counting is mechanical. A layer from $d_{\text{in}}$ to $d_{\text{out}}$ has $d_{\text{in}} d_{\text{out}}$ weights plus $d_{\text{out}}$ biases. A digit classifier with layers 784 → 256 → 10 has $784 \times 256 + 256 + 256 \times 10 + 10 = 203{,}530$ parameters. Each weight costs one multiply and one add per example, so a forward pass is about $2 \times$ (parameter count) floating-point operations per example. That rule of thumb scales all the way up: a 7B-parameter language model spends about 14 GFLOPs per token.

```python
import numpy as np

def relu(z):
    return np.maximum(0.0, z)

def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))

# the 2 -> 3 -> 1 network in the visualisation below
W1 = np.array([[0.5, -0.4], [0.3, 0.8], [-0.6, 0.2]])   # shape (3, 2)
b1 = np.array([0.1, -0.2, 0.05])
W2 = np.array([0.7, -0.5, 0.9])                         # shape (3,)
b2 = 0.1

x = np.array([1.0, 0.5])
h = relu(W1 @ x + b1)          # [0.4, 0.5, 0.0]  (third unit is off)
y_hat = sigmoid(W2 @ h + b2)   # sigmoid(0.13) = 0.53
```

Step through the same computation unit by unit:

```viz
{"type": "ml", "algorithm": "neural-net-forward", "x": [1.0, 0.5],
 "title": "Forward pass through a 2 → 3 → 1 network",
 "caption": "Each hidden unit computes w·x + b then ReLU. The third unit's pre-activation is −0.45, so ReLU switches it off."}
```

## A two-neuron network, forward

The smallest network that shows every idea has two neurons in a chain. One input $x$, one hidden neuron with a sigmoid, one linear output neuron:

$$z_1 = w_1 x + b_1, \quad h = \sigma(z_1), \quad \hat{y} = w_2 h + b_2, \quad L = \tfrac{1}{2}(\hat{y} - y)^2$$

(The $\tfrac{1}{2}$ just cancels the 2 that differentiation brings down.) Take $x = 2.0$, target $y = 1.0$, and starting weights $w_1 = 0.3$, $b_1 = -0.2$, $w_2 = 0.8$, $b_2 = 0.1$.

1. $z_1 = 0.3 \times 2.0 - 0.2 = 0.4$
2. $h = \sigma(0.4) = 1/(1 + e^{-0.4}) = 1/(1 + 0.6703) = 0.5987$
3. $\hat{y} = 0.8 \times 0.5987 + 0.1 = 0.5790$
4. $L = \tfrac{1}{2}(0.5790 - 1.0)^2 = \tfrac{1}{2}(0.1773) = 0.0886$

The prediction is too low. You want to know, for each of the four parameters, which direction to move it and by how much. That is the gradient, and backpropagation computes it.

## Backward: the chain rule, one multiplication at a time

Write the computation as a chain: $w_1 \to z_1 \to h \to \hat{y} \to L$. The chain rule says the derivative of $L$ with respect to anything earlier in the chain is the product of the local derivatives along the way. Backpropagation evaluates that product **from the loss backwards**, reusing each intermediate result, so every parameter's gradient costs one extra multiplication instead of a fresh walk down the chain.

Every step has the same shape: *gradient arriving from above × local derivative of this step*.

| Quantity | Rule | Value |
|---|---|---|
| $\partial L / \partial \hat{y}$ | $\hat{y} - y$ | $0.5790 - 1.0 = -0.4210$ |
| $\partial L / \partial w_2$ | $\partial L / \partial \hat{y} \times h$ | $-0.4210 \times 0.5987 = -0.2521$ |
| $\partial L / \partial b_2$ | $\partial L / \partial \hat{y} \times 1$ | $-0.4210$ |
| $\partial L / \partial h$ | $\partial L / \partial \hat{y} \times w_2$ | $-0.4210 \times 0.8 = -0.3368$ |
| $\partial h / \partial z_1$ | $h(1 - h)$ | $0.5987 \times 0.4013 = 0.2403$ |
| $\partial L / \partial z_1$ | $\partial L / \partial h \times \partial h / \partial z_1$ | $-0.3368 \times 0.2403 = -0.0809$ |
| $\partial L / \partial w_1$ | $\partial L / \partial z_1 \times x$ | $-0.0809 \times 2.0 = -0.1619$ |
| $\partial L / \partial b_1$ | $\partial L / \partial z_1 \times 1$ | $-0.0809$ |

Read the table as a story. The output is 0.42 too low. The output weight's gradient is that error times what it was multiplied by ($h$). The error is passed back to the hidden neuron *through* $w_2$, then shrunk by the sigmoid's slope (0.24), and finally multiplied by the input $x$ to give the gradient of $w_1$. All gradients are negative, so gradient descent increases all four parameters.

Now update with learning rate $\eta = 0.5$ ($w \leftarrow w - \eta \cdot \partial L / \partial w$):

- $w_1 = 0.3 - 0.5 \times (-0.1619) = 0.3809$
- $b_1 = -0.2 - 0.5 \times (-0.0809) = -0.1595$
- $w_2 = 0.8 - 0.5 \times (-0.2521) = 0.9260$
- $b_2 = 0.1 - 0.5 \times (-0.4210) = 0.3105$

Run the forward pass again: $z_1 = 0.6023$, $h = 0.6462$, $\hat{y} = 0.9089$, $L = 0.0041$. One step cut the loss by 95%. That is the whole algorithm: a real network repeats it for billions of parameters and millions of steps.

The visualisation below does the same for the three-hidden-unit network from earlier, with a sigmoid output and cross-entropy loss, where the output error simplifies to exactly $\hat{y} - y$ as well. Watch what happens to the switched-off ReLU unit.

```viz
{"type": "ml", "algorithm": "backprop", "x": [1.0, 0.5], "target": 1, "lr": 0.5,
 "title": "Backpropagation through the 2 → 3 → 1 network",
 "caption": "Errors flow backwards from the output. The hidden unit whose ReLU was off receives zero gradient, so its incoming weights do not change."}
```

### Checking a gradient numerically

Hand-derived gradients are easy to get wrong, so you verify them with a finite difference: nudge one parameter by a tiny $\varepsilon$ each way and measure the change in loss.

```python
import math

def loss(w1, b1=-0.2, w2=0.8, b2=0.1, x=2.0, y=1.0):
    h = 1 / (1 + math.exp(-(w1 * x + b1)))
    return 0.5 * (w2 * h + b2 - y) ** 2

eps = 1e-4
print((loss(0.3 + eps) - loss(0.3 - eps)) / (2 * eps))   # -0.16186, matches the table
```

Nobody writes backward passes by hand in production. Frameworks such as PyTorch and JAX record the forward computation as a graph and apply exactly the table above automatically (**autograd**):

```python
import torch

x, y = torch.tensor(2.0), torch.tensor(1.0)
w1 = torch.tensor(0.3, requires_grad=True); b1 = torch.tensor(-0.2, requires_grad=True)
w2 = torch.tensor(0.8, requires_grad=True); b2 = torch.tensor(0.1, requires_grad=True)

loss = 0.5 * (w2 * torch.sigmoid(w1 * x + b1) + b2 - y) ** 2
loss.backward()
print(w1.grad, b1.grad, w2.grad, b2.grad)   # -0.1619, -0.0809, -0.2521, -0.4210
```

Gradient checking is still how you test a custom layer or a hand-written kernel.

## Cross-entropy: the loss for probabilities

When the output is a probability, squared error is the wrong loss. Use **cross-entropy**: if the model gives probability $p$ to the correct answer, the loss is $-\ln p$.

- Correct answer at $p = 0.9$: loss $= 0.105$
- Coin flip, $p = 0.5$: loss $= 0.693$
- Confidently wrong, $p = 0.1$: loss $= 2.303$

It punishes confident mistakes hard, which is what you want from a classifier. It also pairs beautifully with sigmoid and softmax outputs: the gradient with respect to the pre-activation is simply $p - y$, with no small derivative factor to slow learning. With many classes, a softmax turns the output vector into probabilities and the loss is $-\ln$ of the probability of the correct class. That is precisely the training loss of a language model, where the "classes" are the 50,000 to 200,000 tokens of its vocabulary.

## What backprop costs

- **Compute.** The backward pass costs about twice the forward pass (for each weight you need a gradient for the weight *and* for its input), so one training step is about $3\times$ a forward pass. For LLMs this gives the rule of thumb of about $6 \times$ parameters $\times$ tokens FLOPs for training.
- **Memory.** The backward pass needs the activations from the forward pass ($h$ and $z_1$ above). For a big network and batch that is often more memory than the weights themselves. **Gradient checkpointing** stores only some activations and recomputes the rest during the backward pass, trading about a third more compute for a large memory saving.
- **Optimiser state.** Plain SGD needs only the gradient. **Adam**, the default for large models, keeps a running average of each parameter's gradient and of its square and scales each parameter's step individually. That is two extra numbers per parameter, which is why training a model needs several times the memory of serving it.

## Why deep networks are hard to train

Backprop multiplies local derivatives along the chain, and a product of many numbers is fragile.

- **Vanishing gradients.** Sigmoid's derivative is at most 0.25. Through ten sigmoid layers, the gradient reaching the first layer is scaled by at most $0.25^{10} \approx 10^{-6}$; the early layers barely learn. At the extreme, a saturated sigmoid at $z = 10$ has derivative 0.00005 and passes almost nothing back; one of the exercise tests checks exactly that case.
- **Exploding gradients.** Derivatives above 1 compound the other way. **Gradient clipping** (rescale the gradient if its norm exceeds a threshold) is standard in LLM training.
- **Dead ReLUs.** A ReLU whose pre-activation is negative for every input outputs 0 and has derivative 0, so it never receives a gradient and never recovers. The visualisation's third hidden unit is dead for this input. Leaky ReLU and GELU keep a small slope for negative inputs.
- **Symmetry.** Initialise every weight to the same value and every neuron in a layer computes the same thing, receives the same gradient and stays identical forever. Weights are initialised randomly, scaled by about $1/\sqrt{\text{fan-in}}$ so activations neither blow up nor shrink layer by layer.

The architectural fixes that made very deep networks trainable are the same ones you will find inside every transformer block: **residual connections** ($x + f(x)$, which give the gradient a path that skips the block entirely), **normalisation layers** that keep activations at a stable scale, and ReLU-family activations. When you read [The transformer](/learn/ai-and-llms/how-llms-work/the-transformer), you will recognise each of them as an answer to a problem in this section.

## Why depth, and not just width

The **universal approximation theorem** says one hidden layer with enough units can approximate any continuous function on a bounded domain. It is often quoted as the reason neural networks work, and it says less than it sounds: it does not say how many units you need (for some functions, exponentially many), nor that gradient descent will find the weights. In practice, depth wins because it lets the network build features out of features: pixels into edges, edges into shapes, shapes into objects; or characters into tokens, tokens into phrases, phrases into meaning. A deep network can reuse an intermediate feature many times, where a shallow one has to rebuild it for every case.

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

## Senior signals

- You can explain why a network **without non-linearities collapses to a single linear map**, and why that makes the activation function a design choice rather than a detail.
- You describe backprop as **the chain rule evaluated from the loss backwards, reusing intermediate results**, and you know it costs about 2× the forward pass and needs the forward activations in memory.
- You connect training problems to their mechanisms: **vanishing gradients** from small derivatives multiplied together, **dead ReLUs**, symmetry from bad initialisation, and you know the fixes (residuals, normalisation, careful initialisation, clipping).
- You estimate cost from parameter count: **about 2 FLOPs per parameter per example forward**, about 6 per parameter per token for training, and several times the weight memory for Adam training.
- You **verify custom gradients with finite differences** instead of trusting a derivation.

## Check yourself

```quiz
- q: >-
    A colleague proposes a 12-layer network with no activation functions between layers to "capture complex interactions". What is the problem?
  options: ["It will overfit, because twelve layers give it far too many parameters", "It will train slowly, because gradients vanish through twelve layers", "Stacked linear layers collapse into one linear map; depth adds nothing", "Nothing, provided it is trained with Adam and a learning-rate schedule"]
  answer: 2
  explanation: >-
    W2(W1 x + b1) + b2 simplifies to a single W'x + b', and the same holds for any number of layers. Without non-linearities the network can only represent linear functions, however deep it is. Vanishing gradients come from small activation derivatives multiplied together, and this network has no activations at all; overfitting and optimiser choice are separate concerns.
- q: >-
    In the two-neuron example, why is the gradient for w1 (−0.1619) exactly twice the gradient for b1 (−0.0809)?
  options: ["Because the loss carries a factor of 1/2 that only b1 sees", "Because the learning rate of 0.5 halves the bias gradient", "Because z1 = w1·x + b1, so dz1/dw1 = x = 2 while dz1/db1 = 1", "Because backprop reaches w1 through two paths and b1 through one"]
  answer: 2
  explanation: >-
    Both gradients share the upstream factor dL/dz1 = −0.0809. The local derivative of z1 with respect to w1 is the input x = 2.0 and with respect to b1 is 1, so the w1 gradient is twice as large. There is only one path from the loss to each of them, and the learning rate is applied after the gradient is computed.
- q: >-
    A hidden ReLU unit has a negative pre-activation for every training example. What happens to its incoming weights during training?
  options: ["They grow until the unit activates, since the loss pushes them upward", "They shrink toward zero, because ReLU's gradient is negative there", "They receive zero gradient and never change, so the unit stays dead", "They are reset to small random values by the optimiser"]
  answer: 2
  explanation: >-
    ReLU's derivative is 0 (not negative) for negative inputs, so the gradient reaching its weights is multiplied by 0 on every example and the unit never recovers. This is the dead ReLU problem; leaky ReLU and GELU keep a small slope for negative inputs to avoid it. (Weight decay could shrink them, but it cannot bring the unit back to life.)
- q: >-
    Why did very deep networks with sigmoid activations fail to train, and what fixed it?
  options: ["The networks were too narrow to learn; far wider layers with more parameters fixed it", "Sigmoid is not differentiable at zero; smooth activations such as GELU fixed it", "Each layer scaled gradients by at most 0.25; ReLU, residuals and normalisation fixed it", "Sigmoid was too slow to compute at that depth; cheaper ReLU-family activations fixed it"]
  answer: 2
  explanation: >-
    Backprop multiplies local derivatives; ten sigmoid factors of at most 0.25 shrink the gradient reaching the early layers by about a million, so they barely learn. ReLU has derivative 1 when active, residual connections give gradients a path around each block, and normalisation keeps activations in the useful range. Compute speed and width are not the issue, and sigmoid is smooth everywhere.
- q: >-
    Serving a 7B-parameter model in 16-bit needs about 14 GB for weights. Why does training it with Adam need far more memory than that?
  options: ["Training loads the whole dataset into GPU memory alongside the weights", "The model has extra parameters during training that are pruned for serving", "Backpropagation keeps a separate copy of the full network for every layer", "It must also hold gradients, Adam's two moments and stored activations"]
  answer: 3
  explanation: >-
    Training memory is weights plus a gradient per parameter plus Adam's two moment estimates (typically fp32, plus an fp32 master copy of the weights) plus the forward activations the backward pass needs. That is commonly about 16 bytes per parameter before activations, versus 2 for serving. The parameter count does not change between training and inference, and data is streamed in batches rather than loaded whole.
```
