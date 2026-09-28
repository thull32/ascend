---
slug: ml-foundations
title: Machine learning foundations
description: The one loop behind every model, from linear regression to a 70B-parameter LLM, worked by hand with numbers small enough to check, ending with the vector indexes that make embedding search fast.
prerequisites: [foundations/math-for-engineers]
---
A machine learning model is a function with adjustable numbers inside it, a way of scoring how wrong it is, and a procedure for nudging the numbers to be less wrong. That sentence describes a two-parameter line fit and a frontier language model equally well; the difference is scale, architecture and data, not the idea. This module makes the idea concrete before the scale arrives.

You start with linear regression and gradient descent, computed step by step so you can see a loss fall from 44.75 to 0.18, and you see why the learning rate and feature scaling decide whether training works at all. You then stack neurons into a network and run a full forward and backward pass by hand on a 2-2-1 network, every intermediate value written down, which is all backpropagation ever is. From there you measure bias and variance by simulation, compute precision, recall and ROC-AUC from real counts, and learn which classical models (logistic regression, trees, boosting, k-NN, k-means) you should still reach for before a neural network, each traced by hand.

The last two lessons turn to vectors. Embeddings turn words, documents or users into points so that "similar" becomes a geometric question, and a contrastive training step computed on a three-pair batch shows how the space gets its shape. Vector search internals then opens up the indexes (IVF, HNSW, product quantisation) that make nearest-neighbour search over millions of those vectors fast, with the recall, memory, filtering and deletion costs each one brings. Together they are the foundation of semantic search and retrieval-augmented generation.

The only math you need is from [Math for engineers](/learn/foundations/math-for-engineers/logarithms-and-exponentials): exponentials and logs, sums, and the idea of a derivative as "how much the output moves when you nudge the input".
