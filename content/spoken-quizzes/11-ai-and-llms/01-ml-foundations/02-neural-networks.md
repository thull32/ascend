---
lesson: neural-networks
source: e289c6ce40f7c8da
---
## 1

A colleague proposes a 12-layer network with no activation functions between the layers, to capture complex interactions. What is the problem?

A, it will overfit, because twelve layers give it far too many parameters. B, nothing, provided it is trained with Adam and a learning-rate schedule. C, it will train slowly, because gradients vanish through twelve layers. D, stacked linear layers collapse into one linear map, so depth adds nothing.

[think]

The answer is D: stacked linear layers collapse into one linear map, so depth adds nothing.

A linear function of a linear function simplifies to a single linear function, and the same holds for any number of layers. Without non-linearities, the network can only represent linear functions, however deep it is. Vanishing gradients come from small activation slopes multiplied together, and this network has no activations at all; overfitting and the choice of optimiser are separate concerns.

## 2

A small network has two inputs, two sigmoid hidden units and one output. Hidden unit 1 has an output weight of 0.7, and hidden unit 2 has an output weight of minus 0.5. Why do hidden unit 2's incoming weights decrease after the update, while hidden unit 1's increase?

A, because unit 2's sigmoid slope is smaller, which reverses its gradient. B, because unit 2 has the larger activation, so it is penalised more. C, because the bias of unit 2 is negative, so its weights must shrink too. D, because the error reaches unit 2 through a negative weight, flipping its sign.

[think]

The answer is D: the error reaches unit 2 through a negative weight, flipping its sign.

Both hidden units receive the same output error, minus 0.4482, multiplied by their own output weight. Through the weight of 0.7 it stays negative, so the weights rise. Through minus 0.5 it becomes plus 0.2241, so the weights fall. The sigmoid slope is always positive and only scales the gradient; it cannot change its sign.

## 3

A hidden ReLU unit has a negative pre-activation for every training example. What happens to its incoming weights during training?

A, they are reset to small random values by the optimiser. B, they shrink toward zero, because ReLU's gradient is negative there. C, they receive zero gradient and never change, so the unit stays dead. D, they grow until the unit activates, since the loss pushes them upward.

[think]

The answer is C: they receive zero gradient and never change, so the unit stays dead.

ReLU's derivative is zero, not negative, for negative inputs, so the gradient reaching its weights is multiplied by zero on every example, and the unit never recovers. This is the dead ReLU problem; leaky ReLU and GELU keep a small slope for negative inputs to avoid it. Weight decay could shrink the weights, but it cannot bring the unit back to life.

## 4

A 10-layer ReLU network of width 128 is initialised with weights of standard deviation 1. What happens on the first forward pass?

A, activations stay near 1, since ReLU discards the negative half. B, activations oscillate in sign, since the weights are symmetric. C, activations grow about 8 times per layer, to around a billion by layer 10. D, activations shrink toward zero, since ReLU zeroes half of every layer.

[think]

The answer is C: activations grow about 8 times per layer, to around a billion by layer 10.

Each layer scales the activation size by the weight's standard deviation times the square root of half the width: 1 times the square root of 64, which is 8. Ten layers give roughly 8 to the tenth, about a billion, and the measured value was 1.2 billion. ReLU's halving is already inside that factor. He initialisation, a standard deviation of the square root of 2 over 128, makes the factor 1. And ReLU outputs are never negative, so they cannot oscillate in sign.

## 5

A binary classifier's loss becomes infinite after hours of healthy training. The code computes a probability as the sigmoid of the score, then minus the log of one minus that probability for negative labels. What is the most likely cause?

A, the learning rate was too high, and the weights overflowed. B, a confident score made the probability round to exactly 1 in 32-bit floats. C, the dataset contains a label that is neither 0 nor 1. D, gradient clipping was disabled, so the gradient exploded.

[think]

The answer is B: a confident score made the probability round to exactly 1 in 32-bit floats.

In 32-bit floats, the sigmoid rounds to exactly 1 from a score of about 17, so a confidently wrong prediction on a negative example takes the log of zero. The fused loss that takes the raw scores, the logits, computes the same quantity stably. An overflow from the learning rate would usually show up as not-a-number in the weights first, and a bad label gives a wrong loss, not an infinite one.

## 6

Serving a 7-billion-parameter model in 16-bit needs about 14 gigabytes for the weights. Why does training it with Adam need far more memory than that?

A, backpropagation keeps a separate copy of the full network for every layer. B, the model has extra parameters during training that are pruned for serving. C, training loads the whole dataset into GPU memory alongside the weights. D, it must also hold gradients, Adam's two moments, and stored activations.

[think]

The answer is D: it must also hold gradients, Adam's two moments, and stored activations.

Training memory is the weights, plus a gradient per parameter, plus Adam's two moment estimates, typically in 32-bit along with a 32-bit master copy of the weights, plus the forward activations the backward pass needs. That is commonly about 16 bytes per parameter before activations, against 2 for serving. The parameter count does not change between training and inference, and data is streamed in batches rather than loaded whole.
