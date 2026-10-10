---
lesson: neural-networks
source: 9c964e705e8e289c
fit: partial
desk:
  - "The activation-function comparison table"
  - "The XOR network built from two ReLU units, case by case"
  - "The two-neuron warm-up and the full 2-2-1 forward and backward pass, every value"
  - "Gradient checking by finite differences, the autograd code, and the initialisation experiment"
  - "Exercise: one backprop step on a two-neuron network"
---
## Introduction

A linear model can only draw straight lines. That is fine for "runtime grows with row count", and useless for most things you actually want to predict. Whether a video stream rebuffers depends on the ratio of bitrate to bandwidth, not on either one. Whether a login is suspicious depends on combinations: a new device and a new country together is alarming, either one alone is normal.

The simplest version of that is XOR: output 1 when exactly one of two inputs is on. Picture the four cases on a square. The two "exactly one" corners sit on one diagonal, the "neither" and "both" corners on the other, and no single straight line separates the diagonals.

A neural network fixes this by composing many simple units, each a linear function followed by a small bend. The same gradient descent loop still trains it, and the piece that makes that possible is backpropagation. Three ideas, then: why the bend is the whole point, what backpropagation actually does, and why deep networks are hard to train and how the fixes work.

## The neuron and the bend

A neuron takes its inputs, computes a weighted sum plus a bias, and passes the result through an activation function. If that function is the sigmoid, which squashes any number into the range zero to one, this single neuron is logistic regression.

The common activations differ in the property that decides training: how large their slope can get. The sigmoid's slope is at most a quarter. Keep that number in mind; it explains a whole era of failed deep networks. ReLU, which passes positive numbers through and zeroes negative ones, has a slope of exactly 1 whenever it is on. Modern transformers use smooth ReLU-like curves such as GELU.

Now the reason the bend matters. Stack two linear layers with nothing between them, and the algebra collapses: a linear function of a linear function is just one linear function. Ten linear layers are still one linear layer. Depth buys nothing until you put a non-linearity between the layers.

XOR shows what the bend buys. Two ReLU units, weights chosen by hand. The first fires with the sum of the inputs. The second fires only when both inputs are on, and the output subtracts it twice, cancelling the double count. Each ReLU is a hinge, and a network is a sum of many hinges, bending a flat plane into whatever shape the data needs. Training finds those weights instead of you.

## Layers and their cost

A layer is many neurons reading the same input. Stack their weights as the rows of a matrix, and a whole layer is one matrix multiply followed by the activation. Process a batch at once and the whole forward pass is a handful of matrix multiplications, which is exactly what GPUs are built for.

Counting parameters is mechanical: every input-output pair gets a weight, and every output gets a bias. A digit classifier going from 784 inputs to 256 hidden units to 10 classes has about 200 thousand parameters. And here is the rule of thumb worth carrying: each weight costs one multiply and one add, so a forward pass is about two operations per parameter per example. That scales all the way up. A 7-billion-parameter language model spends about 14 billion operations per token.

## Backpropagation

Here is the core of the lesson. Take the smallest network that shows every idea: one input, one hidden sigmoid neuron, one output neuron, and a squared-error loss.

The forward pass runs left to right and produces a prediction and a loss. The backward pass walks the same chain from the loss back towards the input. And every step of that walk has the same shape: the gradient arriving from above, times the local derivative of this step. For the output weight, the local derivative is the hidden activation. To pass the error back into the hidden neuron, you multiply by the output weight. To go through the sigmoid, you multiply by its slope. That is the whole algorithm. On the worked example, one step with a learning rate of a half cut the loss by 95 percent.

Why does that cost so little? Before I tell you: with millions of parameters, why is backpropagation only about twice the cost of the forward pass, rather than one pass per parameter?

[pause]

Because it reuses intermediate results. The gradient arriving at a hidden neuron is computed once and then serves every weight feeding into that neuron. So each weight costs a constant amount of extra work, about two multiply-adds. Finite differences or forward-mode differentiation would need one pass per parameter. And it is exact, not an approximation.

When the output is a probability, use cross-entropy instead of squared error. If the model gives probability p to the correct answer, the loss is minus the log of p. Correct at 0.9, the loss is about 0.1. A coin flip costs 0.69. Confidently wrong, at 0.1, costs 2.3. It punishes confident mistakes hard. Better still, paired with a sigmoid, the gradient into the output simplifies to just the prediction minus the label. No small sigmoid factor survives to slow learning. With squared error, the gradient carries that factor, which is near zero exactly when the model is confidently wrong, so the worst mistakes learn slowest. The same pairing, with softmax over many classes, is precisely how a language model is trained, where the classes are the 32 thousand tokens of Llama 2's vocabulary, or 256 thousand for Gemma.

## The 2-2-1 network, told as a story

