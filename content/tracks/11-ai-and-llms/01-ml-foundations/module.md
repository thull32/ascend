---
slug: ml-foundations
title: Machine learning foundations
description: The one loop behind every model, from linear regression to a 70B-parameter LLM, worked by hand with numbers small enough to check.
prerequisites: [foundations/math-for-engineers]
---
A machine learning model is a function with adjustable numbers inside it, a way of scoring how wrong it is, and a procedure for nudging the numbers to be less wrong. That sentence describes a two-parameter line fit and a frontier language model equally well; the difference is scale, architecture and data, not the idea. This module makes the idea concrete before the scale arrives.

You start with linear regression and gradient descent, computed step by step so you can see a loss fall from 44.75 to 0.18. You then stack neurons into a network and run a full forward and backward pass by hand on a two-neuron network, which is all backpropagation ever is. From there you learn why a model that is perfect on its training data can be useless in production, how to measure that honestly, and which classical models (logistic regression, trees, boosting, k-NN, k-means) you should still reach for before a neural network. The module ends with embeddings: turning words, documents or users into vectors so that "similar" becomes a geometric question, which is the foundation of semantic search and retrieval-augmented generation.

The only math you need is from [Math for engineers](/learn/foundations/math-for-engineers/logarithms-and-exponentials): exponentials and logs, sums, and the idea of a derivative as "how much the output moves when you nudge the input".