The lesson then runs a full network by hand: two inputs, two hidden sigmoid units, one output. The numbers are on the page; the story is what matters by ear.

The model starts by giving the correct class only 55 percent. The reason is hidden unit 2. It is active, and its output weight is negative, so it drags the output down.

Walk backwards. Both hidden units receive the same output error, but each through its own output weight. Unit 1's output weight is positive, so the error arrives negative, and its incoming weights rise, making it fire harder. Unit 2's output weight is negative, so the sign flips, and its weights fall, making it fire less. Nothing in the algorithm knows about helping or hurting. The sign of the output weight carries it. And one more detail: an input that was small gets proportionally small credit.

After one update with a learning rate of 1, the probability of the right answer rises from 0.55 to 0.74, and the loss halves. A real network repeats this for billions of parameters and millions of steps.

Two practical notes. Hand-derived gradients are easy to get wrong, so you check them numerically: nudge one parameter a tiny amount each way and measure the change in loss. And under the hood, autograd records each operation and saves what its backward rule needs. A sigmoid saves its output, a multiply saves its other input, a ReLU saves just a one-bit mask. Three consequences. The backward pass costs about twice the forward, so a training step is about three times. Saved activations stay alive until they are consumed, so activation memory grows with batch size and depth and often exceeds the weights; gradient checkpointing recomputes some of them for about a third more compute. And at inference you turn recording off and switch the model to evaluation mode.

## Will a signal survive ten layers?

Scale compounds. Each ReLU layer multiplies the size of its activations by a factor set by the weight scale and the layer width. The lesson measured a 10-layer ReLU network, 128 wide.

With weights of standard deviation 1, the factor is 8 per layer, and by layer 10 the activations are around a billion. With weights at 0.01, they shrink to about one hundred-billionth. Only He initialisation, which picks the weight scale from the number of inputs to each unit, keeps the factor at 1, and the signal stays near 1 at every layer. Too large and the forward pass overflows before training starts. Too small and the gradients reaching the first layer are vanishingly tiny. And initialising every weight to the same value fails differently: every neuron gets the same gradient and stays identical forever. Randomness breaks the symmetry; the scale keeps the signal alive.

Then the three classic training problems. Vanishing gradients: the sigmoid's slope is at most a quarter, so through ten sigmoid layers the gradient reaching the first layer is cut about a million times. Exploding gradients, the other direction, which is why gradient clipping is standard in language-model training. And dead ReLUs: a unit whose input is negative for every example outputs zero and has zero slope, so it never gets a gradient and never recovers. Leaky ReLU and GELU keep a small slope below zero.

The fixes that made very deep networks trainable sit inside every transformer block. Residual connections add the input back to the block's output, so the gradient always has a path with a factor of exactly 1 that skips the block. Normalisation layers reset the scale at every block. And ReLU-family activations.

Why depth at all? The universal approximation theorem says one wide hidden layer can approximate any continuous function, but it says nothing about how many units that takes, or whether gradient descent will find them. Depth wins because it builds features out of features: pixels into edges, edges into shapes, shapes into objects.

## Failures in production

The loss sits at 0.693 from the first step. That is minus the log of a half, the loss of predicting 50 percent for everything. The output is disconnected from the input: dead units, a pipeline feeding zeros, or labels shuffled against inputs. The test: can the model overfit a single batch of 32 examples to near zero? If not, the bug is in the data or the wiring, not the capacity.

The loss turns infinite after hours of healthy training. The code computed the sigmoid and then the log of one minus it separately. In 32-bit floats the sigmoid rounds to exactly 1 from an input of about 17, so a confident wrong prediction takes the log of zero. Use the fused loss that takes the raw scores, called logits.

And predictions differ between two identical requests: the model is served in training mode, with dropout still randomly zeroing units. Switch to evaluation mode, and add a test that scores one input twice and asserts they match.

## In the interview

Here is a follow-up the lesson expects. Why do residual connections help deep networks train?

[pause]

The block computes its input plus some function of its input. Its derivative is therefore one plus the function's derivative. So there is always a path where the gradient passes through with a factor of 1, however small the function's own slope is, and stacking 100 blocks never multiplies 100 small numbers together. The wrong answer is "they add more parameters". A residual adds none.

## Recap

Four things to remember. Without a non-linearity between layers, any depth collapses to one linear map. Backpropagation is the chain rule evaluated from the loss backwards, reusing intermediate results: exact, about twice the forward pass, and it needs the forward activations in memory. Pair sigmoid or softmax outputs with cross-entropy, computed from logits, so the gradient is simply prediction minus label. And signals survive depth only with the right initialisation scale, residual connections and normalisation, or they explode, vanish, or die.

At your desk: the activation table, the XOR network, the full 2-2-1 forward and backward pass with every value, the gradient-checking and initialisation code, and the backprop exercise.
